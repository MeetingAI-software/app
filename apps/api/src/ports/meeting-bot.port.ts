import type { TranscriptSegment } from '../domain/types';

export interface MeetingBotPort {
  /** Ask the provider to send a bot into the meeting. Must configure
   *  transcription WITH speaker labels + word/utterance timestamps. */
  createBot(input: { meetingUrl: string; meetingId: string }): Promise<{ botId: string }>;
  getBotStatus(botId: string): Promise<'joining' | 'in_call' | 'done' | 'fatal'>;
  /** Fetch + NORMALIZE transcript. Timestamps and speakers are mandatory. */
  fetchTranscript(botId: string): Promise<TranscriptSegment[]>;
}
