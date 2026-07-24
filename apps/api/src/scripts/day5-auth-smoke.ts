import crypto from 'crypto';
import { DrizzleUserRepository } from '../adapters/db/repositories/user.repository';
import { DrizzleSessionRepository } from '../adapters/db/repositories/session.repository';
import { Argon2Hasher } from '../adapters/auth/argon2.hasher';
import { EmailTakenError } from '../domain/errors';

// Round-trip verification for the Day 5 auth repositories against the REAL database.
// Self-cleaning: every row it creates it deletes before exiting, so it leaves no residue.
async function main() {
  console.log('🧪 Day 5 auth repository round-trip...');
  const users = new DrizzleUserRepository();
  const sessions = new DrizzleSessionRepository();
  const hasher = new Argon2Hasher();

  const rand = crypto.randomBytes(4).toString('hex');
  const mixedCaseEmail = `Day5.Smoke.${rand}@Example.TEST`;
  const password = 'a-strong-enough-password';

  let userId: string | null = null;
  try {
    // 1. create → email stored lowercased
    const hash = await hasher.hash(password);
    const user = await users.create({ email: mixedCaseEmail, passwordHash: hash });
    userId = user.id;
    assert(user.email === mixedCaseEmail.toLowerCase(), `email lowercased (got ${user.email})`);

    // 2. findById
    const byId = await users.findById(user.id);
    assert(!!byId && byId.id === user.id, 'findById returns the user');
    assert((byId as { passwordHash?: string }).passwordHash === undefined, 'findById does NOT expose passwordHash');

    const withHash = await users.findByEmailWithHash(`DAY5.SMOKE.${rand}@example.test`);
    assert(!!withHash && !!withHash.passwordHash, 'findByEmailWithHash finds the user regardless of case');
    assert(await hasher.verify(password, withHash!.passwordHash!), 'stored hash verifies against the password');

    // 4. duplicate email → EmailTakenError (unique violation mapped)
    let taken = false;
    try {
      await users.create({ email: mixedCaseEmail, passwordHash: hash });
    } catch (e) {
      taken = e instanceof EmailTakenError;
    }
    assert(taken, 'duplicate email throws EmailTakenError');

    // 5. session create + lookup by token hash
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await sessions.create({ userId: user.id, tokenHash, expiresAt });
    const foundSession = await sessions.findByTokenHash(tokenHash);
    assert(!!foundSession && foundSession.userId === user.id, 'findByTokenHash returns the session');

    // 6. deleteByTokenHash
    await sessions.deleteByTokenHash(tokenHash);
    assert((await sessions.findByTokenHash(tokenHash)) === null, 'deleteByTokenHash removes it');

    // 7. deleteAllForUser wipes every session
    const th1 = crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('hex');
    const th2 = crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('hex');
    await sessions.create({ userId: user.id, tokenHash: th1, expiresAt });
    await sessions.create({ userId: user.id, tokenHash: th2, expiresAt });
    await sessions.deleteAllForUser(user.id);
    assert((await sessions.findByTokenHash(th1)) === null && (await sessions.findByTokenHash(th2)) === null,
      'deleteAllForUser wipes every session');

    console.log('🎉 All Day 5 auth repository checks passed.');
  } finally {
    // Clean up so the smoke run leaves nothing behind.
    if (userId) {
      await sessions.deleteAllForUser(userId);
      await users.deleteById(userId);
      const gone = await users.findById(userId);
      console.log(gone ? '⚠️  cleanup: user still present!' : '🧹 cleanup: test user removed.');
    }
  }
  process.exit(0);
}

function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAILED: ${label}`);
  console.log(`   ✓ ${label}`);
}

main().catch((err) => {
  console.error('❌ Day 5 auth smoke failed:', err);
  process.exit(1);
});
