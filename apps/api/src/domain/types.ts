// domain/types.ts
export type MeetingPlatform = 'zoom';                       // Day 1: zoom only

export type MeetingStatus =
  | 'pending' | 'bot_joining' | 'recording'
  | 'processing' | 'transcribed' | 'failed';

export interface TranscriptSegment {
  startMs: number;    // offset from meeting start
  endMs: number;
  speaker: string;    // "Alper Eken" | "Speaker 1" if unidentified — never empty
  text: string;
}

export interface Meeting {
  id: string;
  meetingUrl: string;
  platform: MeetingPlatform;
  status: MeetingStatus;
  botId: string | null;
  durationSeconds: number | null;
  errorMessage: string | null;
  summary: string | null;
  shareToken: string;
  createdAt: Date;
  updatedAt: Date;
}

