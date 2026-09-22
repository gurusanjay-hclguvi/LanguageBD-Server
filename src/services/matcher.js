import { languageLabel, labelList } from '../data/languages.js';
import { effectiveLanguages } from './languageInference.js';

/**
 * How much of the language score a BD earns for a shared language, by how well
 * they actually speak it. A "basic" Tamil speaker beats nobody, but a native
 * speaker should win the lead every time.
 */
export const PROFICIENCY_WEIGHT = { native: 1, fluent: 0.85, basic: 0.6 };

export const WEIGHTS = {
  language: 60,   // shared language, scaled by proficiency
  primary: 15,    // the shared language is the learner's FIRST language
  confidence: 10, // a declared language beats an inferred one
  load: 10,       // spread work across the team
  region: 5,      // same state - local context and familiarity
};

const pct = (n) => Math.round(n * 100);

/** Has this BD already burnt a call on this learner over language? */
function hasAlreadyFailed(lead, bd) {
  if (!lead?.failedBDs?.length || !bd?._id) return false;
  return lead.failedBDs.some((entry) => String(entry?.bd) === String(bd._id));
}

/**
 * Score one (lead, BD) pair. The hard gate is language: with no shared
 * language the BD is ineligible, full stop. That is the whole point of the
 * product - better to leave a lead unassigned and visible than to burn a call
 * that cannot possibly work.
 */
export function scoreMatch(lead, bd, load = 0) {
  const leadLangs = effectiveLanguages(lead);
  const bdLangs = bd.languages ?? [];
  const reasons = [];

  const shared = [];
  for (const spoken of bdLangs) {
    const leadIndex = leadLangs.indexOf(spoken.code);
    if (leadIndex === -1) continue;
    shared.push({
      code: spoken.code,
      proficiency: spoken.proficiency,
      weight: PROFICIENCY_WEIGHT[spoken.proficiency] ?? 0.6,
      leadIndex,
    });
  }

  if (!shared.length) {
    const bdList = labelList(bdLangs.map((l) => l.code));
    return {
      eligible: false,
      blocked: 'language',
      score: 0,
      sharedLanguages: [],
      bestLanguage: null,
      reasons: [
        'No shared language - learner speaks ' + labelList(leadLangs) + ', ' + bd.name + ' speaks ' + bdList,
      ],
    };
  }

  // Best shared language: the learner's earliest-listed one, then proficiency.
  shared.sort((a, b) => a.leadIndex - b.leadIndex || b.weight - a.weight);
  const best = shared[0];

  let score = WEIGHTS.language * best.weight;
  reasons.push(
    'Speaks ' + languageLabel(best.code) + ' (' + best.proficiency + ') - +' +
      Math.round(WEIGHTS.language * best.weight),
  );

  if (best.leadIndex === 0) {
    score += WEIGHTS.primary;
    reasons.push(
      languageLabel(best.code) + " is the learner's primary language - +" + WEIGHTS.primary,
    );
  }

  const confidence = lead.languageConfidence ?? 0;
  score += WEIGHTS.confidence * confidence;
  reasons.push(
    'Language is ' + lead.languageSource + ' (' + pct(confidence) + '% confidence) - +' +
      Math.round(WEIGHTS.confidence * confidence),
  );

  const capacity = bd.dailyCapacity || 1;
  const headroom = Math.max(0, 1 - load / capacity);
  score += WEIGHTS.load * headroom;
  reasons.push('Current load ' + load + '/' + capacity + ' - +' + Math.round(WEIGHTS.load * headroom));

  const sameRegion =
    lead.state && bd.region && String(lead.state).toLowerCase() === String(bd.region).toLowerCase();
  if (sameRegion) {
    score += WEIGHTS.region;
    const region = String(bd.region).replace(/\b\w/g, (c) => c.toUpperCase());
    reasons.push('Same region (' + region + ') - +' + WEIGHTS.region);
  }

  let eligible = true;
  let blocked = null;
  if (hasAlreadyFailed(lead, bd)) {
    // Sharing a language on paper is not enough once a real call has proved
    // otherwise - handing the lead back to the same BD repeats the mistake.
    eligible = false;
    blocked = 'already-failed';
    reasons.push(bd.name + ' already hit a language barrier with this learner');
  } else if (bd.isActive === false) {
    eligible = false;
    blocked = 'inactive';
    reasons.push(bd.name + ' is marked inactive');
  } else if (load >= capacity) {
    eligible = false;
    blocked = 'capacity';
    reasons.push('At capacity (' + load + '/' + capacity + ') - cannot take more today');
  }

  return {
    eligible,
    blocked,
    score: Math.round(score),
    sharedLanguages: shared.map((s) => s.code),
    bestLanguage: best.code,
    reasons,
  };
}

/**
 * Score every BD for one lead, best first. Ineligible BDs are kept, with the
 * reason they were ruled out, so the UI can explain a routing decision instead
 * of presenting it as a black box.
 */
export function rankMatches(lead, bds, loadMap = {}) {
  return bds
    .map((bd) => {
      const result = scoreMatch(lead, bd, loadMap[String(bd._id)] ?? 0);
      return {
        bdId: String(bd._id),
        name: bd.name,
        email: bd.email,
        region: bd.region,
        languages: bd.languages,
        load: loadMap[String(bd._id)] ?? 0,
        capacity: bd.dailyCapacity,
        ...result,
      };
    })
    .sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score);
}

/**
 * Greedy assignment over a batch of leads.
 *
 * Leads with a DECLARED language go first: they are the ones we are certain
 * about, so they should win the scarce specialist BDs. Guessed leads take what
 * is left. A lead with no eligible BD is never force-fitted onto someone who
 * cannot speak to them - it becomes `unroutable` with the language recorded as
 * a coverage gap, which is the signal the business actually needs.
 */
export function assignLeads(leads, bds, loadMap = {}) {
  const load = { ...loadMap };
  const ordered = [...leads].sort(
    (a, b) =>
      (b.languageConfidence ?? 0) - (a.languageConfidence ?? 0) ||
      new Date(a.createdAt ?? 0) - new Date(b.createdAt ?? 0),
  );

  const assignments = [];
  const unroutable = [];

  for (const lead of ordered) {
    const ranked = rankMatches(lead, bds, load);
    const winner = ranked.find((r) => r.eligible);

    if (!winner) {
      const langs = effectiveLanguages(lead);
      const blockedByCapacity = ranked.some((r) => r.blocked === 'capacity');
      const blockedByPastFailure = ranked.some((r) => r.blocked === 'already-failed');

      let reason;
      if (blockedByCapacity) {
        reason = 'Every ' + languageLabel(langs[0]) + '-speaking BD is at capacity today';
      } else if (blockedByPastFailure) {
        reason =
          'The only BDs who share a language with this learner have already hit a ' +
          'language barrier with them';
      } else {
        reason = 'No BD on the team speaks ' + labelList(langs);
      }

      unroutable.push({ lead, coverageGapLanguage: langs[0] ?? null, reason });
      continue;
    }

    load[winner.bdId] = (load[winner.bdId] ?? 0) + 1;
    assignments.push({ lead, match: winner, runnerUp: ranked.filter((r) => r.eligible)[1] ?? null });
  }

  return { assignments, unroutable, load };
}
