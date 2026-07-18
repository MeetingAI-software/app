import type { Meeting, TranscriptSegment } from '../../../domain/types';
import type { DocumentContent } from '../../../domain/document';

export interface PublicShareResponse {
  meeting: {
    status: string;
    createdAt: Date;
    durationSeconds: number | null;
    summary: string | null;
    shareToken: string;
  };
  document: { content: DocumentContent; createdAt: Date } | null;
  transcript: TranscriptSegment[];
}

/**
 * Shapes the PUBLIC `/api/share/:token` payload. It must expose ONLY these meeting fields —
 * never chat history, audioStoragePath, transcriptionJobId, participantNames, botId, meetingUrl,
 * or the internal id. A public link is handed to strangers; leaking any of those would expose
 * private data or let someone burn the Claude budget. This is a hard contract (Architecture-Day3 §4/§9).
 */
export function toShareResponse(
  meeting: Meeting,
  document: { content: DocumentContent; createdAt: Date } | null,
  transcript: TranscriptSegment[]
): PublicShareResponse {
  return {
    meeting: {
      status: meeting.status,
      createdAt: meeting.createdAt,
      durationSeconds: meeting.durationSeconds,
      summary: meeting.summary,
      shareToken: meeting.shareToken,
    },
    document,
    transcript,
  };
}
