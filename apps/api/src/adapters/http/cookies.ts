import type { Request, Response } from 'express';
import crypto from 'crypto';
import { config } from '../../config/env';

export const SESSION_COOKIE = 'session';
export const OAUTH_STATE_COOKIE = 'oauth_state';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

// §2 cookie strategy: HttpOnly; Secure; SameSite=Lax; Path=/; expiry = the session's own expiry.
// `secure` is on only in production — a Secure cookie is not sent back over http://localhost by
// curl or browsers, which would break local dev/testing. Prod (where the DoD checks Secure) is https.
function cookieOptions(expiresAt?: Date) {
  return {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    ...(expiresAt ? { expires: expiresAt } : {}),
  };
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(SESSION_COOKIE, token, cookieOptions(expiresAt));
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

/** Read the raw session token from the Cookie header — no cookie-parser dependency needed. */
function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function readSessionCookie(req: Request): string | null {
  return readCookie(req, SESSION_COOKIE);
}

function oauthStateCookieOptions(includeMaxAge = true) {
  return {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/api/auth/google/callback',
    ...(includeMaxAge ? { maxAge: OAUTH_STATE_TTL_MS } : {}),
  };
}

/** Mint a browser-bound, single-use OAuth correlation value. */
export function setOAuthStateCookie(res: Response): string {
  const state = crypto.randomBytes(32).toString('base64url');
  res.cookie(OAUTH_STATE_COOKIE, state, oauthStateCookieOptions());
  return state;
}

export function clearOAuthStateCookie(res: Response): void {
  res.clearCookie(OAUTH_STATE_COOKIE, oauthStateCookieOptions(false));
}

/** Compare without timing leakage. The route consumes the cookie regardless of the verdict. */
export function matchesOAuthState(req: Request, provided: unknown): boolean {
  const expected = readCookie(req, OAUTH_STATE_COOKIE);
  if (!expected || typeof provided !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
