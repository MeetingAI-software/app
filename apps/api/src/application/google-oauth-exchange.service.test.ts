import { describe, expect, it, vi } from 'vitest';
import { GoogleOAuthExchangeService } from './google-oauth-exchange.service';
import { OAuthCapacityError } from '../domain/errors';

describe('GoogleOAuthExchangeService', () => {
  it('does not invoke Google when shared admission is full', async () => {
    const exchange = vi.fn();
    const service = new GoogleOAuthExchangeService({
      acquire: async () => false, release: vi.fn(),
    });
    await expect(service.run(exchange)).rejects.toBeInstanceOf(OAuthCapacityError);
    expect(exchange).not.toHaveBeenCalled();
  });

  it('releases its lease after success and provider failure', async () => {
    const release = vi.fn().mockResolvedValue(undefined);
    const service = new GoogleOAuthExchangeService({ acquire: async () => true, release });
    await expect(service.run(async () => 'verified')).resolves.toBe('verified');
    await expect(service.run(async () => { throw new Error('provider'); })).rejects.toThrow('provider');
    expect(release).toHaveBeenCalledTimes(2);
    expect(release.mock.calls[0][0]).not.toBe(release.mock.calls[1][0]);
  });
});
