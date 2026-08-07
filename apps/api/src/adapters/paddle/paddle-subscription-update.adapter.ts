import { PaddleNotConfiguredError, SubscriptionPaymentDeclinedError } from '../../domain/errors';
import type {
  PaddlePlanChangePreview,
  SubscriptionUpdatePort,
} from '../../ports/subscription-update.port';
import { getPaddleClient } from './paddle-client';

export class PaddleSubscriptionUpdateAdapter implements SubscriptionUpdatePort {
  constructor(private readonly clientFactory = getPaddleClient) {}

  async preview(input: Parameters<SubscriptionUpdatePort['preview']>[0]): Promise<PaddlePlanChangePreview> {
    const paddle = this.client();
    const preview = await paddle.subscriptions.previewUpdate(input.subscriptionId, {
      items: [{ priceId: input.priceId, quantity: input.quantity }],
      prorationBillingMode: input.prorationBillingMode,
      onPaymentFailure: 'prevent_change',
    });

    const immediateTotals = preview.immediateTransaction?.details.totals;
    const recurringTotals = preview.recurringTransactionDetails?.totals;
    return {
      immediateAmount: immediateTotals?.grandTotal ?? null,
      immediateCurrency: immediateTotals?.currencyCode ?? null,
      recurringAmount: recurringTotals?.grandTotal ?? null,
      recurringCurrency: recurringTotals?.currencyCode ?? null,
      nextBilledAt: preview.nextBilledAt,
    };
  }

  async update(input: Parameters<SubscriptionUpdatePort['update']>[0]): Promise<{ status: string; priceId: string | null }> {
    const paddle = this.client();
    const subscription = await (async () => {
      try {
        return await paddle.subscriptions.update(input.subscriptionId, {
          // Paddle replaces the full items array. This subscription model intentionally has one base-plan item.
          items: [{ priceId: input.priceId, quantity: input.quantity }],
          prorationBillingMode: input.prorationBillingMode,
          onPaymentFailure: 'prevent_change',
        });
      } catch (error) {
        if (isPaddlePaymentDeclined(error)) throw new SubscriptionPaymentDeclinedError();
        throw error;
      }
    })();
    return {
      status: subscription.status,
      priceId: subscription.items[0]?.price.id ?? null,
    };
  }

  private client() {
    const paddle = this.clientFactory();
    if (!paddle) throw new PaddleNotConfiguredError('Subscription changes are temporarily unavailable');
    return paddle;
  }
}

export function isPaddlePaymentDeclined(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'subscription_payment_declined';
}
