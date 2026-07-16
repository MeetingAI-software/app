import { db } from '../client';
import { documents } from '../schema';
import { eq } from 'drizzle-orm';
import type { DocumentRepository } from '../../../ports/repositories.port';
import type { DocumentContent } from '../../../domain/document';

export class DrizzleDocumentRepository implements DocumentRepository {
  async upsertForMeeting(
    meetingId: string,
    content: DocumentContent,
    meta: { model: string; inputTokens: number; outputTokens: number }
  ): Promise<{ id: string }> {
    const [row] = await db
      .insert(documents)
      .values({
        meetingId,
        content,
        model: meta.model,
        inputTokens: meta.inputTokens,
        outputTokens: meta.outputTokens,
      })
      .onConflictDoUpdate({
        target: documents.meetingId,
        set: {
          content,
          model: meta.model,
          inputTokens: meta.inputTokens,
          outputTokens: meta.outputTokens,
          createdAt: new Date(), // update timestamp on replacement
        },
      })
      .returning({ id: documents.id });

    return row;
  }

  async getByMeetingId(meetingId: string): Promise<{ content: DocumentContent; createdAt: Date } | null> {
    const [row] = await db
      .select()
      .from(documents)
      .where(eq(documents.meetingId, meetingId));

    if (!row) return null;

    return {
      content: row.content as DocumentContent,
      createdAt: row.createdAt,
    };
  }
}
