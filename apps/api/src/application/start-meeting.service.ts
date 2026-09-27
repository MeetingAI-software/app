import type { MeetingRepository } from '../ports/repositories.port';
import type { MeetingBotPort } from '../ports/meeting-bot.port';
import type { UsageMeterService } from './usage-meter.service';
import type { Meeting } from '../domain/types';
import { detectPlatform } from '../domain/meeting-platform';
import { BotProviderError } from '../domain/errors';

export class StartMeetingService {
  constructor(
    private readonly meetingRepo: MeetingRepository,
    private readonly usageMeter: UsageMeterService,
    private readonly botAdapter: MeetingBotPort
  ) {}

  async start(
    userId: string,
    meetingUrl: string,
    recordingNotice?: { confirmedAt: Date; version: string },
  ): Promise<Meeting> {
    // The database checks capacity and creates the pending row in one transaction.
    const platform = detectPlatform(meetingUrl) ?? 'zoom';
    const { meeting, entitlements } = await this.usageMeter.reserveMeeting(userId, 'bot', {
      meetingUrl,
      platform,
      ...(recordingNotice ? {
        recordingNoticeConfirmedAt: recordingNotice.confirmedAt,
        recordingNoticeVersion: recordingNotice.version,
      } : {}),
    });

    // The route already rejected unsupported hosts, so detectPlatform cannot be null here.

    let createdBotId: string | null = null;
    try {
      // 3. Request the bot join the meeting
      const { botId } = await this.botAdapter.createBot({
        meetingUrl,
        meetingId: meeting.id,
        maxMeetingSeconds: entitlements.maxMeetingSeconds,
      });
      createdBotId = botId;

      // 4. Bind the returned ID even if a timeout sweep has meanwhile marked the row failed.
      const updated = await this.meetingRepo.bindCreatedBot(meeting.id, botId);
      if (updated.status === 'failed') throw new BotProviderError({ operation: 'create_bot' });

      return updated;
    } catch (err) {
      const failure = new BotProviderError(err instanceof BotProviderError ? err.diagnostics : { operation: 'create_bot' });
      const definiteRejection = err instanceof BotProviderError
        && [400, 401, 403, 404, 422].includes(err.diagnostics.status ?? 0);
      // Only an explicit provider rejection proves no bot exists. Generic failures can hide a
      // lost success response; preserve their unresolved claim for provider reconciliation.
      if (!createdBotId && definiteRejection) {
        await this.meetingRepo.markBotCreationRejected(meeting.id, failure.message);
      }
      throw failure;
    }
  }
}
