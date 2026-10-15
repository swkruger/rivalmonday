import { describe, expect, it, vi } from 'vitest';
import type { WorkerDeps } from '../deps';
import { createRivalJobs } from './rivals';
import { createVendorJobs, SINGLE_SHOT_QUEUE } from './vendor';

const RUN = '00000000-0000-4000-8000-0000000000a1';
const NOW = new Date('2026-10-19T09:00:00Z');

function setup(over: Partial<WorkerDeps> = {}) {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const deps = {
    vendorsConfigured: () => true,
    runRivalSearch: vi.fn(async () => ({ status: 'finalising' as const })),
    failRivalRun: vi.fn(async () => {}),
    finaliseRivalSearch: vi.fn(async () => 'done' as const),
    sweepRivalRuns: vi.fn(async () => ({ stale: 0, finalised: 0 })),
    listSignalClients: vi.fn(async () => ['c1', 'c2']),
    computeTrackedSignals: vi.fn(async () => 3),
    ...over,
  } as unknown as WorkerDeps;
  const enqueueFinalise = vi.fn(async (_runId: string, _o: { force: boolean; startAfter?: number }) => {});
  return { deps, enqueueFinalise, jobs: createRivalJobs(deps, { enqueueFinalise, now: () => NOW }) };
}

describe('rival jobs', () => {
  it('rival-search runs the search and schedules a forced finalise 30 min out when it is still finalising', async () => {
    const { deps, enqueueFinalise, jobs } = setup();
    await jobs.search.handler({ runId: RUN });
    expect(deps.runRivalSearch).toHaveBeenCalledWith(RUN);
    expect(enqueueFinalise).toHaveBeenCalledWith(RUN, { force: true, startAfter: 1800 });
  });

  it('rival-search schedules nothing once the run is done or failed', async () => {
    for (const status of ['done', 'failed'] as const) {
      const { enqueueFinalise, jobs } = setup({ runRivalSearch: vi.fn(async () => ({ status })) });
      await jobs.search.handler({ runId: RUN });
      expect(enqueueFinalise).not.toHaveBeenCalled();
    }
  });

  it('rival-search fails the run without vendor calls when vendors are not configured', async () => {
    const { deps, jobs } = setup({ vendorsConfigured: () => false });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await jobs.search.handler({ runId: RUN });
    expect(deps.runRivalSearch).not.toHaveBeenCalled();
    expect(deps.failRivalRun).toHaveBeenCalledWith(RUN, 'vendors_unconfigured');
  });

  it('rival-search is a single-shot, 2 h, short-policy queue', () => {
    const { jobs } = setup();
    expect(jobs.search.queue).toEqual({ ...SINGLE_SHOT_QUEUE, expireInSeconds: 7200, policy: 'short' });
    expect(jobs.finalise.queue?.policy).toBe('short');
    expect(() => jobs.search.schema.parse({ runId: 'nope' })).toThrow();
  });

  it('rival-finalise forwards the force flag (default false)', async () => {
    const { deps, jobs } = setup();
    await jobs.finalise.handler(jobs.finalise.schema.parse({ runId: RUN }));
    await jobs.finalise.handler({ runId: RUN, force: true });
    expect(deps.finaliseRivalSearch).toHaveBeenNthCalledWith(1, RUN, { force: false });
    expect(deps.finaliseRivalSearch).toHaveBeenNthCalledWith(2, RUN, { force: true });
  });

  it('rival-sweep runs every 15 minutes with the current time', async () => {
    const { deps, jobs } = setup();
    expect(jobs.sweep.cron).toBe('*/15 * * * *');
    await jobs.sweep.handler({});
    expect(deps.sweepRivalRuns).toHaveBeenCalledWith(NOW);
  });

  it('signals-weekly rates every listed (active) client on Monday 09:00 and keeps going past a failure', async () => {
    const computeTrackedSignals = vi.fn(async (id: string) => {
      if (id === 'c1') throw new Error('boom');
      return 2;
    });
    const { deps, jobs } = setup({ computeTrackedSignals } as Partial<WorkerDeps>);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(jobs.signalsWeekly.cron).toBe('0 9 * * 1');
    await jobs.signalsWeekly.handler({});
    expect(deps.listSignalClients).toHaveBeenCalled();
    expect(computeTrackedSignals.mock.calls).toEqual([['c1', NOW], ['c2', NOW]]);
  });
});

describe('vendor-poll → rival-finalise', () => {
  it('passes a suggestion-review callback that enqueues a non-forced finalise', async () => {
    let cb: ((runId: string) => Promise<void>) | undefined;
    const pollVendorTasks = vi.fn(async (o?: { onSuggestionReviews?: (runId: string) => Promise<void> }) => {
      cb = o?.onSuggestionReviews;
      return { reviews: { collected: 0, failed: 0, reviews: 0 }, jobs: { collected: 0, failed: 0, postings: 0 } };
    });
    const enqueueRivalFinalise = vi.fn(async (_runId: string) => {});
    const deps = { vendorsConfigured: () => true, pollVendorTasks } as unknown as WorkerDeps;
    const jobs = createVendorJobs(deps, { enqueueCollect: async () => {}, enqueueRankScan: async () => {}, enqueueRivalFinalise });
    await jobs.poll.handler({});
    await cb?.(RUN);
    expect(enqueueRivalFinalise).toHaveBeenCalledWith(RUN);
  });
});
