import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthService, AuthServiceApi } from '../../../application/auth.service';
import {
  EmailAlreadyVerifiedError,
  EmailSendBudgetExhaustedError,
  ExpiredVerificationTokenError,
  InvalidVerificationTokenError,
  UsedVerificationTokenError,
} from '../../../domain/errors';
import { config } from '../../../config/env';
import { createServer } from '../server';
import { createAuthRoutes, hasVerifiedGoogleEmail } from './auth.routes';

describe('hasVerifiedGoogleEmail', () => {
  it('accepts only Google identities with a verified email', () => {
    expect(hasVerifiedGoogleEmail({
      email: 'person@example.com',
      sub: 'google-user',
      email_verified: true,
    })).toBe(true);
    expect(hasVerifiedGoogleEmail({
      email: 'person@example.com',
      sub: 'google-user',
      email_verified: false,
    })).toBe(false);
    expect(hasVerifiedGoogleEmail({ sub: 'google-user', email_verified: true })).toBe(false);
    expect(hasVerifiedGoogleEmail(undefined)).toBe(false);
  });
});

describe('auth routes', () => {
  const registrationEvidence = {
    organizationName: 'Example AB',
    businessUseConfirmed: true,
    termsVersion: '2026-08-24',
  } as const;
  const signup = vi.fn();
  const login = vi.fn();
  const getUserForToken = vi.fn();
  const verifyEmail = vi.fn();
  const resendVerification = vi.fn();
  let server: Server;
  let baseUrl: string;

  beforeAll(() => {
    const auth = {
      signup,
      login,
      logout: vi.fn(),
      getUserForToken,
      verifyEmail,
      resendVerification,
      changePassword: vi.fn(),
      changeEmail: vi.fn(),
      deleteAccount: vi.fn(),
      loginOrCreateGoogleUser: vi.fn(),
    } as unknown as AuthService & AuthServiceApi;
    const app = createServer([createAuthRoutes(auth)], async () => null);
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(() => {
    signup.mockReset();
    login.mockReset();
    getUserForToken.mockReset();
    verifyEmail.mockReset();
    resendVerification.mockReset();
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });

  async function request(token: unknown) {
    return fetch(`${baseUrl}/api/auth/verify-email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: config.WEB_ORIGIN },
      body: JSON.stringify({ token }),
    });
  }

  async function requestResend(email: unknown) {
    return fetch(`${baseUrl}/api/auth/resend-verification`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: config.WEB_ORIGIN },
      body: JSON.stringify({ email }),
    });
  }

  const unverifiedUser = {
    id: 'user-unverified',
    email: 'pending@example.com',
    emailVerified: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  it.each([
    ['/api/auth/signup', signup, 201],
    ['/api/auth/login', login, 200],
  ])('returns explicit pending verification status from %s', async (path, handler, expectedStatus) => {
    handler.mockResolvedValue({
      user: unverifiedUser,
      sessionToken: 'session-token',
      expiresAt: new Date(Date.now() + 60_000),
    });

    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: config.WEB_ORIGIN },
      body: JSON.stringify({ email: unverifiedUser.email, password: 'a-good-password', ...registrationEvidence }),
    });
    const body = await response.json() as {
      user: { emailVerified: boolean };
      emailVerificationRequired: boolean;
    };

    expect(response.status).toBe(expectedStatus);
    expect(body.user.emailVerified).toBe(false);
    expect(body.emailVerificationRequired).toBe(true);
    expect(response.headers.get('set-cookie')).toContain('session=session-token');
  });

  it('returns verification status from the session probe', async () => {
    getUserForToken.mockResolvedValue(unverifiedUser);

    const response = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { cookie: 'session=session-token' },
    });
    const body = await response.json() as {
      user: { emailVerified: boolean };
      emailVerificationRequired: boolean;
    };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      user: { emailVerified: false },
      emailVerificationRequired: true,
    });
  });

  it('binds Google OAuth to a single-use browser state cookie', async () => {
    const previous = {
      clientId: config.GOOGLE_CLIENT_ID,
      clientSecret: config.GOOGLE_CLIENT_SECRET,
      redirectUri: config.GOOGLE_REDIRECT_URI,
    };
    config.GOOGLE_CLIENT_ID = 'google-client-id';
    config.GOOGLE_CLIENT_SECRET = 'google-client-secret';
    config.GOOGLE_REDIRECT_URI = `${baseUrl}/api/auth/google/callback`;

    try {
      const start = await fetch(`${baseUrl}/api/auth/google`, { redirect: 'manual' });
      expect(start.status).toBe(302);
      const location = new URL(start.headers.get('location') as string);
      const state = location.searchParams.get('state');
      expect(state).toMatch(/^[A-Za-z0-9_-]{40,}$/);

      const setCookie = start.headers.get('set-cookie') as string;
      expect(setCookie).toContain(`oauth_state=${state}`);
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Lax');

      const missing = await fetch(`${baseUrl}/api/auth/google/callback?code=unused`, { redirect: 'manual' });
      expect(missing.headers.get('location')).toBe(`${config.WEB_ORIGIN}/login?error=oauth_state_invalid`);

      const mismatch = await fetch(`${baseUrl}/api/auth/google/callback?code=unused&state=attacker`, {
        redirect: 'manual',
        headers: { cookie: `oauth_state=${state}` },
      });
      expect(mismatch.headers.get('location')).toBe(`${config.WEB_ORIGIN}/login?error=oauth_state_invalid`);

      // A correct state reaches ordinary callback validation and is consumed even though code is absent.
      const validState = await fetch(`${baseUrl}/api/auth/google/callback?state=${state}`, {
        redirect: 'manual',
        headers: { cookie: `oauth_state=${state}` },
      });
      expect(validState.headers.get('location')).toBe(`${config.WEB_ORIGIN}/login?error=oauth_failed`);
      expect(validState.headers.get('set-cookie')).toContain('oauth_state=;');
    } finally {
      config.GOOGLE_CLIENT_ID = previous.clientId;
      config.GOOGLE_CLIENT_SECRET = previous.clientSecret;
      config.GOOGLE_REDIRECT_URI = previous.redirectUri;
    }
  });

  it('returns the verified user for a valid token', async () => {
    verifyEmail.mockResolvedValue({
      id: 'user-1',
      email: 'person@example.com',
      emailVerified: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const response = await request('valid-token');
    const body = await response.json() as {
      user: { email: string; emailVerified: boolean };
      emailVerificationRequired: boolean;
    };

    expect(response.status).toBe(200);
    expect(verifyEmail).toHaveBeenCalledWith('valid-token');
    expect(body.user).toMatchObject({ email: 'person@example.com', emailVerified: true });
    expect(body.emailVerificationRequired).toBe(false);
  });

  it('exposes the complete transition from pending signup to verified session status', async () => {
    const verifiedUser = { ...unverifiedUser, emailVerified: true };
    signup.mockResolvedValue({
      user: unverifiedUser,
      sessionToken: 'lifecycle-session',
      expiresAt: new Date(Date.now() + 60_000),
    });
    getUserForToken
      .mockResolvedValueOnce(unverifiedUser)
      .mockResolvedValueOnce(verifiedUser);
    verifyEmail.mockResolvedValue(verifiedUser);

    const signupResponse = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: config.WEB_ORIGIN },
      body: JSON.stringify({ email: unverifiedUser.email, password: 'a-good-password', ...registrationEvidence }),
    });
    const sessionCookie = signupResponse.headers.get('set-cookie')?.split(';')[0];
    const pendingResponse = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { cookie: sessionCookie as string },
    });
    const verificationResponse = await request('lifecycle-token');
    const verifiedResponse = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { cookie: sessionCookie as string },
    });

    await expect(signupResponse.json()).resolves.toMatchObject({
      user: { emailVerified: false },
      emailVerificationRequired: true,
    });
    await expect(pendingResponse.json()).resolves.toMatchObject({
      user: { emailVerified: false },
      emailVerificationRequired: true,
    });
    await expect(verificationResponse.json()).resolves.toMatchObject({
      user: { emailVerified: true },
      emailVerificationRequired: false,
    });
    await expect(verifiedResponse.json()).resolves.toMatchObject({
      user: { emailVerified: true },
      emailVerificationRequired: false,
    });
    expect(sessionCookie).toBe('session=lifecycle-session');
  });

  it('returns a validation error when the token is missing', async () => {
    const response = await request(undefined);
    const body = await response.json() as { error: { code: string } };

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(verifyEmail).not.toHaveBeenCalled();
  });

  it.each([
    [new InvalidVerificationTokenError(), 400, 'INVALID_VERIFICATION_TOKEN'],
    [new ExpiredVerificationTokenError(), 410, 'VERIFICATION_TOKEN_EXPIRED'],
    [new UsedVerificationTokenError(), 409, 'VERIFICATION_TOKEN_USED'],
    [new EmailAlreadyVerifiedError(), 409, 'EMAIL_ALREADY_VERIFIED'],
  ])('maps %s to HTTP %i with code %s', async (error, expectedStatus, expectedCode) => {
    verifyEmail.mockRejectedValue(error);

    const response = await request('rejected-token');
    const body = await response.json() as { error: { code: string; message: string } };

    expect(response.status).toBe(expectedStatus);
    expect(body.error.code).toBe(expectedCode);
    expect(body.error.message).toBe(error.message);
  });

  it('returns a neutral resend response without exposing account state', async () => {
    resendVerification.mockResolvedValue(undefined);

    const response = await requestResend('person@example.com');
    const body = await response.json() as { message: string };

    expect(response.status).toBe(200);
    expect(resendVerification).toHaveBeenCalledWith('person@example.com');
    expect(body.message).toBe('If an account exists, a new verification link has been sent.');
  });

  it('rejects malformed resend input before invoking the service', async () => {
    const response = await requestResend('not-an-email');
    const body = await response.json() as { error: { code: string } };

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(resendVerification).not.toHaveBeenCalled();
  });

  // The limiter buckets on ip+email, so a dedicated address keeps this isolated from the tests
  // above even though they all share the loopback IP and one long-lived server.
  it('rate-limits resend attempts for the same address', async () => {
    resendVerification.mockResolvedValue(undefined);
    const target = 'flood@example.com';

    const allowed = [
      await requestResend(target),
      await requestResend(target),
      await requestResend(target),
    ];
    const blocked = await requestResend(target);
    const body = await blocked.json() as { error: { code: string } };

    expect(allowed.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(blocked.status).toBe(429);
    expect(body.error.code).toBe('RATE_LIMITED');
    // The 4th never reaches the service, so no email is generated for it.
    expect(resendVerification).toHaveBeenCalledTimes(3);
  });

  // 503 rather than 429: the caller has no per-client quota to back off from — the whole service
  // is out of send budget. A fresh address keeps this clear of the resend bucket used above.
  it('maps an exhausted send budget on resend to 503', async () => {
    resendVerification.mockRejectedValue(new EmailSendBudgetExhaustedError());

    const response = await requestResend('budget@example.com');
    const body = await response.json() as { error: { code: string } };

    expect(response.status).toBe(503);
    expect(body.error.code).toBe('EMAIL_BUDGET_EXHAUSTED');
  });

  // The signup limiter keys on the IP alone, so the "unique email per test" trick used above
  // cannot isolate it — every test shares the loopback address. `trust proxy: 2` makes the first
  // of two forwarded entries the client IP (proven in server.test.ts), so a synthetic
  // x-forwarded-for gives each test its own bucket without disturbing the loopback one.
  async function requestSignup(email: string, clientIp: string) {
    return fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: config.WEB_ORIGIN,
        'x-forwarded-for': `${clientIp}, 10.0.0.1`,
      },
      body: JSON.stringify({ email, password: 'a-good-password', ...registrationEvidence }),
    });
  }

  it('fails closed when public registration is disabled', async () => {
    const previous = config.PUBLIC_REGISTRATION_ENABLED;
    config.PUBLIC_REGISTRATION_ENABLED = false;
    try {
      const response = await requestSignup('closed@example.com', '203.0.113.30');
      const body = await response.json() as { error: { code: string } };
      expect(response.status).toBe(503);
      expect(body.error.code).toBe('REGISTRATION_DISABLED');
      expect(signup).not.toHaveBeenCalled();
    } finally {
      config.PUBLIC_REGISTRATION_ENABLED = previous;
    }
  });

  it('rejects stale legal acceptance without creating an account', async () => {
    const response = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json', origin: config.WEB_ORIGIN,
        'x-forwarded-for': '203.0.113.31, 10.0.0.1',
      },
      body: JSON.stringify({
        email: 'stale-policy@example.com', password: 'a-good-password',
        ...registrationEvidence, termsVersion: '2026-01-01',
      }),
    });

    expect(response.status).toBe(409);
    expect(signup).not.toHaveBeenCalled();
  });

  // The regression test for the hole this limiter exists to close: the older signup limiter keyed
  // on ip+email, so six different addresses meant six untouched buckets and all six went through —
  // unlimited account creation, each one spending a verification email from the daily quota.
  it('rate-limits signup per IP regardless of the email (5 allowed, 6th blocked)', async () => {
    signup.mockResolvedValue({
      user: unverifiedUser,
      sessionToken: 'session-token',
      expiresAt: new Date(Date.now() + 60_000),
    });

    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await requestSignup(`flood-${i}@example.com`, '203.0.113.10')).status);
    }
    const blocked = await requestSignup('flood-6@example.com', '203.0.113.10');
    const body = await blocked.json() as { error: { code: string } };

    expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
    expect(body.error.code).toBe('RATE_LIMITED');
    // Six distinct addresses, but only five ever reached the service — so only five emails.
    expect(signup).toHaveBeenCalledTimes(5);
    expect(blocked.headers.get('retry-after')).toBeTruthy();
  });

  it('keeps signup buckets separate per client IP', async () => {
    signup.mockResolvedValue({
      user: unverifiedUser,
      sessionToken: 'session-token',
      expiresAt: new Date(Date.now() + 60_000),
    });

    for (let i = 0; i < 5; i++) await requestSignup(`walled-${i}@example.com`, '203.0.113.20');
    const walled = await requestSignup('walled-5@example.com', '203.0.113.20');
    const neighbour = await requestSignup('neighbour@example.com', '203.0.113.21');

    expect(walled.status).toBe(429);
    expect(neighbour.status).toBe(201); // a different household is not punished for the flood
  });
});

// Its own server: the suite above authenticates as null, so req.userId is never set and every
// change-email call would 401 before reaching the limiter. A second createAuthRoutes() call also
// builds fresh limiter closures, which keeps this bucket clear of the signup tests.
describe('auth routes — change-email rate limit', () => {
  const changeEmail = vi.fn();
  let server: Server;
  let baseUrl: string;

  const owner = {
    id: 'user-owner',
    email: 'owner@example.com',
    emailVerified: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  beforeAll(() => {
    const auth = {
      signup: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      getUserForToken: vi.fn(),
      verifyEmail: vi.fn(),
      resendVerification: vi.fn(),
      changePassword: vi.fn(),
      changeEmail,
      deleteAccount: vi.fn(),
      loginOrCreateGoogleUser: vi.fn(),
    } as unknown as AuthService & AuthServiceApi;
    const app = createServer([createAuthRoutes(auth)], async () => owner);
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });

  async function requestChangeEmail(newEmail: string) {
    return fetch(`${baseUrl}/api/auth/change-email`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: config.WEB_ORIGIN,
        cookie: 'session=session-token',
      },
      body: JSON.stringify({ currentPassword: 'a-good-password', newEmail }),
    });
  }

  // Each call mails an address the caller chose, so the old 10/15-min account bucket let one
  // account fire 40 verification emails an hour at any third party it liked.
  it('rate-limits change-email per account (3 per hour, 4th blocked)', async () => {
    changeEmail.mockImplementation(async (_userId: string, _password: string, newEmail: string) => ({
      ...owner,
      email: newEmail,
    }));

    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      statuses.push((await requestChangeEmail(`target-${i}@example.com`)).status);
    }

    expect(statuses).toEqual([200, 200, 200, 429]);
    expect(changeEmail).toHaveBeenCalledTimes(3);
  });
});
