import { Router } from 'express';
import { runAssignment } from '../services/routing.js';

const router = Router();

/** Route every waiting lead. Safe to re-run; already-assigned leads are untouched. */
router.post('/run', async (req, res, next) => {
  try {
    res.json(await runAssignment());
  } catch (err) {
    next(err);
  }
});

export default router;
