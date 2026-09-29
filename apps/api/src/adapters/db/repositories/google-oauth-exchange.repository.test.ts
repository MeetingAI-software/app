import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, migrateOnce, truncateAll } from '../pglite-harness';
import { googleOAuthExchangeSlots as slots } from '../schema';
import { DrizzleGoogleOAuthExchangeRepository } from './google-oauth-exchange.repository';

vi.mock('../client', () => ({ db }));

describe('shared Google provider exchange slots', () => {
  const now = new Date('2026-09-27T12:00:00Z');
  const expiry = new Date(now.getTime() + 30_000);
  const first = new DrizzleGoogleOAuthExchangeRepository();
  const second = new DrizzleGoogleOAuthExchangeRepository();

  beforeAll(migrateOnce);
  beforeEach(async () => {
    await truncateAll();
    await db.insert(slots).values(Array.from({ length: 8 }, (_, i) => ({ slot: i + 1 })));
  });

  it('admits only eight concurrent exchanges across repository instances', async () => {
    const results = await Promise.all(Array.from({ length: 16 }, (_, i) =>
      (i % 2 ? first : second).acquire(`claim-${i}`, now, expiry)));
    expect(results.filter(Boolean)).toHaveLength(8);
    expect((await db.select().from(slots)).filter(row => row.token !== null)).toHaveLength(8);
  });

  it('releases the matching lease and never frees a replacement with an old token', async () => {
    expect(await first.acquire('original', now, expiry)).toBe(true);
    await second.release('original');
    const [released] = await db.select().from(slots).where(eq(slots.slot, 1));
    expect(released.token).toBeNull();
    expect(await second.acquire('replacement', now, expiry)).toBe(true);
    await first.release('original');
    const [replacement] = await db.select().from(slots).where(eq(slots.slot, 1));
    expect(replacement.token).toBe('replacement');
  });

  it('recovers a crashed exchange after expiry without extending other leases', async () => {
    for (let i = 0; i < 8; i++) expect(await first.acquire(`old-${i}`, now, expiry)).toBe(true);
    expect(await second.acquire('blocked', now, expiry)).toBe(false);
    const later = new Date(expiry.getTime() + 1);
    expect(await second.acquire('recovered', later, new Date(later.getTime() + 30_000))).toBe(true);
    await first.release('old-0');
    const [reused] = await db.select().from(slots).where(eq(slots.slot, 1));
    expect(reused.token).toBe('recovered');
  });
});
