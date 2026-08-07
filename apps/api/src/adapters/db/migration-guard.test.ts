import { describe, expect, it } from 'vitest';
import { blocksInteractiveRemoteMigration } from './migration-guard';

const PROD = 'postgresql://postgres.ebijezvhmimnuqppohpm:pw@aws-0-eu-central-1.pooler.supabase.com:6543/postgres';
const LOCAL = 'postgres://postgres:pw@localhost:5432/app';

describe('blocksInteractiveRemoteMigration', () => {
  // The load-bearing case. The deploy job runs this exact command through `railway run` with
  // production variables injected; if the guard ever fired there, every deploy would fail at the
  // Migrate step. Non-interactive must mean "never block", whatever the database is.
  it('never blocks a non-interactive run, even against production', () => {
    expect(blocksInteractiveRemoteMigration(PROD, false, undefined)).toBe(false);
  });

  it('blocks a human at a terminal pointed at a remote database', () => {
    expect(blocksInteractiveRemoteMigration(PROD, true, undefined)).toBe(true);
  });

  it('allows an interactive run against a local database', () => {
    expect(blocksInteractiveRemoteMigration(LOCAL, true, undefined)).toBe(false);
  });

  it.each(['127.0.0.1', '::1', 'db.local'])('treats %s as local', (host) => {
    expect(blocksInteractiveRemoteMigration(`postgres://u:p@${host}:5432/app`, true, undefined)).toBe(false);
  });

  it('yields to an explicit override so the break-glass path still exists', () => {
    expect(blocksInteractiveRemoteMigration(PROD, true, 'yes')).toBe(false);
  });

  // Anything other than the exact opt-in must not disable the guard, or a stray truthy value in
  // the environment would silently switch it off.
  it.each(['', 'no', 'true', '1', 'YES'])('ignores the non-opt-in override %j', (override) => {
    expect(blocksInteractiveRemoteMigration(PROD, true, override)).toBe(true);
  });

  it('fails open on a connection string it cannot parse', () => {
    expect(blocksInteractiveRemoteMigration('not-a-url', true, undefined)).toBe(false);
  });
});
