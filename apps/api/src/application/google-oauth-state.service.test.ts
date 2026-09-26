import { describe, expect, it } from 'vitest';
import { GoogleOAuthStateService } from './google-oauth-state.service';
import type { GoogleOAuthChallenge } from '../ports/google-oauth-state.port';

describe('GoogleOAuthStateService', () => {
  function setup() {
    const records = new Map<string, GoogleOAuthChallenge>();
    const service = new GoogleOAuthStateService({
      issue: async record => { records.set(record.stateHash, record); return true; },
      claim: async (stateHash, now) => {
        const record = records.get(stateHash);
        if (!record || record.expiresAt <= now) return null;
        records.delete(stateHash);
        return record;
      },
    });
    return { records, service };
  }

  it('binds linking to one session, purpose, and nonce', async () => {
    const { service } = setup();
    const issued = await service.issue({
      purpose: 'link', userId: 'owner', sessionToken: 'owner-session', authVersion: 4,
    });
    expect(await service.claim(issued.state, 'other-session')).toBeNull();
    expect(await service.claim(issued.state, 'owner-session')).toBeNull();

    const next = await service.issue({
      purpose: 'link', userId: 'owner', sessionToken: 'owner-session', authVersion: 4,
    });
    const challenge = await service.claim(next.state, 'owner-session');
    expect(challenge).toMatchObject({ purpose: 'link', userId: 'owner', authVersion: 4 });
    expect(service.matchesNonce(challenge!, issued.nonce)).toBe(false);
    expect(service.matchesNonce(challenge!, next.nonce)).toBe(true);
    expect(await service.claim(next.state, 'owner-session')).toBeNull();
  });

  it('rejects malformed and incomplete linking state', async () => {
    const { service } = setup();
    await expect(service.issue({ purpose: 'link' })).rejects.toThrow();
    expect(await service.claim('link.attacker', 'session')).toBeNull();
  });
});
