import { OAuth2Client } from 'google-auth-library';
import { config } from '../../config/env';

export function createGoogleOAuthClient(): OAuth2Client {
  const client = new OAuth2Client({
    clientId: config.GOOGLE_CLIENT_ID,
    clientSecret: config.GOOGLE_CLIENT_SECRET,
    redirectUri: config.GOOGLE_REDIRECT_URI,
    transporterOptions: { timeout: 8_000, retry: false },
  });
  // google-auth-library passes retry:true per request, overriding transporter defaults.
  // The interceptor runs after option merging and before the outbound request.
  client.transporter.interceptors.request.add({
    resolved: async options => ({
      ...options, timeout: 8_000, retry: false,
      // Gaxios still retries when the library supplies a retryConfig object.
      retryConfig: { ...options.retryConfig, retry: 0 },
    }),
  });
  return client;
}
