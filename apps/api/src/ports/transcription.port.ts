import type { TranscriptSegment } from '../domain/types';

export interface TranscriptionPort {
  /** Submit audio at a (signed) URL. Provider will call our webhook when done. */
  submit(audioUrl: string, meta: { meetingId: string }): Promise<{ jobId: string }>;
  /** Fetch a finished job and return normalized segments with generic speaker labels. */
  fetchResult(jobId: string): Promise<TranscriptSegment[]>;
}
