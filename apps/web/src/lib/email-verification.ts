import type { User } from './api';

export type VerificationBannerStatus = 'idle' | 'sending' | 'sent' | 'rate-limited' | 'error';

/**
 * Mirrors EMAIL_VERIFICATION_RESEND_COOLDOWN_MS on the API. The button re-arms exactly when a new
 * send would actually be accepted — without this the page sticks on "Email sent" forever, because
 * nothing else in the component ever leaves that state.
 */
export const RESEND_COOLDOWN_MS = 60_000;

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
    case 'error': return 'Try again';
    default: return 'Resend email';
  }
}
