import { Router } from 'express';
import type { CustomerPortalService } from '../../../application/customer-portal.service';
import type { CheckoutService } from '../../../application/checkout.service';
import { z } from 'zod';

export function createBillingRoutes(customerPortal: CustomerPortalService, checkout: CheckoutService): Router {
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

  router.post('/api/me/checkout', async (req, res, next) => {
    try {
      const { priceId } = z.object({ priceId: z.string().min(1) }).parse(req.body);
      const transactionId = await checkout.createForUser(req.userId!, priceId);
      return res.status(201).json({ transactionId });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
