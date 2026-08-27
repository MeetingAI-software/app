import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BackgroundPaths } from './background-paths';

describe('BackgroundPaths', () => {
  // The secondary CTA used to point at /s/demo — a share-token route with no `demo` token behind
  // it, so every visitor who pressed it landed on the "Not Found" page instead of an example.
  it('sends the secondary CTA to the walkthrough, not to a share token', () => {
    const html = renderToStaticMarkup(<BackgroundPaths />);

    expect(html).toContain('href="#how-it-works"');
    expect(html).not.toContain('/s/demo');
  });

  it('says what the secondary CTA will show', () => {
    const html = renderToStaticMarkup(<BackgroundPaths />);

    expect(html).toContain('See how it works');
  });

  // Both hero CTAs have to survive with JavaScript disabled: the walkthrough anchor resolves on
  // its href alone, and Get Started still reaches the app.
  it('keeps both hero calls to action working as plain links', () => {
    const html = renderToStaticMarkup(<BackgroundPaths />);

    expect(html).toContain('href="/meetings"');
    expect(html).toContain('Get Started');
  });
});
