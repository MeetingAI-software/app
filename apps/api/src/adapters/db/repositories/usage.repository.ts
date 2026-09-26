import { db } from '../client';
import { usageLedger, meetings, meetingQuotaReservations, users } from '../schema';
import { sql, eq, and, isNull } from 'drizzle-orm';
import type { UsageRepository } from '../../../ports/repositories.port';

export class DrizzleUsageRepository implements UsageRepository {
  async addSeconds(meetingId: string, seconds: number): Promise<void> {
    if (!Number.isSafeInteger(seconds) || seconds < 0) throw new Error('Invalid recorded duration');
    await db.transaction(async tx => {
      const [meeting] = await tx.select({ ownerUserId: meetings.ownerUserId })
        .from(meetings).where(eq(meetings.id, meetingId));
      if (!meeting) throw new Error('Meeting does not exist');
      // Same owner lock as admission: a new claim sees either the full reservation or the
      // settled ledger entry, never an empty gap between the two.
      await tx.select({ id: users.id }).from(users)
        .where(eq(users.id, meeting.ownerUserId)).for('update');
      await tx.insert(usageLedger).values({ meetingId, secondsRecorded: seconds })
        .onConflictDoNothing({ target: usageLedger.meetingId });
      await tx.update(meetingQuotaReservations).set({ releasedAt: new Date() })
        .where(and(eq(meetingQuotaReservations.meetingId, meetingId),
          isNull(meetingQuotaReservations.releasedAt)));
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
