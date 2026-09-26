import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, migrateOnce, truncateAll } from '../pglite-harness';
import { paddleBillingBudgets as budgets, paddleBillingSlots as slots } from '../schema';
import { DrizzlePaddleBillingAdmissionRepository } from './paddle-billing-admission.repository';

vi.mock('../client', () => ({ db }));

const user = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('shared Paddle admission', () => {
  const first = new DrizzlePaddleBillingAdmissionRepository();
  const second = new DrizzlePaddleBillingAdmissionRepository();
  const claim = (n: number, token = `claim-${n}`) =>
    (n % 2 ? first : second).acquire({ userId: user(n), token });

  beforeAll(migrateOnce);
  beforeEach(async () => {
    await truncateAll();
    await db.insert(slots).values(Array.from({ length: 8 }, (_, i) => ({ slot: i + 1 })));
  });

  it('admits only eight concurrent users across repository instances', async () => {
    const results = await Promise.all(Array.from({ length: 16 }, (_, i) => claim(i + 1)));
    expect(results.filter(result => result === 'admitted')).toHaveLength(8);
    expect(results.filter(result => result === 'busy')).toHaveLength(8);
  });

  it('allows only one concurrent workflow for a user, then releases the exact token', async () => {
    expect(await claim(1, 'original')).toBe('admitted');
    expect(await first.acquire({ userId: user(1), token: 'second' })).toBe('busy');
    await second.release('original');
    expect(await first.acquire({ userId: user(1), token: 'replacement' })).toBe('admitted');
    await second.release('original');
    const [row] = await db.select().from(slots).where(eq(slots.slot, 1));
    expect(row.token).toBe('replacement');
  });

  it('keeps failed attempts in the per-user budget and rolls back a denied claim', async () => {
    for (let i = 0; i < 10; i++) {
      expect(await first.acquire({ userId: user(1), token: `attempt-${i}` })).toBe('admitted');
      await first.release(`attempt-${i}`);
    }
    expect(await first.acquire({ userId: user(1), token: 'eleventh' })).toBe('rate_limited');
    expect(await claim(2)).toBe('admitted');
    const [global] = await db.select().from(budgets).where(eq(budgets.scope, 'global'));
    expect(global.count).toBe(11);
  });

  it('caps rotated accounts at the shared global budget', async () => {
    for (let i = 1; i <= 80; i++) {
      expect(await claim(i)).toBe('admitted');
      await first.release(`claim-${i}`);
    }
    expect(await claim(81)).toBe('rate_limited');
    expect((await db.select().from(budgets).where(eq(budgets.scope, 'global')))[0].count).toBe(80);
  }, 30_000);

  it('recovers an expired process lease and rejects a stale release', async () => {
    expect(await claim(1, 'old')).toBe('admitted');
    await db.update(slots).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(slots.slot, 1));
    expect(await first.acquire({ userId: user(1), token: 'new' })).toBe('admitted');
    await second.release('old');
    expect((await db.select().from(slots).where(eq(slots.slot, 1)))[0].token).toBe('new');
  });
});
