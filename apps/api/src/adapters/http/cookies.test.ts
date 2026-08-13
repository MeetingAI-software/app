import type { AddressInfo } from 'net';
import type { Server } from 'http';
import type { Request } from 'express';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '../../config/env';
import { SESSION_COOKIE, clearSessionCookie, readSessionCookie, setSessionCookie } from './cookies';

// ---------------------------------------------------------------------------
// The session cookie is the whole of "you are logged in". Nothing else in the
// suite asserts its flags or how it is parsed back.
//
// The write side is exercised through a real express response rather than a
// stubbed `res`, because what is under test is the serialised header the
// browser actually receives — the flags only mean anything on the wire.
// ---------------------------------------------------------------------------

const EXPIRES = new Date('2026-09-01T12:00:00.000Z');

function req(cookie?: string): Request {
  return { headers: cookie === undefined ? {} : { cookie } } as unknown as Request;
}

describe('readSessionCookie', () => {
  it('returns null when the request carries no cookies at all', () => {
    expect(readSessionCookie(req())).toBeNull();
  });

  it('reads the token when the session cookie is the only one', () => {
    expect(readSessionCookie(req('session=abc123'))).toBe('abc123');
  });

  it('finds it whichever position it holds in the header', () => {
    expect(readSessionCookie(req('other=1; session=abc123'))).toBe('abc123');
    expect(readSessionCookie(req('session=abc123; other=1'))).toBe('abc123');
    expect(readSessionCookie(req('a=1; session=abc123; b=2'))).toBe('abc123');
  });

  // Name matching must be exact. A substring or prefix match would let any cookie the attacker can
  // plant on a sibling subdomain — `xsession`, `session_backup` — be read as the real session.
  it.each([
    ['notsession=abc123'],
    ['xsession=abc123'],
    ['session_backup=abc123'],
    ['sess=abc123'],
  ])('does not mistake %s for the session cookie', (header) => {
    expect(readSessionCookie(req(header))).toBeNull();
  });

  it('picks the real session cookie out from beside a look-alike', () => {
    expect(readSessionCookie(req('xsession=decoy; session=real'))).toBe('real');
  });

  it('decodes a percent-encoded value', () => {
    expect(readSessionCookie(req('session=a%20b'))).toBe('a b');
  });

  it('tolerates surrounding whitespace', () => {
    expect(readSessionCookie(req('  session=abc123  '))).toBe('abc123');
  });

  it('skips malformed segments that carry no "="', () => {
    expect(readSessionCookie(req('flag; session=abc123'))).toBe('abc123');
  });

  // An empty value is returned as '' rather than null, and requireUser's `if (!token)` rejects it
  // either way. Pinned so the two stay consistent if this ever grows a stricter return type.
  it('returns an empty string for a present-but-empty cookie', () => {
    expect(readSessionCookie(req('session='))).toBe('');
  });

  it('is named "session" — the name the web app sends', () => {
    expect(SESSION_COOKIE).toBe('session');
  });
});

describe('the session cookie on the wire', () => {
  let server: Server;
  let baseUrl: string;
  let previousNodeEnv: typeof config.NODE_ENV;

  beforeAll(() => {
    previousNodeEnv = config.NODE_ENV;

    const app = express();
    app.get('/set', (_req, res) => {
      setSessionCookie(res, 'tok-123', EXPIRES);
      res.status(200).end();
    });
    app.get('/clear', (_req, res) => {
      clearSessionCookie(res);
      res.status(200).end();
    });

    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    config.NODE_ENV = previousNodeEnv;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });

  async function setCookieHeader(path: '/set' | '/clear'): Promise<string> {
    const response = await fetch(`${baseUrl}${path}`);
    const [header] = response.headers.getSetCookie();
    return header;
  }

  describe('setSessionCookie', () => {
    it('sends the token under the session name', async () => {
      expect(await setCookieHeader('/set')).toContain('session=tok-123');
    });

    // HttpOnly is what keeps a single XSS from becoming account takeover: script on the page can
    // never read the token, only the browser can send it.
    it('marks the cookie HttpOnly so page scripts can never read it', async () => {
      expect(await setCookieHeader('/set')).toContain('HttpOnly');
    });

    // SameSite=Lax is the braces to originCheck's belt (origin-check.test.ts): the browser refuses
    // to attach this cookie to cross-site POSTs on its own.
    it('marks the cookie SameSite=Lax', async () => {
      expect(await setCookieHeader('/set')).toContain('SameSite=Lax');
    });

    it('scopes the cookie to the whole site and carries the session’s own expiry', async () => {
      const header = await setCookieHeader('/set');

      expect(header).toContain('Path=/');
      expect(header).toContain(`Expires=${EXPIRES.toUTCString()}`);
    });

    // Both directions are pinned deliberately. `secure` is off outside production because a Secure
    // cookie is not sent back over http://localhost, which would break local dev — but that
    // exemption must never be what production runs, or the token travels in clear text.
    it('omits Secure outside production, so local development over http still works', async () => {
      config.NODE_ENV = 'test';

      expect(await setCookieHeader('/set')).not.toContain('Secure');
    });

    it('adds Secure in production, so the token never travels over plain http', async () => {
      config.NODE_ENV = 'production';
      try {
        expect(await setCookieHeader('/set')).toContain('Secure');
      } finally {
        config.NODE_ENV = 'test';
      }
    });
  });

  describe('clearSessionCookie', () => {
    it('blanks the value and expires it in the past', async () => {
      const header = await setCookieHeader('/clear');

      expect(header).toContain('session=;');
      expect(header).toContain('Expires=Thu, 01 Jan 1970');
    });

    // Browsers only overwrite a cookie when the flags match the ones it was set with. Logging out
    // with a different Path or SameSite silently leaves the old cookie in place.
    it('repeats the same flags, or the browser would not replace the original', async () => {
      const header = await setCookieHeader('/clear');

      expect(header).toContain('HttpOnly');
      expect(header).toContain('SameSite=Lax');
      expect(header).toContain('Path=/');
    });
  });
});
