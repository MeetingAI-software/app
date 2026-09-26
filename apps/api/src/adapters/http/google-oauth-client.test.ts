import { describe, expect, it } from 'vitest';
import { createGoogleOAuthClient } from './google-oauth-client';

describe('bounded Google OAuth transport', () => {
  it('overrides library token retries and applies timeout to the actual request', async () => {
    const client = createGoogleOAuthClient();
    const requests: Array<{ retry?: boolean; timeout?: number; retryConfig?: { retry?: number } }> = [];
    client.transporter.defaults.fetchImplementation = async (_url, init) => {
      requests.push(init as { retry?: boolean; timeout?: number; retryConfig?: { retry?: number } });
      return new Response(JSON.stringify({ id_token: 'synthetic-token' }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    };
    await client.getToken('synthetic-code');
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ retry: false, timeout: 8_000, retryConfig: { retry: 0 } });
  });

  it('does not retry a failed token exchange despite library retry defaults', async () => {
    const client = createGoogleOAuthClient();
    let calls = 0;
    client.transporter.defaults.fetchImplementation = async () => {
      calls++;
      return new Response('{}', { status: 503, headers: { 'content-type': 'application/json' } });
    };
    await expect(client.getToken('synthetic-code')).rejects.toThrow();
    expect(calls).toBe(1);
  });
});
