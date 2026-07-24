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

export interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
}

export interface UsageSummary {
  secondsUsed: number;
  secondsCap: number;
}

/** Carries the HTTP status so callers can tell 409 (not ready) from 429 (at cap). */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** All API calls send the session cookie. Auth is cookie-based since Day 5 — no tokens in JS. */
function api(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API_BASE}${path}`, { ...init, credentials: 'include', cache: 'no-store' });
}

async function extractMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.json();
    if (data?.error?.message) return data.error.message as string;
  } catch {
    // ignore
  }
  return fallback;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    // A 401 on a data call means the session lapsed — let the shell bounce to /login.
    if (response.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('unauthorized-api-call'));
    }
    throw new ApiError(await extractMessage(response, `HTTP error! Status: ${response.status}`), response.status);
  }
  return response.json() as Promise<T>;
}

/** For 204/no-body endpoints (logout, delete account). Never dispatches the global 401 — a 401
 *  here means "wrong password", which the calling page shows itself. */
async function handleVoid(response: Response): Promise<void> {
  if (!response.ok) {
    throw new ApiError(await extractMessage(response, `HTTP error! Status: ${response.status}`), response.status);
  }
}

/** Like handleResponse but never fires the global 401 redirect — for password-confirmed account
 *  actions (change password/email) where a 401 means "wrong current password", not a lapsed session. */
async function handleResponseQuiet<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new ApiError(await extractMessage(response, `HTTP error! Status: ${response.status}`), response.status);
  }
  return response.json() as Promise<T>;
}

// --- Auth (Day 5) ---
export async function signup(email: string, password: string): Promise<{ user: User }> {
  const res = await api('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return handleResponse<{ user: User }>(res);
}

export async function login(email: string, password: string): Promise<{ user: User }> {
  const res = await api('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return handleResponse<{ user: User }>(res);
}

export async function logout(): Promise<void> {
  return handleVoid(await api('/api/auth/logout', { method: 'POST' }));
}

export async function getMe(): Promise<{ user: User }> {
  return handleResponse<{ user: User }>(await api('/api/auth/me'));
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<{ user: User }> {
  const res = await api('/api/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  return handleResponseQuiet<{ user: User }>(res);
}

export async function changeEmail(currentPassword: string, newEmail: string): Promise<{ user: User }> {
  const res = await api('/api/auth/change-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newEmail }),
  });
  return handleResponseQuiet<{ user: User }>(res);
}

export async function deleteAccount(password: string): Promise<void> {
  return handleVoid(await api('/api/auth/account', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  }));
}

export async function getUsage(): Promise<UsageSummary> {
  return handleResponse<UsageSummary>(await api('/api/me/usage'));
}

export async function getMeetings(): Promise<Meeting[]> {
  return handleResponse<Meeting[]>(await api('/api/meetings'));
}

export async function createMeeting(meetingUrl: string): Promise<Meeting> {
  const res = await api('/api/meetings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ meetingUrl }),
  });
  return handleResponse<Meeting>(res);
}

export async function getMeeting(id: string): Promise<Meeting> {
  return handleResponse<Meeting>(await api(`/api/meetings/${id}`));
}

export async function getTranscript(id: string): Promise<TranscriptSegment[]> {
  return handleResponse<TranscriptSegment[]>(await api(`/api/meetings/${id}/transcript`));
}

export async function getDocument(id: string): Promise<Document> {
  return handleResponse<Document>(await api(`/api/meetings/${id}/document`));
}

export async function generateDocument(id: string, regenerate = false): Promise<{ document: Document }> {
  const res = await api(`/api/meetings/${id}/document${regenerate ? '?regenerate=true' : ''}`, { method: 'POST' });
  return handleResponse<{ document: Document }>(res);
}

export async function getShare(token: string): Promise<ShareResponse> {
  // Public — no session required; any cookie is simply ignored server-side.
  return handleResponse<ShareResponse>(await api(`/api/share/${token}`));
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
    xhr.withCredentials = true; // send the session cookie

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
      if (xhr.status === 401 && typeof window !== 'undefined') {
        window.dispatchEvent(new Event('unauthorized-api-call'));
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
  return handleResponse<ChatHistory>(await api(`/api/meetings/${id}/chat`));
}

export async function askChat(id: string, question: string): Promise<ChatAnswer> {
  const res = await api(`/api/meetings/${id}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  return handleResponse<ChatAnswer>(res);
}
