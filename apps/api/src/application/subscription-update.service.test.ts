import { describe, expect, it, vi } from 'vitest';
import { InvalidBillingPriceError, PaddleCustomerNotFoundError } from '../domain/errors';
import type { PaddleBillingRepository, PaddleSubscriptionRecord } from '../ports/repositories.port';
import type { SubscriptionUpdatePort } from '../ports/subscription-update.port';
import { SubscriptionUpdateService, type PlanChangePrice } from './subscription-update.service';

const prices: PlanChangePrice[] = [
  { priceId: 'pri_solo_monthly', plan: 'solo', interval: 'monthly' },
  { priceId: 'pri_solo_annual', plan: 'solo', interval: 'annual' },
  { priceId: 'pri_team_monthly', plan: 'team', interval: 'monthly' },
  { priceId: 'pri_team_annual', plan: 'team', interval: 'annual' },
];

function record(patch: Partial<PaddleSubscriptionRecord> = {}): PaddleSubscriptionRecord {
  return {
    subscriptionId: 'sub_1',
    status: 'active',
    priceId: 'pri_solo_annual',
    productId: 'pro_solo',
    quantity: 1,
    currentPeriodStart: new Date('2026-01-01'),
    currentPeriodEnd: new Date('2027-01-01'),
    scheduledChangeAction: null,
    scheduledChangeAt: null,
    lastEventAt: new Date('2026-01-01'),
    ...patch,
  };
}

function setup(subscription: PaddleSubscriptionRecord | null = record()) {
  const billingRepo = {
    listSubscriptionsForUser: vi.fn().mockResolvedValue(subscription ? [subscription] : []),
  } as unknown as PaddleBillingRepository;
  const paddle = {
    preview: vi.fn().mockResolvedValue({
      immediateAmount: '1234', immediateCurrency: 'EUR', recurringAmount: '31200',
      recurringCurrency: 'EUR', nextBilledAt: '2027-01-01T00:00:00Z',
    }),
    update: vi.fn().mockResolvedValue({ status: 'active', priceId: 'pri_team_annual' }),
  } as unknown as SubscriptionUpdatePort;
  return { service: new SubscriptionUpdateService(billingRepo, paddle, prices), paddle };
}

describe('SubscriptionUpdateService', () => {
  it('previews an upgrade immediately and preserves the subscription quantity', async () => {
    const { service, paddle } = setup(record({ quantity: 3 }));
    const preview = await service.previewForUser('user-1', 'pri_team_annual');

    expect(preview).toMatchObject({
      targetPlan: 'team', targetInterval: 'annual',
      prorationBillingMode: 'prorated_immediately', immediateAmount: '1234',
    });
    expect(paddle.preview).toHaveBeenCalledWith({
      subscriptionId: 'sub_1', priceId: 'pri_team_annual', quantity: 3,
      prorationBillingMode: 'prorated_immediately',
    });
  });

  it('defers downgrade proration and collapses a team subscription to one Solo seat', async () => {
    const { service, paddle } = setup(record({ priceId: 'pri_team_monthly', quantity: 4 }));
    await service.updateForUser('user-1', 'pri_solo_monthly');

    expect(paddle.update).toHaveBeenCalledWith({
      subscriptionId: 'sub_1', priceId: 'pri_solo_monthly', quantity: 1,
      prorationBillingMode: 'prorated_next_billing_period',
    });
  });

  it('rejects unknown prices, interval changes, and scheduled changes', async () => {
    await expect(setup().service.previewForUser('user-1', 'pri_unknown')).rejects.toThrow(InvalidBillingPriceError);
    await expect(setup().service.previewForUser('user-1', 'pri_team_monthly')).rejects.toThrow(InvalidBillingPriceError);
    await expect(setup(record({ scheduledChangeAction: 'cancel' })).service
      .previewForUser('user-1', 'pri_team_annual')).rejects.toThrow(InvalidBillingPriceError);
  });

  it('rejects changes when the authenticated user has no active subscription', async () => {
    await expect(setup(null).service.previewForUser('user-1', 'pri_team_annual'))
      .rejects.toThrow(PaddleCustomerNotFoundError);
  });
});
