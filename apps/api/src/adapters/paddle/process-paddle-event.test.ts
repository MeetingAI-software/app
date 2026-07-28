import { describe, expect, it, vi } from 'vitest';
import type { EventEntity } from '@paddle/paddle-node-sdk';
import type { PaddleBillingRepository } from '../../ports/repositories.port';
import { processPaddleEvent } from './process-paddle-event';

function repository(): PaddleBillingRepository {
  return {
    upsertCustomer: vi.fn(),
    upsertSubscription: vi.fn(),
  };
}

describe('processPaddleEvent', () => {
  it('links customer data by normalized repository upsert', async () => {
    const repo = repository();
    await processPaddleEvent({
      eventType: 'customer.updated',
      occurredAt: '2026-07-27T12:00:00Z',
      data: { id: 'ctm_1', email: 'person@example.com' },
    } as EventEntity, repo);

    expect(repo.upsertCustomer).toHaveBeenCalledWith({
      customerId: 'ctm_1',
      email: 'person@example.com',
    });
  });

  it('persists subscription state and scheduled cancellation', async () => {
    const repo = repository();
    await processPaddleEvent({
      eventType: 'subscription.updated',
      occurredAt: '2026-07-27T12:00:00Z',
      data: {
        id: 'sub_1', customerId: 'ctm_1', status: 'active',
        items: [{ quantity: 3, price: { id: 'pri_1', productId: 'pro_1' } }],
        currentBillingPeriod: { startsAt: '2026-07-01T00:00:00Z', endsAt: '2026-08-01T00:00:00Z' },
        scheduledChange: { action: 'cancel', effectiveAt: '2026-08-01T00:00:00Z' },
      },
    } as EventEntity, repo);

    expect(repo.upsertSubscription).toHaveBeenCalledWith(expect.objectContaining({
      subscriptionId: 'sub_1', customerId: 'ctm_1', status: 'active',
      priceId: 'pri_1', productId: 'pro_1', quantity: 3,
      scheduledChangeAction: 'cancel',
    }));
  });

  it('ignores unrelated event types', async () => {
    const repo = repository();
    await processPaddleEvent({ eventType: 'transaction.completed', data: {} } as EventEntity, repo);
    expect(repo.upsertCustomer).not.toHaveBeenCalled();
    expect(repo.upsertSubscription).not.toHaveBeenCalled();
  });
});
