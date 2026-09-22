import { Router } from 'express';
import { Lead } from '../models/Lead.js';
import { normalizeLanguages } from '../data/languages.js';
import { matchesForLead, assignManually } from '../services/routing.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { status, language, bd, source, q, limit = 500 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (source) filter.languageSource = source;
    if (bd) filter.assignedBD = bd;
    if (language) {
      filter.$or = [{ preferredLanguages: language }, { inferredLanguages: language }];
    }
    if (q) {
      const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$and = [{ $or: [{ name: rx }, { phone: rx }, { email: rx }, { city: rx }] }];
    }
    const leads = await Lead.find(filter)
      .populate('assignedBD', 'name languages region')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .exec();
    res.json(leads);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, phone, email, city, state, course, source, preferredLanguages } = req.body ?? {};
    if (!name) return res.status(400).json({ error: 'name is required' });
    const lead = await Lead.create({
      name,
      phone,
      email,
      city,
      state,
      course,
      source: source || 'manual',
      preferredLanguages: normalizeLanguages(preferredLanguages),
    });
    res.status(201).json(lead);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const lead = await Lead.findById(req.params.id)
      .populate('assignedBD', 'name languages region email')
      .exec();
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    res.json(lead);
  } catch (err) {
    next(err);
  }
});

/** Ranked BDs for this lead, with the reasoning behind each score. */
router.get('/:id/matches', async (req, res, next) => {
  try {
    const result = await matchesForLead(req.params.id);
    if (!result) return res.status(404).json({ error: 'Lead not found' });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/** Manual override - the response flags a language mismatch instead of hiding it. */
router.post('/:id/assign', async (req, res, next) => {
  try {
    const { bdId } = req.body ?? {};
    if (!bdId) return res.status(400).json({ error: 'bdId is required' });
    const result = await assignManually(req.params.id, bdId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
