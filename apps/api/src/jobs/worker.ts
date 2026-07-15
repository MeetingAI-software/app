import type { WebhookEventRepository, MeetingRepository } from '../ports/repositories.port';
import type { ProcessWebhookEventService } from '../application/process-webhook-event.service';
import { db } from '../adapters/db/client';
import { webhookEvents } from '../adapters/db/schema';
import { eq } from 'drizzle-orm';
import { routeRecallEvent } from '../adapters/recall/recall-event.router';

export class WebhookWorker {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(
    private readonly webhookRepo: WebhookEventRepository,
    private readonly meetingRepo: MeetingRepository,
    private readonly processService: ProcessWebhookEventService
  ) {}

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('👷 Webhook worker started polling...');
    
    this.intervalId = setInterval(() => {
      this.pollAndProcess().catch(err => {
        console.error('Worker loop error:', err);
      });
    }, 2000);
  }

  stop() {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log('👷 Webhook worker stopped.');
  }

  private async pollAndProcess(): Promise<void> {
    if (this.isProcessing) return; // Prevent overlapping runs on the same worker
    this.isProcessing = true;

    try {
      const event = await this.webhookRepo.claimNextPending();
      if (!event) {
        this.isProcessing = false;
        return;
      }

      const action = routeRecallEvent(event.eventType);
      if (action === 'ignore') {
        console.log(`   Ignoring event ${event.id} of type ${event.eventType}`);
        await this.webhookRepo.markProcessed(event.id);
        this.isProcessing = false;
        return;
      }

      console.log(`👷 Processing event ${event.id} mapped to action ${action}`);

      try {
        await this.processService.processEvent(action, event.payload);
        await this.webhookRepo.markProcessed(event.id);
        console.log(`   Event ${event.id} processed successfully.`);
      } catch (err: any) {
        console.error(`❌ Error processing event ${event.id}:`, err);

        // Fetch current attempts
        const [row] = await db
          .select({ attempts: webhookEvents.attempts })
          .from(webhookEvents)
          .where(eq(webhookEvents.id, event.id));
        
        const attempts = row?.attempts || 1;

        if (attempts >= 5) {
          console.error(`❌ Event ${event.id} failed after 5 attempts. Marking processed and failing meeting.`);
          await this.webhookRepo.markProcessed(event.id);

          // Find meeting by meeting_id or bot_id in payload to mark it failed
          const payload = event.payload as any;
          const botId = payload?.bot_id || payload?.data?.bot_id;
          const meetingId = payload?.meeting_id || payload?.data?.meeting_id;
          
          let meeting = null;
          if (meetingId) {
            meeting = await this.meetingRepo.findById(meetingId);
          }
          if (!meeting && botId) {
            meeting = await this.meetingRepo.findByBotId(botId);
          }

          if (meeting) {
            await this.meetingRepo.updateStatus(meeting.id, 'failed', {
              errorMessage: err?.message || 'Processing failed after max retries',
            });
          }
        } else {
          // Exponential backoff: nextAttemptAt = now + 2^attempts * 5s
          const delaySeconds = Math.pow(2, attempts) * 5;
          const nextAttemptAt = new Date(Date.now() + delaySeconds * 1000);
          await this.webhookRepo.markFailed(event.id, attempts, nextAttemptAt);
          console.log(`   Event ${event.id} rescheduled for ${nextAttemptAt.toISOString()} (attempt ${attempts})`);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }
}
