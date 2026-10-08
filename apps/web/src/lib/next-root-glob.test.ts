import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const moduleRequire = createRequire(import.meta.url);
const pluginRequire = createRequire(moduleRequire.resolve('@next/eslint-plugin-next/package.json'));
const { getRootDirs } = pluginRequire('./dist/utils/get-root-dirs.js') as {
  getRootDirs(context: { cwd: string; settings: { next?: { rootDir?: unknown } } }): string[];
};

describe('Next ESLint root-directory glob compatibility', () => {
  let root: string;
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'next-root-glob-'));
    for (const name of ['web', 'docs', '.hidden']) mkdirSync(join(root, 'apps', name), { recursive: true });
    mkdirSync(join(root, 'apps', 'web', 'nested'), { recursive: true });
    writeFileSync(join(root, 'apps', 'README.md'), 'synthetic fixture');
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  function roots(rootDir: unknown): string[] {
    return getRootDirs({ cwd: root, settings: { next: { rootDir } } }).sort();
  }

  it('uses the current directory without explicit monorepo settings', () => {
    expect(getRootDirs({ cwd: root, settings: {} })).toEqual([root]);
  });

  it('matches only visible directories in wildcard settings', () => {
    expect(roots(join(root, 'apps', '*'))).toEqual([join(root, 'apps', 'docs'), join(root, 'apps', 'web')]);
  });

  it('preserves a literal root without returning descendant directories', () => {
    expect(roots(join(root, 'apps', 'web'))).toEqual([join(root, 'apps', 'web')]);
  });

  it('preserves brace-pattern monorepo settings', () => {
    expect(roots(join(root, 'apps', '{web,docs}'))).toEqual([join(root, 'apps', 'docs'), join(root, 'apps', 'web')]);
  });

  it('preserves root arrays and ignores non-string entries', () => {
    expect(roots([join(root, 'apps', 'web'), false, join(root, 'apps', 'docs'), null]))
      .toEqual([join(root, 'apps', 'docs'), join(root, 'apps', 'web')]);
  });

  it('returns no roots for an unmatched pattern', () => {
    expect(roots(join(root, 'apps', 'missing-*'))).toEqual([]);
  });
});
