import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, migrateOnce, truncateAll } from '../pglite-harness';
import { meetings, transcripts, users } from '../schema';
import { DrizzleMeetingRepository } from './meeting.repository';

// Real Postgres (PGlite) stands in for the live-DATABASE_URL singleton. See pglite-harness.ts for
// why the factory closes over `db` rather than importing inside itself.
vi.mock('../client', () => ({ db }));

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

let tokenSeq = 0;

describe('DrizzleMeetingRepository', () => {
  let repo: DrizzleMeetingRepository;
  let alice: string;
  let bob: string;

  /**
   * Inserts directly rather than through `create()`, because the interesting cases need control over
   * `status`, `createdAt` and `updatedAt` — none of which `create()` accepts. `share_token` is NOT
   * NULL and unique, so it is generated per row.
   */
  async function insertMeeting(overrides: Record<string, unknown> = {}) {
    const [row] = await db
      .insert(meetings)
      .values({
        ownerUserId: alice,
        platform: 'zoom',
        status: 'pending',
        source: 'bot',
        shareToken: `tok-${++tokenSeq}`,
        ...overrides,
      } as never)
      .returning();
    return row;
  }

  beforeAll(async () => {
    await migrateOnce();
  });

  beforeEach(async () => {
    await truncateAll();
    repo = new DrizzleMeetingRepository();
    const inserted = await db
      .insert(users)
      .values([
        { email: 'alice@example.com', passwordHash: 'hash-a' },
        { email: 'bob@example.com', passwordHash: 'hash-b' },
      ])
      .returning();
    alice = inserted[0].id;
    bob = inserted[1].id;
  });

  describe('create', () => {
    it('applies the documented defaults and generates a share token', async () => {
      const meeting = await repo.create({ ownerUserId: alice, source: 'bot' });

      expect(meeting.ownerUserId).toBe(alice);
      expect(meeting.status).toBe('pending');
      expect(meeting.platform).toBe('zoom');      // default when not supplied
      expect(meeting.meetingUrl).toBeNull();      // uploads have no URL
      expect(meeting.shareToken).toBeTruthy();
      expect(meeting.shareEnabled).toBe(false);
      expect(meeting.shareExpiresAt).toBeNull();
      expect(meeting.createdAt).toBeInstanceOf(Date);
    });

    it('gives every meeting a distinct share token', async () => {
      const a = await repo.create({ ownerUserId: alice, source: 'bot' });
      const b = await repo.create({ ownerUserId: alice, source: 'bot' });
      expect(a.shareToken).not.toBe(b.shareToken);
    });

    it('stores the supplied platform, url and participant names', async () => {
      const confirmedAt = new Date('2026-08-24T12:00:00Z');
      const meeting = await repo.create({
        ownerUserId: alice,
        source: 'upload',
        meetingUrl: 'https://meet.google.com/abc',
        platform: 'google_meet',
        participantNames: ['Ada', 'Grace'],
        recordingNoticeConfirmedAt: confirmedAt,
        recordingNoticeVersion: '2026-08-24',
      });

      expect(meeting.source).toBe('upload');
      expect(meeting.platform).toBe('google_meet');
      expect(meeting.meetingUrl).toBe('https://meet.google.com/abc');
      // jsonb round-trip: must come back as an array, not a string.
      expect(meeting.participantNames).toEqual(['Ada', 'Grace']);
      expect(meeting.recordingNoticeConfirmedAt).toEqual(confirmedAt);
      expect(meeting.recordingNoticeVersion).toBe('2026-08-24');
    });

    // Migration 0009 made owner_user_id NOT NULL precisely so an ownerless (and therefore invisible)
    // meeting cannot exist. The database is the guard, not the application.
    it('refuses a meeting with no owner', async () => {
      await expect(insertMeeting({ ownerUserId: null })).rejects.toThrow();
    });

    it('refuses an owner that is not a real user', async () => {
      await expect(
        insertMeeting({ ownerUserId: '00000000-0000-0000-0000-000000000000' }),
      ).rejects.toMatchObject({
        cause: expect.objectContaining({ message: expect.stringMatching(/foreign key/i) }),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // The ownership boundary. These are the tests that would catch one user being
  // able to read another user's meeting — nothing else in the suite can.
  // ---------------------------------------------------------------------------
  describe('findByIdForUser', () => {
    it("returns the caller's own meeting", async () => {
      const mine = await insertMeeting({ ownerUserId: alice });
      const found = await repo.findByIdForUser(mine.id, alice);
      expect(found?.id).toBe(mine.id);
    });

    it("returns null for another user's meeting, even with a valid id", async () => {
      const theirs = await insertMeeting({ ownerUserId: bob });
      expect(await repo.findByIdForUser(theirs.id, alice)).toBeNull();
    });

    it('returns null for an id that does not exist', async () => {
      expect(
        await repo.findByIdForUser('00000000-0000-0000-0000-000000000000', alice),
      ).toBeNull();
    });
  });

  // findById is deliberately NOT owner-scoped: the webhook worker and sweep look meetings up without
  // a user in context. Pinned so nobody "hardens" it into findByIdForUser and breaks the pipeline.
  it('findById finds a meeting regardless of who owns it', async () => {
    const theirs = await insertMeeting({ ownerUserId: bob });
    expect((await repo.findById(theirs.id))?.id).toBe(theirs.id);
  });

  describe('listForUser', () => {
    it('returns only the caller’s meetings', async () => {
      await insertMeeting({ ownerUserId: alice });
      await insertMeeting({ ownerUserId: alice });
      await insertMeeting({ ownerUserId: bob });

      const mine = await repo.listForUser(alice);

      expect(mine).toHaveLength(2);
      expect(mine.every((m) => m.ownerUserId === alice)).toBe(true);
    });

    it('returns newest first', async () => {
      const now = Date.now();
      await insertMeeting({ shareToken: 'ord-old', createdAt: new Date(now - 2 * HOUR) });
      await insertMeeting({ shareToken: 'ord-new', createdAt: new Date(now) });
      await insertMeeting({ shareToken: 'ord-mid', createdAt: new Date(now - 1 * HOUR) });

      const ordered = await repo.listForUser(alice);

      expect(ordered.map((m) => m.shareToken)).toEqual(['ord-new', 'ord-mid', 'ord-old']);
    });

    it('returns an empty array for a user with no meetings', async () => {
      expect(await repo.listForUser(bob)).toEqual([]);
    });
  });

  // Used by the reconciler, which sweeps every meeting regardless of owner. Deliberately unscoped.
  it('list returns meetings across all owners, newest first', async () => {
    const now = Date.now();
    await insertMeeting({ ownerUserId: alice, shareToken: 'all-old', createdAt: new Date(now - HOUR) });
    await insertMeeting({ ownerUserId: bob, shareToken: 'all-new', createdAt: new Date(now) });

    const all = await repo.list();

    expect(all.map((m) => m.shareToken)).toEqual(['all-new', 'all-old']);
  });

  describe('countActiveForUser', () => {
    // 'pending', 'transcribed' and 'failed' are NOT active. Getting this set wrong would let a user
    // exceed MAX_CONCURRENT_BOTS, or block them from starting a meeting they are entitled to.
    it('counts only bot_joining, recording and processing', async () => {
      for (const status of ['bot_joining', 'recording', 'processing', 'pending', 'transcribed', 'failed']) {
        await insertMeeting({ ownerUserId: alice, status });
      }
      expect(await repo.countActiveForUser(alice)).toBe(3);
    });

    it("does not count another user's active meetings", async () => {
      await insertMeeting({ ownerUserId: bob, status: 'recording' });
      await insertMeeting({ ownerUserId: bob, status: 'processing' });
      expect(await repo.countActiveForUser(alice)).toBe(0);
    });

    it('counts across all users in countActive', async () => {
      await insertMeeting({ ownerUserId: alice, status: 'recording' });
      await insertMeeting({ ownerUserId: bob, status: 'processing' });
      await insertMeeting({ ownerUserId: bob, status: 'transcribed' });
      expect(await repo.countActive()).toBe(2);
    });
  });

  describe('lookups by external id', () => {
    it('finds by bot id, and returns null for an unknown one', async () => {
      const m = await insertMeeting({ botId: 'bot-42' });
      expect((await repo.findByBotId('bot-42'))?.id).toBe(m.id);
      expect(await repo.findByBotId('bot-nope')).toBeNull();
    });

    it('finds only an enabled, unexpired share token', async () => {
      const m = await insertMeeting({
        shareToken: 'share-me', shareEnabled: true, shareExpiresAt: new Date(Date.now() + HOUR),
      });
      expect((await repo.findByShareToken('share-me'))?.id).toBe(m.id);
      expect(await repo.findByShareToken('share-other')).toBeNull();
    });

    it('rejects disabled and expired share tokens', async () => {
      await insertMeeting({
        shareToken: 'disabled', shareEnabled: false, shareExpiresAt: new Date(Date.now() + HOUR),
      });
      await insertMeeting({
        shareToken: 'expired', shareEnabled: true, shareExpiresAt: new Date(Date.now() - HOUR),
      });

      expect(await repo.findByShareToken('disabled')).toBeNull();
      expect(await repo.findByShareToken('expired')).toBeNull();
    });

    it('does not accept a meeting id in place of a share token', async () => {
      const m = await insertMeeting();
      expect(await repo.findByShareToken(m.id)).toBeNull();
    });

    it('finds by transcription job id, and returns null for an unknown one', async () => {
      const m = await insertMeeting({ transcriptionJobId: 'job-7' });
      expect((await repo.findByTranscriptionJobId('job-7'))?.id).toBe(m.id);
      expect(await repo.findByTranscriptionJobId('job-none')).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('changes status and advances updatedAt', async () => {
      const m = await insertMeeting({ updatedAt: new Date(Date.now() - HOUR) });

      const updated = await repo.updateStatus(m.id, 'recording');

      expect(updated.status).toBe('recording');
      expect(updated.updatedAt.getTime()).toBeGreaterThan(m.updatedAt.getTime());
    });

    it('applies the optional patch fields', async () => {
      const m = await insertMeeting();

      const updated = await repo.updateStatus(m.id, 'failed', {
        botId: 'bot-9',
        durationSeconds: 120,
        errorMessage: 'provider gave up',
      });

      expect(updated.botId).toBe('bot-9');
      expect(updated.durationSeconds).toBe(120);
      expect(updated.errorMessage).toBe('provider gave up');
    });

    it('leaves fields alone when no patch is given', async () => {
      const m = await insertMeeting({ botId: 'keep-me', durationSeconds: 30 });

      const updated = await repo.updateStatus(m.id, 'transcribed');

      expect(updated.botId).toBe('keep-me');
      expect(updated.durationSeconds).toBe(30);
    });

    // A missing WHERE would pass every single-row test above while rewriting the whole table.
    it('touches only the target row', async () => {
      const target = await insertMeeting({ shareToken: 'target' });
      const other = await insertMeeting({ shareToken: 'other' });

      await repo.updateStatus(target.id, 'recording');

      expect((await repo.findById(other.id))?.status).toBe('pending');
    });
  });

  describe('setSummary and setUploadInfo', () => {
    it('stores the summary on the target row only', async () => {
      const target = await insertMeeting();
      const other = await insertMeeting();

      await repo.setSummary(target.id, 'three bullet points');

      expect((await repo.findById(target.id))?.summary).toBe('three bullet points');
      expect((await repo.findById(other.id))?.summary).toBeNull();
    });

    it('stores upload info on the target row only', async () => {
      const target = await insertMeeting();
      const other = await insertMeeting();

      await repo.setUploadInfo(target.id, { audioStoragePath: 'audio/a.webm', transcriptionJobId: 'job-1' });

      const got = await repo.findById(target.id);
      expect(got?.audioStoragePath).toBe('audio/a.webm');
      expect(got?.transcriptionJobId).toBe('job-1');
      expect((await repo.findById(other.id))?.audioStoragePath).toBeNull();
    });

    // The sweep clears the path with an explicit null after deleting the audio. `undefined` means
    // "leave alone" and null means "clear" — if those collapsed, the sweep would either wipe the job
    // id or never record that the audio is gone.
    it('clears audioStoragePath when passed null, without disturbing the job id', async () => {
      const m = await insertMeeting({ audioStoragePath: 'audio/b.webm', transcriptionJobId: 'job-2' });

      await repo.setUploadInfo(m.id, { audioStoragePath: null });

      const got = await repo.findById(m.id);
      expect(got?.audioStoragePath).toBeNull();
      expect(got?.transcriptionJobId).toBe('job-2');
    });
  });

  // ---------------------------------------------------------------------------
  // The sweep's two selectors. These decide which meetings lose their audio, and
  // deletion is not reversible — an inverted comparison destroys recordings early.
  // ---------------------------------------------------------------------------
  describe('findTranscribedOlderThan', () => {
    it('returns transcribed meetings older than the cutoff and no younger ones', async () => {
      const now = Date.now();
      await insertMeeting({ shareToken: 'old', status: 'transcribed', updatedAt: new Date(now - 2 * HOUR) });
      await insertMeeting({ shareToken: 'young', status: 'transcribed', updatedAt: new Date(now - 5 * MINUTE) });

      const found = await repo.findTranscribedOlderThan(1);

      expect(found.map((m) => m.shareToken)).toEqual(['old']);
    });

    it('ignores meetings that are old but not transcribed', async () => {
      const stale = new Date(Date.now() - 2 * HOUR);
      for (const status of ['pending', 'recording', 'processing', 'failed']) {
        await insertMeeting({ status, updatedAt: stale });
      }
      expect(await repo.findTranscribedOlderThan(1)).toEqual([]);
    });
  });

  describe('findStuckActiveOlderThan', () => {
    it('returns only active meetings older than the cutoff', async () => {
      const now = Date.now();
      await insertMeeting({ shareToken: 'stuck', status: 'recording', updatedAt: new Date(now - 30 * MINUTE) });
      await insertMeeting({ shareToken: 'fresh', status: 'recording', updatedAt: new Date(now - 1 * MINUTE) });
      await insertMeeting({ shareToken: 'done', status: 'transcribed', updatedAt: new Date(now - 30 * MINUTE) });

      const found = await repo.findStuckActiveOlderThan(15);

      expect(found.map((m) => m.shareToken)).toEqual(['stuck']);
    });

    it('covers all three active statuses', async () => {
      const stale = new Date(Date.now() - 30 * MINUTE);
      for (const status of ['bot_joining', 'recording', 'processing']) {
        await insertMeeting({ status, updatedAt: stale });
      }
      expect(await repo.findStuckActiveOlderThan(15)).toHaveLength(3);
    });
  });

  describe('share lifecycle', () => {
    it('enables sharing for the owner, rotates the token, and sets an expiry', async () => {
      const original = await insertMeeting({ ownerUserId: alice });
      const expiresAt = new Date(Date.now() + HOUR);

      const shared = await repo.enableShare(original.id, alice, expiresAt);

      expect(shared?.shareEnabled).toBe(true);
      expect(shared?.shareToken).not.toBe(original.shareToken);
      expect(shared?.shareExpiresAt).toEqual(expiresAt);
      expect(await repo.findByShareToken(original.shareToken)).toBeNull();
      expect((await repo.findByShareToken(shared!.shareToken))?.id).toBe(original.id);
    });

    it('does not enable or revoke another user’s meeting', async () => {
      const target = await insertMeeting({ ownerUserId: alice });
      expect(await repo.enableShare(target.id, bob, new Date(Date.now() + HOUR))).toBeNull();
      expect(await repo.revokeShare(target.id, bob)).toBe(false);
    });

    it('revokes an active link immediately', async () => {
      const target = await insertMeeting({ ownerUserId: alice });
      const shared = await repo.enableShare(target.id, alice, new Date(Date.now() + HOUR));

      expect(await repo.revokeShare(target.id, alice)).toBe(true);
      expect(await repo.findByShareToken(shared!.shareToken)).toBeNull();
    });
  });

  describe('findFailedWithAudioOlderThan', () => {
    it('returns only old failed meetings that still reference audio', async () => {
      const now = Date.now();
      await insertMeeting({ shareToken: 'failed-old', status: 'failed', audioStoragePath: 'a/old', updatedAt: new Date(now - 2 * HOUR) });
      await insertMeeting({ shareToken: 'failed-new', status: 'failed', audioStoragePath: 'a/new', updatedAt: new Date(now - 5 * MINUTE) });
      await insertMeeting({ shareToken: 'failed-empty', status: 'failed', audioStoragePath: null, updatedAt: new Date(now - 2 * HOUR) });
      await insertMeeting({ shareToken: 'done-old', status: 'transcribed', audioStoragePath: 'a/done', updatedAt: new Date(now - 2 * HOUR) });

      const found = await repo.findFailedWithAudioOlderThan(1);

      expect(found.map((m) => m.shareToken)).toEqual(['failed-old']);
    });
  });

  describe('deleteById', () => {
    it('deletes the target row only', async () => {
      const target = await insertMeeting();
      const other = await insertMeeting();

      await repo.deleteById(target.id);

      expect(await repo.findById(target.id)).toBeNull();
      expect(await repo.findById(other.id)).not.toBeNull();
    });

    // Of the five tables referencing meetings, only live_transcript_segments cascades. transcripts,
    // documents, chat_messages and usage_ledger all REJECT the delete — which is exactly why
    // AuthService.deleteAccount deletes chat → documents → transcripts → usage → meeting in that
    // order. Pinning the refusal here means reordering that erasure fails a test instead of failing
    // in production, where it would leave an account undeletable.
    it('is refused while a transcript still references the meeting', async () => {
      const m = await insertMeeting();
      await db
        .insert(transcripts)
        .values({ meetingId: m.id, segments: [], rawPayload: {} } as never);

      await expect(repo.deleteById(m.id)).rejects.toMatchObject({
        cause: expect.objectContaining({ message: expect.stringMatching(/foreign key/i) }),
      });

      // Children first — the order deleteAccount uses — and the delete goes through.
      await db.delete(transcripts).where(eq(transcripts.meetingId, m.id));
      await repo.deleteById(m.id);
      expect(await repo.findById(m.id)).toBeNull();
    });
  });
});
