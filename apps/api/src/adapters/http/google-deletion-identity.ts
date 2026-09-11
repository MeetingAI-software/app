import { OAuth2Client } from 'google-auth-library';
import { config } from '../../config/env';
import { FeatureUnavailableError } from '../../domain/errors';
import type { GoogleDeletionIdentity } from '../../ports/deletion-authorization.port';

export class GoogleDeletionIdentityAdapter implements GoogleDeletionIdentity {
  get audience() { return config.GOOGLE_CLIENT_ID ?? ''; }

  private client() {
    if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET || !config.GOOGLE_REDIRECT_URI) {
      throw new FeatureUnavailableError('Google verification is not available');
    }
    return new OAuth2Client(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET, config.GOOGLE_REDIRECT_URI);
  }

  authorizationUrl(state: string, nonce: string): string {
    return this.client().generateAuthUrl({ scope: ['openid'], state, nonce, prompt: 'select_account' });
  }

  async verifyCode(code: string) {
    const client = this.client();
    const { tokens } = await client.getToken(code);
    if (!tokens.id_token) throw new Error('Missing identity assertion');
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: this.audience });
    const payload = ticket.getPayload();
    if (!payload) throw new Error('Missing verified identity');
    return { sub: payload.sub, nonce: (payload as typeof payload & { nonce?: string }).nonce,
      aud: payload.aud, iss: payload.iss, iat: payload.iat, exp: payload.exp };
  }
}
