import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ComingSoonDialog } from './ComingSoonDialog';
import { COMING_SOON_COPY } from '@/lib/launch';

describe('ComingSoonDialog', () => {
  it('announces the sign-in wait as a modal dialog', () => {
    const html = renderToStaticMarkup(<ComingSoonDialog variant="signin" onClose={() => {}} />);

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain(COMING_SOON_COPY.signin.title);
    expect(html).toContain('id="waitlist-email"');
    expect(html).toContain('Meddela mig');
  });

  it('explains that checkout is closed on the upgrade variant', () => {
    const html = renderToStaticMarkup(<ComingSoonDialog variant="upgrade" onClose={() => {}} />);

    expect(html).toContain(COMING_SOON_COPY.upgrade.title);
    expect(html).toContain('Betalningen är pausad');
    expect(html).not.toContain(COMING_SOON_COPY.signin.title);
  });

  // The address has to reach the API, not a mail client — a mailto: link silently does nothing on
  // a machine with no mail app configured, which is most of them.
  it('offers a real form rather than a mailto link', () => {
    const html = renderToStaticMarkup(<ComingSoonDialog variant="upgrade" onClose={() => {}} />);

    expect(html).toContain('<form');
    expect(html).toContain('type="email"');
    expect(html).not.toContain('mailto:');
  });

  it('says what the address is used for, right where it is asked for', () => {
    const html = renderToStaticMarkup(<ComingSoonDialog variant="signin" onClose={() => {}} />);

    expect(html).toContain('Vi sparar bara adressen');
  });
});
