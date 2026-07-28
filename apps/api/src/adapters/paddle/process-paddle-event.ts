import type { EventEntity } from '@paddle/paddle-node-sdk';
import type { PaddleBillingRepository } from '../../ports/repositories.port';

type CustomerData = { id: string; email: string };
type SubscriptionData = {
  id: string;
  customerId: string;
  status: string;
  items: Array<{ quantity: number; price: { id: string; productId: string } | null }>;
  currentBillingPeriod: { startsAt: string; endsAt: string } | null;
  scheduledChange: { action: string; effectiveAt: string } | null;
};

const subscriptionEvents = new Set([
  'subscription.created',
  'subscription.updated',
  'subscription.activated',
  'subscription.canceled',
  'subscription.past_due',
  'subscription.paused',
  'subscription.resumed',
  'subscription.trialing',
]);

function asDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function processPaddleEvent(
  event: EventEntity,
  repository: PaddleBillingRepository,
): Promise<void> {
  if (event.eventType === 'customer.created' || event.eventType === 'customer.updated') {
    const customer = event.data as CustomerData;
    await repository.upsertCustomer({ customerId: customer.id, email: customer.email });
    return;
  }

  if (!subscriptionEvents.has(event.eventType)) return;

  const subscription = event.data as SubscriptionData;
  const primaryItem = subscription.items[0];
  await repository.upsertSubscription({
    subscriptionId: subscription.id,
    customerId: subscription.customerId,
    status: subscription.status,
    priceId: primaryItem?.price?.id ?? null,
    productId: primaryItem?.price?.productId ?? null,
    quantity: primaryItem?.quantity ?? 1,
    currentPeriodStart: asDate(subscription.currentBillingPeriod?.startsAt),
    currentPeriodEnd: asDate(subscription.currentBillingPeriod?.endsAt),
    scheduledChangeAction: subscription.scheduledChange?.action ?? null,
    scheduledChangeAt: asDate(subscription.scheduledChange?.effectiveAt),
    occurredAt: asDate(event.occurredAt) ?? new Date(),
  });
}
