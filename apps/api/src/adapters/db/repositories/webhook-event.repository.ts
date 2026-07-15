import { db } from '../client';
import { webhookEvents } from '../schema';
import { eq, sql } from 'drizzle-orm';
import type { WebhookEventRepository } from '../../../ports/repositories.port';

export class DrizzleWebhookEventRepository implements WebhookEventRepository {
  async insertIfNew(e: {
    provider: string;
    externalEventId: string;
    eventType: string;
    payload: unknown;
  }): Promise<boolean> {
    const result = await db
      .insert(webhookEvents)
      .values({
        provider: e.provider,
        externalEventId: e.externalEventId,
        eventType: e.eventType,
        payload: e.payload,
      })
      .onConflictDoNothing({ target: webhookEvents.externalEventId })
      .returning();
    return result.length > 0;
  }

  async claimNextPending(): Promise<{ id: string; eventType: string; payload: unknown } | null> {
    // Concurrency safe transactional outbox claim using SKIP LOCKED in UPDATE
    const rows = await db.execute(sql`
      UPDATE webhook_events
      SET next_attempt_at = now() + interval '5 minutes',
          attempts = attempts + 1
      WHERE id = (
        SELECT id
        FROM webhook_events
        WHERE processed_at IS NULL
          AND (next_attempt_at IS NULL OR next_attempt_at <= now())
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, event_type as "eventType", payload
    `);

    if (rows.length === 0) {
      return null;
    }

    return rows[0] as unknown as { id: string; eventType: string; payload: unknown };
  }

  async markProcessed(id: string): Promise<void> {
    await db
      .update(webhookEvents)
      .set({
        processedAt: new Date(),
      })
      .where(eq(webhookEvents.id, id));
  }

  async markFailed(id: string, attempts: number, nextAttemptAt: Date): Promise<void> {
    await db
      .update(webhookEvents)
      .set({
        attempts,
        nextAttemptAt,
      })
      .where(eq(webhookEvents.id, id));
  }
}
