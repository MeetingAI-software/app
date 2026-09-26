import { db } from '../client';
import { chatMessages, meetings } from '../schema';
import { eq, asc, sql, and, inArray } from 'drizzle-orm';
import type { ChatMessageRepository } from '../../../ports/repositories.port';
import type { ChatMessage } from '../../../ports/chat.port';
import { CapExceededError } from '../../../domain/errors';

export class DrizzleChatMessageRepository implements ChatMessageRepository {
  async claimQuestion(meetingId: string, limit: number, question: string): Promise<{ id: string; remaining: number }> {
    return db.transaction(async tx => {
      // The meeting row serializes all claims across API replicas. Pending claims count even if
      // the caller crashes after admission but before receiving a model response.
      const [meeting] = await tx.select({ id: meetings.id }).from(meetings)
        .where(eq(meetings.id, meetingId)).for('update');
      if (!meeting) throw new Error('Meeting does not exist');

      const [used] = await tx.select({
        count: sql<number>`count(*)::int`,
        pending: sql<number>`count(*) filter (where ${chatMessages.role} = 'pending_user')::int`,
      }).from(chatMessages)
        .where(and(eq(chatMessages.meetingId, meetingId),
          inArray(chatMessages.role, ['user', 'pending_user'])));
      // Concurrent answers could otherwise reach the model with incomplete conversation history
      // and finish out of order, leaving mismatched user/assistant turns.
      if (used.pending > 0) throw new CapExceededError('A question is already being answered for this meeting');
      if (used.count >= limit) throw new CapExceededError('Question limit reached for this meeting');

      const [claim] = await tx.insert(chatMessages).values({
        meetingId, role: 'pending_user', content: question,
      }).returning({ id: chatMessages.id });
      return { id: claim.id, remaining: Math.max(0, limit - used.count - 1) };
    });
  }

  async completeQuestion(id: string, answer: string,
    tokens: { input: number; output: number }): Promise<void> {
    await db.transaction(async tx => {
      const [question] = await tx.update(chatMessages).set({ role: 'user' })
        .where(and(eq(chatMessages.id, id), eq(chatMessages.role, 'pending_user')))
        .returning({ meetingId: chatMessages.meetingId });
      if (!question) throw new Error('Chat question claim is unavailable');
      await tx.insert(chatMessages).values({
        meetingId: question.meetingId,
        role: 'assistant',
        content: answer,
        inputTokens: tokens.input,
        outputTokens: tokens.output,
      });
    });
  }

  async releaseQuestion(id: string): Promise<void> {
    await db.delete(chatMessages).where(and(eq(chatMessages.id, id),
      eq(chatMessages.role, 'pending_user')));
  }

  async add(
    meetingId: string,
    role: 'user' | 'assistant',
    content: string,
    tokens?: { input: number; output: number }
  ): Promise<void> {
    await db.insert(chatMessages).values({
      meetingId,
      role,
      content,
      inputTokens: tokens?.input ?? 0,
      outputTokens: tokens?.output ?? 0,
    });
  }

  async listByMeeting(meetingId: string): Promise<ChatMessage[]> {
    const rows = await db
      .select({ role: chatMessages.role, content: chatMessages.content })
      .from(chatMessages)
      .where(and(eq(chatMessages.meetingId, meetingId),
        inArray(chatMessages.role, ['user', 'assistant'])))
      .orderBy(asc(chatMessages.createdAt));
    return rows as ChatMessage[];
  }

  async countUserMessages(meetingId: string): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(chatMessages)
      .where(and(eq(chatMessages.meetingId, meetingId),
        inArray(chatMessages.role, ['user', 'pending_user'])));
    return row?.count ?? 0;
  }

  async deleteByMeeting(meetingId: string): Promise<void> {
    await db.delete(chatMessages).where(eq(chatMessages.meetingId, meetingId));
  }
}
