import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthService, AuthServiceApi } from '../../../application/auth.service';
import {
  EmailAlreadyVerifiedError,
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
      body: JSON.stringify({ email: unverifiedUser.email, password: 'a-good-password' }),
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
      body: JSON.stringify({ email: unverifiedUser.email, password: 'a-good-password' }),
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
});
