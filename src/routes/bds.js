import { Router } from 'express';
import { BD } from '../models/BD.js';
import { Lead } from '../models/Lead.js';
import { normalizeLanguage } from '../data/languages.js';

const router = Router();

/** Accepts ["tamil"] or [{code,proficiency}] and returns clean sub-documents. */
function normalizeSpoken(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const entry of list) {
    const raw = typeof entry === 'string' ? { code: entry } : entry ?? {};
    const code = normalizeLanguage(raw.code);
    if (!code || out.some((l) => l.code === code)) continue;
    const proficiency = ['native', 'fluent', 'basic'].includes(raw.proficiency) ? raw.proficiency : 'fluent';
    out.push({ code, proficiency });
  }
  return out;
}

router.get('/', async (req, res, next) => {
  try {
    const bds = await BD.find().sort({ name: 1 }).lean();
    const loads = await Lead.aggregate([
      { $match: { assignedBD: { $ne: null }, status: { $in: ['assigned', 'contacted'] } } },
      { $group: { _id: '$assignedBD', count: { $sum: 1 } } },
    ]);
    const loadMap = Object.fromEntries(loads.map((l) => [String(l._id), l.count]));
    res.json(bds.map((bd) => ({ ...bd, currentLoad: loadMap[String(bd._id)] ?? 0 })));
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, email, phone, region, dailyCapacity, isActive, languages } = req.body ?? {};
    if (!name) return res.status(400).json({ error: 'name is required' });
    const bd = await BD.create({
      name,
      email,
      phone,
      region,
      dailyCapacity: dailyCapacity ?? 15,
      isActive: isActive ?? true,
      languages: normalizeSpoken(languages),
    });
    res.status(201).json(bd);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const update = { ...req.body };
    if (update.languages) update.languages = normalizeSpoken(update.languages);
    const bd = await BD.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!bd) return res.status(404).json({ error: 'BD not found' });
    res.json(bd);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const bd = await BD.findByIdAndDelete(req.params.id);
    if (!bd) return res.status(404).json({ error: 'BD not found' });
    // Their leads go back in the pool rather than dangling on a missing BD.
    await Lead.updateMany(
      { assignedBD: bd._id, status: { $ne: 'contacted' } },
      { $set: { assignedBD: null, status: 'new', matchScore: null, matchReasons: [], assignmentMode: null } },
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
