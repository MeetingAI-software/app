import { db } from '../client';
import { documentGenerationBudgets, documents, meetings } from '../schema';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { DocumentRepository } from '../../../ports/repositories.port';
import type { DocumentContent } from '../../../domain/document';

export class DrizzleDocumentRepository implements DocumentRepository {
  private static readonly MAX_ATTEMPTS = 3;
  private static readonly REUSE_MS = 10 * 60_000;
  private static readonly CLAIM_MS = 15 * 60_000;

  async claimGeneration(meetingId: string, regenerate: boolean): ReturnType<DocumentRepository['claimGeneration']> {
    return db.transaction(async tx => {
      // Lock the parent even before the budget row exists. This covers two first-time requests.
      const [meeting] = await tx.select({ id: meetings.id }).from(meetings)
        .where(eq(meetings.id, meetingId)).for('update');
      if (!meeting) throw new Error('Meeting does not exist');

      const now = new Date();
      const [document] = await tx.select({ content: documents.content, createdAt: documents.createdAt })
        .from(documents).where(eq(documents.meetingId, meetingId));
      if (document && (!regenerate || now.getTime() - document.createdAt.getTime() < DrizzleDocumentRepository.REUSE_MS)) {
        return { status: 'cached' as const,
          document: { content: document.content as DocumentContent, createdAt: document.createdAt } };
      }

      const [budget] = await tx.select().from(documentGenerationBudgets)
        .where(eq(documentGenerationBudgets.meetingId, meetingId));
      if (budget?.claimId && budget.claimedAt &&
          now.getTime() - budget.claimedAt.getTime() < DrizzleDocumentRepository.CLAIM_MS) {
        return { status: 'pending' as const };
      }
      if ((budget?.attempts ?? 0) >= DrizzleDocumentRepository.MAX_ATTEMPTS) {
        return { status: 'limit' as const };
      }

      const claimId = randomUUID();
      await tx.insert(documentGenerationBudgets)
        .values({ meetingId, attempts: (budget?.attempts ?? 0) + 1, claimId, claimedAt: now })
        .onConflictDoUpdate({ target: documentGenerationBudgets.meetingId,
          set: { attempts: (budget?.attempts ?? 0) + 1, claimId, claimedAt: now } });
      return { status: 'claimed' as const, claimId };
    });
  }

  async completeGeneration(meetingId: string, claimId: string, content: DocumentContent,
    meta: { model: string; inputTokens: number; outputTokens: number }): Promise<void> {
    await db.transaction(async tx => {
      const [budget] = await tx.select({ claimId: documentGenerationBudgets.claimId })
        .from(documentGenerationBudgets)
        .where(eq(documentGenerationBudgets.meetingId, meetingId)).for('update');
      if (budget?.claimId !== claimId) throw new Error('Document generation claim is unavailable');
      await tx.insert(documents).values({ meetingId, content, model: meta.model,
        inputTokens: meta.inputTokens, outputTokens: meta.outputTokens })
        .onConflictDoUpdate({ target: documents.meetingId,
          set: { content, model: meta.model, inputTokens: meta.inputTokens,
            outputTokens: meta.outputTokens, createdAt: new Date() } });
      await tx.update(documentGenerationBudgets).set({ claimId: null, claimedAt: null })
        .where(eq(documentGenerationBudgets.meetingId, meetingId));
    });
  }

  async failGeneration(meetingId: string, claimId: string): Promise<void> {
    await db.update(documentGenerationBudgets).set({ claimId: null, claimedAt: null })
      .where(and(eq(documentGenerationBudgets.meetingId, meetingId),
        eq(documentGenerationBudgets.claimId, claimId)));
  }
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

  async deleteByMeeting(meetingId: string): Promise<void> {
    await db.delete(documents).where(eq(documents.meetingId, meetingId));
  }
}
