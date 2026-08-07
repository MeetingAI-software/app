/**
 * `apps/api/.env` points `DATABASE_URL` at the *production* Supabase project — the same project ref
 * Railway uses. So a reflexive `npm run db:migrate -w api` at a local prompt mutates live data, and
 * nothing in the command says so. Guard the one shape that is always an accident: a human at a
 * terminal, aimed at a remote database.
 *
 * Keyed on a TTY rather than a CI variable on purpose. The deploy pipeline reaches this command
 * through `railway run`, and whether that forwards CI-specific variables is not something a guard
 * should quietly depend on — getting it wrong would break every deploy. No TTY means no reflexive
 * mistake to prevent, so CI is untouched by construction.
 */
export function blocksInteractiveRemoteMigration(
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
    // Fail open. A connection string this guard cannot parse is the migrator's problem to report,
    // and blocking on a parsing quirk would be a worse failure than the one being prevented.
    return false;
  }

  return !isLocalHostname(hostname);
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
