export type MeetingPlatform = 'zoom';

export type MeetingSource = 'bot' | 'upload';

export type MeetingStatus =
  | 'pending'
  | 'bot_joining'
  | 'recording'
  | 'processing'
  | 'transcribed'
  | 'failed';

export interface Meeting {
  id: string;
  meetingUrl: string | null;        // Day 3: upload meetings have no URL
  platform: MeetingPlatform;
  status: MeetingStatus;
  source: MeetingSource;            // Day 3: 'bot' | 'upload'
  botId: string | null;
  durationSeconds: number | null;
  errorMessage: string | null;
  summary: string | null;
  shareToken: string;
  participantNames: string[] | null;   // Day 3: names for an in-room recording
  audioStoragePath: string | null;     // Day 3
  transcriptionJobId: string | null;   // Day 3
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

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatHistory {
  messages: ChatMessage[];
  remaining: number;
}

export interface ChatAnswer {
  answer: string;
  remaining: number;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

/** Carries the HTTP status so callers can tell 409 (not ready) from 429 (at cap). */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

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
    throw new ApiError(errorMessage, response.status);
  }
  return response.json() as Promise<T>;
}

export async function getMeetings(): Promise<Meeting[]> {
  const res = await fetch(`${API_BASE}/api/meetings`, { cache: 'no-store' });
  return handleResponse<Meeting[]>(res);
}

export async function createMeeting(meetingUrl: string): Promise<Meeting> {
  const res = await fetch(`${API_BASE}/api/meetings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ meetingUrl }),
    cache: 'no-store',
  });
  return handleResponse<Meeting>(res);
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

/**
 * Uploads an in-room recording as multipart. Uses XHR (not fetch) so we can report upload
 * progress. `onProgress` receives a fraction 0..1. Resolves with the created meeting.
 */
export function uploadMeeting(
  audio: Blob,
  participantNames: string[],
  onProgress?: (fraction: number) => void
): Promise<Meeting> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('audio', audio, 'recording.webm');
    form.append('participantNames', JSON.stringify(participantNames));

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/api/meetings/upload`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve((JSON.parse(xhr.responseText).meeting) as Meeting);
        } catch {
          reject(new Error('The server returned a malformed response.'));
        }
        return;
      }
      let message = `Upload failed (${xhr.status})`;
      try {
        const data = JSON.parse(xhr.responseText);
        if (data?.error?.message) message = data.error.message;
      } catch {
        // ignore
      }
      reject(new ApiError(message, xhr.status));
    };

    xhr.onerror = () => reject(new Error('Network error during upload.'));
    xhr.send(form);
  });
}

export async function getChat(id: string): Promise<ChatHistory> {
  const res = await fetch(`${API_BASE}/api/meetings/${id}/chat`, { cache: 'no-store' });
  return handleResponse<ChatHistory>(res);
}

export async function askChat(id: string, question: string): Promise<ChatAnswer> {
  const res = await fetch(`${API_BASE}/api/meetings/${id}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
    cache: 'no-store',
  });
  return handleResponse<ChatAnswer>(res);
}
