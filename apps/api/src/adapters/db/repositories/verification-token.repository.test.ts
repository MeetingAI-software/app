import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, migrateOnce, truncateAll } from '../pglite-harness';
import { emailVerificationTokens, sessions, users } from '../schema';
import { DrizzleVerificationTokenRepository } from './verification-token.repository';
import { DrizzleUserRepository } from './user.repository';
import { DrizzleSessionRepository } from './session.repository';

vi.mock('../client', () => ({ db }));

const HOUR = 60 * 60 * 1000;

describe('DrizzleVerificationTokenRepository', () => {
  let repo: DrizzleVerificationTokenRepository;
  let userId: string;

  const future = () => new Date(Date.now() + 24 * HOUR);
  const past = () => new Date(Date.now() - HOUR);

  async function makeUser(email: string, emailVerified = false) {
    const [row] = await db
      .insert(users)
      .values({ email, passwordHash: 'argon2-hash', emailVerified })
      .returning();
    return row.id;
  }

  async function rowsForUser(id: string) {
    return db.select().from(emailVerificationTokens).where(eq(emailVerificationTokens.userId, id));
  }

  beforeAll(async () => {
    await migrateOnce();
  });

  beforeEach(async () => {
    await truncateAll();
    repo = new DrizzleVerificationTokenRepository();
    userId = await makeUser('person@example.com');
  });

  describe('replaceForUser', () => {
    it('stores a token that can then be found by its hash', async () => {
      const expiresAt = future();
      await repo.replaceForUser({ userId, tokenHash: 'hash-1', expiresAt });

      const found = await repo.findByTokenHash('hash-1');
      expect(found?.userId).toBe(userId);
      expect(found?.consumedAt).toBeNull();
      expect(found?.expiresAt.getTime()).toBe(expiresAt.getTime());
    });

    // The whole point of the transaction: a resend must invalidate the previous link, not sit
    // alongside it. Two live tokens for one account would mean an old email still works after the
    // user asked for a new one.
    it('invalidates the previous token when a replacement is issued', async () => {
      await repo.replaceForUser({ userId, tokenHash: 'old', expiresAt: future() });
      await repo.replaceForUser({ userId, tokenHash: 'new', expiresAt: future() });

      expect(await repo.findByTokenHash('old')).toBeNull();
      expect(await repo.findByTokenHash('new')).not.toBeNull();
      expect(await rowsForUser(userId)).toHaveLength(1);
    });

    it('leaves another user’s token untouched', async () => {
      const other = await makeUser('other@example.com');
      await repo.replaceForUser({ userId: other, tokenHash: 'theirs', expiresAt: future() });
      await repo.replaceForUser({ userId, tokenHash: 'mine', expiresAt: future() });

      expect(await repo.findByTokenHash('theirs')).not.toBeNull();
      expect(await rowsForUser(other)).toHaveLength(1);
    });

    // `verification_user_id_uq` is what caps the table at one row per user, and what makes
    // findForUser's "at most one row" assumption safe.
    it('is backed by a unique index that rejects a second row for the same user', async () => {
      await repo.replaceForUser({ userId, tokenHash: 'first', expiresAt: future() });
      await expect(
        db.insert(emailVerificationTokens).values({
          userId,
          tokenHash: 'second',
          expiresAt: future(),
        } as never),
      ).rejects.toMatchObject({
        cause: expect.objectContaining({ message: expect.stringMatching(/unique|duplicate/i) }),
      });
    });
  });

  describe('findByTokenHash and findForUser', () => {
    it('returns null for a hash it has never seen', async () => {
      expect(await repo.findByTokenHash('nope')).toBeNull();
    });

    it('finds the user’s single live token', async () => {
      await repo.replaceForUser({ userId, tokenHash: 'h', expiresAt: future() });
      expect((await repo.findForUser(userId))?.userId).toBe(userId);
    });

    it('returns null from findForUser when the user has no token', async () => {
      expect(await repo.findForUser(userId)).toBeNull();
    });

    // findForUser deliberately does NOT filter on expiry — it backs the resend cooldown, which reads
    // createdAt. Pinned because a well-meaning "only return live tokens" change would silently
    // disable the cooldown.
    it('returns an expired token too, since the cooldown reads createdAt', async () => {
      await repo.replaceForUser({ userId, tokenHash: 'stale', expiresAt: past() });
      expect(await repo.findForUser(userId)).not.toBeNull();
    });

    it('does not accept a user id in place of a token hash', async () => {
      await repo.replaceForUser({ userId, tokenHash: 'h', expiresAt: future() });
      expect(await repo.findByTokenHash(userId)).toBeNull();
    });
  });

  it('deleteByTokenHash removes only the named token', async () => {
    const other = await makeUser('other@example.com');
    await repo.replaceForUser({ userId, tokenHash: 'drop', expiresAt: future() });
    await repo.replaceForUser({ userId: other, tokenHash: 'keep', expiresAt: future() });

    await repo.deleteByTokenHash('drop');

    expect(await repo.findByTokenHash('drop')).toBeNull();
    expect(await repo.findByTokenHash('keep')).not.toBeNull();
  });

  // ---------------------------------------------------------------------------
  // consumeAndVerify is the auth-critical one: it decides whether a verification
  // link works, and it must work exactly once.
  // ---------------------------------------------------------------------------
  describe('consumeAndVerify', () => {
    it('rejects a token for a former address even after changing back to that address', async () => {
      const userRepo = new DrizzleUserRepository();
      await repo.replaceForUser({ userId, tokenHash: 'old-address', expiresAt: future() });
      await userRepo.updateEmail(userId, 'other@example.com', 1);
      await userRepo.updateEmail(userId, 'person@example.com', 1);

      expect((await repo.consumeAndVerify({ tokenHash: 'old-address', now: new Date(), passwordHash: 'new-hash' })).status)
        .toBe('invalid');
      const [unchanged] = await db.select().from(users).where(eq(users.id, userId));
      expect(unchanged.emailVersion).toBe(3);
      expect(unchanged.emailVerified).toBe(false);
    });

    it('checks the version at consumption even if an obsolete token row survives', async () => {
      await repo.replaceForUser({ userId, tokenHash: 'stale-row', expiresAt: future() });
      await db.update(users).set({ email: 'other@example.com', emailVersion: 2 })
        .where(eq(users.id, userId));
      await db.update(users).set({ email: 'person@example.com', emailVersion: 3 })
        .where(eq(users.id, userId));

      expect((await repo.consumeAndVerify({ tokenHash: 'stale-row', now: new Date(), passwordHash: 'new-hash' })).status)
        .toBe('invalid');
      const [unchanged] = await db.select().from(users).where(eq(users.id, userId));
      expect(unchanged.emailVerified).toBe(false);
    });

    it('issues for the current address and verifies only that version', async () => {
      const userRepo = new DrizzleUserRepository();
      await userRepo.updateEmail(userId, 'new@example.com', 1);
      expect(await repo.replaceForUser({ userId, tokenHash: 'new-address', expiresAt: future() }))
        .toEqual({ email: 'new@example.com' });
      const [issued] = await rowsForUser(userId);
      expect(issued).toMatchObject({ emailAtIssue: 'new@example.com', emailVersion: 2 });
      expect((await repo.consumeAndVerify({ tokenHash: 'new-address', now: new Date(), passwordHash: 'new-hash' })).status)
        .toBe('verified');
    });

    it('rejects legacy unbound tokens left by an earlier schema', async () => {
      await db.insert(emailVerificationTokens).values({
        userId, tokenHash: 'legacy', expiresAt: future(),
      });
      expect((await repo.consumeAndVerify({ tokenHash: 'legacy', now: new Date(), passwordHash: 'new-hash' })).status)
        .toBe('invalid');
      const [unchanged] = await db.select().from(users).where(eq(users.id, userId));
      expect(unchanged.emailVerified).toBe(false);
    });

    it('verifies the user and marks the token consumed', async () => {
      const sessionRepo = new DrizzleSessionRepository();
      await sessionRepo.create({
        userId, tokenHash: 'old-session', expiresAt: future(), authVersion: 1,
      });
      await repo.replaceForUser({ userId, tokenHash: 'live', expiresAt: future() });

      const result = await repo.consumeAndVerify({ tokenHash: 'live', now: new Date(), passwordHash: 'new-hash' });

      expect(result.status).toBe('verified');
      if (result.status === 'verified') {
        expect(result.user.id).toBe(userId);
        expect(result.user.emailVerified).toBe(true);
      }
      // The flag is actually persisted, not just returned.
      const [stored] = await db.select().from(users).where(eq(users.id, userId));
      expect(stored.emailVerified).toBe(true);
      expect(stored.passwordHash).toBe('new-hash');
      expect(stored.authVersion).toBe(2);
      expect(await db.select().from(sessions).where(eq(sessions.userId, userId))).toHaveLength(0);
      expect((await repo.findByTokenHash('live'))?.consumedAt).toBeInstanceOf(Date);

      // Simulate a password login that checked the old hash before verification committed, then
      // inserted its session afterward. Its old epoch cannot authenticate.
      await sessionRepo.create({
        userId, tokenHash: 'late-old-session', expiresAt: future(), authVersion: 1,
      });
      expect(await sessionRepo.findByTokenHash('late-old-session')).toBeNull();
    });

    // Single use is the security property. A link that works twice is a link that works for whoever
    // finds it in a forwarded email.
    it('refuses a second use of the same token', async () => {
      await repo.replaceForUser({ userId, tokenHash: 'once', expiresAt: future() });
      await repo.consumeAndVerify({ tokenHash: 'once', now: new Date(), passwordHash: 'new-hash' });

      const second = await repo.consumeAndVerify({ tokenHash: 'once', now: new Date(), passwordHash: 'new-hash' });

      expect(second.status).toBe('used');
    });

    it('reports invalid for a hash that does not exist', async () => {
      const result = await repo.consumeAndVerify({ tokenHash: 'ghost', now: new Date(), passwordHash: 'new-hash' });
      expect(result.status).toBe('invalid');
    });

    it('reports expired for a token past its TTL, and does not verify the user', async () => {
      await repo.replaceForUser({ userId, tokenHash: 'stale', expiresAt: past() });

      const result = await repo.consumeAndVerify({ tokenHash: 'stale', now: new Date(), passwordHash: 'new-hash' });

      expect(result.status).toBe('expired');
      const [stored] = await db.select().from(users).where(eq(users.id, userId));
      expect(stored.emailVerified).toBe(false);
      expect((await repo.findByTokenHash('stale'))?.consumedAt).toBeNull();
    });

    // The exact-boundary case. `gt(expiresAt, now)` accepts only strictly-future expiry, so a token
    // expiring at this very instant is already dead — and deleteExpired's `lte` is the complement.
    it('treats a token expiring exactly now as expired', async () => {
      const now = new Date();
      await repo.replaceForUser({ userId, tokenHash: 'edge', expiresAt: now });

      expect((await repo.consumeAndVerify({ tokenHash: 'edge', now, passwordHash: 'new-hash' })).status).toBe('expired');
    });

    it('reports already_verified when the account was verified by another route', async () => {
      const oauth = await makeUser('oauth@example.com', true);
      await repo.replaceForUser({ userId: oauth, tokenHash: 'redundant', expiresAt: future() });

      const result = await repo.consumeAndVerify({ tokenHash: 'redundant', now: new Date(), passwordHash: 'new-hash' });

      expect(result.status).toBe('already_verified');
    });
  });

  // The sweep passes its own clock in, so every case here pins the cutoff to one fixed instant
  // rather than to wall time.
  describe('deleteExpired', () => {
    it('deletes expired tokens, keeps live ones, and returns the count', async () => {
      const now = new Date();
      const u2 = await makeUser('b@example.com');
      const u3 = await makeUser('c@example.com');
      await repo.replaceForUser({ userId, tokenHash: 'dead-1', expiresAt: new Date(now.getTime() - HOUR) });
      await repo.replaceForUser({ userId: u2, tokenHash: 'dead-2', expiresAt: new Date(now.getTime() - 1000) });
      await repo.replaceForUser({ userId: u3, tokenHash: 'alive', expiresAt: new Date(now.getTime() + 24 * HOUR) });

      expect(await repo.deleteExpired(now)).toBe(2);

      expect(await repo.findByTokenHash('dead-1')).toBeNull();
      expect(await repo.findByTokenHash('dead-2')).toBeNull();
      expect(await repo.findByTokenHash('alive')).not.toBeNull();
    });

    it('reports zero and changes nothing when every token is live', async () => {
      const now = new Date();
      await repo.replaceForUser({ userId, tokenHash: 'alive', expiresAt: new Date(now.getTime() + HOUR) });

      expect(await repo.deleteExpired(now)).toBe(0);
      expect(await repo.findByTokenHash('alive')).not.toBeNull();
    });

    it('is idempotent — a second pass finds nothing left to remove', async () => {
      const now = new Date();
      await repo.replaceForUser({ userId, tokenHash: 'dead', expiresAt: new Date(now.getTime() - HOUR) });

      expect(await repo.deleteExpired(now)).toBe(1);
      expect(await repo.deleteExpired(now)).toBe(0);
    });

    // `lte` is the exact complement of consumeAndVerify's `gt(expiresAt, now)`: a token expiring at
    // this very instant is already unspendable, so the sweep must be free to remove it. A strict
    // `lt` would leave precisely this row on disk — unusable, but undeleted, which is the thing
    // storage limitation forbids.
    it('deletes a token expiring exactly at the cutoff', async () => {
      const now = new Date();
      await repo.replaceForUser({ userId, tokenHash: 'edge', expiresAt: now });

      expect(await repo.deleteExpired(now)).toBe(1);
      expect(await repo.findByTokenHash('edge')).toBeNull();
    });

    // The other side of that boundary: a token consumeAndVerify would still accept must survive.
    // An inverted predicate here would delete exactly the live ones.
    it('never deletes a token that consumeAndVerify would still accept', async () => {
      const now = new Date();
      await repo.replaceForUser({ userId, tokenHash: 'spendable', expiresAt: new Date(now.getTime() + 1000) });

      await repo.deleteExpired(now);

      expect((await repo.consumeAndVerify({ tokenHash: 'spendable', now, passwordHash: 'new-hash' })).status).toBe('verified');
    });
  });

  // users.id cascades to this table (unlike sessions, which block the delete). Deleting an account
  // must not leave a live verification secret behind pointing at a user that no longer exists.
  it('cascades token deletion when the owning user is deleted', async () => {
    await repo.replaceForUser({ userId, tokenHash: 'orphan', expiresAt: future() });

    await db.delete(users).where(eq(users.id, userId));

    expect(await repo.findByTokenHash('orphan')).toBeNull();
  });
});
