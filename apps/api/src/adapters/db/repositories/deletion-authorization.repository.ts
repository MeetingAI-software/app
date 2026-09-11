import { and, eq, gt, isNotNull, isNull, exists } from 'drizzle-orm';
import { db } from '../client';
import { accountDeletionAuthorizations as grants, sessions, users } from '../schema';
import type { DeletionAuthorizationRepository, DeletionChallenge } from '../../../ports/deletion-authorization.port';

export class DrizzleDeletionAuthorizationRepository implements DeletionAuthorizationRepository {
  async replace(input: DeletionChallenge) {
    // One bounded row per session; a new challenge invalidates its previous grant.
    await db.insert(grants).values(input).onConflictDoUpdate({ target: grants.sessionId,
      set: { ...input, claimedAt: null, grantHash: null, grantExpiresAt: null, consumedAt: null } });
  }

  private liveIdentity(now: Date) {
    return exists(db.select({ id: sessions.id }).from(sessions).innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.id, grants.sessionId), eq(sessions.userId, grants.userId), gt(sessions.expiresAt, now),
        eq(users.googleId, grants.googleSub), isNull(users.passwordHash))));
  }

  async claim(input: Parameters<DeletionAuthorizationRepository['claim']>[0]) {
    const [row] = await db.update(grants).set({ claimedAt: input.now }).where(and(
      eq(grants.stateHash, input.stateHash), eq(grants.sessionId, input.sessionId), eq(grants.userId, input.userId),
      isNull(grants.claimedAt), gt(grants.expiresAt, input.now), this.liveIdentity(input.now),
    )).returning();
    return row ?? null;
  }

  async issueGrant(input: Parameters<DeletionAuthorizationRepository['issueGrant']>[0]) {
    const rows = await db.update(grants).set({ grantHash: input.grantHash, grantExpiresAt: input.expiresAt }).where(and(
      eq(grants.stateHash, input.stateHash), isNotNull(grants.claimedAt), isNull(grants.grantHash),
      gt(grants.expiresAt, input.now), this.liveIdentity(input.now),
    )).returning({ id: grants.sessionId });
    return rows.length === 1;
  }

  async consumeGrant(input: Parameters<DeletionAuthorizationRepository['consumeGrant']>[0]) {
    // A single conditional UPDATE commits before external erasure. No read-then-delete race,
    // and no rollback of this consumption if a provider subsequently refuses deletion.
    const rows = await db.update(grants).set({ consumedAt: input.now }).where(and(
      eq(grants.grantHash, input.grantHash), eq(grants.sessionId, input.sessionId), eq(grants.userId, input.userId),
      eq(grants.googleSub, input.googleSub), isNull(grants.consumedAt), gt(grants.grantExpiresAt, input.now),
      this.liveIdentity(input.now),
    )).returning({ id: grants.sessionId });
    return rows.length === 1;
  }
}
