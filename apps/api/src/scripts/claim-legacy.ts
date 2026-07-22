import { db } from '../adapters/db/client';
import { meetings } from '../adapters/db/schema';
import { isNull } from 'drizzle-orm';
import { DrizzleUserRepository } from '../adapters/db/repositories/user.repository';

/**
 * One-off backfill (Day 5 §4): assign every unclaimed (NULL-owner) legacy meeting to a user.
 * Run ONCE after the founders sign up:  npx tsx src/scripts/claim-legacy.ts you@example.com
 *
 * Non-destructive by construction — it only ever updates rows WHERE owner_user_id IS NULL, so it
 * can never reassign a meeting that already belongs to someone. A second run simply claims 0.
 */
async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: tsx src/scripts/claim-legacy.ts <email>');
    process.exit(1);
  }

  const users = new DrizzleUserRepository();
  const user = await users.findByEmailWithHash(email);
  if (!user) {
    console.error(`❌ No account found for "${email}". Sign up first, then re-run.`);
    process.exit(1);
  }

  const claimed = await db
    .update(meetings)
    .set({ ownerUserId: user.id })
    .where(isNull(meetings.ownerUserId))
    .returning({ id: meetings.id });

  console.log(`✅ Claimed ${claimed.length} legacy meeting(s) for ${user.email} (${user.id}).`);
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ claim-legacy failed:', err);
  process.exit(1);
});
