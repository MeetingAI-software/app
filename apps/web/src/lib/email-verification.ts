import type { User } from './api';

export type VerificationBannerStatus = 'idle' | 'sending' | 'sent' | 'error';

export function shouldShowEmailVerificationBanner(
  user: Pick<User, 'emailVerified'> | null,
): boolean {
  return user !== null && !user.emailVerified;
}

export function verificationBannerButtonLabel(status: VerificationBannerStatus): string {
  switch (status) {
    case 'sending': return 'Sending…';
    case 'sent': return 'Email sent';
    case 'error': return 'Try again';
    default: return 'Resend email';
  }
}
