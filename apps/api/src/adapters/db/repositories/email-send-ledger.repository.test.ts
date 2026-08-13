import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, migrateOnce, truncateAll } from '../pglite-harness';
import { emailSendLedger, users } from '../schema';
import { DrizzleEmailSendLedgerRepository } from './email-send-ledger.repository';

// Real Postgres (PGlite) stands in for the live-DATABASE_URL singleton. See pglite-harness.ts for
// why the factory closes over `db` rather than importing inside itself.
vi.mock('../client', () => ({ db }));

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

describe('DrizzleEmailSendLedgerRepository', () => {
  let repo: DrizzleEmailSendLedgerRepository;
  let userId: string;

  /** `record` cannot set `createdAt`, and every boundary case below needs to. */
  async function recordAt(createdAt: Date, overrides: { userId?: string | null; trigger?: string } = {}) {
    await db.insert(emailSendLedger).values({
      userId: overrides.userId === undefined ? userId : overrides.userId,
      trigger: overrides.trigger ?? 'signup',
      createdAt,
    } as never);
  }

  beforeAll(async () => {
    await migrateOnce();
  });

  beforeEach(async () => {
    await truncateAll();
    repo = new DrizzleEmailSendLedgerRepository();
    const [row] = await db
      .insert(users)
      .values({ email: 'person@example.com', passwordHash: 'h' })
      .returning({ id: users.id });
    userId = row.id;
  });

  // ---------------------------------------------------------------------------
  // The two boundaries in this file point in OPPOSITE directions, and that is
  // deliberate:
  //
  //   countSince(since)      is `gte` — inclusive, so the rolling window cannot
  //                          leak a send at its own edge and undercount the cap.
  //   deleteOlderThan(cutoff) is `lt` — exclusive, so the janitor never removes
  //                          a row the window is still counting.
  //
  // Together they guarantee that calling both with the same instant is safe.
  // Both are pinned so nobody "tidies" them into matching operators.
  // ---------------------------------------------------------------------------
  describe('countSince', () => {
    it('counts a row created at exactly the `since` instant', async () => {
      const since = new Date(Date.now() - HOUR);
      await recordAt(since);

      expect(await repo.countSince(since)).toBe(1);
    });

    it('excludes a row created one millisecond before `since`', async () => {
      const since = new Date(Date.now() - HOUR);
      await recordAt(new Date(since.getTime() - 1));

      expect(await repo.countSince(since)).toBe(0);
    });

    it('counts everything inside the window and nothing outside it', async () => {
      const since = new Date(Date.now() - 24 * HOUR);
      await recordAt(new Date(since.getTime() - HOUR));      // yesterday-ish, outside
      await recordAt(new Date(since.getTime() + HOUR));      // inside
      await recordAt(new Date());                            // inside

      expect(await repo.countSince(since)).toBe(2);
    });

    it('returns 0, not NaN, when the ledger is empty', async () => {
      expect(await repo.countSince(new Date(Date.now() - HOUR))).toBe(0);
    });

    // This backs a GLOBAL send budget, not a per-user one — the defence is against the provider
    // bill running away, so every send counts regardless of who triggered it. Adding a user filter
    // here would silently raise the ceiling to (cap × number of users).
    it('counts sends from every user, and anonymous ones too', async () => {
      const [other] = await db
        .insert(users)
        .values({ email: 'other@example.com', passwordHash: 'h' })
        .returning({ id: users.id });
      const since = new Date(Date.now() - HOUR);

      await recordAt(new Date(), { userId });
      await recordAt(new Date(), { userId: other.id });
      await recordAt(new Date(), { userId: null });

      expect(await repo.countSince(since)).toBe(3);
    });
  });

  describe('deleteOlderThan', () => {
    it('keeps a row sitting exactly on the cutoff', async () => {
      const cutoff = new Date(Date.now() - 24 * HOUR);
      await recordAt(cutoff);

      expect(await repo.deleteOlderThan(cutoff)).toBe(0);
      expect(await db.select().from(emailSendLedger)).toHaveLength(1);
    });

    it('removes a row one millisecond older than the cutoff', async () => {
      const cutoff = new Date(Date.now() - 24 * HOUR);
      await recordAt(new Date(cutoff.getTime() - 1));

      expect(await repo.deleteOlderThan(cutoff)).toBe(1);
      expect(await db.select().from(emailSendLedger)).toHaveLength(0);
    });

    it('deletes only the older rows and reports how many went', async () => {
      const cutoff = new Date(Date.now() - 24 * HOUR);
      await recordAt(new Date(cutoff.getTime() - 2 * HOUR));
      await recordAt(new Date(cutoff.getTime() - HOUR));
      await recordAt(new Date(cutoff.getTime() + HOUR));

      expect(await repo.deleteOlderThan(cutoff)).toBe(2);
      expect(await db.select().from(emailSendLedger)).toHaveLength(1);
    });

    it('is idempotent — a second sweep finds nothing left', async () => {
      const cutoff = new Date(Date.now() - 24 * HOUR);
      await recordAt(new Date(cutoff.getTime() - HOUR));

      expect(await repo.deleteOlderThan(cutoff)).toBe(1);
      expect(await repo.deleteOlderThan(cutoff)).toBe(0);
    });

    it('reports 0 on an empty ledger', async () => {
      expect(await repo.deleteOlderThan(new Date())).toBe(0);
    });

    // The two operators working together: sweeping at the same instant the window opens must not
    // remove anything the window still counts.
    it('never deletes a row that countSince is still counting', async () => {
      const boundary = new Date(Date.now() - 24 * HOUR);
      await recordAt(boundary);

      await repo.deleteOlderThan(boundary);

      expect(await repo.countSince(boundary)).toBe(1);
    });
  });

  describe('record', () => {
    it('stores the user and the trigger', async () => {
      await repo.record({ userId, trigger: 'signup' });

      const [row] = await db.select().from(emailSendLedger);
      expect(row.userId).toBe(userId);
      expect(row.trigger).toBe('signup');
      expect(row.createdAt).toBeInstanceOf(Date);
    });

    // Resends can be requested before anyone is signed in, so the column is nullable on purpose.
    it('accepts an anonymous send with no user attached', async () => {
      await repo.record({ userId: null, trigger: 'resend' });

      const [row] = await db.select().from(emailSendLedger);
      expect(row.userId).toBeNull();
    });

    it('accepts each of the three triggers', async () => {
      await repo.record({ userId, trigger: 'signup' });
      await repo.record({ userId, trigger: 'resend' });
      await repo.record({ userId, trigger: 'change_email' });

      const rows = await db.select().from(emailSendLedger);
      expect(rows.map((r) => r.trigger).sort()).toEqual(['change_email', 'resend', 'signup']);
    });

    it('appends rather than replacing, so repeated sends all count', async () => {
      const since = new Date(Date.now() - HOUR);
      await repo.record({ userId, trigger: 'resend' });
      await repo.record({ userId, trigger: 'resend' });

      expect(await repo.countSince(since)).toBe(2);
    });
  });

  // user_id is ON DELETE SET NULL, not CASCADE. Deleting an account must not erase the evidence
  // that emails were sent — otherwise sign up, send, delete, repeat would reset the rate limit.
  it('keeps the ledger row when its user is deleted, blanking only the link', async () => {
    await repo.record({ userId, trigger: 'signup' });

    await db.delete(users).where(eq(users.id, userId));

    const rows = await db.select().from(emailSendLedger);
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBeNull();
    expect(await repo.countSince(new Date(Date.now() - HOUR))).toBe(1);
  });
});
