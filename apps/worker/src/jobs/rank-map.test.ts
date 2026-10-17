import { describe, expect, it, vi } from 'vitest';
import type { WorkerDeps } from '../deps';
import { createRankMapJobs } from './rank-map';

const id = '00000000-0000-4000-8000-0000000000a1';

describe('rank-map job', () => {
  it('job calls refreshRankMap with the client id', async () => {
    const deps = { refreshRankMap: vi.fn(async () => 'stored' as const) } as unknown as WorkerDeps;
    const job = createRankMapJobs(deps).refresh;
    await job.handler({ clientId: id });
    expect(deps.refreshRankMap).toHaveBeenCalledWith(id);
    expect(job.name).toBe('rank-map-refresh');
    expect(job.queue).toEqual({ policy: 'short', retryLimit: 2 });
    expect(job.schema.safeParse({ clientId: 'nope' }).success).toBe(false);
  });
});
