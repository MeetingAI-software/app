import { Router } from 'express';
import type { UsageRepository } from '../../../ports/repositories.port';
import { config } from '../../../config/env';

/** GET /api/me/usage — this month's recorded seconds vs the cap; feeds the header indicator (§6). */
export function createMeRoutes(usageRepo: UsageRepository): Router {
  const router = Router();

  router.get('/api/me/usage', async (req, res, next) => {
    try {
      const secondsUsed = await usageRepo.monthlyTotalSeconds(req.userId!);
      return res.status(200).json({ secondsUsed, secondsCap: config.MONTHLY_CAP_SECONDS });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
