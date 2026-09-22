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
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 254,
      match: [/^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email address'],
    },
    phone: { type: String, trim: true, match: [/^$|^[0-9]{10}$/, 'Phone number must contain exactly 10 digits'] },
    region: { type: String, trim: true, maxlength: 80 },
    languages: { type: [spokenLanguageSchema], default: [] },
    dailyCapacity: { type: Number, default: 15, min: 1, max: 500, validate: Number.isInteger },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const BD = mongoose.model('BD', bdSchema);
export default BD;
