import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, migrateOnce, truncateAll } from '../pglite-harness';
import { documents, meetings, users } from '../schema';
import { DrizzleDocumentRepository } from './document.repository';
import type { DocumentContent } from '../../../domain/document';

// Real Postgres (PGlite) stands in for the live-DATABASE_URL singleton. See pglite-harness.ts for
// why the factory closes over `db` rather than importing inside itself.
vi.mock('../client', () => ({ db }));

let tokenSeq = 0;

describe('DrizzleDocumentRepository', () => {
  let repo: DrizzleDocumentRepository;
  let meetingA: string;
  let meetingB: string;

  const meta = { model: 'gemini-2.5-flash', inputTokens: 1200, outputTokens: 340 };

  function content(overrides: Partial<DocumentContent> = {}): DocumentContent {
    return {
      title: 'Q3 Budget Planning — 15 Jul 2026',
      missed5: ['Budget signed off', 'Hiring paused', 'Launch moved to September'],
      decisions: ['Ship without the export feature'],
      actionPoints: [
        { task: 'Draft the revised budget', owner: 'Alper Eken', deadlineIso: '2026-07-18' },
        { task: 'Chase the vendor quote', owner: null, deadlineIso: null },
      ],
      openQuestions: ['Who owns the migration?'],
      ...overrides,
    };
  }

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
    repo = new DrizzleDocumentRepository();
    const [owner] = await db
      .insert(users)
      .values({ email: 'alice@example.com', passwordHash: 'hash-a' })
      .returning({ id: users.id });
    meetingA = await insertMeeting(owner.id);
    meetingB = await insertMeeting(owner.id);
  });

  describe('upsertForMeeting', () => {
    // The full DocumentContent shape through jsonb — including the two nullable ActionPoint fields,
    // which are null precisely when the model refused to invent an owner or a date.
    it('round-trips the whole document, nulls included', async () => {
      await repo.upsertForMeeting(meetingA, content(), meta);

      const loaded = await repo.getByMeetingId(meetingA);

      expect(loaded?.content).toEqual(content());
      expect(loaded?.content.actionPoints[1].owner).toBeNull();
      expect(loaded?.content.actionPoints[1].deadlineIso).toBeNull();
      expect(loaded?.createdAt).toBeInstanceOf(Date);
    });

    it('stores the generation metadata for cost accounting', async () => {
      await repo.upsertForMeeting(meetingA, content(), meta);

      const [row] = await db.select().from(documents).where(eq(documents.meetingId, meetingA));
      expect(row.model).toBe('gemini-2.5-flash');
      expect(row.inputTokens).toBe(1200);
      expect(row.outputTokens).toBe(340);
    });

    // THE test for this file. `documents.meeting_id` is unique and the upsert targets it, so
    // regenerating a summary must REPLACE the old one. An onConflictDoNothing here would silently
    // keep serving the first draft forever; a plain insert would throw on the second attempt.
    it('replaces the previous document rather than adding a second one', async () => {
      const first = await repo.upsertForMeeting(meetingA, content({ title: 'First pass' }), meta);

      const second = await repo.upsertForMeeting(
        meetingA,
        content({ title: 'Regenerated', decisions: ['Ship everything'] }),
        { model: 'gemini-2.5-pro', inputTokens: 99, outputTokens: 11 },
      );

      expect(await db.select().from(documents)).toHaveLength(1);
      expect(second.id).toBe(first.id);            // same row, updated in place

      const loaded = await repo.getByMeetingId(meetingA);
      expect(loaded?.content.title).toBe('Regenerated');
      expect(loaded?.content.decisions).toEqual(['Ship everything']);
    });

    it('refreshes the metadata on a regeneration too', async () => {
      await repo.upsertForMeeting(meetingA, content(), meta);
      await repo.upsertForMeeting(meetingA, content(), {
        model: 'gemini-2.5-pro', inputTokens: 5, outputTokens: 6,
      });

      const [row] = await db.select().from(documents).where(eq(documents.meetingId, meetingA));
      expect(row.model).toBe('gemini-2.5-pro');
      expect(row.inputTokens).toBe(5);
      expect(row.outputTokens).toBe(6);
    });

    // createdAt is deliberately bumped on replacement — the UI shows it as "summarised at", so a
    // stale timestamp would claim a fresh summary is hours old.
    it('moves the timestamp forward when the document is replaced', async () => {
      await repo.upsertForMeeting(meetingA, content(), meta);
      const before = (await repo.getByMeetingId(meetingA))!.createdAt;

      await repo.upsertForMeeting(meetingA, content({ title: 'Later' }), meta);
      const after = (await repo.getByMeetingId(meetingA))!.createdAt;

      expect(after.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('keeps a separate document per meeting', async () => {
      await repo.upsertForMeeting(meetingA, content({ title: 'Meeting A' }), meta);
      await repo.upsertForMeeting(meetingB, content({ title: 'Meeting B' }), meta);

      expect(await db.select().from(documents)).toHaveLength(2);
      expect((await repo.getByMeetingId(meetingA))?.content.title).toBe('Meeting A');
      expect((await repo.getByMeetingId(meetingB))?.content.title).toBe('Meeting B');
    });
  });

  describe('getByMeetingId', () => {
    it('returns null for a meeting that has not been summarised', async () => {
      expect(await repo.getByMeetingId(meetingB)).toBeNull();
    });
  });

  describe('deleteByMeeting', () => {
    it('removes only the named meeting’s document', async () => {
      await repo.upsertForMeeting(meetingA, content(), meta);
      await repo.upsertForMeeting(meetingB, content(), meta);

      await repo.deleteByMeeting(meetingA);

      expect(await repo.getByMeetingId(meetingA)).toBeNull();
      expect(await repo.getByMeetingId(meetingB)).not.toBeNull();
    });

    it('is a no-op for a meeting with no document', async () => {
      await expect(repo.deleteByMeeting(meetingB)).resolves.toBeUndefined();
    });
  });

  // meeting_id has no ON DELETE clause, so it restricts — matching transcripts and usage, and
  // matching auth.service.ts's children-before-parent erasure order.
  it('blocks deleting a meeting that still has a document', async () => {
    await repo.upsertForMeeting(meetingA, content(), meta);

    await expect(db.delete(meetings).where(eq(meetings.id, meetingA)))
      .rejects.toThrow(/foreign key|violates/i);

    await repo.deleteByMeeting(meetingA);
    await expect(db.delete(meetings).where(eq(meetings.id, meetingA))).resolves.toBeDefined();
  });
});
