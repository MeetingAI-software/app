import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, migrateOnce, truncateAll } from '../pglite-harness';
import { chatMessages, meetings, users } from '../schema';
import { DrizzleChatMessageRepository } from './chat-message.repository';
import { CapExceededError } from '../../../domain/errors';
import { ChatService } from '../../../application/chat.service';
import { PLAN_ENTITLEMENTS } from '../../../domain/billing';
import { GeminiChatAdapter, type GeminiClient } from '../../gemini/gemini-chat.adapter';

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

  describe('paid question admission', () => {
    it('never starts a second paid model call while the first answer is pending', async () => {
      let modelStarted!: () => void;
      let returnAnswer!: (value: { answer: string; inputTokens: number; outputTokens: number }) => void;
      const started = new Promise<void>(resolve => { modelStarted = resolve; });
      const answer = new Promise<{ answer: string; inputTokens: number; outputTokens: number }>(
        resolve => { returnAnswer = resolve; });
      const model = { answerQuestion: vi.fn(() => { modelStarted(); return answer; }) };
      const service = new ChatService(
        { getByMeetingId: vi.fn().mockResolvedValue([
          { startMs: 0, endMs: 1000, speaker: 'A', text: 'Test transcript' },
        ]), save: vi.fn(), deleteByMeeting: vi.fn() },
        repo,
        model,
        { getAccess: vi.fn().mockResolvedValue({
          plan: 'free', status: 'none', hasPaidAccess: false,
          entitlements: { ...PLAN_ENTITLEMENTS.free, chatQuestionsPerMeeting: 2 },
          subscription: null,
        }) },
      );

      const first = service.ask('owner', meetingA, 'first?');
      await started;
      await expect(service.ask('owner', meetingA, 'second?')).rejects.toThrow(CapExceededError);
      expect(model.answerQuestion).toHaveBeenCalledTimes(1);
      returnAnswer({ answer: 'first answer', inputTokens: 3, outputTokens: 2 });
      await expect(first).resolves.toEqual({ answer: 'first answer', remaining: 1 });
      expect(await repo.listByMeeting(meetingA)).toHaveLength(2);
    });

    it('admits only one concurrent claim for the last question across repository instances', async () => {
      const results = await Promise.allSettled([
        repo.claimQuestion(meetingA, 1, 'first?'),
        new DrizzleChatMessageRepository().claimQuestion(meetingA, 1, 'second?'),
      ]);

      expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find(result => result.status === 'rejected');
      expect(rejected).toMatchObject({ reason: expect.any(CapExceededError) });
      expect(await repo.countUserMessages(meetingA)).toBe(1);
      expect(await repo.listByMeeting(meetingA)).toEqual([]);
    });

    it('serializes questions even when two entitlements remain', async () => {
      const first = await repo.claimQuestion(meetingA, 2, 'first?');
      await expect(new DrizzleChatMessageRepository().claimQuestion(meetingA, 2, 'second?'))
        .rejects.toThrow('already being answered');
      await repo.completeQuestion(first.id, 'first answer', { input: 1, output: 1 });
      const second = await repo.claimQuestion(meetingA, 2, 'second?');
      expect(second.remaining).toBe(0);
    });

    it('hides a pending question, then publishes both messages on completion', async () => {
      const claim = await repo.claimQuestion(meetingA, 2, 'private question?');
      expect(claim.remaining).toBe(1);
      expect(await repo.countUserMessages(meetingA)).toBe(1);
      expect(await repo.listByMeeting(meetingA)).toEqual([]);

      await repo.completeQuestion(claim.id, 'answer', { input: 12, output: 3 });
      expect(await repo.listByMeeting(meetingA)).toEqual([
        { role: 'user', content: 'private question?' },
        { role: 'assistant', content: 'answer' },
      ]);
      expect(await repo.countUserMessages(meetingA)).toBe(1);
      await expect(repo.completeQuestion(claim.id, 'duplicate', { input: 1, output: 1 }))
        .rejects.toThrow('unavailable');
      expect(await repo.listByMeeting(meetingA)).toHaveLength(2);
    });

    it('releases only an unfinished claim after a failed model call', async () => {
      const claim = await repo.claimQuestion(meetingA, 1, 'failed question?');
      await repo.releaseQuestion(claim.id);
      expect(await repo.countUserMessages(meetingA)).toBe(0);
      const retry = await repo.claimQuestion(meetingA, 1, 'retry?');
      await repo.completeQuestion(retry.id, 'answer', { input: 1, output: 1 });
      await repo.releaseQuestion(retry.id);
      expect(await repo.countUserMessages(meetingA)).toBe(1);
    });

    it('keeps a crashed pending claim against the cap until reconciled', async () => {
      await repo.claimQuestion(meetingA, 1, 'unknown outcome?');
      await expect(new DrizzleChatMessageRepository().claimQuestion(meetingA, 1, 'another?'))
        .rejects.toThrow(CapExceededError);
      expect(await repo.listByMeeting(meetingA)).toEqual([]);
    });

    it('counts a settled unknown outcome once and never refunds it on repeated settlement', async () => {
      const claim = await repo.claimQuestion(meetingA, 1, 'unknown outcome?');
      await repo.markQuestionOutcomeUnknown(claim.id);
      await repo.markQuestionOutcomeUnknown(claim.id);

      const [stored] = await db.select({ role: chatMessages.role }).from(chatMessages)
        .where(eq(chatMessages.id, claim.id));
      expect(stored.role).toBe('unknown_user');
      expect(await repo.countUserMessages(meetingA)).toBe(1);
      expect(await repo.listByMeeting(meetingA)).toEqual([]);
      await expect(repo.completeQuestion(claim.id, 'late duplicate', { input: 1, output: 1 }))
        .rejects.toThrow('unavailable');
      await expect(new DrizzleChatMessageRepository().claimQuestion(meetingA, 1, 'free retry?'))
        .rejects.toThrow(CapExceededError);
      await repo.releaseQuestion(claim.id);
      expect(await repo.countUserMessages(meetingA)).toBe(1);
    });

    it('counts an empty provider response while admitting a later question within the cap', async () => {
      const generateContent = vi.fn()
        .mockResolvedValueOnce({
          text: '   ', usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 1 },
        })
        .mockResolvedValueOnce({
          text: 'A grounded answer', usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 3 },
        });
      const client: GeminiClient = { models: { generateContent } };
      const transcript = { getByMeetingId: vi.fn().mockResolvedValue([
        { startMs: 0, endMs: 1000, speaker: 'A', text: 'Test transcript' },
      ]), save: vi.fn(), deleteByMeeting: vi.fn() };
      const billing = { getAccess: vi.fn().mockResolvedValue({
        plan: 'free', status: 'none', hasPaidAccess: false,
        entitlements: { ...PLAN_ENTITLEMENTS.free, chatQuestionsPerMeeting: 2 },
        subscription: null,
      }) };
      const adapter = new GeminiChatAdapter(client);
      const firstReplica = new ChatService(transcript, repo, adapter, billing);
      const secondReplica = new ChatService(transcript, new DrizzleChatMessageRepository(), adapter, billing);

      await expect(firstReplica.ask('owner', meetingA, 'first?')).rejects.toThrow();
      expect(generateContent).toHaveBeenCalledTimes(1);
      expect(await repo.countUserMessages(meetingA)).toBe(1);
      expect(await repo.listByMeeting(meetingA)).toEqual([]);
      expect(await firstReplica.getHistory('owner', meetingA)).toEqual({ messages: [], remaining: 1 });
      await expect(secondReplica.ask('owner', meetingA, 'second?'))
        .resolves.toEqual({ answer: 'A grounded answer', remaining: 0 });
      expect(generateContent).toHaveBeenCalledTimes(2);
      expect(await repo.countUserMessages(meetingA)).toBe(2);
      expect(await repo.listByMeeting(meetingA)).toEqual([
        { role: 'user', content: 'second?' },
        { role: 'assistant', content: 'A grounded answer' },
      ]);
      await expect(firstReplica.ask('owner', meetingA, 'third?')).rejects.toThrow(CapExceededError);
      expect(generateContent).toHaveBeenCalledTimes(2);
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
