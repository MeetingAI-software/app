import type { LoginAdmissionRepository } from '../ports/login-admission.port';

/** Shared attempt budget plus a per-process cap on expensive Argon2 verification work. */
export class LoginAdmissionService {
  private activeHashes = 0;
  constructor(private readonly repository: LoginAdmissionRepository,
    private readonly maxConcurrentHashes = 4) {}

  async admit(ip: string, email: string): Promise<boolean> {
    return this.repository.admit({ ip, email, now: new Date() });
  }

  async admitSignup(ip: string, email: string): Promise<boolean> {
    return this.repository.admitSignup({ ip, email, now: new Date() });
  }

  acquireHashSlot(): (() => void) | null {
    if (this.activeHashes >= this.maxConcurrentHashes) return null;
    this.activeHashes += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.activeHashes -= 1;
    };
  }
}
