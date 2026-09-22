import { Lead } from '../models/Lead.js';
import { BD } from '../models/BD.js';
import { assignLeads, rankMatches } from './matcher.js';
import { effectiveLanguages } from './languageInference.js';

/** Leads that occupy a BD's day: already assigned, or already being worked. */
const ACTIVE_STATUSES = ['assigned', 'contacted'];

/** Current per-BD workload, keyed by BD id, so scoring can balance the team. */
export async function currentLoadMap() {
  const rows = await Lead.aggregate([
    { $match: { assignedBD: { $ne: null }, status: { $in: ACTIVE_STATUSES } } },
    { $group: { _id: '$assignedBD', count: { $sum: 1 } } },
  ]);
  return Object.fromEntries(rows.map((r) => [String(r._id), r.count]));
}

/**
 * Route every lead that is waiting. Re-runnable: leads already assigned are
 * left alone, and previously-unroutable leads are retried (so hiring a Bengali
 * speaker and re-running clears the backlog).
 */
export async function runAssignment() {
  const [bds, leads, loadMap] = await Promise.all([
    BD.find().lean(),
    Lead.find({ assignedBD: null, status: { $in: ['new', 'unroutable'] } }).lean(),
    currentLoadMap(),
  ]);

  const { assignments, unroutable } = assignLeads(leads, bds, loadMap);
  const now = new Date();
  const ops = [];

  for (const { lead, match } of assignments) {
    ops.push({
      updateOne: {
        filter: { _id: lead._id },
        update: {
          $set: {
            assignedBD: match.bdId,
            assignedAt: now,
            status: 'assigned',
            matchScore: match.score,
            matchReasons: match.reasons,
            assignmentMode: 'auto',
            coverageGapLanguage: null,
            unroutableReason: null,
          },
        },
      },
    });
  }

  for (const { lead, coverageGapLanguage, reason } of unroutable) {
    ops.push({
      updateOne: {
        filter: { _id: lead._id },
        update: {
          $set: {
            status: 'unroutable',
            assignedBD: null,
            matchScore: null,
            matchReasons: [],
            assignmentMode: null,
            coverageGapLanguage,
            unroutableReason: reason,
          },
        },
      },
    });
  }

  if (ops.length) await Lead.bulkWrite(ops);

  const gaps = {};
  for (const u of unroutable) {
    const key = u.coverageGapLanguage ?? 'unknown';
    gaps[key] = (gaps[key] ?? 0) + 1;
  }

  const avgScore = assignments.length
    ? Math.round(assignments.reduce((s, a) => s + a.match.score, 0) / assignments.length)
    : 0;

  return {
    processed: leads.length,
    assigned: assignments.length,
    unroutable: unroutable.length,
    avgMatchScore: avgScore,
    gaps,
    sample: assignments.slice(0, 5).map((a) => ({
      lead: a.lead.name,
      bd: a.match.name,
      score: a.match.score,
      language: a.match.bestLanguage,
    })),
  };
}

/** Every BD scored for one lead - powers the "why this BD?" explainer. */
export async function matchesForLead(leadId) {
  const [lead, bds, loadMap] = await Promise.all([
    Lead.findById(leadId).lean(),
    BD.find().lean(),
    currentLoadMap(),
  ]);
  if (!lead) return null;
  // lean() skips the schema virtual, so attach the resolved languages here.
  return {
    lead: { ...lead, effectiveLanguages: effectiveLanguages(lead) },
    matches: rankMatches(lead, bds, loadMap),
  };
}

/**
 * Manual override. We still score the pair and store the reasons, and we do
 * not silently hide a language mismatch - the response flags it so the UI can
 * warn before the BD wastes the call.
 */
export async function assignManually(leadId, bdId) {
  const [lead, bd, loadMap] = await Promise.all([
    Lead.findById(leadId),
    BD.findById(bdId).lean(),
    currentLoadMap(),
  ]);
  if (!lead) throw Object.assign(new Error('Lead not found'), { status: 404 });
  if (!bd) throw Object.assign(new Error('BD not found'), { status: 404 });

  const ranked = rankMatches(lead.toObject(), [bd], loadMap);
  const match = ranked[0];

  lead.assignedBD = bd._id;
  lead.assignedAt = new Date();
  lead.status = 'assigned';
  lead.matchScore = match.score;
  lead.matchReasons = match.reasons;
  lead.assignmentMode = 'manual';
  lead.coverageGapLanguage = null;
  lead.unroutableReason = null;
  await lead.save();

  return { lead, match, languageMismatch: match.blocked === 'language' };
}
