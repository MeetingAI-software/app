import { Router } from 'express';
import type { CustomerPortalService } from '../../../application/customer-portal.service';

export function createBillingRoutes(customerPortal: CustomerPortalService): Router {
  const router = Router();

  // The endpoint accepts no customer/subscription identifiers. Ownership comes from req.userId.
  router.post('/api/me/billing-portal', async (req, res, next) => {
    try {
      const url = await customerPortal.createForUser(req.userId!);
      return res.status(201).json({ url });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
