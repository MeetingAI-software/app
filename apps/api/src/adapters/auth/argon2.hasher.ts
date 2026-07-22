import argon2 from 'argon2';
import type { PasswordHasher } from '../../ports/password-hasher.port';

// OWASP-recommended argon2id parameters (Day 5 §2). These are a security decision, not a
// deployment knob, so they live as constants here — never in env. memoryCost is in KiB:
// 19456 KiB = 19 MiB.
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export class Argon2Hasher implements PasswordHasher {
  async hash(plain: string): Promise<string> {
    return argon2.hash(plain, ARGON2_OPTIONS);
  }

  async verify(plain: string, hash: string): Promise<boolean> {
    // argon2.verify reads the algorithm + params from the encoded hash itself, and throws
    // on a malformed hash string. A bad/garbage hash is not a match, not an exception.
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }
}
