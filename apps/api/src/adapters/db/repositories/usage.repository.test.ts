import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { db, migrateOnce, truncateAll } from '../pglite-harness';
import { meetings, usageLedger, users } from '../schema';
import { DrizzleUsageRepository } from './usage.repository';

// Real Postgres (PGlite) stands in for the live-DATABASE_URL singleton. See pglite-harness.ts for
// why the factory closes over `db` rather than importing inside itself.
vi.mock('../client', () => ({ db }));

let tokenSeq = 0;

describe('DrizzleUsageRepository', () => {
  let repo: DrizzleUsageRepository;
  let alice: string;
  let bob: string;
  let aliceMeeting: string;
  let bobMeeting: string;

  async function insertMeeting(ownerUserId: string) {
    const [row] = await db
      .insert(meetings)
      .values({
        ownerUserId,
        platform: 'zoom',
        status: 'transcribed',
        source: 'bot',
        shareToken: `tok-${++tokenSeq}`,
      } as never)
      .returning({ id: meetings.id });
    return row.id;
  }

  /**
   * Inserts a ledger row at a caller-chosen instant. `addSeconds` cannot set `createdAt`, and the
   * month-window cases need to sit exactly on the boundary — so the timestamp is written as SQL
   * evaluated by the same database the query reads, rather than a JS Date. That keeps the test
   * clock and the query clock identical, and sidesteps the session-timezone question entirely
   * (`date_trunc` truncates in the session zone, whatever it happens to be).
   */
  async function insertUsageAt(meetingId: string, seconds: number, createdAt: ReturnType<typeof sql>) {
    await db.insert(usageLedger).values({ meetingId, secondsRecorded: seconds, createdAt } as never);
  }

  beforeAll(async () => {
    await migrateOnce();
  });

  beforeEach(async () => {
    await truncateAll();
    repo = new DrizzleUsageRepository();
    const inserted = await db
      .insert(users)
      .values([
        { email: 'alice@example.com', passwordHash: 'hash-a' },
        { email: 'bob@example.com', passwordHash: 'hash-b' },
      ])
      .returning({ id: users.id });
    alice = inserted[0].id;
    bob = inserted[1].id;
    aliceMeeting = await insertMeeting(alice);
    bobMeeting = await insertMeeting(bob);
  });

  // ---------------------------------------------------------------------------
  // monthlyTotalSeconds is the last ownership boundary in the app. It gates the
  // monthly quota (usage-meter.service.ts), so a lost owner predicate would both
  // leak another user's usage and hand out their allowance.
  // ---------------------------------------------------------------------------
  describe('monthlyTotalSeconds — ownership', () => {
    // THE test. The join to meetings.owner_user_id is the only thing scoping this query to the
    // caller; drop it and every user reads every user's minutes.
    it('counts only the caller’s own meetings', async () => {
      await repo.addSeconds(aliceMeeting, 100);
      await repo.addSeconds(bobMeeting, 900);

      expect(await repo.monthlyTotalSeconds(alice)).toBe(100);
      expect(await repo.monthlyTotalSeconds(bob)).toBe(900);
    });

    it('sums across several of the caller’s meetings', async () => {
      const second = await insertMeeting(alice);
      await repo.addSeconds(aliceMeeting, 30);
      await repo.addSeconds(second, 45);
      await repo.addSeconds(bobMeeting, 10_000);

      expect(await repo.monthlyTotalSeconds(alice)).toBe(75);
    });

    // coalesce(..., '0') + parseInt: an empty SUM is SQL NULL, and this must surface as 0 rather
    // than NaN — the quota check compares it numerically.
    it('returns 0, not NaN, for a user with no meetings at all', async () => {
      const stranger = (await db
        .insert(users)
        .values({ email: 'nobody@example.com', passwordHash: 'h' })
        .returning({ id: users.id }))[0].id;

      expect(await repo.monthlyTotalSeconds(stranger)).toBe(0);
    });

    it('returns 0 for a user whose meetings have recorded nothing', async () => {
      expect(await repo.monthlyTotalSeconds(alice)).toBe(0);
    });

    it('ignores usage attached to a meeting owned by someone else, even at the same instant', async () => {
      await insertUsageAt(aliceMeeting, 10, sql`now()`);
      await insertUsageAt(bobMeeting, 10, sql`now()`);

      expect(await repo.monthlyTotalSeconds(alice)).toBe(10);
    });
  });

  // ---------------------------------------------------------------------------
  // The window is `created_at >= date_trunc('month', now())` — inclusive at the
  // start of the month. Both sides of that boundary are pinned, because a `>`
  // would silently drop the first row of every month.
  // ---------------------------------------------------------------------------
  describe('monthlyTotalSeconds — the month window', () => {
    it('counts a row sitting exactly on the start of the month', async () => {
      await insertUsageAt(aliceMeeting, 60, sql`date_trunc('month', now())`);

      expect(await repo.monthlyTotalSeconds(alice)).toBe(60);
    });

    it('excludes a row one millisecond before the start of the month', async () => {
      await insertUsageAt(aliceMeeting, 60, sql`date_trunc('month', now()) - interval '1 millisecond'`);

      expect(await repo.monthlyTotalSeconds(alice)).toBe(0);
    });

    it('excludes last month entirely while keeping this month', async () => {
      await insertUsageAt(aliceMeeting, 500, sql`now() - interval '1 month'`);
      await insertUsageAt(aliceMeeting, 60, sql`now()`);

      expect(await repo.monthlyTotalSeconds(alice)).toBe(60);
    });
  });

  describe('addSeconds', () => {
    // A ledger, not a counter: each call appends. Turning this into an upsert would quietly reset
    // the month every time a meeting finished.
    it('appends a row per call rather than overwriting', async () => {
      await repo.addSeconds(aliceMeeting, 10);
      await repo.addSeconds(aliceMeeting, 20);

      const rows = await db.select().from(usageLedger).where(eq(usageLedger.meetingId, aliceMeeting));
      expect(rows).toHaveLength(2);
      expect(await repo.monthlyTotalSeconds(alice)).toBe(30);
    });

    it('accepts zero seconds without affecting the total', async () => {
      await repo.addSeconds(aliceMeeting, 0);

      expect(await repo.monthlyTotalSeconds(alice)).toBe(0);
    });
  });

  describe('deleteByMeeting', () => {
    it('removes only the named meeting’s rows', async () => {
      const second = await insertMeeting(alice);
      await repo.addSeconds(aliceMeeting, 10);
      await repo.addSeconds(second, 20);
      await repo.addSeconds(bobMeeting, 30);

      await repo.deleteByMeeting(aliceMeeting);

      expect(await repo.monthlyTotalSeconds(alice)).toBe(20);
      expect(await repo.monthlyTotalSeconds(bob)).toBe(30);
    });

    it('is a no-op for a meeting that recorded nothing', async () => {
      await repo.addSeconds(bobMeeting, 30);

      await expect(repo.deleteByMeeting(aliceMeeting)).resolves.toBeUndefined();
      expect(await repo.monthlyTotalSeconds(bob)).toBe(30);
    });
  });

  // usage_ledger.meeting_id has no ON DELETE clause, so it restricts. That is exactly why
  // auth.service.ts deletes usage (and the other children) *before* the meeting during account
  // erasure. Pinned so the ordering is not "simplified" away.
  it('blocks deleting a meeting that still has usage rows', async () => {
    await repo.addSeconds(aliceMeeting, 10);

    await expect(db.delete(meetings).where(eq(meetings.id, aliceMeeting))).rejects.toMatchObject({
      cause: expect.objectContaining({ message: expect.stringMatching(/foreign key|violates/i) }),
    });

    await repo.deleteByMeeting(aliceMeeting);
    await expect(db.delete(meetings).where(eq(meetings.id, aliceMeeting))).resolves.toBeDefined();
  });
});
