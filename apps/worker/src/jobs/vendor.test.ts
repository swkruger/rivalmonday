import { describe, expect, it, vi } from 'vitest';
import type { WorkerDeps } from '../deps';
import { createVendorJobs } from './vendor';

describe('vendor jobs', () => {
  it('batches reviews/jobs into async task posts and enqueues the rest', async () => {
    const deps = {
      vendorsConfigured: () => true,
      ensureSelfCompetitors: vi.fn(async () => 0),
      claimDueSources: vi.fn(async () => [
        { competitorId: 'c1', source: 'reviews' }, { competitorId: 'c2', source: 'jobs' }, { competitorId: 'c1', source: 'gbp' }, { competitorId: 'c1', source: 'ads_meta' },
      ]),
      postBatchTasks: vi.fn(async () => ({ failed: 0 })),
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
    const deps = { vendorsConfigured: () => false, claimDueSources, postBatchTasks: vi.fn(async () => ({ failed: 0 })) } as unknown as WorkerDeps;
    const jobs = createVendorJobs(deps, { enqueueCollect: async () => {}, enqueueRankScan: async () => {} });
    await jobs.schedule.handler({});
    expect(claimDueSources).not.toHaveBeenCalled();
  });

  it('still enqueues the sync collects when postBatchTasks reports some sources released for retry (no throw)', async () => {
    const postBatchTasks = vi.fn(async () => ({ failed: 1 }));
    const deps = {
      vendorsConfigured: () => true,
      ensureSelfCompetitors: vi.fn(async () => 0),
      claimDueSources: vi.fn(async () => [{ competitorId: 'c1', source: 'reviews' }, { competitorId: 'c2', source: 'gbp' }]),
      postBatchTasks,
    } as unknown as WorkerDeps;
    const enqueueCollect = vi.fn(async (_p: { competitorId: string; source: 'gbp' | 'ads_google' | 'ads_meta' }) => {});
    const jobs = createVendorJobs(deps, { enqueueCollect, enqueueRankScan: async () => {} });
    await expect(jobs.schedule.handler({})).resolves.toBeUndefined();
    expect(enqueueCollect).toHaveBeenCalledWith({ competitorId: 'c2', source: 'gbp' });
    expect(postBatchTasks).toHaveBeenCalledWith([{ competitorId: 'c1', source: 'reviews' }]);
  });

  it('still enqueues the sync collects, and never releases anything itself, when postBatchTasks throws unexpectedly', async () => {
    const deps = {
      vendorsConfigured: () => true,
      ensureSelfCompetitors: vi.fn(async () => 0),
      claimDueSources: vi.fn(async () => [{ competitorId: 'c1', source: 'reviews' }, { competitorId: 'c2', source: 'gbp' }]),
      postBatchTasks: vi.fn(async () => {
        throw new Error('db down');
      }),
    } as unknown as WorkerDeps;
    const enqueueCollect = vi.fn(async (_p: { competitorId: string; source: 'gbp' | 'ads_google' | 'ads_meta' }) => {});
    const jobs = createVendorJobs(deps, { enqueueCollect, enqueueRankScan: async () => {} });
    // deps.postBatchTasks now owns all release/status decisions internally (per round-2 fix); vendor.ts
    // has no releaseSources of its own any more, so there is nothing to assert it *didn't* call —
    // this test documents that an unexpected throw is swallowed (logged) without crashing the tick.
    await expect(jobs.schedule.handler({})).resolves.toBeUndefined();
    expect(enqueueCollect).toHaveBeenCalledWith({ competitorId: 'c2', source: 'gbp' });
  });

  it('links self businesses before claiming due sources', async () => {
    const order: string[] = [];
    const deps = {
      vendorsConfigured: () => true,
      ensureSelfCompetitors: vi.fn(async () => {
        order.push('self');
        return 2;
      }),
      claimDueSources: vi.fn(async () => {
        order.push('claim');
        return [];
      }),
    } as unknown as WorkerDeps;
    const jobs = createVendorJobs(deps, { enqueueCollect: vi.fn(), enqueueRankScan: vi.fn() });
    await jobs.schedule.handler({});
    expect(order).toEqual(['self', 'claim']);
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

  it('registers rank-scan and suggest-competitors as single-shot queues; suggest dedupes queued duplicates', () => {
    const jobs = createVendorJobs({} as WorkerDeps, { enqueueCollect: async () => {}, enqueueRankScan: async () => {} });
    for (const job of [jobs.rankScan, jobs.suggest]) {
      expect(job.queue?.retryLimit).toBe(0);
      expect(job.queue?.expireInSeconds).toBeGreaterThanOrEqual(2 * 60 * 60);
    }
    expect(jobs.suggest.queue?.policy).toBe('short');
  });
});
