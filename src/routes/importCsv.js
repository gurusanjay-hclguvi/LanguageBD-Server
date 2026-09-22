import { Router } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { randomUUID } from 'node:crypto';
import { Lead } from '../models/Lead.js';
import { normalizeLanguages } from '../data/languages.js';
import { resolveLanguages } from '../services/languageInference.js';
import { runAssignment } from '../services/routing.js';

const router = Router();
// 4 MB, deliberately under Vercel's 4.5 MB serverless request-body ceiling:
// a bigger file is rejected here with a clear message rather than by the
// platform with an opaque 413.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } });

export const CSV_TEMPLATE_HEADERS = ['name', 'phone', 'email', 'city', 'state', 'course', 'preferred_languages'];

/** Header aliases, because nobody exports a CSV with the columns you asked for. */
const FIELD_ALIASES = {
  name: ['name', 'full_name', 'fullname', 'learner', 'student', 'lead_name'],
  phone: ['phone', 'mobile', 'contact', 'phone_number', 'mobile_number'],
  email: ['email', 'email_id', 'mail'],
  city: ['city', 'town', 'location'],
  state: ['state', 'region', 'province'],
  course: ['course', 'program', 'interest', 'course_interest'],
  preferredLanguages: ['preferred_languages', 'language', 'languages', 'preferred_language', 'known_languages'],
};

const key = (h) => String(h ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');

function pick(row, field) {
  for (const alias of FIELD_ALIASES[field]) {
    const value = row[alias];
    if (value != null && String(value).trim() !== '') return String(value).trim();
  }
  return '';
}

router.get('/template.csv', (req, res) => {
  const sample = [
    CSV_TEMPLATE_HEADERS.join(','),
    'Karthik Raja,9876543210,karthik@example.com,Coimbatore,Tamil Nadu,Full Stack Development,Tamil|English',
    'Riya Sen,9876543211,riya@example.com,Kolkata,West Bengal,Data Science,Bengali',
    'Aarav Mehta,9876543212,aarav@example.com,Ahmedabad,Gujarat,Full Stack Development,',
  ].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="lead-import-template.csv"');
  res.send(sample);
});

/**
 * Bulk import. One bad row never fails the batch - it is reported back with
 * its row number so the ops team can fix and re-upload just that row.
 */
router.post('/import', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Upload a CSV file in the "file" field' });

    let rows;
    try {
      rows = parse(req.file.buffer, {
        columns: (header) => header.map(key),
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      });
    } catch (err) {
      return res.status(400).json({ error: 'Could not parse CSV: ' + err.message });
    }

    const importBatchId = randomUUID();
    const docs = [];
    const errors = [];
    const preview = [];

    rows.forEach((row, i) => {
      const rowNumber = i + 2; // +1 for the header, +1 for 1-based counting
      const name = pick(row, 'name');
      if (!name) {
        errors.push({ row: rowNumber, error: 'Missing name', data: row });
        return;
      }
      const city = pick(row, 'city');
      const state = pick(row, 'state');
      const rawLanguages = pick(row, 'preferredLanguages');
      const preferredLanguages = normalizeLanguages(rawLanguages);

      if (rawLanguages && !preferredLanguages.length) {
        errors.push({
          row: rowNumber,
          error: 'Unrecognised language "' + rawLanguages + '" - falling back to region inference',
          data: row,
          severity: 'warning',
        });
      }

      const doc = {
        name,
        phone: pick(row, 'phone'),
        email: pick(row, 'email'),
        city,
        state,
        course: pick(row, 'course'),
        source: 'csv',
        preferredLanguages,
        importBatchId,
      };
      docs.push(doc);

      if (preview.length < 10) {
        const resolved = resolveLanguages(doc);
        preview.push({
          name,
          city,
          state,
          languages: resolved.effectiveLanguages,
          languageSource: resolved.languageSource,
          languageBasis: resolved.languageBasis,
        });
      }
    });

    // create() (not insertMany) so the pre-validate language resolution runs.
    const inserted = docs.length ? await Lead.create(docs) : [];

    // Route immediately - no manual "assign" step for the common case.
    const routing = inserted.length ? await runAssignment() : null;

    res.status(201).json({
      importBatchId,
      rows: rows.length,
      inserted: inserted.length,
      skipped: errors.filter((e) => e.severity !== 'warning').length,
      errors,
      preview,
      routing: routing && {
        assigned: routing.assigned,
        unroutable: routing.unroutable,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
