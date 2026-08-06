import type { User } from './api';

export type VerificationBannerStatus =
  | 'idle'
  | 'sending'
  | 'sent'
  | 'rate-limited'
  | 'budget-exhausted'
  | 'error';

/**
 * Mirrors EMAIL_VERIFICATION_RESEND_COOLDOWN_MS on the API. The button re-arms exactly when a new
 * send would actually be accepted — without this the page sticks on "Email sent" forever, because
 * nothing else in the component ever leaves that state.
 */
export const RESEND_COOLDOWN_MS = 60_000;

/**
 * Mirrors the resendVerificationLimiter window in auth.routes.ts (3 per hour), which is a different
 * clock from the cooldown above. Re-arming a 429 after RESEND_COOLDOWN_MS was a promise the server
 * could not keep: the button came back after a minute straight into another 429.
 */
export const RESEND_RATE_LIMIT_BACKOFF_MS = 60 * 60 * 1000;

/** How long to wait before re-arming the resend button, given how the last attempt ended. */
export function resendRetryDelayMs(status: VerificationBannerStatus): number | null {
  switch (status) {
    case 'sent': return RESEND_COOLDOWN_MS;
    case 'rate-limited': return RESEND_RATE_LIMIT_BACKOFF_MS;
    // Global budget exhaustion clears on the server's rolling 24h window, not on a timer we can
    // predict — leave the button armed so the user can find out for themselves.
    default: return null;
  }
}

/** Mirrors the server's gate: an authenticated but unverified account reaches nothing but /auth. */
export function shouldRequireEmailVerification(
  user: Pick<User, 'emailVerified'> | null,
): boolean {
  return user !== null && !user.emailVerified;
}

export function verificationBannerButtonLabel(status: VerificationBannerStatus): string {
  switch (status) {
    case 'sending': return 'Sending…';
    case 'sent': return 'Email sent';
    case 'rate-limited': return 'Try again later';
    case 'budget-exhausted': return 'Try again';
    case 'error': return 'Try again';
    default: return 'Resend email';
  }
}
