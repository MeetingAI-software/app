import type {
  MeetingRepository,
  TranscriptRepository,
  UsageRepository,
} from '../ports/repositories.port';
import type { MeetingBotPort } from '../ports/meeting-bot.port';
import { assertTransition } from '../domain/state-machine';
import type { MeetingStatus } from '../domain/types';

function mapRecallStatusToMeetingStatus(statusCode: string): MeetingStatus | null {
  switch (statusCode) {
    case 'joining_call':
    case 'in_waiting_room':
      return 'bot_joining';
    case 'in_call_not_recording':
    case 'recording_permission_allowed':
    case 'in_call_recording':
      return 'recording';
    case 'recording_done':
    case 'call_ended':
    case 'done':
      return 'processing';
    case 'fatal':
      return 'failed';
    default:
      return null;
  }
}

export class ProcessWebhookEventService {
  constructor(
    private readonly meetingRepo: MeetingRepository,
    private readonly transcriptRepo: TranscriptRepository,
    private readonly usageRepo: UsageRepository,
    private readonly botAdapter: MeetingBotPort
  ) {}

  async processEvent(action: 'transcript_ready' | 'bot_status_change', payload: any): Promise<void> {
    const parsedPayload = typeof payload === 'string' ? JSON.parse(payload) : payload;
    const botId = parsedPayload.bot_id || parsedPayload.data?.bot_id;
    const meetingId = parsedPayload.meeting_id || parsedPayload.data?.meeting_id;

    if (!botId) {
      throw new Error('bot_id is missing from payload');
    }

    // Resolve meeting
    let meeting = null;
    if (meetingId) {
      meeting = await this.meetingRepo.findById(meetingId);
    }
    if (!meeting) {
      meeting = await this.meetingRepo.findByBotId(botId);
    }

    if (!meeting) {
      throw new Error(`Meeting not found for botId: ${botId} / meetingId: ${meetingId}`);
    }

    if (action === 'bot_status_change') {
      const rawStatus = parsedPayload.status?.code || parsedPayload.status;
      if (!rawStatus) {
        console.warn('⚠️ bot_status_change event is missing status information, skipping.');
        return;
      }

      const nextStatus = mapRecallStatusToMeetingStatus(String(rawStatus));
      if (!nextStatus) {
        console.warn(`⚠️ Unrecognized Recall status code: ${rawStatus}, ignoring.`);
        return;
      }

      if (meeting.status === nextStatus) {
        return;
      }

      try {
        assertTransition(meeting.status, nextStatus);
        console.log(`👷 Transitioning meeting ${meeting.id} status from ${meeting.status} to ${nextStatus}`);
        await this.meetingRepo.updateStatus(meeting.id, nextStatus);
      } catch (err: any) {
        console.error(`⚠️ Illegal transition attempted from ${meeting.status} to ${nextStatus} for meeting ${meeting.id}:`, err.message);
      }
    } else if (action === 'transcript_ready') {
      console.log(`👷 Processing transcript_ready for meeting ${meeting.id} (bot: ${botId})`);
      
      // Fetch transcript segments
      const segments = await this.botAdapter.fetchTranscript(botId);
      
      // Save transcript
      await this.transcriptRepo.save(meeting.id, segments, payload);

      // Estimate duration based on segments
      let durationSeconds = 0;
      if (segments.length > 0) {
        const lastSegment = segments[segments.length - 1];
        durationSeconds = Math.ceil(lastSegment.endMs / 1000);
      }

      // Transition the meeting status step-by-step to transcribed
      let currentStatus = meeting.status;
      
      // If meeting is not yet in processing state, transition it step-by-step
      const transitionSteps: MeetingStatus[] = ['bot_joining', 'recording', 'processing', 'transcribed'];
      const startIndex = transitionSteps.indexOf(currentStatus);

      if (startIndex !== -1 && currentStatus !== 'transcribed') {
        for (let i = startIndex; i < transitionSteps.length - 1; i++) {
          const from = transitionSteps[i];
          const to = transitionSteps[i + 1];
          try {
            assertTransition(from, to);
            if (to === 'transcribed') {
              await this.meetingRepo.updateStatus(meeting.id, to, {
                durationSeconds,
              });
            } else {
              await this.meetingRepo.updateStatus(meeting.id, to);
            }
            console.log(`👷 Step-transitioned meeting ${meeting.id} from ${from} to ${to}`);
          } catch (err: any) {
            console.error(`⚠️ Error during step-transition from ${from} to ${to}:`, err.message);
            throw err;
          }
        }
      } else {
        // Fallback: direct assertTransition and update
        assertTransition(currentStatus, 'transcribed');
        await this.meetingRepo.updateStatus(meeting.id, 'transcribed', {
          durationSeconds,
        });
      }

      // Add to usage ledger
      await this.usageRepo.addSeconds(meeting.id, durationSeconds);
    }
  }
}
