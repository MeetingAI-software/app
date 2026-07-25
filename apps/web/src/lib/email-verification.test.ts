import { describe, expect, it } from 'vitest';
import {
  shouldShowEmailVerificationBanner,
  verificationBannerButtonLabel,
} from './email-verification';

describe('email verification banner state', () => {
  it('shows the banner only for authenticated users with an unverified email', () => {
    expect(shouldShowEmailVerificationBanner(null)).toBe(false);
    expect(shouldShowEmailVerificationBanner({ emailVerified: true })).toBe(false);
    expect(shouldShowEmailVerificationBanner({ emailVerified: false })).toBe(true);
  });

  it('provides clear button labels for every resend state', () => {
    expect(verificationBannerButtonLabel('idle')).toBe('Resend email');
    expect(verificationBannerButtonLabel('sending')).toBe('Sending…');
    expect(verificationBannerButtonLabel('sent')).toBe('Email sent');
    expect(verificationBannerButtonLabel('error')).toBe('Try again');
  });
});
