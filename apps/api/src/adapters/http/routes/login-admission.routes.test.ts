import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthService, AuthServiceApi } from '../../../application/auth.service';
import { LoginAdmissionService } from '../../../application/login-admission.service';
import { config } from '../../../config/env';
import { createServer } from '../server';
import { createAuthRoutes } from './auth.routes';

describe('login admission before password hashing', () => {
  const login = vi.fn();
  const admit = vi.fn();
  const admission = new LoginAdmissionService({ admit, admitSignup: async () => true }, 1);
  let server: Server;
  let baseUrl: string;
  const result = {
    user: { id: 'owner', email: 'owner@example.com', emailVerified: true,
      createdAt: new Date('2026-01-01') },
    sessionToken: 'new-session', expiresAt: new Date(Date.now() + 60_000),
  };

  beforeAll(() => {
    const auth = { login } as unknown as AuthService & AuthServiceApi;
    const app = createServer([createAuthRoutes(auth, undefined, undefined, admission)], async () => null);
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  beforeEach(() => {
    login.mockReset();
    admit.mockReset();
    admit.mockResolvedValue(true);
    login.mockResolvedValue(result);
  });
  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });

  function request(email = 'owner@example.com') {
    return fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST', headers: { origin: config.WEB_ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'candidate-password' }),
    });
  }

  it('rejects exhausted shared budget before invoking the password service', async () => {
    admit.mockResolvedValue(false);
    const response = await request();
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('900');
    expect(login).not.toHaveBeenCalled();
  });

  it('fails closed before password hashing when the admission database fails', async () => {
    admit.mockRejectedValue(new Error('database unavailable'));
    const response = await request();
    expect(response.status).toBe(500);
    expect(login).not.toHaveBeenCalled();
  });

  it('rejects concurrent password hashing and recovers after the first call settles', async () => {
    let finish!: (value: typeof result) => void;
    login.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const first = request();
    await vi.waitFor(() => expect(login).toHaveBeenCalledTimes(1));
    const second = await request('other@example.com');
    expect(second.status).toBe(429);
    expect(login).toHaveBeenCalledTimes(1);
    finish(result);
    expect((await first).status).toBe(200);
    expect((await request('third@example.com')).status).toBe(200);
  });
});
