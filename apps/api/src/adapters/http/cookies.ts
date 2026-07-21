import type { Request, Response } from 'express';
import { config } from '../../config/env';

export const SESSION_COOKIE = 'session';

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
export function readSessionCookie(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === SESSION_COOKIE) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}
