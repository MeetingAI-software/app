/**
 * A developer laptop must not be able to reach the production database by accident.
 *
 * This started as a migration-only guard, because `apps/api/.env` pointed `DATABASE_URL` at the
 * production Supabase project and a reflexive `npm run db:migrate -w api` mutated live data. The
 * sweep job then proved the hole was wider: `npm run dev -w api` deleted real meeting audio within
 * seconds of boot, and account deletion would have erased a real user outright. Migrations were
 * never the only way in — the connection itself is.
 *
 * Guard the one shape that is always an accident: a human at a terminal, aimed at a remote database.
 *
 * Keyed on a TTY rather than a CI variable on purpose. The deploy pipeline reaches the migrator
 * through `railway run`, and whether that forwards CI-specific variables is not something a guard
 * should quietly depend on — getting it wrong would break every deploy. No TTY means no reflexive
 * mistake to prevent, so CI is untouched by construction.
 *
 * This stops accidents, not determination. An explicit override still works, and a local run with
 * no TTY (output piped to a file) is not caught. Both are deliberate: a guard nobody can get past
 * is a guard someone eventually deletes.
 */
export function blocksInteractiveRemoteDatabase(
  databaseUrl: string,
  isTty: boolean,
  override: string | undefined,
): boolean {
  if (!isTty) return false;
  if (override === 'yes') return false;

  let hostname: string;
  try {
    hostname = new URL(databaseUrl).hostname;
  } catch {
    // Fail open. A connection string this guard cannot parse is the caller's problem to report,
    // and blocking on a parsing quirk would be a worse failure than the one being prevented.
    return false;
  }

  return !isLocalHostname(hostname);
}

/**
 * Boot-time variant, for `main.ts`. Identical to the above except that production is exempt
 * outright.
 *
 * The exemption is redundant on paper — the Railway container has no TTY, so the predicate already
 * returns false there — and that redundancy is the point. This function decides whether the API
 * starts at all, so it gets two independent reasons to let production through: if `NODE_ENV` is
 * somehow unset in Railway the TTY check still carries it, and if a TTY somehow appears the
 * `NODE_ENV` check still carries it. Both would have to fail together to take production down.
 *
 * Note the asymmetry: `NODE_ENV` can only ever *weaken* this guard, never strengthen it. That is
 * why it is safe here and would not have been safe as the primary key — a guard that blocks
 * whenever `NODE_ENV !== 'production'` bets production uptime on a value nothing in this repo sets.
 */
export function blocksRemoteDatabaseBoot(opts: {
  databaseUrl: string;
  isTty: boolean;
  override: string | undefined;
  nodeEnv: string;
}): boolean {
  if (opts.nodeEnv === 'production') return false;
  return blocksInteractiveRemoteDatabase(opts.databaseUrl, opts.isTty, opts.override);
}

/**
 * For tools that have no legitimate production use at all — the dev seeder being the case this was
 * written for. A seeder is a bulk writer; there is no TTY, override or environment in which aiming
 * one at production is correct, so it gets a plain "is this local" question rather than the
 * accident-shaped guard above.
 *
 * Note the inverted failure direction: this fails **closed** where
 * `blocksInteractiveRemoteDatabase` fails open. There, an unparseable URL is the migrator's problem
 * to report and blocking would be the worse failure. Here, "I could not tell what database this is"
 * is reason enough to refuse — the caller is about to write rows.
 */
export function isLocalDatabaseUrl(databaseUrl: string): boolean {
  try {
    return isLocalHostname(new URL(databaseUrl).hostname);
  } catch {
    return false;
  }
}

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.local')
  );
}
