import { ApiError, verifyEmail, type AuthUserResponse } from './api';

export type VerifyEmailState =
  | 'verifying'
  | 'success'
  | 'missing-token'
  | 'invalid-token'
  | 'expired-token'
  | 'used-token'
  | 'already-verified'
  | 'error';

const verificationRequests = new Map<string, Promise<AuthUserResponse>>();

/** Reuses the same request when React Strict Mode runs the page effect twice in development. */
export function verifyEmailOnce(token: string): Promise<AuthUserResponse> {
  const existing = verificationRequests.get(token);
  if (existing) return existing;
  const request = verifyEmail(token);
  verificationRequests.set(token, request);
  return request;
}

export function stateForVerificationError(error: unknown): VerifyEmailState {
  if (!(error instanceof ApiError)) return 'error';
  switch (error.code) {
    case 'INVALID_VERIFICATION_TOKEN': return 'invalid-token';
    case 'VERIFICATION_TOKEN_EXPIRED': return 'expired-token';
    case 'VERIFICATION_TOKEN_USED': return 'used-token';
    case 'EMAIL_ALREADY_VERIFIED': return 'already-verified';
    default: return 'error';
  }
}

export const EMAIL_VERIFICATION_COMPLETED_EVENT = 'email-verification-completed';
export const EMAIL_VERIFICATION_STORAGE_KEY = 'meetingai:email-verification-completed';

/** Updates this tab immediately and notifies other open app tabs through the storage event. */
export function notifyEmailVerificationCompleted(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(EMAIL_VERIFICATION_STORAGE_KEY, new Date().toISOString());
  window.dispatchEvent(new Event(EMAIL_VERIFICATION_COMPLETED_EVENT));
}

export function clearVerificationRequestCache(): void {
  verificationRequests.clear();
}
