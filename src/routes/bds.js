import { Router } from 'express';
import { BD } from '../models/BD.js';
import { Lead } from '../models/Lead.js';
import { normalizeLanguage } from '../data/languages.js';
import { runAssignment } from '../services/routing.js';

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
    if (!name || String(name).trim().length < 2) return res.status(400).json({ error: 'name must be at least 2 characters' });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
      return res.status(400).json({ error: 'Please provide a valid email address' });
    }
    if (phone && !/^[0-9]{10}$/.test(String(phone).trim())) {
      return res.status(400).json({ error: 'Phone number must contain exactly 10 digits' });
    }
    if (dailyCapacity != null && (!Number.isInteger(Number(dailyCapacity)) || Number(dailyCapacity) < 1 || Number(dailyCapacity) > 500)) {
      return res.status(400).json({ error: 'Daily capacity must be a whole number from 1 to 500' });
    }
    const bd = await BD.create({
      name,
      email,
      phone,
      region,
      dailyCapacity: dailyCapacity ?? 15,
      isActive: isActive ?? true,
      languages: normalizeSpoken(languages),
    });
    
    // Automatically route unroutable leads that match this BD's languages
    const routingResult = await runAssignment();
    
    // Return BD with routing results
    res.status(201).json({ 
      ...bd.toObject(),
      routing: {
        assigned: routingResult.assigned,
        unroutable: routingResult.unroutable,
        newAssignments: routingResult.sample.filter(s => s.bd === name)
      }
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const update = { ...req.body };
    const languagesChanged = update.languages && JSON.stringify(update.languages) !== JSON.stringify(normalizeSpoken(update.languages));
    if (update.languages) update.languages = normalizeSpoken(update.languages);
    const bd = await BD.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!bd) return res.status(404).json({ error: 'BD not found' });
    
    // If languages or isActive changed, re-route leads
    let routingResult = null;
    if (languagesChanged || 'isActive' in req.body) {
      routingResult = await runAssignment();
    }
    
    res.json({
      ...bd.toObject(),
      ...(routingResult && {
        routing: {
          assigned: routingResult.assigned,
          unroutable: routingResult.unroutable,
          newAssignments: routingResult.sample.filter(s => s.bd === bd.name)
        }
      })
    });
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
