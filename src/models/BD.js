import mongoose from 'mongoose';
import { LANGUAGE_CODES } from '../data/languages.js';

const spokenLanguageSchema = new mongoose.Schema(
  {
    code: { type: String, enum: LANGUAGE_CODES, required: true },
    proficiency: { type: String, enum: ['native', 'fluent', 'basic'], default: 'fluent' },
  },
  { _id: false },
);

/** A Business Development associate - the person who actually makes the call. */
const bdSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    region: { type: String, trim: true },
    languages: { type: [spokenLanguageSchema], default: [] },
    dailyCapacity: { type: Number, default: 15, min: 1 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const BD = mongoose.model('BD', bdSchema);
export default BD;
