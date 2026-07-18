import type { MeetingRepository } from '../ports/repositories.port';
import type { MeetingBotPort } from '../ports/meeting-bot.port';
import type { UsageMeterService } from './usage-meter.service';
import type { Meeting } from '../domain/types';
import { assertTransition } from '../domain/state-machine';
import { BotProviderError } from '../domain/errors';

export class StartMeetingService {
  constructor(
    private readonly meetingRepo: MeetingRepository,
    private readonly usageMeter: UsageMeterService,
    private readonly botAdapter: MeetingBotPort
  ) {}

  async start(meetingUrl: string): Promise<Meeting> {
    // 1. Assert we have budget/quota
    await this.usageMeter.assertCanStartMeeting();

    // 2. Create the pending meeting row in database
    const meeting = await this.meetingRepo.create({ source: 'bot', meetingUrl });

    try {
      // 3. Request the bot join the meeting
      const { botId } = await this.botAdapter.createBot({
        meetingUrl,
        meetingId: meeting.id,
      });

      // 4. Transition to bot_joining with the returned botId
      assertTransition(meeting.status, 'bot_joining');
      const updated = await this.meetingRepo.updateStatus(meeting.id, 'bot_joining', {
        botId,
      });

      return updated;
    } catch (err: any) {
      // If bot creation fails, mark meeting as failed
      await this.meetingRepo.updateStatus(meeting.id, 'failed', {
        errorMessage: err?.message || 'Failed to create bot',
      });
      throw new BotProviderError(err?.message || 'Bot provider failed to initialize');
    }
  }
}
