import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import EmailVerificationBanner from './EmailVerificationBanner';

describe('EmailVerificationBanner', () => {
  it('renders the destination, expiry guidance, resend action, and live status region', () => {
    const html = renderToStaticMarkup(
      <EmailVerificationBanner email="person@example.com" />,
    );

    expect(html).toContain('Verify your email address');
    expect(html).toContain('person@example.com');
    expect(html).toContain('expires after 24 hours');
    expect(html).toContain('Resend email');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-label="Email verification required"');
  });
});
