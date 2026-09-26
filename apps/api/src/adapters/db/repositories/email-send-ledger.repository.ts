import { db } from '../client';
import { emailSendLedger } from '../schema';
import { sql, gte, lt } from 'drizzle-orm';
import type { EmailSendLedgerRepository, EmailSendTrigger } from '../../../ports/repositories.port';

export class DrizzleEmailSendLedgerRepository implements EmailSendLedgerRepository {
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
