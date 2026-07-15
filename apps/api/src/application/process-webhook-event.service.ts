import type {
  MeetingRepository,
  TranscriptRepository,
  UsageRepository,
} from '../ports/repositories.port';
import type { MeetingBotPort } from '../ports/meeting-bot.port';
import { assertTransition } from '../domain/state-machine';

export class ProcessWebhookEventService {
  constructor(
    private readonly meetingRepo: MeetingRepository,
    private readonly transcriptRepo: TranscriptRepository,
    private readonly usageRepo: UsageRepository,
    private readonly botAdapter: MeetingBotPort
  ) {}

  async processEvent(eventType: string, payload: any): Promise<void> {
    if (eventType === 'transcript_ready') {
      const parsedPayload = typeof payload === 'string' ? JSON.parse(payload) : payload;
      const botId = parsedPayload.bot_id;
      const meetingId = parsedPayload.meeting_id;
      
      if (!meetingId) {
        throw new Error('meeting_id is missing from payload');
      }

      const meeting = await this.meetingRepo.findById(meetingId);
      if (!meeting) {
        throw new Error(`Meeting not found for ID: ${meetingId}`);
      }

      // Fetch transcript segments
      const segments = await this.botAdapter.fetchTranscript(botId);
      
      // Save transcript
      await this.transcriptRepo.save(meetingId, segments, payload);

      // Estimate duration based on segments
      let durationSeconds = 0;
      if (segments.length > 0) {
        const lastSegment = segments[segments.length - 1];
        durationSeconds = Math.ceil(lastSegment.endMs / 1000);
      }

      // Transition the meeting status step-by-step to transcribed
      let currentStatus = meeting.status;
      if (currentStatus === 'bot_joining') {
        assertTransition(currentStatus, 'recording');
        await this.meetingRepo.updateStatus(meeting.id, 'recording');
        currentStatus = 'recording';
      }
      if (currentStatus === 'recording') {
        assertTransition(currentStatus, 'processing');
        await this.meetingRepo.updateStatus(meeting.id, 'processing');
        currentStatus = 'processing';
      }
      if (currentStatus === 'processing') {
        assertTransition(currentStatus, 'transcribed');
        await this.meetingRepo.updateStatus(meeting.id, 'transcribed', {
          durationSeconds,
        });
      }

      // Add to usage ledger
      await this.usageRepo.addSeconds(meetingId, durationSeconds);
    }
  }
}
