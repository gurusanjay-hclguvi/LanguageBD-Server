import { normalizeLanguages } from '../data/languages.js';
import { languagesForRegion, regionLabel } from '../data/regionLanguages.js';

/**
 * Works out which languages a learner most likely speaks, and how much we
 * trust that answer. Four tiers, deliberately distinguishable in the UI:
 *
 *   confirmed (1.00) - a BD heard them speak it on a call. Ground truth, and
 *                      the only source that outranks the learner's own form.
 *   explicit  (1.00) - the learner told us on the form. Treat as fact.
 *   inferred  (0.60) - guessed from their state/city. Useful, not gospel.
 *   unknown   (0.00) - no signal at all; we fall back to English so the lead
 *                      is still callable, but the UI shouts that it is a guess.
 */
export const CONFIDENCE = { confirmed: 1, explicit: 1, inferred: 0.6, unknown: 0 };

export function resolveLanguages({
  confirmedLanguages,
  preferredLanguages,
  city,
  state,
  languageBasis,
} = {}) {
  const confirmed = normalizeLanguages(confirmedLanguages);
  const explicit = normalizeLanguages(preferredLanguages);
  const { region, languages: regional } = languagesForRegion({ state, city });

  /*
   * Checked first, and deliberately so: this function re-runs whenever a lead's
   * form fields change, and a language a BD verified on a live call must never
   * be overwritten by a fresh guess from the learner's postcode.
   */
  if (confirmed.length) {
    return {
      confirmedLanguages: confirmed,
      preferredLanguages: explicit,
      inferredLanguages: regional,
      effectiveLanguages: confirmed,
      languageSource: 'confirmed',
      languageConfidence: CONFIDENCE.confirmed,
      // Preserve the "who and when" the call handler wrote, if there is one.
      languageBasis: languageBasis || 'Confirmed by a BD on a call',
    };
  }

  if (explicit.length) {
    return {
      confirmedLanguages: [],
      preferredLanguages: explicit,
      inferredLanguages: regional,
      effectiveLanguages: explicit,
      languageSource: 'explicit',
      languageConfidence: CONFIDENCE.explicit,
      languageBasis: 'Declared by the learner on the lead form',
    };
  }

  if (regional.length) {
    return {
      confirmedLanguages: [],
      preferredLanguages: [],
      inferredLanguages: regional,
      effectiveLanguages: regional,
      languageSource: 'inferred',
      languageConfidence: CONFIDENCE.inferred,
      languageBasis: 'No language on the form - inferred from region: ' + regionLabel(region),
    };
  }

  return {
    confirmedLanguages: [],
    preferredLanguages: [],
    inferredLanguages: [],
    effectiveLanguages: ['english'],
    languageSource: 'unknown',
    languageConfidence: CONFIDENCE.unknown,
    languageBasis: 'No language and no usable region - defaulting to English',
  };
}

/**
 * The languages the matcher should actually match on, for an already-saved
 * lead document. Kept here so the rule lives in exactly one place.
 * Mirrors the `effectiveLanguages` virtual on the Lead schema.
 */
export function effectiveLanguages(lead) {
  if (lead?.confirmedLanguages?.length) return lead.confirmedLanguages;
  if (lead?.preferredLanguages?.length) return lead.preferredLanguages;
  if (lead?.inferredLanguages?.length) return lead.inferredLanguages;
  return ['english'];
}

/** Mutates a lead-shaped object in place with the resolved language fields. */
export function applyLanguageResolution(lead) {
  const resolved = resolveLanguages(lead);
  lead.confirmedLanguages = resolved.confirmedLanguages;
  lead.preferredLanguages = resolved.preferredLanguages;
  lead.inferredLanguages = resolved.inferredLanguages;
  lead.languageSource = resolved.languageSource;
  lead.languageConfidence = resolved.languageConfidence;
  lead.languageBasis = resolved.languageBasis;
  return lead;
}
