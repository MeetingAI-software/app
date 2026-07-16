import type {
  MeetingRepository,
  TranscriptRepository,
  UsageRepository,
} from '../ports/repositories.port';
import type { MeetingBotPort } from '../ports/meeting-bot.port';
import type { DocumentGeneratorPort } from '../ports/document-generator.port';
import { assertTransition } from '../domain/state-machine';
import type { MeetingStatus, TranscriptSegment } from '../domain/types';
import { logger } from '../config/logger';

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
    private readonly botAdapter: MeetingBotPort,
    private readonly docGen: DocumentGeneratorPort
  ) {}

  /** One retry. The caller treats a thrown error as "leave summary null and carry on". */
  private async generateSummaryWithRetry(segments: TranscriptSegment[]): Promise<string> {
    try {
      return await this.docGen.generateSummary(segments);
    } catch (err: any) {
      logger.warn({ err: err?.message }, 'Summary generation failed, retrying once');
      return await this.docGen.generateSummary(segments);
    }
  }

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

      // Summary. A missing summary must never block markProcessed or the document button.
      let summarySucceeded = false;
      try {
        const summary = await this.generateSummaryWithRetry(segments);
        await this.meetingRepo.setSummary(meeting.id, summary);
        summarySucceeded = true;
        logger.info({ meetingId: meeting.id }, 'Summary generated');
      } catch (err: any) {
        logger.error(
          { meetingId: meeting.id, err: err?.message },
          'Summary generation failed after retry — leaving summary null and continuing'
        );
      }

      // The GDPR promise. Audio is deleted ONLY after the transcript is stored and the
      // summary has proven the pipeline can read it. If anything upstream failed, the
      // audio survives for reprocessing. Deletion failure is non-fatal by design.
      if (summarySucceeded) {
        try {
          await this.botAdapter.deleteRecording(botId);
          logger.info(
            { meetingId: meeting.id, botId },
            'Recording deleted at provider'
          );
        } catch (err: any) {
          logger.warn(
            { meetingId: meeting.id, botId, err: err?.message },
            'Failed to delete recording at provider — a sweep job will retry'
          );
        }
      }
    }
  }
}
