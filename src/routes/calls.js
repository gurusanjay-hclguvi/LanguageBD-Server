import { Router } from 'express';
import { CallLog } from '../models/CallLog.js';
import { Lead } from '../models/Lead.js';
import { BD } from '../models/BD.js';
import { normalizeLanguages, labelList } from '../data/languages.js';

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
 * Log a call outcome.
 *
 * This is where the system learns. The BD has just spoken to the learner, so
 * whatever they heard is better evidence than anything on the lead form or
 * guessed from a postcode:
 *
 *   - `observedLanguages` is promoted onto the lead as `confirmed`, the highest
 *     confidence tier, so every future routing decision uses it.
 *   - A `language_barrier` also records the BD on `lead.failedBDs` and returns
 *     the lead to the pool, so re-routing cannot hand it straight back to the
 *     person it just failed with.
 */
router.post('/', async (req, res, next) => {
  try {
    const { leadId, bdId, outcome, notes, durationSec, observedLanguages } = req.body ?? {};
    if (!leadId || !bdId) return res.status(400).json({ error: 'leadId and bdId are required' });
    if (!OUTCOMES.includes(outcome)) {
      return res.status(400).json({ error: 'outcome must be one of ' + OUTCOMES.join(', ') });
    }

    const observed = normalizeLanguages(observedLanguages);

    // A language barrier means our data was wrong, so this is exactly the case
    // where the correction is worth insisting on.
    if (outcome === 'language_barrier' && !observed.length) {
      return res.status(400).json({
        error:
          'observedLanguages is required for a language_barrier call - record what the learner ' +
          'actually speaks so routing can correct itself',
      });
    }

    const [lead, bd] = await Promise.all([Lead.findById(leadId), BD.findById(bdId).lean()]);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (!bd) return res.status(404).json({ error: 'BD not found' });

    const call = await CallLog.create({
      lead: leadId,
      bd: bdId,
      outcome,
      observedLanguages: observed,
      notes: notes ?? '',
      durationSec: durationSec ?? 0,
    });

    // Ground truth from the call outranks the form and the region guess.
    let corrected = false;
    if (observed.length) {
      const before = lead.effectiveLanguages.join(',');
      lead.confirmedLanguages = observed;
      lead.languageBasis =
        'Confirmed by ' + bd.name + ' on a call, ' + new Date().toISOString().slice(0, 10);
      corrected = before !== observed.join(',');
    }

    if (outcome === 'language_barrier') {
      lead.failedBDs.push({
        bd: bdId,
        at: new Date(),
        reason: 'Language barrier - learner speaks ' + labelList(observed),
      });
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

    res.status(201).json({ call, lead, languageCorrected: corrected });
  } catch (err) {
    next(err);
  }
});

export default router;
