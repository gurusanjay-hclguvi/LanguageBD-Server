import { Router } from 'express';
import { Lead } from '../models/Lead.js';
import { effectiveLanguages } from '../services/languageInference.js';

const router = Router();

/**
 * Get recent assignments for a BD (notifications).
 * Returns leads assigned to this BD in the last 24 hours.
 */
router.get('/:bdId', async (req, res, next) => {
  try {
    const { bdId } = req.params;
    const hours = parseInt(req.query.hours) || 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const recentAssignments = await Lead.find({
      assignedBD: bdId,
      assignedAt: { $gte: since },
      status: 'assigned'
    })
    .select(
      'name phone city state course assignedAt matchScore languageSource ' +
        'confirmedLanguages preferredLanguages inferredLanguages',
    )
    .sort({ assignedAt: -1 })
    .lean();

    res.json({
      count: recentAssignments.length,
      notifications: recentAssignments.map(lead => ({
        _id: lead._id,
        name: lead.name,
        phone: lead.phone,
        location: [lead.city, lead.state].filter(Boolean).join(', '),
        course: lead.course,
        assignedAt: lead.assignedAt,
        score: lead.matchScore,
        speakIn: effectiveLanguages(lead)[0],
        languageSource: lead.languageSource
      }))
    });
  } catch (err) {
    next(err);
  }
});

export default router;
