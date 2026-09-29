import { describe, expect, it, vi } from 'vitest';
import { PaddleBillingAdmissionError } from '../domain/errors';
import type { PaddleBillingAdmissionRepository } from '../ports/paddle-billing-admission.port';
import { PaddleBillingAdmissionService } from './paddle-billing-admission.service';

describe('Paddle billing admission service', () => {
  it('keeps a workflow slot until the provider settles', async () => {
    let finish!: (value: string) => void;
    const provider = vi.fn(() => new Promise<string>(resolve => { finish = resolve; }));
    const repository: PaddleBillingAdmissionRepository = {
      acquire: vi.fn().mockResolvedValue('admitted'),
      release: vi.fn().mockResolvedValue(undefined),
    };
    const service = new PaddleBillingAdmissionService(repository);
    const pending = service.run('user-1', provider);
    await vi.waitFor(() => expect(provider).toHaveBeenCalledOnce());
    expect(repository.release).not.toHaveBeenCalled();
    finish('ok');
    expect(await pending).toBe('ok');
    expect(repository.release).toHaveBeenCalledOnce();
  });

  it('does not call Paddle after a denied admission', async () => {
    const repository: PaddleBillingAdmissionRepository = {
      acquire: vi.fn().mockResolvedValue('rate_limited'),
      release: vi.fn(),
    };
    const provider = vi.fn();
    await expect(new PaddleBillingAdmissionService(repository).run('user-1', provider))
      .rejects.toEqual(new PaddleBillingAdmissionError('rate_limited'));
    expect(provider).not.toHaveBeenCalled();
    expect(repository.release).not.toHaveBeenCalled();
  });

  it('releases the slot after a failed provider request without pretending the attempt was free', async () => {
    const repository: PaddleBillingAdmissionRepository = {
      acquire: vi.fn().mockResolvedValue('admitted'),
      release: vi.fn().mockResolvedValue(undefined),
    };
    const provider = vi.fn().mockRejectedValue(new Error('provider outage'));
    await expect(new PaddleBillingAdmissionService(repository).run('user-1', provider))
      .rejects.toThrow('provider outage');
    expect(repository.release).toHaveBeenCalledOnce();
  });
});
