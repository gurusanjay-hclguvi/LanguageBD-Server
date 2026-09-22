import { Router } from 'express';
import { CallLog } from '../models/CallLog.js';
import { Lead } from '../models/Lead.js';

const router = Router();

const OUTCOMES = ['connected', 'language_barrier', 'no_answer', 'not_interested', 'converted'];

router.get('/', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.bd) filter.bd = req.query.bd;
    if (req.query.outcome) filter.outcome = req.query.outcome;
    const calls = await CallLog.find(filter)
      .populate('lead', 'name phone')
      .populate('bd', 'name')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    res.json(calls);
  } catch (err) {
    next(err);
  }
});

/**
 * Log a call outcome. A `language_barrier` result is the signal that routing
 * got it wrong, so we record it on the lead too and push the lead back into
 * the pool for re-routing rather than leaving it parked on the wrong BD.
 */
router.post('/', async (req, res, next) => {
  try {
    const { leadId, bdId, outcome, notes, durationSec } = req.body ?? {};
    if (!leadId || !bdId) return res.status(400).json({ error: 'leadId and bdId are required' });
    if (!OUTCOMES.includes(outcome)) {
      return res.status(400).json({ error: 'outcome must be one of ' + OUTCOMES.join(', ') });
    }

    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const call = await CallLog.create({
      lead: leadId,
      bd: bdId,
      outcome,
      notes: notes ?? '',
      durationSec: durationSec ?? 0,
    });

    if (outcome === 'language_barrier') {
      lead.status = 'new';
      lead.assignedBD = null;
      lead.matchScore = null;
      lead.matchReasons = [];
      lead.assignmentMode = null;
      lead.unroutableReason = 'Returned to the pool after a language-barrier call';
    } else {
      lead.status = 'contacted';
    }
    await lead.save();

    res.status(201).json({ call, lead });
  } catch (err) {
    next(err);
  }
});

export default router;
