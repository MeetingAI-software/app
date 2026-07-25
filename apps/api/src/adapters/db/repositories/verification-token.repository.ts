import { db } from '../client';
import { emailVerificationTokens } from '../schema';
import { eq } from 'drizzle-orm';
import type { VerificationTokenRepository } from '../../../ports/repositories.port';
import type { EmailVerificationToken } from '../../../domain/types';

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
        createdAt: emailVerificationTokens.createdAt,
      })
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.tokenHash, tokenHash));
    return row ?? null;
  }

  async deleteByTokenHash(tokenHash: string): Promise<void> {
    await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.tokenHash, tokenHash));
  }
}
