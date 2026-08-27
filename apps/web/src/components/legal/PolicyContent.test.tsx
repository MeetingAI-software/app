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

  it.each([
    ['en', 'Exercise withdrawal right through Paddle'],
    ['sv', 'Utöva ångerrätten genom Paddle'],
  ] as const)('links the %s refund policy to the hosted Paddle flow', (locale, label) => {
    const html = renderToStaticMarkup(<PolicyContent kind="refund" locale={locale} seller={seller} />);

    expect(html).toContain(`href="https://paddle.net"`);
    expect(html).toContain(label);
  });

  it.each([
    ['en', 'rather than a general refund request'],
    ['sv', 'i stället för en allmän begäran om återbetalning'],
  ] as const)('tells %s readers that withdrawal is not a refund request', (locale, marker) => {
    const html = renderToStaticMarkup(<PolicyContent kind="refund" locale={locale} seller={seller} />);

    expect(html).toContain(marker);
    expect(html).not.toContain('Request refund');
  });

  it.each(['en', 'sv'] as const)('does not present submission as approval in %s', (locale) => {
    const html = renderToStaticMarkup(<PolicyContent kind="terms" locale={locale} seller={seller} />);

    expect(html).toContain('Merchant of Record');
    expect(html).toMatch(locale === 'en'
      ? /Submitting a request is not itself approval/
      : /Att skicka en begäran innebär inte i sig att den har godkänts/);
  });
});
