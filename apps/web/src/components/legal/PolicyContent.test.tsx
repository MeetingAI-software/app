import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PolicyContent } from './PolicyContent';

const seller = {
  name: 'Example Seller',
  address: 'Public address',
  country: 'Sweden',
  email: 'legal@example.test',
  phone: '+46 00 000 00 00',
};

describe('legal policy content', () => {
  it.each(['privacy', 'terms', 'refund'] as const)('renders the English %s policy', (kind) => {
    const html = renderToStaticMarkup(<PolicyContent kind={kind} locale="en" seller={seller} />);
    expect(html).toContain(kind === 'refund' ? 'legal@example.test' : 'Example Seller');
  });

  it.each(['privacy', 'terms', 'refund'] as const)('renders the Swedish %s policy', (kind) => {
    const html = renderToStaticMarkup(<PolicyContent kind={kind} locale="sv" seller={seller} />);
    expect(html).toContain(kind === 'refund' ? 'legal@example.test' : 'Example Seller');
  });

  it('does not claim complete EU data residency', () => {
    const html = renderToStaticMarkup(<PolicyContent kind="privacy" locale="en" seller={seller} />);
    expect(html).toContain('We do not claim complete EU data residency');
  });

  it('keeps the commercial guarantee separate from statutory rights', () => {
    const html = renderToStaticMarkup(<PolicyContent kind="refund" locale="en" seller={seller} />);
    expect(html).toContain('additional to, and does not limit, mandatory rights');
  });
});
