import { and, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '../client';
import { googleOAuthExchangeSlots as slots } from '../schema';
import type { GoogleOAuthExchangeRepository } from '../../../ports/google-oauth-exchange.port';

export class DrizzleGoogleOAuthExchangeRepository implements GoogleOAuthExchangeRepository {
  async acquire(token: string, now: Date, expiresAt: Date): Promise<boolean> {
    return db.transaction(async tx => {
      // Serialize admission across replicas, then lease one of the eight fixed rows.
      // A missing table/lock fails closed; no in-memory fallback can bypass the cap.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(218493021)`);
      const [available] = await tx.select({ slot: slots.slot }).from(slots)
        .where(or(isNull(slots.expiresAt), lte(slots.expiresAt, now)))
        .orderBy(slots.slot).limit(1);
      if (!available) return false;
      const [leased] = await tx.update(slots).set({ token, expiresAt })
        .where(and(eq(slots.slot, available.slot), or(isNull(slots.expiresAt), lte(slots.expiresAt, now))))
        .returning({ slot: slots.slot });
      return Boolean(leased);
    });
  }

  async release(token: string): Promise<void> {
    await db.update(slots).set({ token: null, expiresAt: null }).where(eq(slots.token, token));
  }
}
