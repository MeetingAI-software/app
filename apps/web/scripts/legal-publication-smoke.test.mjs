import { describe, expect, it } from 'vitest';
import { parseArguments, runLegalPublicationSmoke } from './legal-publication-smoke.mjs';

const paths = [
  '/privacy', '/terms', '/refund-policy', '/sv/privacy', '/sv/terms', '/sv/refund-policy',
  '/', '/login', '/signup', '/settings',
];

function response(status, html = '') {
  return { status, text: async () => html };
}

function closedFetch() {
  return async (url) => response(paths.slice(0, 6).includes(url.pathname) ? 404 : 200, '<html>closed</html>');
}

function openFetch(overrides = {}) {
  const alternate = {
    '/privacy': '/sv/privacy', '/terms': '/sv/terms', '/refund-policy': '/sv/refund-policy',
    '/sv/privacy': '/privacy', '/sv/terms': '/terms', '/sv/refund-policy': '/refund-policy',
  };
  return async (url) => {
    if (overrides[url.pathname]) return overrides[url.pathname];
    if (url.pathname === '/settings') return response(200, '<html>protected session shell</html>');
    const links = url.pathname in alternate
      ? `<a href="${alternate[url.pathname]}">language</a>${url.pathname.includes('refund') ? '<a href="https://paddle.net">withdraw</a>' : ''}`
      : '<a href="/privacy">privacy</a><a href="/terms">terms</a><a href="/refund-policy">refund</a><a href="https://paddle.net">withdraw</a>';
    return response(200, links);
  };
}

describe('legal publication smoke', () => {
  it('accepts an explicit origin and publication mode', () => {
    expect(parseArguments(['--base-url', 'https://preview.example.com', '--mode=open'])).toEqual({
      baseUrl: 'https://preview.example.com', mode: 'open',
    });
  });

  it('rejects origins containing credentials or paths', () => {
    expect(() => parseArguments(['--base-url', 'https://user:secret@example.com/app', '--mode', 'closed']))
      .toThrow('origin without credentials');
  });

  it('verifies a closed deployment without sending authentication state', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url: url.href, options });
      return closedFetch()(url);
    };

    const result = await runLegalPublicationSmoke({
      baseUrl: 'https://www.syncmemos.com', mode: 'closed', fetchImpl,
    });

    expect(result.checked).toHaveLength(10);
    expect(calls.every((call) => !('cookie' in call.options.headers) && !('authorization' in call.options.headers))).toBe(true);
  });

  it('verifies public withdrawal navigation without requiring protected Settings HTML', async () => {
    const result = await runLegalPublicationSmoke({
      baseUrl: 'https://preview.example.com', mode: 'open', fetchImpl: openFetch(),
    });
    expect(result.checked).toEqual(paths);
  });

  it('fails without including response content in the error', async () => {
    const privateText = 'private seller address';
    await expect(runLegalPublicationSmoke({
      baseUrl: 'https://preview.example.com', mode: 'open',
      fetchImpl: openFetch({ '/privacy': response(500, privateText) }),
    })).rejects.toThrow('/privacy: expected HTTP 200, received HTTP 500');

    try {
      await runLegalPublicationSmoke({
        baseUrl: 'https://preview.example.com', mode: 'open',
        fetchImpl: openFetch({ '/privacy': response(500, privateText) }),
      });
    } catch (error) {
      expect(error.message).not.toContain(privateText);
    }
  });
});
