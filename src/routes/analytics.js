import { Router } from 'express';
import { analyticsSummary } from '../services/analytics.js';

const router = Router();

router.get('/summary', async (req, res, next) => {
  try {
    res.json(await analyticsSummary());
  } catch (err) {
    next(err);
  }
});

export default router;
