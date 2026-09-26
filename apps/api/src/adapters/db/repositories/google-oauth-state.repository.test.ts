import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, migrateOnce, truncateAll } from '../pglite-harness';
import { googleOAuthBudget } from '../schema';
import { DrizzleGoogleOAuthStateRepository } from './google-oauth-state.repository';

vi.mock('../client', () => ({ db }));

describe('DrizzleGoogleOAuthStateRepository', () => {
  const repo = new DrizzleGoogleOAuthStateRepository();
  const now = new Date('2026-09-26T12:00:00Z');
  const challenge = (stateHash: string, expiresAt = new Date(now.getTime() + 60_000)) => ({
    stateHash, nonceHash: 'nonce-hash', purpose: 'login' as const,
    userId: null, sessionHash: null, authVersion: null,
    createdAt: now, expiresAt,
  });

  beforeAll(migrateOnce);
  beforeEach(truncateAll);

  it('claims a live state once, including under parallel callbacks', async () => {
    expect(await repo.issue(challenge('once'))).toBe(true);
    const results = await Promise.all([repo.claim('once', now), repo.claim('once', now)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await repo.claim('once', now)).toBeNull();
  });

  it('rejects expired and unknown states', async () => {
    expect(await repo.issue(challenge('expired', new Date(now.getTime() - 1)))).toBe(true);
    expect(await repo.claim('expired', now)).toBeNull();
    expect(await repo.claim('unknown', now)).toBeNull();
  });

  it('admits only up to the shared database budget before creating state', async () => {
    expect(await repo.issue(challenge('first'))).toBe(true);
    const [budget] = await db.select().from(googleOAuthBudget);
    await db.update(googleOAuthBudget).set({ count: 300 })
      .where(eq(googleOAuthBudget.window, budget.window));
    expect(await repo.issue(challenge('blocked'))).toBe(false);
    expect(await repo.claim('blocked', now)).toBeNull();
    expect(await repo.claim('first', now)).not.toBeNull();
  });

  it('admits only one of two parallel requests for the last budget slot', async () => {
    expect(await repo.issue(challenge('seed'))).toBe(true);
    const [budget] = await db.select().from(googleOAuthBudget);
    await db.update(googleOAuthBudget).set({ count: 299 })
      .where(eq(googleOAuthBudget.window, budget.window));
    const results = await Promise.all([
      repo.issue(challenge('racer-one')), repo.issue(challenge('racer-two')),
    ]);
    expect(results).toEqual(expect.arrayContaining([true, false]));
    const [after] = await db.select().from(googleOAuthBudget);
    expect(after.count).toBe(300);
  });
});
