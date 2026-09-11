import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SettingsPageClient } from './SettingsPageClient';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

describe('SettingsPageClient withdrawal navigation', () => {
  it('keeps the Paddle withdrawal route hidden while legal publication is closed', () => {
    const html = renderToStaticMarkup(<SettingsPageClient legalPublished={false} />);

    expect(html).not.toContain('Exercise withdrawal right');
    expect(html).not.toContain('href="https://paddle.net"');
  });

  it('shows the clearly labeled Paddle route after legal publication', () => {
    const html = renderToStaticMarkup(<SettingsPageClient legalPublished />);

    expect(html).toContain('Exercise withdrawal right');
    expect(html).toContain('href="https://paddle.net"');
  });

  it('tells the account holder that withdrawal is not a refund request', () => {
    const html = renderToStaticMarkup(<SettingsPageClient legalPublished />);

    expect(html).toContain('rather than a general refund request');
    expect(html).not.toContain('Request refund');
  });
});
