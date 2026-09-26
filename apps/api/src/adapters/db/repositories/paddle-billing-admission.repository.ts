import { and, eq, gt, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { db } from '../client';
import { paddleBillingBudgets as budgets, paddleBillingSlots as slots } from '../schema';
import type { PaddleBillingAdmissionRepository, PaddleBillingAdmissionResult } from '../../../ports/paddle-billing-admission.port';

const WINDOW_MS = 60_000;
const RETENTION_WINDOWS = 1440;
const LEASE_MINUTES = 10;
class RateLimited extends Error {}

export class DrizzlePaddleBillingAdmissionRepository implements PaddleBillingAdmissionRepository {
  async acquire(input: { userId: string; token: string }): Promise<PaddleBillingAdmissionResult> {
    try {
      return await db.transaction(async tx => {
        // A single transaction lock serializes both the per-user check and global slot selection.
        // Missing migration fails closed instead of falling back to process-local counters.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(218493022)`);
        // Use the database clock so replica clock skew cannot reclaim another worker's live lease
        // or move a request into a different rate-limit window.
        const [clock] = await tx.select({ window: sql<number>`floor(extract(epoch from clock_timestamp()) / ${WINDOW_MS / 1000})::integer` })
          .from(slots).limit(1);
        if (!clock) return 'busy';
        const window = clock.window;
        const [sameUser] = await tx.select({ slot: slots.slot }).from(slots)
          .where(and(eq(slots.userId, input.userId), gt(slots.expiresAt, sql`clock_timestamp()`))).limit(1);
        if (sameUser) return 'busy';
        const [available] = await tx.select({ slot: slots.slot }).from(slots)
          .where(or(isNull(slots.expiresAt), lte(slots.expiresAt, sql`clock_timestamp()`)))
          .orderBy(slots.slot).limit(1);
        if (!available) return 'busy';

        for (const [scope, max] of [['global', 80], [`user:${input.userId}`, 10]] as const) {
          const [claimed] = await tx.insert(budgets).values({ scope, window, count: 1 })
            .onConflictDoUpdate({
              target: [budgets.scope, budgets.window],
              set: { count: sql`${budgets.count} + 1` },
              setWhere: lt(budgets.count, max),
            }).returning({ count: budgets.count });
          if (!claimed) throw new RateLimited();
        }

        const [leased] = await tx.update(slots).set({
          token: input.token, userId: input.userId,
          expiresAt: sql`clock_timestamp() + ${LEASE_MINUTES} * INTERVAL '1 minute'`,
        }).where(and(eq(slots.slot, available.slot), or(isNull(slots.expiresAt), lte(slots.expiresAt, sql`clock_timestamp()`))))
          .returning({ slot: slots.slot });
        if (!leased) throw new Error('Billing admission slot changed unexpectedly');
        if (available.slot === 1) await tx.delete(budgets).where(lt(budgets.window, window - RETENTION_WINDOWS));
        return 'admitted';
      });
    } catch (error) {
      if (error instanceof RateLimited) return 'rate_limited';
      throw error;
    }
  }

  async release(token: string): Promise<void> {
    await db.update(slots).set({ token: null, userId: null, expiresAt: null }).where(eq(slots.token, token));
  }
}
