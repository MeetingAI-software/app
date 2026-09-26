import { randomUUID } from 'node:crypto';
import { PaddleBillingAdmissionError } from '../domain/errors';
import type { PaddleBillingAdmissionRepository } from '../ports/paddle-billing-admission.port';

export class PaddleBillingAdmissionService {
  constructor(private readonly repository: PaddleBillingAdmissionRepository) {}

  async run<T>(userId: string, call: () => Promise<T>): Promise<T> {
    const token = randomUUID();
    const result = await this.repository.acquire({ userId, token });
    if (result !== 'admitted') throw new PaddleBillingAdmissionError(result);
    try {
      return await call();
    } finally {
      // A failed release must not turn a successful checkout into a 500 that invites a duplicate.
      // The lease expires conservatively and is then available to a later request.
      try { await this.repository.release(token); }
      catch { console.error('Billing admission release failed'); }
    }
  }
}
