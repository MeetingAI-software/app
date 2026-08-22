import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { LegalPublication } from '@/lib/legal';
import { LegalPage } from './LegalPage';

const publication: LegalPublication = {
  version: '2026-08-22',
  seller: {
    name: 'Example Seller',
    address: 'Public service address',
    country: 'Sweden',
    email: 'legal@example.test',
    phone: '+46 00 000 00 00',
  },
};

describe('LegalPage navigation', () => {
  it('cross-links the English policies and Swedish alternative', () => {
    const html = renderToStaticMarkup(
      <LegalPage
        locale="en"
        title="Privacy Policy"
        description="Description"
        alternateHref="/sv/privacy"
        publication={publication}
      >
        <p>Policy</p>
      </LegalPage>,
    );

    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/refund-policy"');
    expect(html).toContain('href="/sv/privacy"');
    expect(html).toContain('hrefLang="sv"');
  });

  it('cross-links the Swedish policies and English alternative', () => {
    const html = renderToStaticMarkup(
      <LegalPage
        locale="sv"
        title="Integritetspolicy"
        description="Beskrivning"
        alternateHref="/privacy"
        publication={publication}
      >
        <p>Policy</p>
      </LegalPage>,
    );

    expect(html).toContain('href="/sv/privacy"');
    expect(html).toContain('href="/sv/terms"');
    expect(html).toContain('href="/sv/refund-policy"');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('hrefLang="en"');
  });
});
