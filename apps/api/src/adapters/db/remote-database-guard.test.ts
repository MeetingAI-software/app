import { describe, expect, it } from 'vitest';
import { blocksInteractiveRemoteDatabase, blocksRemoteDatabaseBoot } from './remote-database-guard';

const PROD = 'postgresql://postgres.ebijezvhmimnuqppohpm:pw@aws-0-eu-central-1.pooler.supabase.com:6543/postgres';
const LOCAL = 'postgres://postgres:pw@localhost:5432/app';

describe('blocksInteractiveRemoteDatabase', () => {
  // The load-bearing case. The deploy job runs the migrator through `railway run` with production
  // variables injected; if the guard ever fired there, every deploy would fail at the Migrate step.
  // Non-interactive must mean "never block", whatever the database is.
  it('never blocks a non-interactive run, even against production', () => {
    expect(blocksInteractiveRemoteDatabase(PROD, false, undefined)).toBe(false);
  });

  it('blocks a human at a terminal pointed at a remote database', () => {
    expect(blocksInteractiveRemoteDatabase(PROD, true, undefined)).toBe(true);
  });

  it('allows an interactive run against a local database', () => {
    expect(blocksInteractiveRemoteDatabase(LOCAL, true, undefined)).toBe(false);
  });

  it.each(['127.0.0.1', '::1', 'db.local'])('treats %s as local', (host) => {
    expect(blocksInteractiveRemoteDatabase(`postgres://u:p@${host}:5432/app`, true, undefined)).toBe(false);
  });

  it('yields to an explicit override so the break-glass path still exists', () => {
    expect(blocksInteractiveRemoteDatabase(PROD, true, 'yes')).toBe(false);
  });

  // Anything other than the exact opt-in must not disable the guard, or a stray truthy value in
  // the environment would silently switch it off.
  it.each(['', 'no', 'true', '1', 'YES'])('ignores the non-opt-in override %j', (override) => {
    expect(blocksInteractiveRemoteDatabase(PROD, true, override)).toBe(true);
  });

  it('fails open on a connection string it cannot parse', () => {
    expect(blocksInteractiveRemoteDatabase('not-a-url', true, undefined)).toBe(false);
  });
});

describe('blocksRemoteDatabaseBoot', () => {
  const boot = (over: Partial<Parameters<typeof blocksRemoteDatabaseBoot>[0]> = {}) =>
    blocksRemoteDatabaseBoot({
      databaseUrl: PROD,
      isTty: true,
      override: undefined,
      nodeEnv: 'development',
      ...over,
    });

  // This function decides whether the API process starts, so the cases that must never block are
  // worth more than the ones that must. Each of these is production surviving on its own.
  it('never blocks when NODE_ENV is production, even from a TTY', () => {
    expect(boot({ nodeEnv: 'production' })).toBe(false);
  });

  it('never blocks without a TTY, even when NODE_ENV is unset in the container', () => {
    expect(boot({ isTty: false, nodeEnv: '' })).toBe(false);
  });

  // The two escapes are independent on purpose: production boots if either holds.
  it.each([
    ['production TTY', { nodeEnv: 'production', isTty: true }],
    ['unset NODE_ENV, no TTY', { nodeEnv: '', isTty: false }],
  ])('boots production via the %s path', (_label, over) => {
    expect(boot(over)).toBe(false);
  });

  it('blocks the accident it exists for: dev terminal, production database', () => {
    expect(boot()).toBe(true);
  });

  it('allows the normal local-development boot', () => {
    expect(boot({ databaseUrl: LOCAL })).toBe(false);
  });

  it('yields to an explicit override', () => {
    expect(boot({ override: 'yes' })).toBe(false);
  });

  it('still blocks a test-environment run against production', () => {
    expect(boot({ nodeEnv: 'test' })).toBe(true);
  });
});
