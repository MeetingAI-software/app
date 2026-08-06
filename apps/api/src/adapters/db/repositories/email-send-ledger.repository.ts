import { db } from '../client';
import { emailSendLedger } from '../schema';
import { sql, gte, lt } from 'drizzle-orm';
import type { EmailSendLedgerRepository, EmailSendTrigger } from '../../../ports/repositories.port';

export class DrizzleEmailSendLedgerRepository implements EmailSendLedgerRepository {
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
