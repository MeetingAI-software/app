import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleDeletionIdentityAdapter } from './google-deletion-identity';
import { config } from '../../config/env';

const mocks = vi.hoisted(() => ({ getToken: vi.fn(), verifyIdToken: vi.fn(), generateAuthUrl: vi.fn() }));
vi.mock('google-auth-library', () => ({ OAuth2Client: class {
  getToken = mocks.getToken;
  verifyIdToken = mocks.verifyIdToken;
  generateAuthUrl = mocks.generateAuthUrl;
} }));

describe('Google deletion OIDC adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.GOOGLE_CLIENT_ID = 'synthetic-client';
    config.GOOGLE_CLIENT_SECRET = 'synthetic-secret';
    config.GOOGLE_REDIRECT_URI = 'https://api.example.test/api/auth/google/callback';
  });

  it('requests openid and the dedicated state/nonce using the registered callback client', () => {
    new GoogleDeletionIdentityAdapter().authorizationUrl('delete.state', 'nonce');
    expect(mocks.generateAuthUrl).toHaveBeenCalledWith({ scope: ['openid'], state: 'delete.state', nonce: 'nonce', prompt: 'select_account' });
  });

  it('requires library signature and audience verification before exposing any claims', async () => {
    mocks.getToken.mockResolvedValue({ tokens: { id_token: 'synthetic-signed-token' } });
    const claims = { sub: 'linked', nonce: 'nonce', aud: 'synthetic-client', iss: 'accounts.google.com', iat: 1, exp: 2 };
    mocks.verifyIdToken.mockResolvedValue({ getPayload: () => claims });
    expect(await new GoogleDeletionIdentityAdapter().verifyCode('code')).toEqual(claims);
    expect(mocks.verifyIdToken).toHaveBeenCalledWith({ idToken: 'synthetic-signed-token', audience: 'synthetic-client' });
    mocks.verifyIdToken.mockRejectedValue(new Error('invalid signature'));
    await expect(new GoogleDeletionIdentityAdapter().verifyCode('code')).rejects.toThrow('invalid signature');
  });
});
