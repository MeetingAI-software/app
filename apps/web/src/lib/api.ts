export type MeetingPlatform = 'zoom' | 'google_meet' | 'teams';

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

/**
 * An utterance captured while the meeting is still running. `seq` is a server-side cursor:
 * it survives reconnects and lets the stream and the polling fallback resume in the same place.
 * These are replaced wholesale by the final `TranscriptSegment[]` once the meeting is over.
 */
export interface LiveSegment extends TranscriptSegment {
  seq: number;
}

export interface LivePoll {
  segments: LiveSegment[];
  cursor: number;
  status: MeetingStatus;
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

export interface AuthUserResponse {
  user: User;
  emailVerificationRequired: boolean;
}

export interface UsageSummary {
  secondsUsed: number;
  secondsCap: number;
}

export type PlanId = 'free' | 'solo' | 'team' | 'business';

export interface SubscriptionSummary {
  plan: PlanId;
  status: string | 'none';
  hasPaidAccess: boolean;
  inRoomRecordingEnabled: boolean;
  entitlements: {
    monthlySecondsCap: number;
    maxMeetingSeconds: number;
    chatQuestionsPerMeeting: number;
    phoneInRoomRecording: boolean;
    adminControlsAndAuditLog: boolean;
  };
  subscription: {
    id: string;
    priceId: string | null;
    quantity: number;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    scheduledChangeAction: string | null;
    scheduledChangeAt: string | null;
  } | null;
}

export interface BillingContext {
  paddleCustomerId: string | null;
}

/** Carries the HTTP status so callers can tell 409 (not ready) from 429 (at cap). */
export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Copy for the two transient server-side walls in front of the email-sending routes: the per-client
 * rate limiters (429) and the global daily send budget (503). Neither is the user's fault and both
 * clear on their own, so they get a plain sentence instead of the raw server string — and they live
 * here so the signup, settings, and verification screens cannot drift apart. Returns null when the
 * error is something else, leaving the caller's own handling in charge.
 */
export function throttleMessage(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  if (err.status === 429) return 'Too many attempts. Please wait a while and try again.';
  if (err.code === 'EMAIL_BUDGET_EXHAUSTED') {
    return 'We are temporarily unable to send verification emails. Please try again in a few hours.';
  }
  return null;
}

/** All API calls send the session cookie. Auth is cookie-based since Day 5 — no tokens in JS. */
function api(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API_BASE}${path}`, { ...init, credentials: 'include', cache: 'no-store' });
}

/** Reads the API's `{error:{code,message}}` envelope. The code is what callers branch on — a
 *  message is for humans, so anything matching on copy breaks the moment the wording changes. */
async function readError(response: Response): Promise<ApiError> {
  let message = `HTTP error! Status: ${response.status}`;
  let code: string | undefined;
  try {
    const data = (await response.json()) as { error?: { code?: string; message?: string } } | null;
    if (data?.error?.message) message = data.error.message;
    if (data?.error?.code) code = data.error.code;
  } catch {
    // Non-JSON body (proxy error page, empty 502) — keep the status-line fallback.
  }
  return new ApiError(message, response.status, code);
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    // A 401 on a data call means the session lapsed — let the shell bounce to /login.
    if (response.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('unauthorized-api-call'));
    }
    throw await readError(response);
  }
  return response.json() as Promise<T>;
}

/** For 204/no-body endpoints (logout, delete account). Never dispatches the global 401 — a 401
 *  here means "wrong password", which the calling page shows itself. */
async function handleVoid(response: Response): Promise<void> {
  if (!response.ok) {
    throw await readError(response);
  }
}

/** Like handleResponse but never fires the global 401 redirect — for password-confirmed account
 *  actions (change password/email) where a 401 means "wrong current password", not a lapsed session. */
async function handleResponseQuiet<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw await readError(response);
  }
  return response.json() as Promise<T>;
}

// --- Auth (Day 5) ---
export async function signup(email: string, password: string): Promise<AuthUserResponse> {
  const res = await api('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return handleResponse<AuthUserResponse>(res);
}

export async function login(email: string, password: string): Promise<AuthUserResponse> {
  const res = await api('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return handleResponse<AuthUserResponse>(res);
}

export async function logout(): Promise<void> {
  return handleVoid(await api('/api/auth/logout', { method: 'POST' }));
}

export async function getMe(): Promise<AuthUserResponse> {
  return handleResponse<AuthUserResponse>(await api('/api/auth/me'));
}

export async function resendVerification(email: string): Promise<void> {
  const response = await api('/api/auth/resend-verification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  return handleVoid(response);
}

export async function verifyEmail(token: string): Promise<AuthUserResponse> {
  const response = await api('/api/auth/verify-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  // Quiet: every failure here is a token verdict (invalid/expired/used), never a lapsed session,
  // so the global 401 redirect must not fire.
  return handleResponseQuiet<AuthUserResponse>(response);
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<AuthUserResponse> {
  const res = await api('/api/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  return handleResponseQuiet<AuthUserResponse>(res);
}

export async function changeEmail(currentPassword: string, newEmail: string): Promise<AuthUserResponse> {
  const res = await api('/api/auth/change-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newEmail }),
  });
  return handleResponseQuiet<AuthUserResponse>(res);
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

export async function getSubscription(): Promise<SubscriptionSummary> {
  return handleResponse<SubscriptionSummary>(await api('/api/me/subscription'));
}

/**
 * `/pricing` is public, so an anonymous 401 is an expected "no Paddle customer yet" result and
 * must not trigger the application's global session-expired redirect.
 */
export async function getOptionalBillingContext(): Promise<BillingContext | null> {
  const response = await api('/api/me/billing-context');
  if (response.status === 401) return null;
  return handleResponseQuiet<BillingContext>(response);
}

export async function createBillingPortalSession(): Promise<{ url: string }> {
  return handleResponse<{ url: string }>(await api('/api/me/billing-portal', { method: 'POST' }));
}

export async function createCheckoutTransaction(priceId: string, quantity = 1): Promise<{ transactionId: string }> {
  return handleResponse<{ transactionId: string }>(await api('/api/me/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ priceId, quantity }),
  }));
}

export interface SubscriptionChangePreview {
  targetPlan: 'solo' | 'team';
  targetInterval: 'monthly' | 'annual';
  prorationBillingMode: 'prorated_immediately' | 'prorated_next_billing_period';
  immediateAmount: string | null;
  immediateCurrency: string | null;
  recurringAmount: string | null;
  recurringCurrency: string | null;
  nextBilledAt: string | null;
}

export async function previewSubscriptionChange(priceId: string): Promise<SubscriptionChangePreview> {
  return handleResponse<SubscriptionChangePreview>(await api('/api/me/subscription/preview-change', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ priceId }),
  }));
}

export async function changeSubscription(priceId: string): Promise<{ accepted: true; status: string; priceId: string | null }> {
  return handleResponse(await api('/api/me/subscription/change', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ priceId }),
  }));
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

/** Cursor-polling fallback for the live transcript, used when SSE can't hold a connection. */
export async function getLiveSegments(id: string, after: number): Promise<LivePoll> {
  return handleResponse<LivePoll>(await api(`/api/meetings/${id}/live?after=${after}`));
}

/**
 * EventSource takes a URL rather than a Request, so it can't go through `api()`. The session
 * cookie still flows because the hook constructs it with `{ withCredentials: true }` and the
 * API is on the same registrable domain.
 */
export function liveStreamUrl(id: string, after: number): string {
  return `${API_BASE}/api/meetings/${id}/live/stream?after=${after}`;
}

/**
 * A plain link, not a fetch — the browser has to follow the redirect to Google itself. It must be
 * absolute so the whole OAuth round trip stays on the API host, which is where the callback sets
 * the session cookie.
 */
export function googleOAuthUrl(): string {
  return `${API_BASE}/api/auth/google`;
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
      let code: string | undefined;
      try {
        const data = JSON.parse(xhr.responseText);
        if (data?.error?.message) message = data.error.message;
        if (data?.error?.code) code = data.error.code;
      } catch {
        // ignore
      }
      reject(new ApiError(message, xhr.status, code));
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
