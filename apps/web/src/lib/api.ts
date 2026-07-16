export type MeetingPlatform = 'zoom';

export type MeetingStatus =
  | 'pending'
  | 'bot_joining'
  | 'recording'
  | 'processing'
  | 'transcribed'
  | 'failed';

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
  createdAt: string;
  updatedAt: string;
}

export interface TranscriptSegment {
  startMs: number;
  endMs: number;
  speaker: string;
  text: string;
}

export interface ActionPoint {
  task: string;
  owner: string | null;
  deadlineIso: string | null;
}

export interface DocumentContent {
  title: string;
  missed5: string[];
  decisions: string[];
  actionPoints: ActionPoint[];
  openQuestions: string[];
}

export interface Document {
  content: DocumentContent;
  createdAt: string;
}

export interface ShareResponse {
  meeting: {
    status: MeetingStatus;
    createdAt: string;
    durationSeconds: number | null;
    summary: string | null;
    shareToken: string;
  };
  document: Document | null;
  transcript: TranscriptSegment[];
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorMessage = `HTTP error! Status: ${response.status}`;
    try {
      const data = await response.json();
      if (data?.error?.message) {
        errorMessage = data.error.message;
      }
    } catch {
      // ignore
    }
    throw new Error(errorMessage);
  }
  return response.json() as Promise<T>;
}

export async function getMeetings(): Promise<Meeting[]> {
  const res = await fetch(`${API_BASE}/api/meetings`, { cache: 'no-store' });
  return handleResponse<Meeting[]>(res);
}

export async function getMeeting(id: string): Promise<Meeting> {
  const res = await fetch(`${API_BASE}/api/meetings/${id}`, { cache: 'no-store' });
  return handleResponse<Meeting>(res);
}

export async function getTranscript(id: string): Promise<TranscriptSegment[]> {
  const res = await fetch(`${API_BASE}/api/meetings/${id}/transcript`, { cache: 'no-store' });
  return handleResponse<TranscriptSegment[]>(res);
}

export async function getDocument(id: string): Promise<Document> {
  const res = await fetch(`${API_BASE}/api/meetings/${id}/document`, { cache: 'no-store' });
  return handleResponse<Document>(res);
}

export async function generateDocument(id: string, regenerate = false): Promise<{ document: Document }> {
  const url = `${API_BASE}/api/meetings/${id}/document${regenerate ? '?regenerate=true' : ''}`;
  const res = await fetch(url, {
    method: 'POST',
    cache: 'no-store',
  });
  return handleResponse<{ document: Document }>(res);
}

export async function getShare(token: string): Promise<ShareResponse> {
  const res = await fetch(`${API_BASE}/api/share/${token}`, { cache: 'no-store' });
  return handleResponse<ShareResponse>(res);
}
