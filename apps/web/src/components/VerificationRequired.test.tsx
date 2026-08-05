import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import VerificationRequired from './VerificationRequired';

function render() {
  return renderToStaticMarkup(
    <VerificationRequired
      user={{ email: 'person@example.com' }}
      onLogout={() => {}}
      onEmailChanged={() => {}}
    />,
  );
}

describe('VerificationRequired', () => {
  it('renders the destination, expiry guidance, resend action, and live status region', () => {
    const html = render();

    expect(html).toContain('Check your email');
    expect(html).toContain('person@example.com');
    expect(html).toContain('expires after 24 hours');
    expect(html).toContain('Resend email');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-label="Email verification required"');
  });

  // A typo'd address is otherwise a dead account: no mail arrives and every route that could fix it
  // is gated. These two ways out have to be on the page itself, because nothing else is reachable.
  it('offers the only two escape hatches the API still accepts', () => {
    const html = render();

    expect(html).toContain('Change it');
    expect(html).toContain('Log out');
  });
});
