// domain/types.ts
export type MeetingPlatform = 'zoom';                       // Day 1: zoom only

export type MeetingSource = 'bot' | 'upload';               // Day 3: bot join vs in-room upload

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
  meetingUrl: string | null;              // Day 3: upload meetings have no URL
  platform: MeetingPlatform;
  status: MeetingStatus;
  source: MeetingSource;                  // Day 3: 'bot' | 'upload'
  botId: string | null;
  durationSeconds: number | null;
  errorMessage: string | null;
  summary: string | null;
  shareToken: string;
  participantNames: string[] | null;      // Day 3: names entered before an in-room recording
  audioStoragePath: string | null;        // Day 3: Supabase Storage path for uploads
  transcriptionJobId: string | null;      // Day 3: AssemblyAI job id for uploads
  createdAt: Date;
  updatedAt: Date;
}

