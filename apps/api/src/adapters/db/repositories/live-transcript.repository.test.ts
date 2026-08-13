import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, migrateOnce, truncateAll } from '../pglite-harness';
import { liveTranscriptSegments, meetings, users } from '../schema';
import { DrizzleLiveTranscriptRepository } from './live-transcript.repository';
import type { TranscriptSegment } from '../../../domain/types';

// Real Postgres (PGlite) stands in for the live-DATABASE_URL singleton. See pglite-harness.ts for
// why the factory closes over `db` rather than importing inside itself.
vi.mock('../client', () => ({ db }));

let tokenSeq = 0;

describe('DrizzleLiveTranscriptRepository', () => {
  let repo: DrizzleLiveTranscriptRepository;
  let meetingA: string;
  let meetingB: string;

  function segment(overrides: Partial<TranscriptSegment> = {}): TranscriptSegment {
    return { startMs: 0, endMs: 1000, speaker: 'Speaker 1', text: 'hello', ...overrides };
  }

  async function insertMeeting(ownerUserId: string) {
    const [row] = await db
      .insert(meetings)
      .values({
        ownerUserId,
        platform: 'zoom',
        status: 'recording',
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
    repo = new DrizzleLiveTranscriptRepository();
    const [owner] = await db
      .insert(users)
      .values({ email: 'alice@example.com', passwordHash: 'hash-a' })
      .returning({ id: users.id });
    meetingA = await insertMeeting(owner.id);
    meetingB = await insertMeeting(owner.id);
  });

  describe('append', () => {
    it('returns the segment with the sequence number the database assigned', async () => {
      const seg = segment({ text: 'first utterance' });

      const stored = await repo.append(meetingA, seg);

      expect(stored.seq).toBeGreaterThan(0);
      expect(stored.text).toBe('first utterance');
      expect(stored.startMs).toBe(seg.startMs);
      expect(stored.endMs).toBe(seg.endMs);
      expect(stored.speaker).toBe(seg.speaker);
    });

    it('hands out strictly increasing sequence numbers', async () => {
      const a = await repo.append(meetingA, segment({ text: 'one' }));
      const b = await repo.append(meetingA, segment({ text: 'two' }));

      expect(b.seq).toBeGreaterThan(a.seq);
    });

    // `seq` is a single global sequence, not per-meeting — that is what lets it double as the SSE
    // `Last-Event-ID` cursor. Pinned because making it per-meeting would look tidier and would
    // quietly break replay across reconnects.
    it('draws sequence numbers from one global counter shared by all meetings', async () => {
      const a1 = await repo.append(meetingA, segment({ text: 'a1' }));
      const b1 = await repo.append(meetingB, segment({ text: 'b1' }));
      const a2 = await repo.append(meetingA, segment({ text: 'a2' }));

      expect(b1.seq).toBeGreaterThan(a1.seq);
      expect(a2.seq).toBeGreaterThan(b1.seq);
    });
  });

  // ---------------------------------------------------------------------------
  // listSince is the live feed's cursor, used by both the SSE stream and the
  // polling fallback (meetings.routes.ts). An off-by-one here either repeats an
  // utterance on screen or drops one entirely.
  // ---------------------------------------------------------------------------
  describe('listSince', () => {
    it('returns everything, oldest first, when asked from 0', async () => {
      await repo.append(meetingA, segment({ text: 'one', startMs: 0 }));
      await repo.append(meetingA, segment({ text: 'two', startMs: 1000 }));
      await repo.append(meetingA, segment({ text: 'three', startMs: 2000 }));

      const all = await repo.listSince(meetingA, 0);

      expect(all.map((s) => s.text)).toEqual(['one', 'two', 'three']);
    });

    // THE boundary. `afterSeq` means strictly after: passing back the seq you last displayed must
    // return what came next, never that same utterance again. A `gte` here duplicates every
    // segment at every reconnect.
    it('excludes the cursor segment itself and returns only what follows', async () => {
      await repo.append(meetingA, segment({ text: 'one' }));
      const second = await repo.append(meetingA, segment({ text: 'two' }));
      await repo.append(meetingA, segment({ text: 'three' }));

      const after = await repo.listSince(meetingA, second.seq);

      expect(after.map((s) => s.text)).toEqual(['three']);
    });

    it('returns nothing once the caller is caught up', async () => {
      const last = await repo.append(meetingA, segment({ text: 'only' }));

      expect(await repo.listSince(meetingA, last.seq)).toEqual([]);
    });

    it('returns nothing for a meeting that has streamed no segments', async () => {
      expect(await repo.listSince(meetingB, 0)).toEqual([]);
    });

    // The scoping check. Because `seq` is global, a missing meeting predicate would splice another
    // meeting's live captions into this one's feed.
    it('never returns another meeting’s segments', async () => {
      await repo.append(meetingA, segment({ text: 'mine' }));
      await repo.append(meetingB, segment({ text: 'theirs' }));

      const mine = await repo.listSince(meetingA, 0);

      expect(mine.map((s) => s.text)).toEqual(['mine']);
    });

    // Interleaved streams: A's own segments must stay contiguous from A's point of view even
    // though B's writes moved the global counter in between.
    it('skips over sequence numbers consumed by another meeting', async () => {
      const a1 = await repo.append(meetingA, segment({ text: 'a1' }));
      await repo.append(meetingB, segment({ text: 'b1' }));
      await repo.append(meetingA, segment({ text: 'a2' }));

      expect((await repo.listSince(meetingA, a1.seq)).map((s) => s.text)).toEqual(['a2']);
    });

    it('round-trips every field of a segment intact', async () => {
      await repo.append(meetingA, {
        startMs: 12_345, endMs: 67_890, speaker: 'Alper Eken', text: 'Let’s ship it.',
      });

      const [only] = await repo.listSince(meetingA, 0);

      expect(only.startMs).toBe(12_345);
      expect(only.endMs).toBe(67_890);
      expect(only.speaker).toBe('Alper Eken');
      expect(only.text).toBe('Let’s ship it.');
    });
  });

  describe('deleteByMeeting', () => {
    // Called the moment the authoritative transcript lands (process-webhook-event.service.ts).
    it('removes only the named meeting’s segments', async () => {
      await repo.append(meetingA, segment({ text: 'mine' }));
      await repo.append(meetingB, segment({ text: 'theirs' }));

      await repo.deleteByMeeting(meetingA);

      expect(await repo.listSince(meetingA, 0)).toEqual([]);
      expect((await repo.listSince(meetingB, 0)).map((s) => s.text)).toEqual(['theirs']);
    });

    it('is a no-op for a meeting with nothing streamed', async () => {
      await expect(repo.deleteByMeeting(meetingB)).resolves.toBeUndefined();
    });
  });

  // meeting_id is ON DELETE CASCADE here, unlike transcripts/usage which restrict. Live segments
  // are disposable by design, so deleting the meeting must not be blocked by them.
  it('lets a meeting be deleted, taking its segments with it', async () => {
    await repo.append(meetingA, segment({ text: 'gone soon' }));

    await db.delete(meetings).where(eq(meetings.id, meetingA));

    expect(await db.select().from(liveTranscriptSegments)).toHaveLength(0);
  });
});
