import mongoose from 'mongoose';
import { LANGUAGE_CODES } from '../data/languages.js';
import { applyLanguageResolution } from '../services/languageInference.js';

/** A learner who filled a form and is waiting for a call. */
const leadSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    course: { type: String, trim: true },
    source: { type: String, trim: true, default: 'web' },

    // What the learner told us (may be empty)...
    preferredLanguages: { type: [String], enum: LANGUAGE_CODES, default: [] },
    // ...and what we guessed from their region when they told us nothing.
    inferredLanguages: { type: [String], enum: LANGUAGE_CODES, default: [] },
    languageSource: { type: String, enum: ['explicit', 'inferred', 'unknown'], default: 'unknown' },
    languageConfidence: { type: Number, default: 0, min: 0, max: 1 },
    languageBasis: { type: String, default: '' },

    status: {
      type: String,
      enum: ['new', 'assigned', 'contacted', 'unroutable'],
      default: 'new',
      index: true,
    },
    assignedBD: { type: mongoose.Schema.Types.ObjectId, ref: 'BD', default: null, index: true },
    assignedAt: { type: Date, default: null },
    matchScore: { type: Number, default: null },
    matchReasons: { type: [String], default: [] },
    assignmentMode: { type: String, enum: ['auto', 'manual', null], default: null },

    // Set when nobody on the team can speak to this learner - the business signal.
    coverageGapLanguage: { type: String, default: null },
    unroutableReason: { type: String, default: null },

    importBatchId: { type: String, default: null, index: true },
  },
  { timestamps: true },
);

// Every creation path (API, CSV import, seed) goes through the same resolution,
// so a lead can never exist without its language provenance being recorded.
leadSchema.pre('validate', function resolve(next) {
  if (this.isNew || this.isModified('preferredLanguages') || this.isModified('state') || this.isModified('city')) {
    applyLanguageResolution(this);
  }
  next();
});

/** The languages we will actually match on - declared beats inferred. */
leadSchema.virtual('effectiveLanguages').get(function get() {
  if (this.preferredLanguages?.length) return this.preferredLanguages;
  if (this.inferredLanguages?.length) return this.inferredLanguages;
  return ['english'];
});

leadSchema.set('toJSON', { virtuals: true });
leadSchema.set('toObject', { virtuals: true });

export const Lead = mongoose.model('Lead', leadSchema);
export default Lead;
