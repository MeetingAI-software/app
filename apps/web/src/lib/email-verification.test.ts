import { describe, expect, it } from 'vitest';
import {
  RESEND_COOLDOWN_MS,
  RESEND_RATE_LIMIT_BACKOFF_MS,
  resendRetryDelayMs,
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
    expect(verificationBannerButtonLabel('budget-exhausted')).toBe('Try again');
    expect(verificationBannerButtonLabel('error')).toBe('Try again');
  });

  // Must match EMAIL_VERIFICATION_RESEND_COOLDOWN_MS in the API. A shorter value here re-arms the
  // button before the server would accept another send, so the retry silently does nothing.
  it('waits out the server-side resend cooldown before re-arming', () => {
    expect(RESEND_COOLDOWN_MS).toBe(60_000);
  });

  // Must match resendVerificationLimiter's window in auth.routes.ts (3 per hour). This used to
  // re-arm on the 60s cooldown instead, which walked the user straight into another 429.
  it('waits out the hourly resend limiter, not the 60s cooldown, after a 429', () => {
    expect(RESEND_RATE_LIMIT_BACKOFF_MS).toBe(60 * 60 * 1000);
    expect(resendRetryDelayMs('rate-limited')).toBe(RESEND_RATE_LIMIT_BACKOFF_MS);
  });

  it('picks the re-arm delay from how the last attempt ended', () => {
    expect(resendRetryDelayMs('sent')).toBe(RESEND_COOLDOWN_MS);
    // Nothing to wait out: idle/sending are not terminal, and the global budget clears on the
    // server's own rolling window, so the button stays armed rather than guessing.
    expect(resendRetryDelayMs('idle')).toBeNull();
    expect(resendRetryDelayMs('sending')).toBeNull();
    expect(resendRetryDelayMs('budget-exhausted')).toBeNull();
    expect(resendRetryDelayMs('error')).toBeNull();
  });
});
