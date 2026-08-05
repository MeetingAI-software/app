import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { VerifyEmailState } from '../lib/verify-email';
import EmailVerificationResult from './EmailVerificationResult';

describe('EmailVerificationResult', () => {
  it.each([
    ['verifying', 'Verifying your email', null],
    ['success', 'Email verified', 'Continue to dashboard'],
    ['missing-token', 'Verification link is incomplete', 'Back to login'],
    ['invalid-token', 'Verification link is invalid', 'Back to login'],
    ['expired-token', 'Verification link has expired', 'Go to Syncmemos'],
    ['used-token', 'Verification link was already used', 'Continue to dashboard'],
    ['already-verified', 'Email already verified', 'Continue to dashboard'],
    ['not-persisted', 'That did not save', 'Go to Syncmemos'],
    ['error', 'Verification could not be completed', 'Back to login'],
  ] satisfies Array<[VerifyEmailState, string, string | null]>)('%s renders the correct guidance', (state, title, action) => {
    const html = renderToStaticMarkup(<EmailVerificationResult state={state} />);

    expect(html).toContain(title);
    if (action) expect(html).toContain(action);
    else expect(html).not.toContain('<a');
  });

  it('marks the verifying state as busy for assistive technology', () => {
    const html = renderToStaticMarkup(<EmailVerificationResult state="verifying" />);

    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-busy="true"');
  });
});
