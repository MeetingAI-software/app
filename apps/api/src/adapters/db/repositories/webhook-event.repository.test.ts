import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { asc, eq, sql, type SQL } from 'drizzle-orm';
import { db, migrateOnce, truncateAll } from '../pglite-harness';
import { webhookEvents } from '../schema';
import { DrizzleWebhookEventRepository } from './webhook-event.repository';

// Real Postgres (PGlite) stands in for the live-DATABASE_URL singleton. See pglite-harness.ts for
// why the factory closes over `db` rather than importing inside itself.
vi.mock('../client', () => ({ db }));

/**
 * Two limits of this harness, both about `claimNextPending`, both deliberate:
 *
 * 1. Its return value is not asserted anywhere below. The method runs raw SQL through
 *    `db.execute`, and for a query with no field mapping the two drivers disagree on the shape
 *    they hand back: postgres-js returns the row array directly (`client.unsafe(...)`), while
 *    PGlite returns Postgres's `{ rows, fields, affectedRows }` envelope (`client.query(...)`).
 *    Under PGlite the `rows.length === 0` guard therefore reads `undefined`, and the method
 *    resolves to `undefined` rather than a row or null. Production runs postgres-js, where the
 *    code is correct — so this is a driver difference, not a bug, and it is not worked around
 *    here. Every case instead asserts on what the claim *did to the table*, which is where the
 *    real risk lives anyway: the ordering, the filter, and the backoff are all in the SQL.
 *
 * 2. Genuine concurrency is untestable here — PGlite is a single connection, so two overlapping
 *    `FOR UPDATE SKIP LOCKED` claims cannot be staged. Sequential claims still prove the property
 *    that matters operationally: a claimed row is not handed out again.
 */
describe('DrizzleWebhookEventRepository', () => {
  let repo: DrizzleWebhookEventRepository;

  /** Seeds a row directly, so `createdAt`, `nextAttemptAt` and `processedAt` can be positioned. */
  async function seed(externalEventId: string, overrides: Record<string, SQL | null> = {}) {
    await db
      .insert(webhookEvents)
      .values({
        provider: 'recall',
        externalEventId,
        eventType: 'bot.done',
        payload: { id: externalEventId },
        ...overrides,
      } as never);
  }

  async function byExternalId(externalEventId: string) {
    const [row] = await db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.externalEventId, externalEventId));
    return row;
  }

  /** The external ids of every row the worker has taken, oldest claim first. */
  async function claimedIds() {
    const rows = await db
      .select({ externalEventId: webhookEvents.externalEventId, attempts: webhookEvents.attempts })
      .from(webhookEvents)
      .orderBy(asc(webhookEvents.createdAt));
    return rows.filter((r) => r.attempts > 0).map((r) => r.externalEventId);
  }

  beforeAll(async () => {
    await migrateOnce();
  });

  beforeEach(async () => {
    await truncateAll();
    repo = new DrizzleWebhookEventRepository();
  });

  // ---------------------------------------------------------------------------
  // insertIfNew is the duplicate-delivery guard. Recall retries webhooks; without
  // this, a retry would queue the same meeting for transcription a second time.
  // ---------------------------------------------------------------------------
  describe('insertIfNew', () => {
    it('stores a new event and reports that it did', async () => {
      const inserted = await repo.insertIfNew({
        provider: 'recall',
        externalEventId: 'evt-1',
        eventType: 'bot.status_change',
        payload: { status: 'done' },
      });

      expect(inserted).toBe(true);
      const row = await byExternalId('evt-1');
      expect(row.eventType).toBe('bot.status_change');
      expect(row.payload).toEqual({ status: 'done' });
      expect(row.attempts).toBe(0);
      expect(row.processedAt).toBeNull();
      expect(row.nextAttemptAt).toBeNull();
    });

    // The idempotency property. A redelivered webhook must be swallowed, not queued twice.
    it('reports false on a redelivery and leaves exactly one row', async () => {
      const first = await repo.insertIfNew({
        provider: 'recall', externalEventId: 'evt-dupe', eventType: 'bot.done', payload: { n: 1 },
      });
      const second = await repo.insertIfNew({
        provider: 'recall', externalEventId: 'evt-dupe', eventType: 'bot.done', payload: { n: 2 },
      });

      expect(first).toBe(true);
      expect(second).toBe(false);
      expect(await db.select().from(webhookEvents)).toHaveLength(1);
    });

    // onConflictDoNothing, not DoUpdate: the first delivery's payload is the one kept.
    it('does not overwrite the original payload on a redelivery', async () => {
      await repo.insertIfNew({
        provider: 'recall', externalEventId: 'evt-keep', eventType: 'bot.done', payload: { n: 1 },
      });
      await repo.insertIfNew({
        provider: 'recall', externalEventId: 'evt-keep', eventType: 'other', payload: { n: 2 },
      });

      const row = await byExternalId('evt-keep');
      expect(row.payload).toEqual({ n: 1 });
      expect(row.eventType).toBe('bot.done');
    });

    // `webhook_events_external_id_uq` covers external_event_id alone, NOT (provider, external_id).
    // So two providers issuing the same id would collide. Pinned as current behaviour — it is
    // harmless while 'recall' and 'fake' are the only providers, and would need a compound index
    // before a third one is added.
    it('treats the same external id from a different provider as a duplicate', async () => {
      await repo.insertIfNew({
        provider: 'recall', externalEventId: 'shared-id', eventType: 'a', payload: {},
      });

      const second = await repo.insertIfNew({
        provider: 'fake', externalEventId: 'shared-id', eventType: 'b', payload: {},
      });

      expect(second).toBe(false);
      expect(await db.select().from(webhookEvents)).toHaveLength(1);
    });

    it('accepts distinct external ids from the same provider', async () => {
      expect(await repo.insertIfNew({
        provider: 'recall', externalEventId: 'evt-a', eventType: 'a', payload: {},
      })).toBe(true);
      expect(await repo.insertIfNew({
        provider: 'recall', externalEventId: 'evt-b', eventType: 'b', payload: {},
      })).toBe(true);
      expect(await db.select().from(webhookEvents)).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------------
  // claimNextPending is the outbox claim behind jobs/worker.ts. Two workers taking
  // the same event means one meeting transcribed twice — billed twice, shown twice.
  // ---------------------------------------------------------------------------
  describe('claimNextPending', () => {
    it('takes the oldest pending event, and only that one', async () => {
      await seed('old', { createdAt: sql`now() - interval '3 minutes'` });
      await seed('middle', { createdAt: sql`now() - interval '2 minutes'` });
      await seed('new', { createdAt: sql`now() - interval '1 minute'` });

      await repo.claimNextPending();

      expect(await claimedIds()).toEqual(['old']);
    });

    // The no-double-claim property, stated as plainly as a single connection allows: the row the
    // first call took is not the row the second call takes, and its attempt count does not move
    // again. A dropped ORDER BY or a lost `processed_at IS NULL` shows up right here.
    it('never hands the same event out twice', async () => {
      await seed('first', { createdAt: sql`now() - interval '2 minutes'` });
      await seed('second', { createdAt: sql`now() - interval '1 minute'` });

      await repo.claimNextPending();
      await repo.claimNextPending();

      expect(await claimedIds()).toEqual(['first', 'second']);
      expect((await byExternalId('first')).attempts).toBe(1);
      expect((await byExternalId('second')).attempts).toBe(1);
    });

    // The claim doubles as a lease: the 5-minute push-out is what stops a crashed worker's event
    // from being retried instantly forever.
    it('leases the claimed event for five minutes and counts the attempt', async () => {
      await seed('leased');

      await repo.claimNextPending();

      const row = await byExternalId('leased');
      expect(row.attempts).toBe(1);
      const leaseMs = row.nextAttemptAt!.getTime() - Date.now();
      expect(leaseMs).toBeGreaterThan(4 * 60 * 1000);
      expect(leaseMs).toBeLessThan(6 * 60 * 1000);
    });

    it('skips an event whose retry time has not arrived', async () => {
      await seed('backed-off', { nextAttemptAt: sql`now() + interval '1 hour'` });

      await repo.claimNextPending();

      expect(await claimedIds()).toEqual([]);
    });

    it('claims an event whose retry time has passed', async () => {
      await seed('due', { nextAttemptAt: sql`now() - interval '1 second'` });

      await repo.claimNextPending();

      expect(await claimedIds()).toEqual(['due']);
    });

    // Work already finished must never be picked up again, however old it is.
    it('never reclaims an event that has been processed', async () => {
      await seed('done', {
        createdAt: sql`now() - interval '1 day'`,
        processedAt: sql`now() - interval '23 hours'`,
      });
      await seed('pending', { createdAt: sql`now() - interval '1 minute'` });

      await repo.claimNextPending();

      expect(await claimedIds()).toEqual(['pending']);
    });

    it('leaves an empty queue untouched', async () => {
      await repo.claimNextPending();

      expect(await db.select().from(webhookEvents)).toHaveLength(0);
    });

    it('prefers an older backed-off event once it comes due, over a newer fresh one', async () => {
      await seed('older-retry', {
        createdAt: sql`now() - interval '10 minutes'`,
        nextAttemptAt: sql`now() - interval '1 minute'`,
      });
      await seed('newer-fresh', { createdAt: sql`now() - interval '1 minute'` });

      await repo.claimNextPending();

      expect(await claimedIds()).toEqual(['older-retry']);
    });
  });

  describe('markProcessed and markFailed', () => {
    it('markProcessed stamps the target and leaves other rows alone', async () => {
      await seed('target');
      await seed('bystander');
      const target = await byExternalId('target');

      await repo.markProcessed(target.id);

      expect((await byExternalId('target')).processedAt).toBeInstanceOf(Date);
      expect((await byExternalId('bystander')).processedAt).toBeNull();
    });

    it('markProcessed takes the row out of the queue for good', async () => {
      await seed('target');
      const target = await byExternalId('target');

      await repo.markProcessed(target.id);
      await repo.claimNextPending();

      expect(await claimedIds()).toEqual([]);
    });

    it('markFailed records both the attempt count and the next retry time, on the target only', async () => {
      await seed('failing');
      await seed('bystander');
      const failing = await byExternalId('failing');
      const retryAt = new Date(Date.now() + 30 * 60 * 1000);

      await repo.markFailed(failing.id, 3, retryAt);

      const updated = await byExternalId('failing');
      expect(updated.attempts).toBe(3);
      expect(updated.nextAttemptAt?.getTime()).toBe(retryAt.getTime());

      const bystander = await byExternalId('bystander');
      expect(bystander.attempts).toBe(0);
      expect(bystander.nextAttemptAt).toBeNull();
    });

    // The point of writing nextAttemptAt at all: the failed event stops being claimable until then.
    it('markFailed pushes the event out of reach until its retry time', async () => {
      await seed('failing');
      const failing = await byExternalId('failing');

      await repo.markFailed(failing.id, 1, new Date(Date.now() + 60 * 60 * 1000));
      await repo.claimNextPending();

      expect((await byExternalId('failing')).attempts).toBe(1);   // unchanged by the claim
    });
  });
});
