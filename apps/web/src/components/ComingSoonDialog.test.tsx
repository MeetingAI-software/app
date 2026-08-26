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
    expect(html).toContain('Notify me at launch');
  });

  it('explains that checkout is closed on the upgrade variant', () => {
    const html = renderToStaticMarkup(<ComingSoonDialog variant="upgrade" onClose={() => {}} />);

    expect(html).toContain(COMING_SOON_COPY.upgrade.title);
    expect(html).toContain('Checkout is paused');
    expect(html).not.toContain(COMING_SOON_COPY.signin.title);
  });
});
