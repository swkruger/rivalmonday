import { describe, expect, it, vi } from 'vitest';
import type { WorkerDeps } from '../deps';
import { createVendorJobs } from './vendor';

describe('vendor jobs', () => {
  it('batches reviews/jobs into async task posts and enqueues the rest', async () => {
    const deps = {
      vendorsConfigured: () => true,
      claimDueSources: vi.fn(async () => [
        { competitorId: 'c1', source: 'reviews' }, { competitorId: 'c2', source: 'jobs' }, { competitorId: 'c1', source: 'gbp' }, { competitorId: 'c1', source: 'ads_meta' },
      ]),
      postBatchTasks: vi.fn(async () => {}),
    } as unknown as WorkerDeps;
    const enqueueCollect = vi.fn(async (_p: { competitorId: string; source: 'gbp' | 'ads_google' | 'ads_meta' }) => {});
    const jobs = createVendorJobs(deps, { enqueueCollect, enqueueRankScan: async () => {} });
    await jobs.schedule.handler({});
    expect(deps.postBatchTasks).toHaveBeenCalledWith([{ competitorId: 'c1', source: 'reviews' }, { competitorId: 'c2', source: 'jobs' }]);
    expect(enqueueCollect.mock.calls.map((c) => c[0])).toEqual([{ competitorId: 'c1', source: 'gbp' }, { competitorId: 'c1', source: 'ads_meta' }]);
    expect(jobs.schedule.cron).toBe('*/30 * * * *');
    expect(jobs.poll.cron).toBe('*/10 * * * *');
    expect(jobs.rankSchedule.cron).toBe('0 6 1 * *');
  });

  it('rejects unknown sources in collect payloads', () => {
    const jobs = createVendorJobs({} as WorkerDeps, { enqueueCollect: async () => {}, enqueueRankScan: async () => {} });
    expect(() => jobs.collect.schema.parse({ competitorId: '00000000-0000-4000-8000-0000000000f1', source: 'reviews' })).toThrow();
    expect(() => jobs.collect.schema.parse({ competitorId: '00000000-0000-4000-8000-0000000000f1', source: 'gbp' })).not.toThrow();
  });

  it('skips claiming when vendor credentials are not configured', async () => {
    const claimDueSources = vi.fn(async () => []);
    const deps = { vendorsConfigured: () => false, claimDueSources, postBatchTasks: vi.fn(async () => {}) } as unknown as WorkerDeps;
    const jobs = createVendorJobs(deps, { enqueueCollect: async () => {}, enqueueRankScan: async () => {} });
    await jobs.schedule.handler({});
    expect(claimDueSources).not.toHaveBeenCalled();
  });

  it('still enqueues the sync collects and releases the batch for retry when postBatchTasks fails', async () => {
    const releaseSources = vi.fn(async () => {});
    const deps = {
      vendorsConfigured: () => true,
      claimDueSources: vi.fn(async () => [{ competitorId: 'c1', source: 'reviews' }, { competitorId: 'c2', source: 'gbp' }]),
      postBatchTasks: vi.fn(async () => {
        throw new Error('dfs down');
      }),
      releaseSources,
    } as unknown as WorkerDeps;
    const enqueueCollect = vi.fn(async (_p: { competitorId: string; source: 'gbp' | 'ads_google' | 'ads_meta' }) => {});
    const jobs = createVendorJobs(deps, { enqueueCollect, enqueueRankScan: async () => {} });
    await expect(jobs.schedule.handler({})).resolves.toBeUndefined();
    expect(enqueueCollect).toHaveBeenCalledWith({ competitorId: 'c2', source: 'gbp' });
    expect(releaseSources).toHaveBeenCalledWith([{ competitorId: 'c1', source: 'reviews' }], 'post_failed');
  });

  it('skips polling when vendor credentials are not configured', async () => {
    const pollVendorTasks = vi.fn(async () => ({ reviews: { collected: 0, failed: 0, reviews: 0 }, jobs: { collected: 0, failed: 0, postings: 0 } }));
    const deps = { vendorsConfigured: () => false, pollVendorTasks } as unknown as WorkerDeps;
    const jobs = createVendorJobs(deps, { enqueueCollect: async () => {}, enqueueRankScan: async () => {} });
    await jobs.poll.handler({});
    expect(pollVendorTasks).not.toHaveBeenCalled();
  });

  it('handles a skipped-reviews poll result without crashing on the collected count', async () => {
    const deps = {
      vendorsConfigured: () => true,
      pollVendorTasks: vi.fn(async () => ({ reviews: { skipped: 'REVIEWER_HASH_SALT must be set to at least 32 random characters' }, jobs: { collected: 1, failed: 0, postings: 1 } })),
    } as unknown as WorkerDeps;
    const jobs = createVendorJobs(deps, { enqueueCollect: async () => {}, enqueueRankScan: async () => {} });
    await expect(jobs.poll.handler({})).resolves.toBeUndefined();
  });

  it('skips the monthly rank fan-out when vendor credentials are not configured', async () => {
    const listRankClients = vi.fn(async () => ['client-1']);
    const deps = { vendorsConfigured: () => false, listRankClients } as unknown as WorkerDeps;
    const enqueueRankScan = vi.fn(async () => {});
    const jobs = createVendorJobs(deps, { enqueueCollect: async () => {}, enqueueRankScan });
    await jobs.rankSchedule.handler({});
    expect(listRankClients).not.toHaveBeenCalled();
    expect(enqueueRankScan).not.toHaveBeenCalled();
  });
});
