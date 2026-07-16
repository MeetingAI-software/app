import { randomUUID } from 'crypto';
import type { MeetingBotPort } from '../../ports/meeting-bot.port';
import type { WebhookEventRepository } from '../../ports/repositories.port';
import type { TranscriptSegment } from '../../domain/types';

export class FakeBotAdapter implements MeetingBotPort {
  // Simple in-memory store for fake bots
  private bots = new Map<string, { status: 'joining' | 'in_call' | 'done'; segments: TranscriptSegment[] }>();

  constructor(private readonly webhookEventRepo: WebhookEventRepository) {}

  async createBot(input: { meetingUrl: string; meetingId: string }): Promise<{ botId: string }> {
    const botId = `fake-${randomUUID()}`;
    
    // Generate realistic segments
    const segments: TranscriptSegment[] = [
      { startMs: 0, endMs: 2000, speaker: 'Alper Eken', text: 'Välkomna till MeetingAI startup-mötet!' },
      { startMs: 2500, endMs: 5000, speaker: 'AbdulRehman Khan', text: 'Tack Alper! Jag har satt upp Recall.ai adaptern nu.' },
      { startMs: 5500, endMs: 8000, speaker: 'Alper Eken', text: 'Kanon, jag har byggt klart databas- och Express-lagret.' },
      { startMs: 8500, endMs: 12000, speaker: 'AbdulRehman Khan', text: 'Perfekt. Låt oss köra integrationstester mot vår Frankfurt DB.' },
      { startMs: 12500, endMs: 15000, speaker: 'Alper Eken', text: 'Ja, det ser ut att fungera klockrent med PostgreSQL.' },
      { startMs: 15500, endMs: 18000, speaker: 'AbdulRehman Khan', text: 'Mötet avslutat, då stänger vi ner inspelningen.' },
    ];

    this.bots.set(botId, { status: 'in_call', segments });

    // Schedule transcript_ready webhook after 10s
    setTimeout(async () => {
      const bot = this.bots.get(botId);
      if (bot) {
        bot.status = 'done';
        
        // Insert webhook event to simulate Recall callback
        const eventId = `evt-${randomUUID()}`;
        await this.webhookEventRepo.insertIfNew({
          provider: 'fake',
          externalEventId: eventId,
          eventType: 'transcript_ready',
          payload: {
            bot_id: botId,
            meeting_id: input.meetingId,
            status: 'done',
          },
        });
      }
    }, 10000);

    return { botId };
  }

  async getBotStatus(botId: string): Promise<'joining' | 'in_call' | 'done' | 'fatal'> {
    const bot = this.bots.get(botId);
    if (!bot) return 'fatal';
    return bot.status;
  }

  async fetchTranscript(botId: string): Promise<TranscriptSegment[]> {
    const bot = this.bots.get(botId);
    if (!bot) throw new Error(`Bot ${botId} not found`);
    return bot.segments;
  }

  async deleteRecording(botId: string): Promise<void> {
    // Fake deletion: delete from in-memory bots or just log
    console.log(`🗑️  [fake] deleteRecording called for bot ${botId}`);
    this.bots.delete(botId);
  }
}

