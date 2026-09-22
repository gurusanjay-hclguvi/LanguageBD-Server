import mongoose from 'mongoose';

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
    durationSec: { type: Number, default: 0 },
    notes: { type: String, default: '' },
  },
  { timestamps: true },
);

export const CallLog = mongoose.model('CallLog', callLogSchema);
export default CallLog;
