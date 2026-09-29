import { db } from '../client';
import { liveTranscriptSegments, meetings } from '../schema';
import { and, asc, eq, gt } from 'drizzle-orm';
import type { LiveTranscriptRepository, LiveTranscriptSegment } from '../../../ports/repositories.port';
import type { TranscriptSegment } from '../../../domain/types';
import { LiveTranscriptClosedError } from '../../../domain/errors';

export class DrizzleLiveTranscriptRepository implements LiveTranscriptRepository {
  async append(meetingId: string, seg: TranscriptSegment): Promise<LiveTranscriptSegment> {
    // A sequence is allocated before its transaction commits. Serialize allocation and commit
    // per meeting so a visible cursor can never overtake an uncommitted lower sequence.
    return db.transaction(async (tx) => {
      const [meeting] = await tx.select({ status: meetings.status }).from(meetings)
        .where(eq(meetings.id, meetingId)).for('update');
      if (!meeting || meeting.status === 'failed' || meeting.status === 'transcribed') {
        throw new LiveTranscriptClosedError();
      }
      const [row] = await tx.insert(liveTranscriptSegments)
        .values({
          meetingId,
          startMs: seg.startMs,
          endMs: seg.endMs,
          speaker: seg.speaker,
          text: seg.text,
        })
        .returning({ seq: liveTranscriptSegments.seq });

      return { seq: Number(row.seq), ...seg };
    });
  }

  async listSince(meetingId: string, afterSeq: number, limit = 500): Promise<LiveTranscriptSegment[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new RangeError('Invalid transcript page size');
    const rows = await db
      .select()
      .from(liveTranscriptSegments)
      .where(and(
        eq(liveTranscriptSegments.meetingId, meetingId),
        gt(liveTranscriptSegments.seq, afterSeq),
      ))
      .orderBy(asc(liveTranscriptSegments.seq))
      .limit(limit);

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
