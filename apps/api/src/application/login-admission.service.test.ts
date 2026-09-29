import { describe, expect, it } from 'vitest';
import { LoginAdmissionService } from './login-admission.service';

describe('LoginAdmissionService', () => {
  it('caps live password-hash work and releases slots exactly once', () => {
    const service = new LoginAdmissionService({ admit: async () => true, admitSignup: async () => true }, 1);
    const release = service.acquireHashSlot();
    expect(release).not.toBeNull();
    expect(service.acquireHashSlot()).toBeNull();
    release?.();
    release?.();
    expect(service.acquireHashSlot()).not.toBeNull();
  });
});
