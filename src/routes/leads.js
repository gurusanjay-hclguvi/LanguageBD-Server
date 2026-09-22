import { Router } from 'express';
import { Lead } from '../models/Lead.js';
import { BD } from '../models/BD.js';
import { normalizeLanguages } from '../data/languages.js';
import { matchesForLead, assignManually, runAssignment } from '../services/routing.js';
import { effectiveLanguages } from '../services/languageInference.js';

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
    const [leads, bds] = await Promise.all([
      Lead.find(filter)
        .populate('assignedBD', 'name languages region')
        .sort({ createdAt: -1 })
        .limit(Number(limit))
        .exec(),
      BD.find({ isActive: { $ne: false } }).select('languages').lean(),
    ]);
    res.json(
      leads.map((lead) => {
        const leadLanguages = effectiveLanguages(lead);
        const hasAvailableMatch = bds.some((bd) =>
          (bd.languages ?? []).some((language) => leadLanguages.includes(language.code)),
        );
        return { ...lead.toObject(), hasAvailableMatch };
      }),
    );
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, phone, email, city, state, course, source, preferredLanguages } = req.body ?? {};
    if (!name || String(name).trim().length < 2) return res.status(400).json({ error: 'name must be at least 2 characters' });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
      return res.status(400).json({ error: 'Please provide a valid email address' });
    }
    if (phone && !/^[0-9]{10}$/.test(String(phone).trim())) {
      return res.status(400).json({ error: 'Phone number must contain exactly 10 digits' });
    }
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

    // Route immediately - no manual "assign" step for the common case.
    await runAssignment();
    const routed = await Lead.findById(lead._id).populate('assignedBD', 'name languages region').exec();
    res.status(201).json(routed);
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
