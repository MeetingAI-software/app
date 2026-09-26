import { and, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import { db } from '../client';
import { googleOAuthBudget as budgets, googleOAuthStates as states } from '../schema';
import type { GoogleOAuthChallenge, GoogleOAuthStateRepository } from '../../../ports/google-oauth-state.port';

const WINDOW_MS = 15 * 60_000;
const MAX_STATES_PER_WINDOW = 300;
const RETENTION_MS = 24 * 60 * 60_000;
const windowKey = (now: Date) => String(Math.floor(now.getTime() / WINDOW_MS)).padStart(12, '0');

export class DrizzleGoogleOAuthStateRepository implements GoogleOAuthStateRepository {
  async issue(challenge: GoogleOAuthChallenge): Promise<boolean> {
    return db.transaction(async (tx) => {
      const [admitted] = await tx.insert(budgets)
        .values({ window: windowKey(challenge.createdAt), count: 1 })
        .onConflictDoUpdate({
          target: budgets.window,
          set: { count: sql`${budgets.count} + 1` },
          setWhere: lt(budgets.count, MAX_STATES_PER_WINDOW),
        }).returning({ count: budgets.count });
      if (!admitted) return false;

      await tx.insert(states).values(challenge);
      // Cleanup runs after admission, so a flood cannot turn expiration work into free requests.
      await tx.delete(states).where(lt(states.expiresAt,
        new Date(challenge.createdAt.getTime() - RETENTION_MS)));
      await tx.delete(budgets).where(lt(budgets.window,
        windowKey(new Date(challenge.createdAt.getTime() - RETENTION_MS))));
      return true;
    });
  }

  async claim(stateHash: string, now: Date): Promise<GoogleOAuthChallenge | null> {
    const [claimed] = await db.update(states).set({ claimedAt: now }).where(and(
      eq(states.stateHash, stateHash), isNull(states.claimedAt), gt(states.expiresAt, now),
    )).returning();
    return claimed ? {
      stateHash: claimed.stateHash,
      nonceHash: claimed.nonceHash,
      purpose: claimed.purpose as GoogleOAuthChallenge['purpose'],
      userId: claimed.userId,
      sessionHash: claimed.sessionHash,
      authVersion: claimed.authVersion,
      createdAt: claimed.createdAt,
      expiresAt: claimed.expiresAt,
    } : null;
  }
}
