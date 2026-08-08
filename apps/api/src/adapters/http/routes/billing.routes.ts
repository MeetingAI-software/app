import { Router } from 'express';
import type { CustomerPortalService } from '../../../application/customer-portal.service';
import type { CheckoutService } from '../../../application/checkout.service';
import type { SubscriptionUpdateService } from '../../../application/subscription-update.service';
import type { BillingContextService } from '../../../application/billing-context.service';
import { BillingMutationsDisabledError } from '../../../domain/errors';
import { z } from 'zod';

export function createBillingRoutes(
  customerPortal: CustomerPortalService,
  checkout: CheckoutService,
  subscriptionUpdate: SubscriptionUpdateService,
  billingContext: BillingContextService,
  billingMutationsEnabled: boolean,
): Router {
  const router = Router();

  const requireBillingMutations = () => {
    if (!billingMutationsEnabled) throw new BillingMutationsDisabledError();
  };

  router.get('/api/me/billing-context', async (req, res, next) => {
    try {
      return res.json(await billingContext.getForUser(req.userId!));
    } catch (error) {
      return next(error);
    }
  });

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
      requireBillingMutations();
      const { priceId } = z.object({ priceId: z.string().min(1) }).parse(req.body);
      const transactionId = await checkout.createForUser(req.userId!, priceId);
      return res.status(201).json({ transactionId });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/api/me/subscription/preview-change', async (req, res, next) => {
    try {
      requireBillingMutations();
      const { priceId } = z.object({ priceId: z.string().min(1) }).parse(req.body);
      const preview = await subscriptionUpdate.previewForUser(req.userId!, priceId);
      return res.json(preview);
    } catch (error) {
      return next(error);
    }
  });

  router.post('/api/me/subscription/change', async (req, res, next) => {
    try {
      requireBillingMutations();
      const { priceId } = z.object({ priceId: z.string().min(1) }).parse(req.body);
      const result = await subscriptionUpdate.updateForUser(req.userId!, priceId);
      return res.json({ accepted: true, ...result });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
