import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer } from '../server';
import { createAuthRoutes } from './auth.routes';
import { GoogleOAuthStateService } from '../../../application/google-oauth-state.service';
import { GoogleOAuthExchangeService } from '../../../application/google-oauth-exchange.service';
import type { GoogleOAuthChallenge } from '../../../ports/google-oauth-state.port';
import type { AuthService, AuthServiceApi } from '../../../application/auth.service';
import { config } from '../../../config/env';
import { InvalidCredentialsError } from '../../../domain/errors';

const google = vi.hoisted(() => ({
  getToken: vi.fn(), verifyIdToken: vi.fn(), generateAuthUrl: vi.fn(), setCredentials: vi.fn(),
  clientOptions: vi.fn(), acquire: vi.fn(), release: vi.fn(),
}));
vi.mock('google-auth-library', () => ({ OAuth2Client: class {
  constructor(options: unknown) { google.clientOptions(options); }
  transporter = { interceptors: { request: { add: vi.fn() } } };
  getToken = google.getToken;
  verifyIdToken = google.verifyIdToken;
  generateAuthUrl = google.generateAuthUrl;
  setCredentials = google.setCredentials;
} }));

describe('active Google account linking', () => {
  const owner = {
    id: '00000000-0000-4000-8000-000000000001', email: 'owner@example.com',
    emailVerified: true, hasPassword: true, hasGoogleLogin: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
  const beginGoogleLink = vi.fn();
  const completeGoogleLink = vi.fn();
  const getUserForToken = vi.fn();
  const prior = {
    clientId: config.GOOGLE_CLIENT_ID, clientSecret: config.GOOGLE_CLIENT_SECRET,
    redirectUri: config.GOOGLE_REDIRECT_URI,
  };
  let server: Server;
  let baseUrl: string;

  beforeAll(() => {
    config.GOOGLE_CLIENT_ID = 'synthetic-client';
    config.GOOGLE_CLIENT_SECRET = 'synthetic-secret';
    const records = new Map<string, GoogleOAuthChallenge>();
    const oauthStates = new GoogleOAuthStateService({
      issue: async record => { records.set(record.stateHash, record); return true; },
      claim: async (hash, now) => {
        const record = records.get(hash);
        if (!record || record.expiresAt <= now) return null;
        records.delete(hash);
        return record;
      },
    });
    const auth = { beginGoogleLink, completeGoogleLink, getUserForToken } as unknown as AuthService & AuthServiceApi;
    const exchanges = new GoogleOAuthExchangeService({
      acquire: google.acquire, release: google.release,
    });
    const app = createServer([createAuthRoutes(auth, undefined, oauthStates, undefined, exchanges)],
      async token => token === 'session-one' || token === 'session-two' ? owner : null);
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    config.GOOGLE_REDIRECT_URI = `${baseUrl}/api/auth/google/callback`;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    google.acquire.mockResolvedValue(true);
    google.release.mockResolvedValue(undefined);
    beginGoogleLink.mockResolvedValue(1);
    completeGoogleLink.mockResolvedValue(undefined);
    getUserForToken.mockImplementation(async token =>
      token === 'session-one' || token === 'session-two' ? owner : null);
    google.generateAuthUrl.mockImplementation(({ state, nonce }) =>
      `https://accounts.google.com/o/oauth2/v2/auth?state=${state}&nonce=${nonce}`);
    google.getToken.mockResolvedValue({ tokens: { id_token: 'signed-id-token' } });
  });

  afterAll(async () => {
    config.GOOGLE_CLIENT_ID = prior.clientId;
    config.GOOGLE_CLIENT_SECRET = prior.clientSecret;
    config.GOOGLE_REDIRECT_URI = prior.redirectUri;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });

  async function begin(password = 'current-password') {
    const response = await fetch(`${baseUrl}/api/auth/google/link`, {
      method: 'POST', headers: {
        origin: config.WEB_ORIGIN, 'content-type': 'application/json', cookie: 'session=session-one',
      }, body: JSON.stringify({ currentPassword: password }),
    });
    const body = await response.json() as { url?: string };
    return { response, body, state: body.url ? new URL(body.url).searchParams.get('state') : null,
      nonce: body.url ? new URL(body.url).searchParams.get('nonce') : null };
  }

  function callback(state: string, session: string, code = 'authorization-code') {
    return fetch(`${baseUrl}/api/auth/google/callback?state=${state}&code=${code}`, {
      redirect: 'manual', headers: { cookie: `oauth_state=${state}; session=${session}` },
    });
  }

  it('requires current password, then links a matching verified subject once', async () => {
    beginGoogleLink.mockRejectedValueOnce(new InvalidCredentialsError('bad password'));
    const denied = await begin();
    expect(denied.response.status).toBe(401);
    expect(denied.body.url).toBeUndefined();

    const { response, state, nonce } = await begin();
    expect(response.status).toBe(200);
    expect(google.generateAuthUrl).toHaveBeenCalledWith(expect.objectContaining({
      scope: expect.arrayContaining(['openid']), state, nonce,
    }));
    google.verifyIdToken.mockResolvedValue({ getPayload: () => ({
      sub: 'google-sub', email: owner.email, email_verified: true, nonce,
    }) });
    const linked = await callback(state!, 'session-one');
    expect(linked.headers.get('location')).toBe(`${config.WEB_ORIGIN}/settings?google=linked`);
    expect(completeGoogleLink).toHaveBeenCalledWith(owner.id, 'google-sub', owner.email, 1);
    expect(google.verifyIdToken).toHaveBeenCalledWith({
      idToken: 'signed-id-token', audience: 'synthetic-client',
    });
    expect(google.clientOptions).toHaveBeenCalledWith(expect.objectContaining({
      transporterOptions: { timeout: 8_000, retry: false },
    }));
    expect(google.release).toHaveBeenCalledTimes(1);
    const replay = await callback(state!, 'session-one');
    expect(replay.headers.get('location')).toBe(`${config.WEB_ORIGIN}/login?error=oauth_state_invalid`);
    expect(completeGoogleLink).toHaveBeenCalledTimes(1);
  });

  it('rejects a different session before contacting Google', async () => {
    const { state } = await begin();
    const swapped = await callback(state!, 'session-two');
    expect(swapped.headers.get('location')).toBe(`${config.WEB_ORIGIN}/login?error=oauth_state_invalid`);
    expect(google.getToken).not.toHaveBeenCalled();
    expect(completeGoogleLink).not.toHaveBeenCalled();
  });

  it('does not contact Google when all shared exchange slots are leased', async () => {
    const { state } = await begin();
    google.acquire.mockResolvedValueOnce(false);
    const blocked = await callback(state!, 'session-one');
    expect(blocked.headers.get('location')).toBe(`${config.WEB_ORIGIN}/login?error=oauth_busy`);
    expect(google.getToken).not.toHaveBeenCalled();
    expect(google.release).not.toHaveBeenCalled();
  });

  it('releases its provider slot after a failed token request', async () => {
    const { state } = await begin();
    google.getToken.mockRejectedValueOnce(new Error('synthetic provider failure'));
    const failed = await callback(state!, 'session-one');
    expect(failed.headers.get('location')).toBe(`${config.WEB_ORIGIN}/login?error=oauth_error`);
    expect(google.release).toHaveBeenCalledTimes(1);
  });

  it('rejects a valid Google token whose nonce differs from the initiated challenge', async () => {
    const { state } = await begin();
    google.verifyIdToken.mockResolvedValue({ getPayload: () => ({
      sub: 'google-sub', email: owner.email, email_verified: true, nonce: 'attacker-nonce',
    }) });
    const swapped = await callback(state!, 'session-one');
    expect(swapped.headers.get('location')).toBe(`${config.WEB_ORIGIN}/login?error=oauth_payload_invalid`);
    expect(completeGoogleLink).not.toHaveBeenCalled();
  });
});
