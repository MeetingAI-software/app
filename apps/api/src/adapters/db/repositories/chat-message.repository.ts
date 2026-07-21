import { db } from '../client';
import { chatMessages } from '../schema';
import { eq, asc, sql } from 'drizzle-orm';
import type { ChatMessageRepository } from '../../../ports/repositories.port';
import type { ChatMessage } from '../../../ports/chat.port';

export class DrizzleChatMessageRepository implements ChatMessageRepository {
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
      .where(eq(chatMessages.meetingId, meetingId))
      .orderBy(asc(chatMessages.createdAt));
    return rows as ChatMessage[];
  }

  async countUserMessages(meetingId: string): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(chatMessages)
      .where(sql`${chatMessages.meetingId} = ${meetingId} AND ${chatMessages.role} = 'user'`);
    return row?.count ?? 0;
  }

  async deleteByMeeting(meetingId: string): Promise<void> {
    await db.delete(chatMessages).where(eq(chatMessages.meetingId, meetingId));
  }
}
