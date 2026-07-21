import { db } from '../client';
import { usageLedger, meetings } from '../schema';
import { sql, eq, and } from 'drizzle-orm';
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

  async monthlyTotalSeconds(userId: string): Promise<number> {
    // Sum secondsRecorded for the current calendar month, scoped to this user's meetings.
    const [row] = await db
      .select({
        total: sql<string>`coalesce(sum(${usageLedger.secondsRecorded}), '0')`,
      })
      .from(usageLedger)
      .innerJoin(meetings, eq(usageLedger.meetingId, meetings.id))
      .where(and(
        eq(meetings.ownerUserId, userId),
        sql`${usageLedger.createdAt} >= date_trunc('month', now())`
      ));

    return parseInt(row?.total || '0', 10);
  }

  async deleteByMeeting(meetingId: string): Promise<void> {
    await db.delete(usageLedger).where(eq(usageLedger.meetingId, meetingId));
  }
}
