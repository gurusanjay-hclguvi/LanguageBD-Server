import mongoose from 'mongoose';
import { LANGUAGE_CODES } from '../data/languages.js';
import { applyLanguageResolution } from '../services/languageInference.js';

/** A learner who filled a form and is waiting for a call. */
const leadSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    phone: { type: String, trim: true, match: [/^$|^[0-9]{10}$/, 'Phone number must contain exactly 10 digits'] },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 254,
      match: [/^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email address'],
    },
    city: { type: String, trim: true, maxlength: 80 },
    state: { type: String, trim: true, maxlength: 80 },
    course: { type: String, trim: true, maxlength: 120 },
    source: { type: String, trim: true, default: 'web' },

    // What a BD actually heard on a call - ground truth, and the only tier that
    // outranks what the learner wrote on the form.
    confirmedLanguages: { type: [String], enum: LANGUAGE_CODES, default: [] },
    // What the learner told us (may be empty)...
    preferredLanguages: { type: [String], enum: LANGUAGE_CODES, default: [] },
    // ...and what we guessed from their region when they told us nothing.
    inferredLanguages: { type: [String], enum: LANGUAGE_CODES, default: [] },
    languageSource: {
      type: String,
      enum: ['confirmed', 'explicit', 'inferred', 'unknown'],
      default: 'unknown',
    },
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

    /**
     * BDs who have already hit a language barrier with this learner. Routing
     * treats them as ineligible, so a lead returned to the pool cannot be
     * handed straight back to someone it has already failed with.
     */
    failedBDs: {
      type: [
        {
          _id: false,
          bd: { type: mongoose.Schema.Types.ObjectId, ref: 'BD' },
          at: { type: Date, default: Date.now },
          reason: { type: String, default: '' },
        },
      ],
      default: [],
    },

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
  if (
    this.isNew ||
    this.isModified('confirmedLanguages') ||
    this.isModified('preferredLanguages') ||
    this.isModified('state') ||
    this.isModified('city')
  ) {
    applyLanguageResolution(this);
  }
  next();
});

/**
 * The languages we will actually match on. Confirmed on a call beats what the
 * learner wrote on the form, which beats a guess from their region.
 * Keep this in step with effectiveLanguages() in services/languageInference.js.
 */
leadSchema.virtual('effectiveLanguages').get(function get() {
  if (this.confirmedLanguages?.length) return this.confirmedLanguages;
  if (this.preferredLanguages?.length) return this.preferredLanguages;
  if (this.inferredLanguages?.length) return this.inferredLanguages;
  return ['english'];
});

leadSchema.set('toJSON', { virtuals: true });
leadSchema.set('toObject', { virtuals: true });

export const Lead = mongoose.model('Lead', leadSchema);
export default Lead;
