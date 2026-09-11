import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalValue = process.env.NEXT_PUBLIC_LAUNCH_PAUSED;

async function loadFlag(value: string | undefined): Promise<boolean> {
  vi.resetModules();
  if (value === undefined) delete process.env.NEXT_PUBLIC_LAUNCH_PAUSED;
  else process.env.NEXT_PUBLIC_LAUNCH_PAUSED = value;
  const { LAUNCH_PAUSED } = await import('./launch');
  return LAUNCH_PAUSED;
}

describe('LAUNCH_PAUSED', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (originalValue === undefined) delete process.env.NEXT_PUBLIC_LAUNCH_PAUSED;
    else process.env.NEXT_PUBLIC_LAUNCH_PAUSED = originalValue;
  });

  it('stays paused when the variable is missing, so a misconfigured deploy never opens sign-in', async () => {
    await expect(loadFlag(undefined)).resolves.toBe(true);
  });

  it('stays paused for any value other than the exact opt-out', async () => {
    await expect(loadFlag('true')).resolves.toBe(true);
    await expect(loadFlag('')).resolves.toBe(true);
    await expect(loadFlag('FALSE')).resolves.toBe(true);
  });

  it('opens the product only for the exact string "false"', async () => {
    await expect(loadFlag('false')).resolves.toBe(false);
  });
});
