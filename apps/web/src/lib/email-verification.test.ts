import { describe, expect, it } from 'vitest';
import {
  RESEND_COOLDOWN_MS,
  shouldRequireEmailVerification,
  verificationBannerButtonLabel,
} from './email-verification';

describe('email verification gate state', () => {
  it('holds back the app only for authenticated users with an unverified email', () => {
    expect(shouldRequireEmailVerification(null)).toBe(false);
    expect(shouldRequireEmailVerification({ emailVerified: true })).toBe(false);
    expect(shouldRequireEmailVerification({ emailVerified: false })).toBe(true);
  });

  it('provides clear button labels for every resend state', () => {
    expect(verificationBannerButtonLabel('idle')).toBe('Resend email');
    expect(verificationBannerButtonLabel('sending')).toBe('Sending…');
    expect(verificationBannerButtonLabel('sent')).toBe('Email sent');
    expect(verificationBannerButtonLabel('rate-limited')).toBe('Try again later');
    expect(verificationBannerButtonLabel('error')).toBe('Try again');
  });

  // Must match EMAIL_VERIFICATION_RESEND_COOLDOWN_MS in the API. A shorter value here re-arms the
  // button before the server would accept another send, so the retry silently does nothing.
  it('waits out the server-side resend cooldown before re-arming', () => {
    expect(RESEND_COOLDOWN_MS).toBe(60_000);
  });
});
