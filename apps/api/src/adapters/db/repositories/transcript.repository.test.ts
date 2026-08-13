import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, migrateOnce, truncateAll } from '../pglite-harness';
import { meetings, transcripts, users } from '../schema';
import { DrizzleTranscriptRepository } from './transcript.repository';
import type { TranscriptSegment } from '../../../domain/types';

// Real Postgres (PGlite) stands in for the live-DATABASE_URL singleton. See pglite-harness.ts for
// why the factory closes over `db` rather than importing inside itself.
vi.mock('../client', () => ({ db }));

let tokenSeq = 0;

describe('DrizzleTranscriptRepository', () => {
  let repo: DrizzleTranscriptRepository;
  let meetingA: string;
  let meetingB: string;

  const segments: TranscriptSegment[] = [
    { startMs: 0, endMs: 4200, speaker: 'Alper Eken', text: 'Shall we start?' },
    { startMs: 4200, endMs: 9100, speaker: 'Speaker 2', text: 'Yes — budget first.' },
  ];

  async function insertMeeting(ownerUserId: string) {
    const [row] = await db
      .insert(meetings)
      .values({
        ownerUserId,
        platform: 'zoom',
        status: 'transcribed',
        source: 'bot',
        shareToken: `tok-${++tokenSeq}`,
      } as never)
      .returning({ id: meetings.id });
    return row.id;
  }

  beforeAll(async () => {
    await migrateOnce();
  });

  beforeEach(async () => {
    await truncateAll();
    repo = new DrizzleTranscriptRepository();
    const [owner] = await db
      .insert(users)
      .values({ email: 'alice@example.com', passwordHash: 'hash-a' })
      .returning({ id: users.id });
    meetingA = await insertMeeting(owner.id);
    meetingB = await insertMeeting(owner.id);
  });

  describe('save and getByMeetingId', () => {
    // The segments survive a round trip through jsonb with their timings and speakers intact —
    // which is the whole contract, since the chat and document features read nothing else.
    it('round-trips every segment field', async () => {
      await repo.save(meetingA, segments, { provider: 'assemblyai' });

      const loaded = await repo.getByMeetingId(meetingA);

      expect(loaded).toEqual(segments);
    });

    it('returns null for a meeting with no transcript', async () => {
      expect(await repo.getByMeetingId(meetingB)).toBeNull();
    });

    // An empty transcript is a real outcome (a silent recording) and must read back as an empty
    // list, not as "no transcript yet" — the two mean different things to the caller.
    it('distinguishes an empty transcript from a missing one', async () => {
      await repo.save(meetingA, [], { provider: 'assemblyai' });

      expect(await repo.getByMeetingId(meetingA)).toEqual([]);
      expect(await repo.getByMeetingId(meetingB)).toBeNull();
    });

    // Kept so a transcript can be re-derived without paying the provider again.
    it('stores the provider’s raw response alongside the segments', async () => {
      const raw = { id: 'job-1', status: 'completed', words: [{ text: 'Shall' }] };
      await repo.save(meetingA, segments, raw);

      const [row] = await db.select().from(transcripts).where(eq(transcripts.meetingId, meetingA));
      expect(row.rawPayload).toEqual(raw);
    });

    it('reads back only the requested meeting’s transcript', async () => {
      await repo.save(meetingA, segments, {});
      await repo.save(meetingB, [{ startMs: 0, endMs: 1, speaker: 'X', text: 'other' }], {});

      expect(await repo.getByMeetingId(meetingA)).toEqual(segments);
      expect((await repo.getByMeetingId(meetingB))?.[0].text).toBe('other');
    });
  });

  describe('deleteByMeeting', () => {
    it('removes only the named meeting’s transcript', async () => {
      await repo.save(meetingA, segments, {});
      await repo.save(meetingB, segments, {});

      await repo.deleteByMeeting(meetingA);

      expect(await repo.getByMeetingId(meetingA)).toBeNull();
      expect(await repo.getByMeetingId(meetingB)).not.toBeNull();
    });

    it('is a no-op for a meeting that has no transcript', async () => {
      await expect(repo.deleteByMeeting(meetingB)).resolves.toBeUndefined();
    });
  });

  // meeting_id has no ON DELETE clause, so it restricts — which is why auth.service.ts deletes
  // transcripts before the meeting during account erasure. Pinned so that ordering is not undone.
  it('blocks deleting a meeting that still has a transcript', async () => {
    await repo.save(meetingA, segments, {});

    await expect(db.delete(meetings).where(eq(meetings.id, meetingA)))
      .rejects.toThrow(/foreign key|violates/i);

    await repo.deleteByMeeting(meetingA);
    await expect(db.delete(meetings).where(eq(meetings.id, meetingA))).resolves.toBeDefined();
  });
});
