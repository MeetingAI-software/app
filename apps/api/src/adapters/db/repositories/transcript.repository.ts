import { db } from '../client';
import { transcripts } from '../schema';
import { eq } from 'drizzle-orm';
import type { TranscriptRepository } from '../../../ports/repositories.port';
import type { TranscriptSegment } from '../../../domain/types';

export class DrizzleTranscriptRepository implements TranscriptRepository {
  async save(meetingId: string, segments: TranscriptSegment[], rawPayload: unknown): Promise<void> {
    await db
      .insert(transcripts)
      .values({
        meetingId,
        segments,
        rawPayload,
      });
  }

  async getByMeetingId(meetingId: string): Promise<TranscriptSegment[] | null> {
    const [row] = await db
      .select()
      .from(transcripts)
      .where(eq(transcripts.meetingId, meetingId));
    return row ? (row.segments as TranscriptSegment[]) : null;
  }
}
