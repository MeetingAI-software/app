import type { MeetingRepository } from '../ports/repositories.port';
import type { MeetingBotPort } from '../ports/meeting-bot.port';
import type { UsageMeterService } from './usage-meter.service';
import type { Meeting } from '../domain/types';
import { assertTransition } from '../domain/state-machine';
import { detectPlatform } from '../domain/meeting-platform';
import { BotProviderError } from '../domain/errors';

export class StartMeetingService {
  constructor(
    private readonly meetingRepo: MeetingRepository,
    private readonly usageMeter: UsageMeterService,
    private readonly botAdapter: MeetingBotPort
  ) {}

  async start(userId: string, meetingUrl: string): Promise<Meeting> {
    // 1. Assert we have budget/quota (per user)
    const entitlements = await this.usageMeter.assertCanStartMeeting(userId);

    // 2. Create the pending meeting row, owned by this user.
    // The route already rejected unsupported hosts, so detectPlatform cannot be null here.
    const platform = detectPlatform(meetingUrl) ?? 'zoom';
    const meeting = await this.meetingRepo.create({ ownerUserId: userId, source: 'bot', meetingUrl, platform });

    try {
      // 3. Request the bot join the meeting
      const { botId } = await this.botAdapter.createBot({
        meetingUrl,
        meetingId: meeting.id,
        maxMeetingSeconds: entitlements.maxMeetingSeconds,
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
