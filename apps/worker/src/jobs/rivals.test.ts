import { describe, expect, it, vi } from 'vitest';
import type { WorkerDeps } from '../deps';
import { createRivalJobs, RIVAL_MONTHLY_SPACING_SECONDS } from './rivals';
import { createVendorJobs, SINGLE_SHOT_QUEUE } from './vendor';

const RUN = '00000000-0000-4000-8000-0000000000a1';
const NOW = new Date('2026-10-19T09:00:00Z');

type Started = { runId: string } | { refused: string };
function setup(over: Partial<WorkerDeps> = {}, at: Date = NOW, startScheduledSearch = vi.fn(async (_clientId: string, _startAfter: number): Promise<Started> => ({ runId: RUN }))) {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const deps = {
    vendorsConfigured: () => true,
    runRivalSearch: vi.fn(async () => ({ status: 'finalising' as const })),
    failRivalRun: vi.fn(async () => {}),
    finaliseRivalSearch: vi.fn(async () => 'done' as const),
    sweepRivalRuns: vi.fn(async () => ({ stale: 0, finalised: 0 })),
    listSignalClients: vi.fn(async () => ['c1', 'c2']),
    computeTrackedSignals: vi.fn(async () => 3),
    listMonthlyRivalClients: vi.fn(async () => ['m1', 'm2', 'm3', 'm4']),
    ...over,
  } as unknown as WorkerDeps;
  const enqueueFinalise = vi.fn(async (_runId: string, _o: { force: boolean; startAfter?: number }) => {});
  return { deps, enqueueFinalise, startScheduledSearch, jobs: createRivalJobs(deps, { enqueueFinalise, startScheduledSearch, now: () => at }) };
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

describe('rival-monthly (first Monday of the month)', () => {
  // Monday 2 Nov 2026 is a first Monday; Monday 19 Oct 2026 (NOW) is not.
  const FIRST_MONDAY = new Date('2026-11-02T10:00:00Z');

  it('is scheduled every Monday 10:00 UTC (cron ORs day-of-month with day-of-week, so the job checks the date)', () => {
    const { jobs } = setup();
    expect(jobs.monthly.cron).toBe('0 10 * * 1');
    expect(jobs.monthly.name).toBe('rival-monthly');
  });

  it('does nothing on a Monday after the 7th', async () => {
    for (const at of [NOW, new Date('2026-11-09T10:00:00Z')]) {
      const { deps, jobs, startScheduledSearch } = setup({}, at);
      await jobs.monthly.handler({});
      expect(deps.listMonthlyRivalClients).not.toHaveBeenCalled();
      expect(startScheduledSearch).not.toHaveBeenCalled();
    }
  });

  it('starts a scheduled search for every eligible client, a few minutes apart; refusals take no slot, failures do not stop the rest', async () => {
    const start = vi.fn(async (clientId: string, _s: number): Promise<Started> => {
      if (clientId === 'm2') return { refused: 'running' };
      if (clientId === 'm3') throw new Error('boom');
      return { runId: RUN };
    });
    const { deps, jobs } = setup({}, FIRST_MONDAY, start);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await jobs.monthly.handler({});
    expect(deps.listMonthlyRivalClients).toHaveBeenCalledTimes(1);
    expect(start.mock.calls).toEqual([['m1', 0], ['m2', RIVAL_MONTHLY_SPACING_SECONDS], ['m3', RIVAL_MONTHLY_SPACING_SECONDS], ['m4', RIVAL_MONTHLY_SPACING_SECONDS]]);
    expect(RIVAL_MONTHLY_SPACING_SECONDS).toBeGreaterThanOrEqual(120);
    expect(RIVAL_MONTHLY_SPACING_SECONDS).toBeLessThanOrEqual(600);
  });

  it('also runs on the 7th when that is the first Monday', async () => {
    const { deps, jobs } = setup({}, new Date('2026-09-07T10:00:00Z'));
    await jobs.monthly.handler({});
    expect(deps.listMonthlyRivalClients).toHaveBeenCalledTimes(1);
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
