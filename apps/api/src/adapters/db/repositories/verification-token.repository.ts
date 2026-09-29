import { db } from '../client';
import { emailVerificationTokens, sessions, users } from '../schema';
import { and, eq, gt, isNull, lte, sql } from 'drizzle-orm';
import type {
  VerificationTokenConsumeResult,
  VerificationTokenRepository,
} from '../../../ports/repositories.port';
import type { EmailVerificationToken, User } from '../../../domain/types';

function toUser(row: { id: string; email: string; emailVerified: boolean; createdAt: Date }): User {
  return { id: row.id, email: row.email, emailVerified: row.emailVerified, createdAt: row.createdAt };
}

export class DrizzleVerificationTokenRepository implements VerificationTokenRepository {
  async replaceForUser(input: { userId: string; tokenHash: string; expiresAt: Date }): Promise<{ email: string }> {
    return db.transaction(async (tx) => {
      // Serialize issuance with updateEmail. The recipient and address version must come from the
      // same locked user row, not from the possibly stale caller's User object.
      const [user] = await tx.select({ email: users.email, emailVersion: users.emailVersion })
        .from(users).where(eq(users.id, input.userId)).for('update');
      if (!user) throw new Error('Verification token user no longer exists');
      await tx.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, input.userId));
      await tx.insert(emailVerificationTokens).values({
        userId: input.userId,
        tokenHash: input.tokenHash,
        emailAtIssue: user.email,
        emailVersion: user.emailVersion,
        expiresAt: input.expiresAt,
      });
      return { email: user.email };
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

  async consumeAndVerify(input: { tokenHash: string; now: Date; passwordHash: string }): Promise<VerificationTokenConsumeResult> {
    return db.transaction(async (tx) => {
      const [tokenOwner] = await tx.select({ userId: emailVerificationTokens.userId })
        .from(emailVerificationTokens).where(eq(emailVerificationTokens.tokenHash, input.tokenHash));
      if (!tokenOwner) return { status: 'invalid' };
      // Lock users before tokens, matching issuance and changeEmail, to avoid a token/user lock
      // inversion under concurrent verification and address changes.
      const [userLock] = await tx.select({ id: users.id }).from(users)
        .where(eq(users.id, tokenOwner.userId)).for('update');
      if (!userLock) return { status: 'invalid' };
      const [claimed] = await tx
        .update(emailVerificationTokens)
        .set({ consumedAt: input.now })
        .where(and(
          eq(emailVerificationTokens.tokenHash, input.tokenHash),
          isNull(emailVerificationTokens.consumedAt),
          gt(emailVerificationTokens.expiresAt, input.now),
        ))
        .returning({
          userId: emailVerificationTokens.userId,
          emailAtIssue: emailVerificationTokens.emailAtIssue,
          emailVersion: emailVerificationTokens.emailVersion,
        });

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

      if (!claimed.emailAtIssue || claimed.emailVersion === null) return { status: 'invalid' };

      const [verifiedUser] = await tx
        .update(users)
        .set({
          emailVerified: true,
          passwordHash: input.passwordHash,
          googleId: null,
          authVersion: sql`${users.authVersion} + 1`,
        })
        .where(and(
          eq(users.id, claimed.userId),
          eq(users.email, claimed.emailAtIssue),
          eq(users.emailVersion, claimed.emailVersion),
          eq(users.emailVerified, false),
        ))
        .returning();

      if (verifiedUser) {
        await tx.delete(sessions).where(eq(sessions.userId, verifiedUser.id));
        return { status: 'verified', user: toUser(verifiedUser) };
      }

      const [existingUser] = await tx.select().from(users).where(eq(users.id, claimed.userId));
      if (existingUser?.email === claimed.emailAtIssue
        && existingUser.emailVersion === claimed.emailVersion
        && existingUser.emailVerified) return { status: 'already_verified' };
      if (existingUser) return { status: 'invalid' };
      throw new Error(`Verification token references missing user: ${claimed.userId}`);
    });
  }

}
