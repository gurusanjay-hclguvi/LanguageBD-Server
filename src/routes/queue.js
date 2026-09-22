import { Router } from 'express';
import { Lead } from '../models/Lead.js';
import { BD } from '../models/BD.js';
import { scoreMatch } from '../services/matcher.js';

const router = Router();

/**
 * One BD's working queue. Each lead carries the shared language up front, so
 * the BD knows which language to open the call in.
 */
router.get('/:bdId', async (req, res, next) => {
  try {
    const { bdId } = req.params;
    // Not real auth - a demo role switch. A BD may only read their own queue.
    if (req.actor?.role === 'bd' && req.actor.bdId !== bdId) {
      return res.status(403).json({ error: 'You can only view your own queue' });
    }

    const bd = await BD.findById(bdId).lean();
    if (!bd) return res.status(404).json({ error: 'BD not found' });

    const leads = await Lead.find({ assignedBD: bdId, status: { $in: ['assigned', 'contacted'] } })
      .sort({ matchScore: -1, createdAt: 1 })
      .exec();

    const items = leads.map((doc) => {
      const lead = doc.toJSON();
      const match = scoreMatch(lead, bd, 0);
      return {
        ...lead,
        sharedLanguages: match.sharedLanguages,
        speakInLanguage: match.bestLanguage,
        matchReasons: lead.matchReasons?.length ? lead.matchReasons : match.reasons,
      };
    });

    res.json({ bd, leads: items });
  } catch (err) {
    next(err);
  }
});

export default router;
