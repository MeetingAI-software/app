import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventEntity } from '@paddle/paddle-node-sdk';
import { eq } from 'drizzle-orm';
import { db, migrateOnce, truncateAll } from '../pglite-harness';
import { paddleCustomers, paddleSubscriptions, users } from '../schema';
import { processPaddleEvent } from '../../paddle/process-paddle-event';
import { DrizzlePaddleBillingRepository } from './paddle-billing.repository';

vi.mock('../client', () => ({ db }));

function subscriptionEvent(status: string, occurredAt: string): EventEntity {
  return {
    eventType: 'subscription.updated',
    eventId: `evt_${status}_${occurredAt}`,
    occurredAt,
    data: {
      id: 'sub_1', customerId: 'ctm_1', status,
      items: [{ quantity: 1, price: { id: 'pri_01alpha', productId: 'pro_solo' } }],
      currentBillingPeriod: null,
      scheduledChange: null,
    },
  } as unknown as EventEntity;
}

describe('DrizzlePaddleBillingRepository delivery convergence', () => {
  let repository: DrizzlePaddleBillingRepository;

  beforeAll(async () => {
    await migrateOnce();
  });

  beforeEach(async () => {
    await truncateAll();
    repository = new DrizzlePaddleBillingRepository();
  });

  it('keeps one customer and subscription row when Paddle replays the same resources', async () => {
    const customer = {
      eventType: 'customer.updated', occurredAt: '2026-08-24T12:00:00Z',
      data: { id: 'ctm_1', email: 'buyer@example.com' },
    } as EventEntity;
    const subscription = subscriptionEvent('active', '2026-08-24T12:00:00Z');

    await processPaddleEvent(customer, repository);
    await processPaddleEvent(customer, repository);
    await processPaddleEvent(subscription, repository);
    await processPaddleEvent(subscription, repository);

    expect(await db.select().from(paddleCustomers)).toHaveLength(1);
    expect(await db.select().from(paddleSubscriptions)).toHaveLength(1);
  });

  it('converges on the newest subscription state when events arrive out of order', async () => {
    await processPaddleEvent(subscriptionEvent('canceled', '2026-08-24T13:00:00Z'), repository);
    await processPaddleEvent(subscriptionEvent('active', '2026-08-24T12:00:00Z'), repository);

    const [stored] = await db.select().from(paddleSubscriptions)
      .where(eq(paddleSubscriptions.subscriptionId, 'sub_1'));

    expect(stored.status).toBe('canceled');
    expect(stored.lastEventAt).toEqual(new Date('2026-08-24T13:00:00Z'));
  });

  it('allows a newer retry to repair an older stored state', async () => {
    await processPaddleEvent(subscriptionEvent('active', '2026-08-24T12:00:00Z'), repository);
    await processPaddleEvent(subscriptionEvent('past_due', '2026-08-24T13:00:00Z'), repository);

    const [stored] = await db.select().from(paddleSubscriptions)
      .where(eq(paddleSubscriptions.subscriptionId, 'sub_1'));

    expect(stored.status).toBe('past_due');
    expect(stored.lastEventAt).toEqual(new Date('2026-08-24T13:00:00Z'));
  });

  it('removes local customer identity when an account is erased', async () => {
    const [user] = await db.insert(users).values({
      email: 'erase@example.com',
      passwordHash: 'not-a-real-hash',
      emailVerified: true,
    }).returning();
    await repository.upsertCustomer({ customerId: 'ctm_erase', email: user.email });
    expect(await repository.attachCustomerToUser({ customerId: 'ctm_erase', email: user.email, userId: user.id })).toBe(true);

    await repository.anonymizeCustomerForUser(user.id);

    const [customer] = await db.select().from(paddleCustomers)
      .where(eq(paddleCustomers.customerId, 'ctm_erase'));
    expect(customer).toMatchObject({ email: null, userId: null });
    expect(customer.anonymizedAt).toBeInstanceOf(Date);
  });

  it('does not reidentify an anonymized customer through late, repeated or concurrent customer events', async () => {
    const [user] = await db.insert(users).values({ email: 'erased@example.test' }).returning();
    await repository.upsertCustomer({ customerId: 'ctm_1', email: user.email });
    expect(await repository.attachCustomerToUser({ customerId: 'ctm_1', email: user.email, userId: user.id })).toBe(true);
    await processPaddleEvent(subscriptionEvent('active', '2026-09-11T10:00:00Z'), repository);
    const event = { eventType: 'customer.updated', occurredAt: '2026-09-11T10:01:00Z',
      data: { id: 'ctm_1', email: user.email } } as EventEntity;
    await Promise.all([repository.anonymizeCustomerForUser(user.id), processPaddleEvent(event, repository)]);
    await db.delete(users).where(eq(users.id, user.id));
    // A future account with the same email must not acquire the old billing identity.
    await db.insert(users).values({ email: user.email });
    await Promise.all(Array.from({ length: 6 }, () => processPaddleEvent(event, repository)));
    await repository.upsertCustomer({ customerId: 'ctm_1', email: user.email });
    await processPaddleEvent(subscriptionEvent('canceled', '2026-09-11T11:00:00Z'), repository);
    const [customer] = await db.select().from(paddleCustomers);
    expect(customer).toMatchObject({ customerId: 'ctm_1', email: null, userId: null });
    expect(customer.anonymizedAt).toBeInstanceOf(Date);
    const [replacement] = await db.select().from(users).where(eq(users.email, user.email));
    expect(await repository.attachCustomerToUser({ customerId: 'ctm_1', email: user.email, userId: replacement.id })).toBe(false);
    expect(await db.select().from(paddleSubscriptions)).toMatchObject([{ subscriptionId: 'sub_1', customerId: 'ctm_1', status: 'canceled' }]);
  });

  it('continues enriching an ordinary placeholder when the customer event arrives later', async () => {
    await processPaddleEvent(subscriptionEvent('active', '2026-09-11T10:00:00Z'), repository);
    const [user] = await db.insert(users).values({ email: 'placeholder@example.test' }).returning();
    await repository.upsertCustomer({ customerId: 'ctm_1', email: user.email });
    expect(await repository.attachCustomerToUser({ customerId: 'ctm_1', email: user.email, userId: user.id })).toBe(true);
    expect(await db.select().from(paddleCustomers)).toMatchObject([
      { customerId: 'ctm_1', email: user.email, userId: user.id, anonymizedAt: null },
    ]);
  });

  it('does not transfer an owned customer when its former email is reused', async () => {
    const [original] = await db.insert(users).values({ email: 'former@example.test', emailVerified: true }).returning();
    expect(await repository.attachCustomerToUser({ customerId: 'ctm_owned', email: original.email, userId: original.id })).toBe(true);
    await db.update(users).set({ email: 'current@example.test' }).where(eq(users.id, original.id));
    const [replacement] = await db.insert(users).values({ email: 'former@example.test', emailVerified: true }).returning();

    await repository.upsertCustomer({ customerId: 'ctm_owned', email: replacement.email });
    expect(await repository.attachCustomerToUser({ customerId: 'ctm_owned', email: replacement.email, userId: replacement.id })).toBe(false);
    await repository.upsertSubscription({
      subscriptionId: 'sub_owned', customerId: 'ctm_owned', status: 'active',
      priceId: null, productId: null, quantity: 1, currentPeriodStart: null,
      currentPeriodEnd: null, scheduledChangeAction: null, scheduledChangeAt: null,
      occurredAt: new Date(),
    });

    const [customer] = await db.select().from(paddleCustomers)
      .where(eq(paddleCustomers.customerId, 'ctm_owned'));
    expect(customer.userId).toBe(original.id);
    expect(await repository.findCustomerForUser(replacement.id)).toBeNull();
    expect(await repository.listSubscriptionsForUser(replacement.id)).toEqual([]);
    expect(await repository.listSubscriptionsForUser(original.id)).toMatchObject([{ subscriptionId: 'sub_owned' }]);
  });

  it('allows only one concurrent claimant of an unowned customer', async () => {
    const [a] = await db.insert(users).values({ email: 'first@example.test' }).returning();
    const [b] = await db.insert(users).values({ email: 'second@example.test' }).returning();
    await repository.upsertCustomer({ customerId: 'ctm_placeholder', email: a.email });

    const results = await Promise.all([
      repository.attachCustomerToUser({ customerId: 'ctm_placeholder', email: a.email, userId: a.id }),
      repository.attachCustomerToUser({ customerId: 'ctm_placeholder', email: b.email, userId: b.id }),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    const [customer] = await db.select().from(paddleCustomers);
    expect(customer.userId).toBe(results[0] ? a.id : b.id);
  });
});
