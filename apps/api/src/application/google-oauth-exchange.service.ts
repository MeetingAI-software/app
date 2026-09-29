import { randomUUID } from 'node:crypto';
import { OAuthCapacityError } from '../domain/errors';
import type { GoogleOAuthExchangeRepository } from '../ports/google-oauth-exchange.port';

// getToken and certificate fetch each have an 8s transport timeout. Leave room for
// scheduling and cleanup, then recover a slot if an API process dies mid-exchange.
const LEASE_MS = 30_000;

export class GoogleOAuthExchangeService {
  constructor(private readonly repository: GoogleOAuthExchangeRepository) {}

  async run<T>(exchange: () => Promise<T>): Promise<T> {
    const token = randomUUID();
    const now = new Date();
    if (!await this.repository.acquire(token, now, new Date(now.getTime() + LEASE_MS))) {
      throw new OAuthCapacityError();
    }
    try { return await exchange(); }
    finally { await this.repository.release(token); }
  }
}
