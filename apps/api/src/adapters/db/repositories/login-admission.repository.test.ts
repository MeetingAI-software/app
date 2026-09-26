import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, migrateOnce, truncateAll } from '../pglite-harness';
import { loginAttemptBudgets } from '../schema';
import { DrizzleLoginAdmissionRepository } from './login-admission.repository';

vi.mock('../client', () => ({ db }));

describe('DrizzleLoginAdmissionRepository', () => {
  const repo = new DrizzleLoginAdmissionRepository();
  const now = new Date('2026-09-26T12:00:00Z');
  beforeAll(migrateOnce);
  beforeEach(truncateAll);

  it('caps distributed guesses for one email independently of source IP', async () => {
    for (let i = 0; i < 12; i++) {
      expect(await repo.admit({ ip: `192.0.2.${i}`, email: 'Victim@Example.com ', now })).toBe(true);
    }
    expect(await repo.admit({ ip: '198.51.100.99', email: 'victim@example.com', now })).toBe(false);
    const [global] = await db.select().from(loginAttemptBudgets)
      .where(eq(loginAttemptBudgets.scope, 'global'));
    expect(global.count).toBe(12); // denied transaction cannot spend other counters
    const scopes = (await db.select({ scope: loginAttemptBudgets.scope }).from(loginAttemptBudgets))
      .map(row => row.scope);
    expect(scopes.some(scope => scope.includes('victim@example.com'))).toBe(false);
  });

  it('caps one source rotating distinct addresses before password hashing', async () => {
    for (let i = 0; i < 40; i++) {
      expect(await repo.admit({ ip: '203.0.113.7', email: `person-${i}@example.com`, now })).toBe(true);
    }
    expect(await repo.admit({ ip: '203.0.113.7', email: 'next@example.com', now })).toBe(false);
  });

  it('allows only one parallel claim for the final shared global slot', async () => {
    expect(await repo.admit({ ip: '192.0.2.1', email: 'seed@example.com', now })).toBe(true);
    await db.update(loginAttemptBudgets).set({ count: 1199 })
      .where(eq(loginAttemptBudgets.scope, 'global'));
    const results = await Promise.all([
      repo.admit({ ip: '192.0.2.2', email: 'one@example.com', now }),
      repo.admit({ ip: '192.0.2.3', email: 'two@example.com', now }),
    ]);
    expect(results).toEqual(expect.arrayContaining([true, false]));
    const [global] = await db.select().from(loginAttemptBudgets)
      .where(eq(loginAttemptBudgets.scope, 'global'));
    expect(global.count).toBe(1200);
  });
});
