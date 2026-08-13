import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, migrateOnce, truncateAll } from '../pglite-harness';
import { chatMessages, meetings, users } from '../schema';
import { DrizzleChatMessageRepository } from './chat-message.repository';

// Real Postgres (PGlite) stands in for the live-DATABASE_URL singleton. See pglite-harness.ts for
// why the factory closes over `db` rather than importing inside itself.
vi.mock('../client', () => ({ db }));

let tokenSeq = 0;

describe('DrizzleChatMessageRepository', () => {
  let repo: DrizzleChatMessageRepository;
  let meetingA: string;
  let meetingB: string;

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

  /** Ordering is by createdAt, so the ordering cases set it explicitly rather than racing now(). */
  async function insertAt(meetingId: string, role: 'user' | 'assistant', content: string, createdAt: Date) {
    await db.insert(chatMessages).values({ meetingId, role, content, createdAt } as never);
  }

  beforeAll(async () => {
    await migrateOnce();
  });

  beforeEach(async () => {
    await truncateAll();
    repo = new DrizzleChatMessageRepository();
    const [owner] = await db
      .insert(users)
      .values({ email: 'alice@example.com', passwordHash: 'hash-a' })
      .returning({ id: users.id });
    meetingA = await insertMeeting(owner.id);
    meetingB = await insertMeeting(owner.id);
  });

  describe('add', () => {
    it('stores the role and the text', async () => {
      await repo.add(meetingA, 'user', 'What did we decide about the budget?');

      const [row] = await db.select().from(chatMessages).where(eq(chatMessages.meetingId, meetingA));
      expect(row.role).toBe('user');
      expect(row.content).toBe('What did we decide about the budget?');
    });

    it('records the token counts when they are supplied', async () => {
      await repo.add(meetingA, 'assistant', 'We signed off the budget.', { input: 900, output: 40 });

      const [row] = await db.select().from(chatMessages).where(eq(chatMessages.meetingId, meetingA));
      expect(row.inputTokens).toBe(900);
      expect(row.outputTokens).toBe(40);
    });

    // A user turn costs nothing to store, so the caller omits tokens — that must land as 0 rather
    // than null, since the columns are NOT NULL and the cost report sums them.
    it('defaults both token counts to zero when they are omitted', async () => {
      await repo.add(meetingA, 'user', 'Anything on hiring?');

      const [row] = await db.select().from(chatMessages).where(eq(chatMessages.meetingId, meetingA));
      expect(row.inputTokens).toBe(0);
      expect(row.outputTokens).toBe(0);
    });
  });

  describe('listByMeeting', () => {
    // The history is replayed straight into the model prompt, so order is meaning: swap it and the
    // answers start referring to questions that have not been asked yet.
    it('returns the conversation oldest first', async () => {
      const t0 = new Date(Date.now() - 3 * 60 * 1000);
      await insertAt(meetingA, 'assistant', 'third', new Date(t0.getTime() + 2000));
      await insertAt(meetingA, 'user', 'first', t0);
      await insertAt(meetingA, 'assistant', 'second', new Date(t0.getTime() + 1000));

      const history = await repo.listByMeeting(meetingA);

      expect(history.map((m) => m.content)).toEqual(['first', 'second', 'third']);
    });

    it('returns both sides of the conversation, and only role and content', async () => {
      await repo.add(meetingA, 'user', 'question');
      await repo.add(meetingA, 'assistant', 'answer', { input: 10, output: 20 });

      const history = await repo.listByMeeting(meetingA);

      expect(history).toEqual([
        { role: 'user', content: 'question' },
        { role: 'assistant', content: 'answer' },
      ]);
    });

    it('never mixes in another meeting’s conversation', async () => {
      await repo.add(meetingA, 'user', 'mine');
      await repo.add(meetingB, 'user', 'theirs');

      expect((await repo.listByMeeting(meetingA)).map((m) => m.content)).toEqual(['mine']);
    });

    it('returns an empty list for a meeting nobody has asked about', async () => {
      expect(await repo.listByMeeting(meetingB)).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // countUserMessages backs the per-meeting question cap (chat.service.ts). It
  // must count questions only: counting the assistant's replies too would halve
  // every user's allowance.
  // ---------------------------------------------------------------------------
  describe('countUserMessages', () => {
    it('counts the questions and ignores the answers', async () => {
      await repo.add(meetingA, 'user', 'q1');
      await repo.add(meetingA, 'assistant', 'a1');
      await repo.add(meetingA, 'user', 'q2');
      await repo.add(meetingA, 'assistant', 'a2');

      expect(await repo.countUserMessages(meetingA)).toBe(2);
    });

    it('counts only this meeting’s questions', async () => {
      await repo.add(meetingA, 'user', 'q1');
      await repo.add(meetingB, 'user', 'q2');
      await repo.add(meetingB, 'user', 'q3');

      expect(await repo.countUserMessages(meetingA)).toBe(1);
      expect(await repo.countUserMessages(meetingB)).toBe(2);
    });

    it('returns 0 for a meeting with no questions yet', async () => {
      expect(await repo.countUserMessages(meetingB)).toBe(0);
    });

    it('returns 0, not null, when only the assistant has spoken', async () => {
      await repo.add(meetingA, 'assistant', 'unprompted');

      expect(await repo.countUserMessages(meetingA)).toBe(0);
    });
  });

  describe('deleteByMeeting', () => {
    it('removes only the named meeting’s messages', async () => {
      await repo.add(meetingA, 'user', 'mine');
      await repo.add(meetingB, 'user', 'theirs');

      await repo.deleteByMeeting(meetingA);

      expect(await repo.listByMeeting(meetingA)).toEqual([]);
      expect(await repo.listByMeeting(meetingB)).toHaveLength(1);
    });

    // Erasure has to clear the cap counter too, not just the visible history.
    it('resets the question count for that meeting', async () => {
      await repo.add(meetingA, 'user', 'q1');
      await repo.add(meetingA, 'user', 'q2');

      await repo.deleteByMeeting(meetingA);

      expect(await repo.countUserMessages(meetingA)).toBe(0);
    });

    it('is a no-op for a meeting with no messages', async () => {
      await expect(repo.deleteByMeeting(meetingB)).resolves.toBeUndefined();
    });
  });

  // meeting_id has no ON DELETE clause, so it restricts — the same children-before-parent order
  // auth.service.ts follows during account erasure.
  it('blocks deleting a meeting that still has messages', async () => {
    await repo.add(meetingA, 'user', 'q1');

    await expect(db.delete(meetings).where(eq(meetings.id, meetingA))).rejects.toMatchObject({
      cause: expect.objectContaining({ message: expect.stringMatching(/foreign key|violates/i) }),
    });

    await repo.deleteByMeeting(meetingA);
    await expect(db.delete(meetings).where(eq(meetings.id, meetingA))).resolves.toBeDefined();
  });
});
