import { PaddleNotConfiguredError } from '../../domain/errors';
import type {
  PaddlePlanChangePreview,
  SubscriptionUpdatePort,
} from '../../ports/subscription-update.port';
import { getPaddleClient } from './paddle-client';

export class PaddleSubscriptionUpdateAdapter implements SubscriptionUpdatePort {
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
    const subscription = await paddle.subscriptions.update(input.subscriptionId, {
      // Paddle replaces the full items array. This subscription model intentionally has one base-plan item.
      items: [{ priceId: input.priceId, quantity: input.quantity }],
      prorationBillingMode: input.prorationBillingMode,
      onPaymentFailure: 'prevent_change',
    });
    return {
      status: subscription.status,
      priceId: subscription.items[0]?.price.id ?? null,
    };
  }

  private client() {
    const paddle = getPaddleClient();
    if (!paddle) throw new PaddleNotConfiguredError('Subscription changes are temporarily unavailable');
    return paddle;
  }
}
