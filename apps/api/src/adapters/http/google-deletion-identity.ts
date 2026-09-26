import { createGoogleOAuthClient } from './google-oauth-client';
import { config } from '../../config/env';
import { FeatureUnavailableError } from '../../domain/errors';
import type { GoogleDeletionIdentity } from '../../ports/deletion-authorization.port';
import type { GoogleOAuthExchangeService } from '../../application/google-oauth-exchange.service';

export class GoogleDeletionIdentityAdapter implements GoogleDeletionIdentity {
  constructor(private readonly exchanges: GoogleOAuthExchangeService) {}
  get audience() { return config.GOOGLE_CLIENT_ID ?? ''; }

  private client() {
    if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET || !config.GOOGLE_REDIRECT_URI) {
      throw new FeatureUnavailableError('Google verification is not available');
    }
    return createGoogleOAuthClient();
  }

  authorizationUrl(state: string, nonce: string): string {
    return this.client().generateAuthUrl({ scope: ['openid'], state, nonce, prompt: 'select_account' });
  }

  async verifyCode(code: string) {
    return this.exchanges.run(async () => {
      const client = this.client();
      const { tokens } = await client.getToken(code);
      if (!tokens.id_token) throw new Error('Missing identity assertion');
      const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: this.audience });
      const payload = ticket.getPayload();
      if (!payload) throw new Error('Missing verified identity');
      return { sub: payload.sub, nonce: (payload as typeof payload & { nonce?: string }).nonce,
        aud: payload.aud, iss: payload.iss, iat: payload.iat, exp: payload.exp };
    });
  }
}
