import { describe, expect, it, vi } from 'vitest';
import { revokeSessionBeforeLeaving } from './logout-flow';

describe('revokeSessionBeforeLeaving', () => {
  it('leaves the protected app only after the server confirms revocation', async () => {
    const navigate = vi.fn();
    const revoke = vi.fn(async () => undefined);
    expect(await revokeSessionBeforeLeaving(revoke, navigate)).toBe(true);
    expect(navigate).toHaveBeenCalledOnce();
  });

  it('keeps the user in place when session revocation fails so they can retry', async () => {
    const navigate = vi.fn();
    const revoke = vi.fn().mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce(undefined);
    expect(await revokeSessionBeforeLeaving(revoke, navigate)).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    expect(await revokeSessionBeforeLeaving(revoke, navigate)).toBe(true);
    expect(navigate).toHaveBeenCalledOnce();
  });
});
