import { describe, expect, it, vi } from 'vitest';
import { BillingAccessService } from './billing-access.service';
import type { PaddleBillingRepository, PaddleSubscriptionRecord } from '../ports/repositories.port';

const catalog = {
  solo: ['pri_solo_monthly', 'pri_solo_annual'],
  team: ['pri_team_monthly'],
  business: ['pri_business_monthly'],
};

function subscription(patch: Partial<PaddleSubscriptionRecord> = {}): PaddleSubscriptionRecord {
  return {
    subscriptionId: 'sub_1', status: 'active', priceId: 'pri_solo_annual', productId: 'pro_1',
    quantity: 1, currentPeriodStart: new Date('2026-07-30T00:00:00Z'),
    currentPeriodEnd: new Date('2027-07-30T00:00:00Z'), scheduledChangeAction: null,
    scheduledChangeAt: null, lastEventAt: new Date('2026-07-30T00:00:01Z'), ...patch,
  };
}

function service(rows: PaddleSubscriptionRecord[]) {
  const repo: PaddleBillingRepository = {
    upsertCustomer: vi.fn(), upsertSubscription: vi.fn(),
    listSubscriptionsForUser: vi.fn().mockResolvedValue(rows),
  };
  return new BillingAccessService(repo, catalog);
}

describe('BillingAccessService', () => {
  it('maps an active Paddle price to Solo entitlements', async () => {
    const access = await service([subscription()]).getAccess('user-1');
    expect(access.plan).toBe('solo');
    expect(access.hasPaidAccess).toBe(true);
    expect(access.entitlements.monthlySecondsCap).toBe(36_000);
    expect(access.entitlements.chatQuestionsPerMeeting).toBe(100);
    expect(access.subscription?.id).toBe('sub_1');
  });

  it('multiplies Team recording allowance by seat quantity', async () => {
    const access = await service([subscription({ priceId: 'pri_team_monthly', quantity: 3 })]).getAccess('user-1');
    expect(access.plan).toBe('team');
    expect(access.entitlements.monthlySecondsCap).toBe(216_000);
    expect(access.entitlements.phoneInRoomRecording).toBe(true);
  });

  it('fails closed to Free when an active price is not configured', async () => {
    const access = await service([subscription({ priceId: 'pri_unknown' })]).getAccess('user-1');
    expect(access.plan).toBe('free');
    expect(access.hasPaidAccess).toBe(false);
  });

  it('keeps canceled subscriptions visible without granting paid access', async () => {
    const access = await service([subscription({ status: 'canceled' })]).getAccess('user-1');
    expect(access.status).toBe('canceled');
    expect(access.plan).toBe('free');
    expect(access.subscription?.id).toBe('sub_1');
  });
});
