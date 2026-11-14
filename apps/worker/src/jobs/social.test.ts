import { describe, expect, it, vi } from 'vitest';
import type { WorkerDeps } from '../deps';
import { createSocialJobs } from './social';

const ID = '00000000-0000-4000-8000-0000000000c1';

describe('social jobs', () => {
  it('social-discover calls deps.discoverSocial with the competitor id', async () => {
    const deps = { discoverSocial: vi.fn(async () => ({ status: 'ok' })), pullSocial: vi.fn() } as unknown as WorkerDeps;
    const jobs = createSocialJobs(deps);
    await jobs.discover.handler({ competitorId: ID });
    expect(deps.discoverSocial).toHaveBeenCalledWith(ID);
    expect(deps.pullSocial).not.toHaveBeenCalled();
    expect(jobs.discover.name).toBe('social-discover');
  });

  it('social-pull calls deps.pullSocial with the competitor id', async () => {
    const deps = { discoverSocial: vi.fn(), pullSocial: vi.fn(async () => ({ status: 'ok' })) } as unknown as WorkerDeps;
    const jobs = createSocialJobs(deps);
    await jobs.pull.handler({ competitorId: ID });
    expect(deps.pullSocial).toHaveBeenCalledWith(ID);
    expect(deps.discoverSocial).not.toHaveBeenCalled();
    expect(jobs.pull.name).toBe('social-pull');
  });

  it('schemas require a uuid competitorId', () => {
    const jobs = createSocialJobs({} as WorkerDeps);
    expect(jobs.pull.schema.safeParse({ competitorId: 'nope' }).success).toBe(false);
    expect(jobs.discover.schema.safeParse({ competitorId: ID }).success).toBe(true);
  });
});
