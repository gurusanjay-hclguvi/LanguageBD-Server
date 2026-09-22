import { normalizeLanguages } from '../data/languages.js';
import { languagesForRegion, regionLabel } from '../data/regionLanguages.js';

/**
 * Works out which languages a learner most likely speaks, and how much we
 * trust that answer. Three tiers, deliberately distinguishable in the UI:
 *
 *   explicit  (1.00) - the learner told us on the form. Treat as fact.
 *   inferred  (0.60) - guessed from their state/city. Useful, not gospel.
 *   unknown   (0.00) - no signal at all; we fall back to English so the lead
 *                      is still callable, but the UI shouts that it is a guess.
 */
export const CONFIDENCE = { explicit: 1, inferred: 0.6, unknown: 0 };

export function resolveLanguages({ preferredLanguages, city, state } = {}) {
  const explicit = normalizeLanguages(preferredLanguages);
  const { region, languages: regional } = languagesForRegion({ state, city });

  if (explicit.length) {
    return {
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
      preferredLanguages: [],
      inferredLanguages: regional,
      effectiveLanguages: regional,
      languageSource: 'inferred',
      languageConfidence: CONFIDENCE.inferred,
      languageBasis: 'No language on the form - inferred from region: ' + regionLabel(region),
    };
  }

  return {
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
 */
export function effectiveLanguages(lead) {
  if (lead?.preferredLanguages?.length) return lead.preferredLanguages;
  if (lead?.inferredLanguages?.length) return lead.inferredLanguages;
  return ['english'];
}

/** Mutates a lead-shaped object in place with the resolved language fields. */
export function applyLanguageResolution(lead) {
  const resolved = resolveLanguages(lead);
  lead.preferredLanguages = resolved.preferredLanguages;
  lead.inferredLanguages = resolved.inferredLanguages;
  lead.languageSource = resolved.languageSource;
  lead.languageConfidence = resolved.languageConfidence;
  lead.languageBasis = resolved.languageBasis;
  return lead;
}
