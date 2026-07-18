import { randomUUID } from 'crypto';
import type { TranscriptionPort } from '../../ports/transcription.port';
import type { WebhookEventRepository } from '../../ports/repositories.port';
import type { TranscriptSegment } from '../../domain/types';

// Canned diarized transcript with GENERIC labels only. mapSpeakers() (Step 2) turns
// "Speaker A/B" into the participant names the user typed — so these MUST stay generic,
// exactly like a real AssemblyAI diarization result.
const CANNED_SEGMENTS: TranscriptSegment[] = [
  { startMs: 0, endMs: 3500, speaker: 'Speaker A', text: 'Okay, let us kick off the in-room sync. Where are we on the AssemblyAI upload path?' },
  { startMs: 4000, endMs: 9000, speaker: 'Speaker B', text: 'Recording in the browser works and the file uploads to Supabase Storage. The worker submits it for transcription.' },
  { startMs: 9500, endMs: 14000, speaker: 'Speaker A', text: 'Good. And we delete the audio after the summary succeeds, so the GDPR promise holds on this path too?' },
  { startMs: 14500, endMs: 18000, speaker: 'Speaker B', text: 'Yes, same rule as the Recall path. Transcript is the source of truth, audio gets deleted.' },
  { startMs: 18500, endMs: 23000, speaker: 'Speaker A', text: 'Let us also confirm the chat only answers from the transcript and cites timestamps.' },
  { startMs: 23500, endMs: 27500, speaker: 'Speaker B', text: 'Confirmed. If something was not discussed, it says so plainly instead of guessing.' },
  { startMs: 28000, endMs: 31000, speaker: 'Speaker A', text: 'Great, that is the trust wedge. Let us ship it.' },
];

export class FakeTranscriptionAdapter implements TranscriptionPort {
  constructor(private readonly webhookEventRepo: WebhookEventRepository) {}

  async submit(_audioUrl: string, meta: { meetingId: string }): Promise<{ jobId: string }> {
    const jobId = `fake-${randomUUID()}`;

    // Simulate the provider calling our webhook once transcription finishes (the Day 1 FakeBot trick).
    setTimeout(async () => {
      const eventId = `evt-${randomUUID()}`;
      await this.webhookEventRepo.insertIfNew({
        provider: 'fake',
        externalEventId: eventId,
        eventType: 'transcription_ready',
        payload: {
          jobId,
          meetingId: meta.meetingId,
        },
      });
    }, 3000);

    return { jobId };
  }

  async fetchResult(_jobId: string): Promise<TranscriptSegment[]> {
    return CANNED_SEGMENTS.map((s) => ({ ...s }));
  }
}
