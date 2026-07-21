import { describe, it, expect } from 'vitest';
import { Argon2Hasher } from './argon2.hasher';
import type { PasswordHasher } from '../../ports/password-hasher.port';

// Written against the PORT, not the package — any PasswordHasher must satisfy these (Day 5 §2 "L").
describe('Argon2Hasher (PasswordHasher port)', () => {
  const hasher: PasswordHasher = new Argon2Hasher();

  it('verify(p, hash(p)) is true', async () => {
    const hash = await hasher.hash('correct horse battery staple');
    expect(await hasher.verify('correct horse battery staple', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hasher.hash('correct horse battery staple');
    expect(await hasher.verify('wrong password entirely', hash)).toBe(false);
  });

  it('produces an argon2id-encoded hash (not the plaintext)', async () => {
    const hash = await hasher.hash('another-password-123');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).not.toContain('another-password-123');
  });

  it('returns false for a malformed hash instead of throwing', async () => {
    expect(await hasher.verify('whatever', 'not-a-real-hash')).toBe(false);
  });
});
