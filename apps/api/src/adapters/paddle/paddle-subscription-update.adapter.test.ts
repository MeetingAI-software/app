import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionPaymentDeclinedError } from '../../domain/errors';
import { PaddleSubscriptionUpdateAdapter, isPaddlePaymentDeclined } from './paddle-subscription-update.adapter';

describe('PaddleSubscriptionUpdateAdapter', () => {
  const update = vi.fn();
  const adapter = () => new PaddleSubscriptionUpdateAdapter(() => ({
    subscriptions: { update },
  }) as never);

  beforeEach(() => update.mockReset());

  it('maps a declined proration charge to a safe application error', async () => {
    const declined = Object.assign(new Error('payment declined'), {
      code: 'subscription_payment_declined',
    });
    expect(isPaddlePaymentDeclined(declined)).toBe(true);
    update.mockImplementationOnce(() => { throw declined; });

    let caught: unknown;
    try {
      await adapter().update({
        subscriptionId: 'sub_1',
        priceId: 'pri_team_annual',
        quantity: 1,
        prorationBillingMode: 'prorated_immediately',
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SubscriptionPaymentDeclinedError);

    expect(update).toHaveBeenCalledWith('sub_1', {
      items: [{ priceId: 'pri_team_annual', quantity: 1 }],
      prorationBillingMode: 'prorated_immediately',
      onPaymentFailure: 'prevent_change',
    });
  });

  it('does not hide unrelated Paddle errors', async () => {
    const error = Object.assign(new Error('request failed'), { code: 'request_error' });
    update.mockImplementationOnce(() => { throw error; });

    let caught: unknown;
    try {
      await adapter().update({
        subscriptionId: 'sub_1',
        priceId: 'pri_team_annual',
        quantity: 1,
        prorationBillingMode: 'prorated_immediately',
      });
    } catch (caughtError) {
      caught = caughtError;
    }
    expect(caught).toBe(error);
  });
});
