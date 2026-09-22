import mongoose from 'mongoose';
import { LANGUAGE_CODES } from '../data/languages.js';

/**
 * One call attempt. `language_barrier` is the outcome this entire product
 * exists to drive to zero, so it is a first-class enum value rather than a
 * note buried in free text.
 */
const callLogSchema = new mongoose.Schema(
  {
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
    bd: { type: mongoose.Schema.Types.ObjectId, ref: 'BD', required: true, index: true },
    outcome: {
      type: String,
      enum: ['connected', 'language_barrier', 'no_answer', 'not_interested', 'converted'],
      required: true,
      index: true,
    },
    /**
     * What the learner actually turned out to speak, as heard by the BD on the
     * call. This is the only ground truth in the system - everything else is
     * either self-reported on a form or guessed from a region - so it is
     * captured as structured data rather than left in `notes`.
     */
    observedLanguages: { type: [String], enum: LANGUAGE_CODES, default: [] },

    durationSec: { type: Number, default: 0 },
    notes: { type: String, default: '' },
  },
  { timestamps: true },
);

export const CallLog = mongoose.model('CallLog', callLogSchema);
export default CallLog;
