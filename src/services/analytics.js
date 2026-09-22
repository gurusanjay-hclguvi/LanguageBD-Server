import { Lead } from '../models/Lead.js';
import { BD } from '../models/BD.js';
import { CallLog } from '../models/CallLog.js';
import { LANGUAGES, languageLabel } from '../data/languages.js';
import { effectiveLanguages } from './languageInference.js';

const rate = (num, den) => (den ? Math.round((num / den) * 1000) / 10 : 0);

/**
 * Everything the dashboard and the analytics page need, in one round trip.
 * Deliberately computed over lean documents rather than a clever aggregation
 * pipeline: lead volume in this MVP is small, and the language rules live in
 * one place (effectiveLanguages) instead of being re-implemented in Mongo.
 */
export async function analyticsSummary() {
  const [leads, bds, calls] = await Promise.all([
    Lead.find()
      .select(
        'name status assignedBD matchScore confirmedLanguages preferredLanguages ' +
          'inferredLanguages languageSource coverageGapLanguage state',
      )
      .lean(),
    BD.find().lean(),
    CallLog.find().populate('lead', 'name').populate('bd', 'name').sort({ createdAt: -1 }).lean(),
  ]);

  const activeBDs = bds.filter((b) => b.isActive !== false);
  const bdById = Object.fromEntries(bds.map((b) => [String(b._id), b]));

  // ---- status + score KPIs -------------------------------------------------
  const statusCounts = { new: 0, assigned: 0, contacted: 0, unroutable: 0 };
  for (const l of leads) statusCounts[l.status] = (statusCounts[l.status] ?? 0) + 1;

  const scored = leads.filter((l) => typeof l.matchScore === 'number');
  const avgMatchScore = scored.length
    ? Math.round(scored.reduce((s, l) => s + l.matchScore, 0) / scored.length)
    : 0;

  const routed = statusCounts.assigned + statusCounts.contacted;

  // ---- language provenance -------------------------------------------------
  const sourceCounts = { confirmed: 0, explicit: 0, inferred: 0, unknown: 0 };
  for (const l of leads) sourceCounts[l.languageSource] = (sourceCounts[l.languageSource] ?? 0) + 1;

  /*
   * ---- is the region guess any good? ---------------------------------------
   * Once a BD confirms a language on a call we can grade the inference that
   * preceded it. A "hit" means the language they actually speak was in the list
   * we guessed from their region. Broken down by state, this is a to-do list
   * for data/regionLanguages.js rather than an opinion about it.
   */
  const graded = leads.filter((l) => l.confirmedLanguages?.length && l.inferredLanguages?.length);
  const byState = {};
  let hits = 0;

  for (const l of graded) {
    const hit = l.inferredLanguages.includes(l.confirmedLanguages[0]);
    if (hit) hits += 1;
    const key = l.state?.trim() || 'Unknown region';
    byState[key] ??= { state: key, graded: 0, hits: 0 };
    byState[key].graded += 1;
    if (hit) byState[key].hits += 1;
  }

  const inferenceAccuracy = {
    graded: graded.length,
    hits,
    accuracy: rate(hits, graded.length),
    byState: Object.values(byState)
      .map((row) => ({ ...row, accuracy: rate(row.hits, row.graded) }))
      .sort((a, b) => a.accuracy - b.accuracy || b.graded - a.graded),
    note:
      graded.length === 0
        ? 'No calls have confirmed a language yet - log call outcomes to start grading the region guesses.'
        : 'Measured against languages BDs confirmed on real calls.',
  };

  // ---- demand vs supply, per language -------------------------------------
  const demand = {};
  const primaryDemand = {};
  for (const l of leads) {
    const langs = effectiveLanguages(l);
    langs.forEach((code, i) => {
      demand[code] = (demand[code] ?? 0) + 1;
      if (i === 0) primaryDemand[code] = (primaryDemand[code] ?? 0) + 1;
    });
  }

  const supply = {};
  const capacityByLang = {};
  for (const bd of activeBDs) {
    for (const spoken of bd.languages ?? []) {
      supply[spoken.code] = (supply[spoken.code] ?? 0) + 1;
      capacityByLang[spoken.code] = (capacityByLang[spoken.code] ?? 0) + (bd.dailyCapacity ?? 0);
    }
  }

  const languageCoverage = LANGUAGES.map(({ code, label }) => ({
    code,
    label,
    leads: demand[code] ?? 0,
    primaryLeads: primaryDemand[code] ?? 0,
    bds: supply[code] ?? 0,
    capacity: capacityByLang[code] ?? 0,
  }))
    .filter((row) => row.leads > 0 || row.bds > 0)
    .sort((a, b) => b.leads - a.leads);

  // A gap is demand with no one to serve it - the hiring/upskilling signal.
  const coverageGaps = languageCoverage
    .filter((row) => row.primaryLeads > 0 && row.bds === 0)
    .map((row) => ({ ...row, unroutableLeads: leads.filter((l) => l.coverageGapLanguage === row.code).length }));

  // ---- per-BD load ---------------------------------------------------------
  const loadByBD = {};
  for (const l of leads) {
    if (l.assignedBD && (l.status === 'assigned' || l.status === 'contacted')) {
      const key = String(l.assignedBD);
      loadByBD[key] = (loadByBD[key] ?? 0) + 1;
    }
  }
  const bdLoad = bds
    .map((bd) => ({
      id: String(bd._id),
      name: bd.name,
      region: bd.region,
      isActive: bd.isActive,
      languages: (bd.languages ?? []).map((l) => l.code),
      assigned: loadByBD[String(bd._id)] ?? 0,
      capacity: bd.dailyCapacity ?? 0,
      utilisation: rate(loadByBD[String(bd._id)] ?? 0, bd.dailyCapacity ?? 0),
    }))
    .sort((a, b) => b.assigned - a.assigned);

  // ---- measured call outcomes ---------------------------------------------
  const outcomeCounts = {};
  for (const c of calls) outcomeCounts[c.outcome] = (outcomeCounts[c.outcome] ?? 0) + 1;
  const totalCalls = calls.length;
  const barrierCalls = outcomeCounts.language_barrier ?? 0;

  // Barrier rate over time, so the "before vs after" story is measured, not modelled.
  const byDay = {};
  for (const c of calls) {
    const day = new Date(c.createdAt).toISOString().slice(0, 10);
    byDay[day] ??= { day, calls: 0, barriers: 0 };
    byDay[day].calls += 1;
    if (c.outcome === 'language_barrier') byDay[day].barriers += 1;
  }
  const barrierTrend = Object.values(byDay)
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((d) => ({ ...d, barrierRate: rate(d.barriers, d.calls) }));

  // ---- projection: what naive round-robin routing would cost ---------------
  // For each lead, the chance a randomly-picked BD shares a language is
  // (BDs who share one) / (all active BDs). Summing the complement estimates
  // the calls that would die on the language barrier. This is a MODEL, and the
  // UI labels it as one next to the measured rate above.
  let naiveMismatch = 0;
  let routableLeads = 0;
  for (const l of leads) {
    const langs = effectiveLanguages(l);
    const speakers = activeBDs.filter((bd) => (bd.languages ?? []).some((s) => langs.includes(s.code)));
    if (speakers.length) routableLeads += 1;
    if (!activeBDs.length) continue;
    naiveMismatch += 1 - speakers.length / activeBDs.length;
  }

  const projection = {
    leadsConsidered: leads.length,
    routableLeads,
    naiveWastedCalls: Math.round(naiveMismatch),
    naiveWastedRate: rate(naiveMismatch, leads.length),
    routedWastedCalls: 0,
    callsSaved: Math.round(naiveMismatch),
    note: 'Model estimate: assumes round-robin assignment ignoring language. Compare with the measured barrier rate.',
  };

  return {
    kpis: {
      totalLeads: leads.length,
      routed,
      routedRate: rate(routed, leads.length),
      unroutable: statusCounts.unroutable,
      waiting: statusCounts.new,
      avgMatchScore,
      activeBDs: activeBDs.length,
      totalCalls,
      barrierCalls,
      barrierRate: rate(barrierCalls, totalCalls),
      callsSaved: projection.callsSaved,
    },
    statusCounts,
    sourceCounts,
    inferenceAccuracy,
    languageCoverage,
    coverageGaps,
    bdLoad,
    outcomeCounts,
    barrierTrend,
    projection,
    recentCalls: calls.slice(0, 8).map((c) => ({
      id: String(c._id),
      lead: c.lead?.name ?? 'Unknown lead',
      bd: c.bd?.name ?? bdById[String(c.bd)]?.name ?? 'Unknown BD',
      outcome: c.outcome,
      notes: c.notes,
      createdAt: c.createdAt,
    })),
    languageLabels: Object.fromEntries(LANGUAGES.map((l) => [l.code, languageLabel(l.code)])),
  };
}
