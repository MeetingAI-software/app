import { db } from '../client';
import { meetings } from '../schema';
import { eq, inArray, desc } from 'drizzle-orm';
import type { MeetingRepository } from '../../../ports/repositories.port';
import type { Meeting, MeetingStatus } from '../../../domain/types';

export class DrizzleMeetingRepository implements MeetingRepository {
  async create(input: { meetingUrl: string }): Promise<Meeting> {
    const [row] = await db
      .insert(meetings)
      .values({
        meetingUrl: input.meetingUrl,
        platform: 'zoom',
        status: 'pending',
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
