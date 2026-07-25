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
import { createAuthRoutes } from './auth.routes';

describe('POST /api/auth/verify-email', () => {
  const verifyEmail = vi.fn();
  let server: Server;
  let baseUrl: string;

  beforeAll(() => {
    const auth = {
      signup: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      getUserForToken: vi.fn(),
      verifyEmail,
      resendVerification: vi.fn(),
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
    verifyEmail.mockReset();
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

  it('returns the verified user for a valid token', async () => {
    verifyEmail.mockResolvedValue({
      id: 'user-1',
      email: 'person@example.com',
      emailVerified: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const response = await request('valid-token');
    const body = await response.json() as { user: { email: string; emailVerified: boolean } };

    expect(response.status).toBe(200);
    expect(verifyEmail).toHaveBeenCalledWith('valid-token');
    expect(body.user).toMatchObject({ email: 'person@example.com', emailVerified: true });
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
});
