import { db } from '../client';
import { liveTranscriptSegments } from '../schema';
import { and, asc, eq, gt } from 'drizzle-orm';
import type { LiveTranscriptRepository, LiveTranscriptSegment } from '../../../ports/repositories.port';
import type { TranscriptSegment } from '../../../domain/types';

export class DrizzleLiveTranscriptRepository implements LiveTranscriptRepository {
  async append(meetingId: string, seg: TranscriptSegment): Promise<LiveTranscriptSegment> {
    const [row] = await db
      .insert(liveTranscriptSegments)
      .values({
        meetingId,
        startMs: seg.startMs,
        endMs: seg.endMs,
        speaker: seg.speaker,
        text: seg.text,
      })
      .returning({ seq: liveTranscriptSegments.seq });

    return { seq: Number(row.seq), ...seg };
  }

  async listSince(meetingId: string, afterSeq: number): Promise<LiveTranscriptSegment[]> {
    const rows = await db
      .select()
      .from(liveTranscriptSegments)
      .where(and(
        eq(liveTranscriptSegments.meetingId, meetingId),
        gt(liveTranscriptSegments.seq, afterSeq),
      ))
      .orderBy(asc(liveTranscriptSegments.seq));

    return rows.map(row => ({
      seq: Number(row.seq),
      startMs: row.startMs,
      endMs: row.endMs,
      speaker: row.speaker,
      text: row.text,
    }));
  }

  async deleteByMeeting(meetingId: string): Promise<void> {
    await db.delete(liveTranscriptSegments).where(eq(liveTranscriptSegments.meetingId, meetingId));
  }
}
