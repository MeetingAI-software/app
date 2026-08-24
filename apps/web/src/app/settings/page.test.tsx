import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SettingsPage from './page';

vi.mock('next/server', () => ({
  connection: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

const completeLegalEnvironment = {
  LEGAL_POLICIES_PUBLISHED: 'true',
  LEGAL_WITHDRAWAL_FLOW_APPROVED: 'true',
  LEGAL_POLICIES_VERSION: '2026-08-24',
  LEGAL_SELLER_NAME: 'Preview Test Seller',
  LEGAL_SELLER_ADDRESS: 'Preview Test Address',
  LEGAL_SELLER_COUNTRY: 'Sweden',
  LEGAL_SELLER_EMAIL: 'legal@example.test',
  LEGAL_SELLER_PHONE: '+46 00 000 00 00',
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Settings legal publication wiring', () => {
  it('passes the closed publication state to Settings', async () => {
    for (const [key, value] of Object.entries({
      ...completeLegalEnvironment,
      LEGAL_POLICIES_PUBLISHED: 'false',
    })) vi.stubEnv(key, value);

    const html = renderToStaticMarkup(await SettingsPage());

    expect(html).not.toContain('Exercise withdrawal right');
    expect(html).not.toContain('href="https://paddle.net"');
  });

  it('passes an approved publication state to the authenticated Settings content', async () => {
    for (const [key, value] of Object.entries(completeLegalEnvironment)) vi.stubEnv(key, value);

    const html = renderToStaticMarkup(await SettingsPage());

    expect(html).toContain('Exercise withdrawal right');
    expect(html).toContain('href="https://paddle.net"');
    expect(html).toContain('Request refund');
  });
});
