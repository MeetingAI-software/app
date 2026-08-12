import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, migrateOnce, truncateAll } from '../pglite-harness';
import { users } from '../schema';
import { DrizzleSessionRepository } from './session.repository';

// Substitutes the live-DATABASE_URL singleton with PGlite — real Postgres in WASM, so these tests
// run genuine SQL with no container. The factory closes over the `db` imported above: vi.mock is
// hoisted, but the factory only *runs* when session.repository requests '../client', which happens
// while that later import is evaluated — by which point '../pglite-harness' is fully initialised.
vi.mock('../client', () => ({ db }));

const HOUR = 60 * 60 * 1000;

describe('DrizzleSessionRepository', () => {
  let repo: InstanceType<typeof DrizzleSessionRepository>;
  let userId: string;

  beforeAll(async () => {
    await migrateOnce();
  });

  beforeEach(async () => {
    await truncateAll();
    repo = new DrizzleSessionRepository();
    // sessions.user_id is NOT NULL and references users, so every case needs a real owner.
    const [user] = await db
      .insert(users)
      .values({ email: 'person@example.com', passwordHash: 'argon2-hash' })
      .returning();
    userId = user.id;
  });

  it('round-trips a session by its token hash', async () => {
    const expiresAt = new Date(Date.now() + HOUR);
    const created = await repo.create({ userId, tokenHash: 'hash-a', expiresAt });

    expect(created.userId).toBe(userId);
    expect(created.id).toBeTruthy();
    // Proves the timestamptz column survives the round-trip rather than arriving as a string.
    expect(created.expiresAt).toBeInstanceOf(Date);
    expect(created.expiresAt.getTime()).toBe(expiresAt.getTime());

    const found = await repo.findByTokenHash('hash-a');
    expect(found?.id).toBe(created.id);
  });

  it('returns null for a token hash it has never seen', async () => {
    expect(await repo.findByTokenHash('nope')).toBeNull();
  });

  // The raw token never reaches this repo — only its sha256. A lookup keyed on anything else would
  // be a silent auth bypass, so the column being matched is worth pinning down.
  it('does not match a session by user id passed as a token hash', async () => {
    await repo.create({ userId, tokenHash: 'hash-b', expiresAt: new Date(Date.now() + HOUR) });
    expect(await repo.findByTokenHash(userId)).toBeNull();
  });

  it('deletes only the session whose token hash was given', async () => {
    await repo.create({ userId, tokenHash: 'keep', expiresAt: new Date(Date.now() + HOUR) });
    await repo.create({ userId, tokenHash: 'drop', expiresAt: new Date(Date.now() + HOUR) });

    await repo.deleteByTokenHash('drop');

    expect(await repo.findByTokenHash('drop')).toBeNull();
    expect(await repo.findByTokenHash('keep')).not.toBeNull();
  });

  it('deletes every session for one user and leaves another user untouched', async () => {
    const [other] = await db
      .insert(users)
      .values({ email: 'other@example.com', passwordHash: 'argon2-hash' })
      .returning();
    await repo.create({ userId, tokenHash: 'mine-1', expiresAt: new Date(Date.now() + HOUR) });
    await repo.create({ userId, tokenHash: 'mine-2', expiresAt: new Date(Date.now() + HOUR) });
    await repo.create({ userId: other.id, tokenHash: 'theirs', expiresAt: new Date(Date.now() + HOUR) });

    await repo.deleteAllForUser(userId);

    expect(await repo.findByTokenHash('mine-1')).toBeNull();
    expect(await repo.findByTokenHash('mine-2')).toBeNull();
    expect(await repo.findByTokenHash('theirs')).not.toBeNull();
  });

  // The check no unit test could make: that the janitor's predicate points the right way. An
  // inverted `lt` would log a plausible count while deleting every *live* session on the box.
  it('deletes expired sessions, keeps live ones, and returns the count removed', async () => {
    await repo.create({ userId, tokenHash: 'dead-1', expiresAt: new Date(Date.now() - HOUR) });
    await repo.create({ userId, tokenHash: 'dead-2', expiresAt: new Date(Date.now() - 1000) });
    await repo.create({ userId, tokenHash: 'live', expiresAt: new Date(Date.now() + HOUR) });

    expect(await repo.deleteExpired()).toBe(2);

    expect(await repo.findByTokenHash('dead-1')).toBeNull();
    expect(await repo.findByTokenHash('dead-2')).toBeNull();
    expect(await repo.findByTokenHash('live')).not.toBeNull();
  });

  it('reports zero when there is nothing expired to delete', async () => {
    await repo.create({ userId, tokenHash: 'live', expiresAt: new Date(Date.now() + HOUR) });
    expect(await repo.deleteExpired()).toBe(0);
  });

  // `sessions.user_id` has NO onDelete rule — deliberately, unlike email_verification_tokens
  // (cascade) and email_send_ledger (set null). So the database *refuses* to delete a user who still
  // has sessions, which is what makes AuthService.deleteAccount's ordering load-bearing rather than
  // incidental: it clears sessions first, then the user. Pinning the refusal here means that if
  // someone later adds a cascade, or reorders the erasure, this test says so.
  it('refuses to delete a user while their sessions still exist', async () => {
    await repo.create({ userId, tokenHash: 'held', expiresAt: new Date(Date.now() + HOUR) });
    await expect(db.delete(users).where(eq(users.id, userId))).rejects.toThrow(
      /violates foreign key constraint/i,
    );

    // Clearing sessions first — the order deleteAccount uses — is what makes erasure possible.
    await repo.deleteAllForUser(userId);
    await expect(db.delete(users).where(eq(users.id, userId))).resolves.toBeDefined();
  });
});
