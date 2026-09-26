import { db } from '../client';
import { meetingQuotaReservations, meetings, usageLedger, users } from '../schema';
import { eq, inArray, desc, and, lt, gt, isNotNull, isNull, sql } from 'drizzle-orm';
import type { MeetingRepository } from '../../../ports/repositories.port';
import type { Meeting, MeetingPlatform, MeetingSource, MeetingStatus } from '../../../domain/types';
import crypto from 'crypto';
import type { PlanEntitlements } from '../../../domain/billing';
import { CapExceededError } from '../../../domain/errors';

export class DrizzleMeetingRepository implements MeetingRepository {
  async reserve(input: Parameters<MeetingRepository['create']>[0],
    entitlements: PlanEntitlements, maxConcurrent: number): Promise<Meeting> {
    // The owner row is the mutex shared by all API replicas and usage settlement. The meeting
    // and its claim commit together, so even a crash before the provider call consumes capacity.
    return db.transaction(async tx => {
      const [owner] = await tx.select({ id: users.id }).from(users)
        .where(eq(users.id, input.ownerUserId)).for('update');
      if (!owner) throw new Error('Meeting owner does not exist');

      const [active] = await tx.select({
        count: sql<string>`count(*)`,
        seconds: sql<string>`coalesce(sum(${meetingQuotaReservations.reservedSeconds}), 0)`,
      }).from(meetingQuotaReservations).where(and(
        eq(meetingQuotaReservations.ownerUserId, input.ownerUserId),
        isNull(meetingQuotaReservations.releasedAt),
      ));
      if (Number(active.count) >= maxConcurrent) {
        throw new CapExceededError('concurrent recording limit');
      }

      const [used] = await tx.select({
        seconds: sql<string>`coalesce(sum(${usageLedger.secondsRecorded}), 0)`,
      }).from(usageLedger).innerJoin(meetings, eq(usageLedger.meetingId, meetings.id))
        .where(and(eq(meetings.ownerUserId, input.ownerUserId),
          sql`${usageLedger.createdAt} >= date_trunc('month', now())`));
      if (Number(used.seconds) + Number(active.seconds) + entitlements.maxMeetingSeconds
        > entitlements.monthlySecondsCap) {
        throw new CapExceededError('Monthly recording limit reached for your plan');
      }

      const [row] = await tx.insert(meetings).values({
        ownerUserId: input.ownerUserId,
        meetingUrl: input.meetingUrl ?? null,
        platform: input.platform ?? 'zoom',
        status: 'pending',
        source: input.source,
        participantNames: input.participantNames ?? null,
        recordingNoticeConfirmedAt: input.recordingNoticeConfirmedAt ?? null,
        recordingNoticeVersion: input.recordingNoticeVersion ?? null,
        shareToken: crypto.randomBytes(16).toString('base64url'),
      }).returning();
      await tx.insert(meetingQuotaReservations).values({
        meetingId: row.id,
        ownerUserId: input.ownerUserId,
        reservedSeconds: entitlements.maxMeetingSeconds,
      });
      return row as Meeting;
    });
  }

  async create(input: {
    ownerUserId: string;
    source: MeetingSource;
    meetingUrl?: string;
    platform?: MeetingPlatform;
    participantNames?: string[];
    recordingNoticeConfirmedAt?: Date;
    recordingNoticeVersion?: string;
  }): Promise<Meeting> {
    const shareToken = crypto.randomBytes(16).toString('base64url');
    const [row] = await db
      .insert(meetings)
      .values({
        ownerUserId: input.ownerUserId,
        meetingUrl: input.meetingUrl ?? null,
        platform: input.platform ?? 'zoom',
        status: 'pending',
        source: input.source,
        participantNames: input.participantNames ?? null,
        recordingNoticeConfirmedAt: input.recordingNoticeConfirmedAt ?? null,
        recordingNoticeVersion: input.recordingNoticeVersion ?? null,
        shareToken,
      })
      .returning();
    return row as Meeting;
  }

  async findById(id: string): Promise<Meeting | null> {
    const [row] = await db
      .select()
      .from(meetings)
      .where(eq(meetings.id, id));
    return (row as Meeting) || null;
  }

  async findByIdForUser(id: string, userId: string): Promise<Meeting | null> {
    // Postgres UUID comparison throws 22P02 for malformed route parameters. A malformed ID
    // cannot name a meeting, so take the same not-found path as a valid missing ID.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
    const [row] = await db
      .select()
      .from(meetings)
      .where(and(eq(meetings.id, id), eq(meetings.ownerUserId, userId)));
    return (row as Meeting) || null;
  }

  async findByBotId(botId: string): Promise<Meeting | null> {
    const [row] = await db
      .select()
      .from(meetings)
      .where(eq(meetings.botId, botId));
    return (row as Meeting) || null;
  }

  async findByShareToken(token: string): Promise<Meeting | null> {
    const [row] = await db
      .select()
      .from(meetings)
      .where(and(
        eq(meetings.shareToken, token),
        eq(meetings.shareEnabled, true),
        gt(meetings.shareExpiresAt, new Date()),
      ));
    return (row as Meeting) || null;
  }

  async enableShare(id: string, userId: string, expiresAt: Date): Promise<Meeting | null> {
    const shareToken = crypto.randomBytes(24).toString('base64url');
    const [row] = await db.update(meetings).set({
      shareToken,
      shareEnabled: true,
      shareExpiresAt: expiresAt,
      updatedAt: new Date(),
    }).where(and(eq(meetings.id, id), eq(meetings.ownerUserId, userId))).returning();
    return (row as Meeting) || null;
  }

  async revokeShare(id: string, userId: string): Promise<boolean> {
    const rows = await db.update(meetings).set({
      shareEnabled: false,
      shareExpiresAt: null,
      updatedAt: new Date(),
    }).where(and(eq(meetings.id, id), eq(meetings.ownerUserId, userId)))
      .returning({ id: meetings.id });
    return rows.length > 0;
  }

  // The legacy toggle API now has the same expiry and rotation guarantees as POST /share.
  async setShareEnabled(id: string, userId: string, enabled: boolean): Promise<Meeting | null> {
    if (enabled) return this.enableShare(id, userId, new Date(Date.now() + 24 * 60 * 60 * 1000));
    const [row] = await db
      .update(meetings)
      .set({ shareEnabled: false, shareExpiresAt: null, updatedAt: new Date() })
      .where(and(eq(meetings.id, id), eq(meetings.ownerUserId, userId)))
      .returning();
    return (row as Meeting) || null;
  }

  /**
   * Mints a fresh token. Anyone holding the old link gets a 404 from the next request onward.
   * Owner-scoped for the same reason as the toggle above.
   */
  async rotateShareToken(id: string, userId: string): Promise<Meeting | null> {
    const [row] = await db
      .update(meetings)
      .set({ shareToken: crypto.randomBytes(16).toString('base64url'), updatedAt: new Date() })
      .where(and(eq(meetings.id, id), eq(meetings.ownerUserId, userId)))
      .returning();
    return (row as Meeting) || null;
  }

  async findByTranscriptionJobId(jobId: string): Promise<Meeting | null> {
    const [row] = await db
      .select()
      .from(meetings)
      .where(eq(meetings.transcriptionJobId, jobId));
    return (row as Meeting) || null;
  }

  async updateStatus(
    id: string,
    to: MeetingStatus,
    patch?: Partial<Pick<Meeting, 'botId' | 'durationSeconds' | 'errorMessage'>>
  ): Promise<Meeting> {
    const updateFields: any = {
      status: to,
      updatedAt: new Date(),
    };

    if (patch) {
      if (patch.botId !== undefined) updateFields.botId = patch.botId;
      if (patch.durationSeconds !== undefined) updateFields.durationSeconds = patch.durationSeconds;
      if (patch.errorMessage !== undefined) updateFields.errorMessage = patch.errorMessage;
    }

    if (to === 'failed') {
      // Failure and release are one commit. A replay cannot release a later, different claim.
      return db.transaction(async tx => {
        const [row] = await tx.update(meetings).set(updateFields)
          .where(eq(meetings.id, id)).returning();
        if (row) {
          const [charged] = await tx.select({ id: usageLedger.id }).from(usageLedger)
            .where(eq(usageLedger.meetingId, id));
          // A created bot may have recorded despite a failed transcript or worker. Retain its
          // claim until measured/conservative settlement; only a pre-bot rejection is free.
          if (row.source !== 'bot' || !row.botId || charged) {
            await tx.update(meetingQuotaReservations).set({ releasedAt: new Date() })
              .where(and(eq(meetingQuotaReservations.meetingId, id),
                isNull(meetingQuotaReservations.releasedAt)));
          }
        }
        return row as Meeting;
      });
    }
    const [row] = await db.update(meetings).set(updateFields)
      .where(eq(meetings.id, id)).returning();
    return row as Meeting;
  }

  async setSummary(id: string, summary: string): Promise<void> {
    await db
      .update(meetings)
      .set({
        summary,
        updatedAt: new Date(),
      })
      .where(eq(meetings.id, id));
  }

  async setUploadInfo(
    id: string,
    patch: { audioStoragePath?: string | null; transcriptionJobId?: string }
  ): Promise<void> {
    const updateFields: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.audioStoragePath !== undefined) updateFields.audioStoragePath = patch.audioStoragePath;
    if (patch.transcriptionJobId !== undefined) updateFields.transcriptionJobId = patch.transcriptionJobId;

    await db
      .update(meetings)
      .set(updateFields)
      .where(eq(meetings.id, id));
  }

  async countActive(): Promise<number> {
    const rows = await db
      .select()
      .from(meetings)
      .where(inArray(meetings.status, ['pending', 'bot_joining', 'recording', 'processing']));
    return rows.length;
  }

  async countActiveForUser(userId: string): Promise<number> {
    const rows = await db
      .select()
      .from(meetings)
      .where(and(
        eq(meetings.ownerUserId, userId),
        inArray(meetings.status, ['pending', 'bot_joining', 'recording', 'processing'])
      ));
    return rows.length;
  }

  async list(): Promise<Meeting[]> {
    const rows = await db
      .select()
      .from(meetings)
      .orderBy(desc(meetings.createdAt));
    return rows as Meeting[];
  }

  async listForUser(userId: string): Promise<Meeting[]> {
    const rows = await db
      .select()
      .from(meetings)
      .where(eq(meetings.ownerUserId, userId))
      .orderBy(desc(meetings.createdAt));
    return rows as Meeting[];
  }

  async deleteById(id: string): Promise<void> {
    await db.delete(meetings).where(eq(meetings.id, id));
  }

  async findTranscribedOlderThan(hours: number): Promise<Meeting[]> {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    return (await db
      .select()
      .from(meetings)
      .where(
        and(
          eq(meetings.status, 'transcribed'),
          lt(meetings.updatedAt, cutoff)
        )
      )) as Meeting[];
  }

  async findFailedWithAudioOlderThan(hours: number): Promise<Meeting[]> {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    return (await db
      .select()
      .from(meetings)
      .where(and(
        eq(meetings.status, 'failed'),
        isNotNull(meetings.audioStoragePath),
        lt(meetings.updatedAt, cutoff),
      ))) as Meeting[];
  }

  async findStuckActiveOlderThan(minutes: number): Promise<Meeting[]> {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    return (await db
      .select()
      .from(meetings)
      .where(
        and(
          inArray(meetings.status, ['bot_joining', 'recording', 'processing']),
          lt(meetings.updatedAt, cutoff)
        )
      )) as Meeting[];
  }
}

