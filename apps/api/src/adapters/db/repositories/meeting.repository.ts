import { db } from '../client';
import { meetings } from '../schema';
import { eq, inArray, desc } from 'drizzle-orm';
import type { MeetingRepository } from '../../../ports/repositories.port';
import type { Meeting, MeetingSource, MeetingStatus } from '../../../domain/types';
import crypto from 'crypto';

export class DrizzleMeetingRepository implements MeetingRepository {
  async create(input: {
    source: MeetingSource;
    meetingUrl?: string;
    participantNames?: string[];
  }): Promise<Meeting> {
    const shareToken = crypto.randomBytes(16).toString('base64url');
    const [row] = await db
      .insert(meetings)
      .values({
        meetingUrl: input.meetingUrl ?? null,
        platform: 'zoom',
        status: 'pending',
        source: input.source,
        participantNames: input.participantNames ?? null,
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
      .where(eq(meetings.shareToken, token));
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

    const [row] = await db
      .update(meetings)
      .set(updateFields)
      .where(eq(meetings.id, id))
      .returning();
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
    patch: { audioStoragePath?: string; transcriptionJobId?: string }
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
      .where(inArray(meetings.status, ['bot_joining', 'recording', 'processing']));
    return rows.length;
  }

  async list(): Promise<Meeting[]> {
    const rows = await db
      .select()
      .from(meetings)
      .orderBy(desc(meetings.createdAt));
    return rows as Meeting[];
  }
}

