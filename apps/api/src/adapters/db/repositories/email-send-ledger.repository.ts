import { db } from '../client';
import { emailSendLedger, emailVerificationTokens, users } from '../schema';
import { sql, gte, lt, eq } from 'drizzle-orm';
import type { EmailSendLedgerRepository, EmailSendTrigger } from '../../../ports/repositories.port';

export class DrizzleEmailSendLedgerRepository implements EmailSendLedgerRepository {
  async tryReserveAndIssue(input: { userId: string; trigger: EmailSendTrigger;
    since: Date; now: Date; limit: number; cooldownMs: number;
    tokenHash: string; expiresAt: Date }): Promise<{ status: 'issued'; email: string }
      | { status: 'cooldown' | 'budget' | 'already_verified' }> {
    return db.transaction(async tx => {
      // All send paths take this lock first. The user lock then serializes with email changes and
      // token consumption. No rejected send may invalidate the user's existing link.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(218493017)`);
      const [user] = await tx.select({ email: users.email, emailVersion: users.emailVersion,
        emailVerified: users.emailVerified }).from(users)
        .where(eq(users.id, input.userId)).for('update');
      if (!user || user.emailVerified) return { status: 'already_verified' };
      const [previous] = await tx.select({ createdAt: emailVerificationTokens.createdAt })
        .from(emailVerificationTokens).where(eq(emailVerificationTokens.userId, input.userId));
      if (input.trigger === 'resend' && previous
        && previous.createdAt.getTime() > input.now.getTime() - input.cooldownMs) {
        return { status: 'cooldown' };
      }
      const [spent] = await tx.select({ total: sql<string>`count(*)` })
        .from(emailSendLedger).where(gte(emailSendLedger.createdAt, input.since));
      if (Number(spent?.total ?? 0) >= input.limit) return { status: 'budget' };
      await tx.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, input.userId));
      await tx.insert(emailVerificationTokens).values({
        userId: input.userId, tokenHash: input.tokenHash, emailAtIssue: user.email,
        emailVersion: user.emailVersion, expiresAt: input.expiresAt, createdAt: input.now,
      });
      await tx.insert(emailSendLedger).values({
        userId: input.userId, trigger: input.trigger, createdAt: input.now,
      });
      return { status: 'issued', email: user.email };
    });
  }

  async tryReserve(input: { userId: string | null; trigger: EmailSendTrigger;
    since: Date; now: Date; limit: number }): Promise<boolean> {
    return db.transaction(async (tx) => {
      // One transaction-scoped lock serializes the count and insert across every API replica.
      // It is released automatically on commit or rollback, including a crashed caller.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(218493017)`);
      const [row] = await tx.select({ total: sql<string>`count(*)` })
        .from(emailSendLedger).where(gte(emailSendLedger.createdAt, input.since));
      if (Number(row?.total ?? 0) >= input.limit) return false;
      await tx.insert(emailSendLedger).values({
        userId: input.userId,
        trigger: input.trigger,
        createdAt: input.now,
      });
      return true;
    });
  }

  async countSince(since: Date): Promise<number> {
    const [row] = await db
      .select({ total: sql<string>`count(*)` })
      .from(emailSendLedger)
      .where(gte(emailSendLedger.createdAt, since));

    return parseInt(row?.total || '0', 10);
  }

  async record(input: { userId: string | null; trigger: EmailSendTrigger }): Promise<void> {
    await db.insert(emailSendLedger).values({
      userId: input.userId,
      trigger: input.trigger,
    });
  }

  async deleteOlderThan(cutoff: Date): Promise<number> {
    const removed = await db
      .delete(emailSendLedger)
      .where(lt(emailSendLedger.createdAt, cutoff))
      .returning({ id: emailSendLedger.id });
    return removed.length;
  }
}
