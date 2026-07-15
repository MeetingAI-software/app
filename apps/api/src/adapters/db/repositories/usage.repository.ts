import { db } from '../client';
import { usageLedger } from '../schema';
import { sql } from 'drizzle-orm';
import type { UsageRepository } from '../../../ports/repositories.port';

export class DrizzleUsageRepository implements UsageRepository {
  async addSeconds(meetingId: string, seconds: number): Promise<void> {
    await db
      .insert(usageLedger)
      .values({
        meetingId,
        secondsRecorded: seconds,
      });
  }

  async monthlyTotalSeconds(): Promise<number> {
    // Sum secondsRecorded for the current calendar month
    const [row] = await db
      .select({
        total: sql<string>`coalesce(sum(${usageLedger.secondsRecorded}), '0')`,
      })
      .from(usageLedger)
      .where(sql`${usageLedger.createdAt} >= date_trunc('month', now())`);

    return parseInt(row?.total || '0', 10);
  }
}
