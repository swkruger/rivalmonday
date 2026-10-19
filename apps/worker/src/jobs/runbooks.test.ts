import { describe, expect, it, vi } from 'vitest';
import type { WorkerDeps } from '../deps';
import { createRunbookJobs } from './runbooks';

const ID = '00000000-0000-4000-8000-0000000000a1';

describe('runbook-tailor job', () => {
  it('declares name and a short queue with one retry', () => {
    const { tailor } = createRunbookJobs({} as WorkerDeps, { envName: 'dev' });
    expect(tailor).toMatchObject({ name: 'runbook-tailor', queue: { policy: 'short', retryLimit: 1 } });
  });
  it.each(['demo', 'test'] as const)('skips in %s', async (envName) => {
    const tailorRunbook = vi.fn();
    const { tailor } = createRunbookJobs({ tailorRunbook } as unknown as WorkerDeps, { envName });
    expect(await tailor.handler({ clientId: ID })).toEqual({ skipped: envName });
    expect(tailorRunbook).not.toHaveBeenCalled();
  });
  it('delegates to deps in dev', async () => {
    const tailorRunbook = vi.fn(async () => ({ status: 'done' as const, rejected: [] }));
    const { tailor } = createRunbookJobs({ tailorRunbook } as unknown as WorkerDeps, { envName: 'dev' });
    expect(await tailor.handler({ clientId: ID })).toEqual({ status: 'done', rejected: [] });
    expect(tailorRunbook).toHaveBeenCalledWith(ID);
  });
});
