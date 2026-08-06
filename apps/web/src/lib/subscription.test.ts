import { describe, expect, it } from 'vitest';
import { canManageSubscription } from './subscription';

describe('canManageSubscription', () => {
  it.each(['active', 'trialing', 'past_due', 'paused'])(
    'shows billing management for %s subscriptions',
    (status) => {
      expect(canManageSubscription(status, true)).toBe(true);
    },
  );

  it.each(['canceled', 'none'])(
    'hides billing management for %s subscriptions',
    (status) => {
      expect(canManageSubscription(status, true)).toBe(false);
    },
  );

  it('requires a mirrored subscription row', () => {
    expect(canManageSubscription('active', false)).toBe(false);
  });
});
