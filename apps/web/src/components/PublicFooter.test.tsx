import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PublicFooter } from './PublicFooter';

describe('PublicFooter', () => {
  it('keeps legal navigation hidden while publication is closed', () => {
    const html = renderToStaticMarkup(<PublicFooter />);

    expect(html).toContain('Policies pending publication');
    expect(html).not.toContain('href="/privacy"');
    expect(html).not.toContain('href="/terms"');
    expect(html).not.toContain('href="/refund-policy"');
    expect(html).not.toContain('href="#"');
  });

  it('reveals all legal routes after publication', () => {
    const html = renderToStaticMarkup(<PublicFooter legalPublished />);

    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/refund-policy"');
    expect(html).not.toContain('Policies pending publication');
  });

  it('does not read or render seller details from the client environment', () => {
    vi.stubEnv('LEGAL_SELLER_NAME', 'Private Seller Value');
    vi.stubEnv('LEGAL_SELLER_ADDRESS', 'Private Address Value');

    const html = renderToStaticMarkup(<PublicFooter legalPublished />);

    expect(html).not.toContain('Private Seller Value');
    expect(html).not.toContain('Private Address Value');
    vi.unstubAllEnvs();
  });
});
