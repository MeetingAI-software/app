import { db } from '../client';
import { emailVerificationTokens, users } from '../schema';
import { and, eq, gt, isNull, lte } from 'drizzle-orm';
import type {
  VerificationTokenConsumeResult,
  VerificationTokenRepository,
} from '../../../ports/repositories.port';
import type { EmailVerificationToken, User } from '../../../domain/types';

function toUser(row: { id: string; email: string; emailVerified: boolean; createdAt: Date }): User {
  return { id: row.id, email: row.email, emailVerified: row.emailVerified, createdAt: row.createdAt };
}

export class DrizzleVerificationTokenRepository implements VerificationTokenRepository {
  async replaceForUser(input: { userId: string; tokenHash: string; expiresAt: Date }): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, input.userId));
      await tx.insert(emailVerificationTokens).values({
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      });
    });
  }

  async findByTokenHash(tokenHash: string): Promise<EmailVerificationToken | null> {
    const [row] = await db
      .select({
        id: emailVerificationTokens.id,
        userId: emailVerificationTokens.userId,
        expiresAt: emailVerificationTokens.expiresAt,
        consumedAt: emailVerificationTokens.consumedAt,
        createdAt: emailVerificationTokens.createdAt,
      })
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.tokenHash, tokenHash));
    return row ?? null;
  }

  async findForUser(userId: string): Promise<EmailVerificationToken | null> {
    // `verification_user_id_uq` makes this at most one row, so no ordering is needed.
    const [row] = await db
      .select({
        id: emailVerificationTokens.id,
        userId: emailVerificationTokens.userId,
        expiresAt: emailVerificationTokens.expiresAt,
        consumedAt: emailVerificationTokens.consumedAt,
        createdAt: emailVerificationTokens.createdAt,
      })
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.userId, userId));
    return row ?? null;
  }

  async deleteByTokenHash(tokenHash: string): Promise<void> {
    await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.tokenHash, tokenHash));
  }

  async deleteExpired(now: Date): Promise<number> {
    const removed = await db
      .delete(emailVerificationTokens)
      .where(lte(emailVerificationTokens.expiresAt, now))
      .returning({ id: emailVerificationTokens.id });
    return removed.length;
  }

  async consumeAndVerify(input: { tokenHash: string; now: Date }): Promise<VerificationTokenConsumeResult> {
    return db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(emailVerificationTokens)
        .set({ consumedAt: input.now })
        .where(and(
          eq(emailVerificationTokens.tokenHash, input.tokenHash),
          isNull(emailVerificationTokens.consumedAt),
          gt(emailVerificationTokens.expiresAt, input.now),
        ))
        .returning({ userId: emailVerificationTokens.userId });

      if (!claimed) {
        const [existing] = await tx
          .select({
            expiresAt: emailVerificationTokens.expiresAt,
            consumedAt: emailVerificationTokens.consumedAt,
          })
          .from(emailVerificationTokens)
          .where(eq(emailVerificationTokens.tokenHash, input.tokenHash));

        if (!existing) return { status: 'invalid' };
        if (existing.consumedAt) return { status: 'used' };
        if (existing.expiresAt.getTime() <= input.now.getTime()) return { status: 'expired' };
        return { status: 'invalid' };
      }

      const [verifiedUser] = await tx
        .update(users)
        .set({ emailVerified: true })
        .where(and(eq(users.id, claimed.userId), eq(users.emailVerified, false)))
        .returning();

      if (verifiedUser) return { status: 'verified', user: toUser(verifiedUser) };

      const [existingUser] = await tx.select().from(users).where(eq(users.id, claimed.userId));
      if (existingUser?.emailVerified) return { status: 'already_verified' };
      throw new Error(`Verification token references missing user: ${claimed.userId}`);
    });
  }
}
