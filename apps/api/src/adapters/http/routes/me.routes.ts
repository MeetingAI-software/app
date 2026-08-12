import { Router } from 'express';
import type { UsageRepository } from '../../../ports/repositories.port';
import type { BillingAccessProvider } from '../../../domain/billing';

/** GET /api/me/usage — this month's recorded seconds vs the cap; feeds the header indicator (§6). */
export function createMeRoutes(
  usageRepo: UsageRepository,
  billingAccess: BillingAccessProvider,
  inRoomRecordingEnabled = false,
): Router {
  const router = Router();

  router.get('/api/me/usage', async (req, res, next) => {
    try {
      const [secondsUsed, access] = await Promise.all([
        usageRepo.monthlyTotalSeconds(req.userId!),
        billingAccess.getAccess(req.userId!),
      ]);
      return res.status(200).json({ secondsUsed, secondsCap: access.entitlements.monthlySecondsCap });
    } catch (err) {
      return next(err);
    }
  });

  router.get('/api/me/subscription', async (req, res, next) => {
    try {
      const access = await billingAccess.getAccess(req.userId!);
      return res.status(200).json({ ...access, inRoomRecordingEnabled });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
