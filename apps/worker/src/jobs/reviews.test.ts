import { describe, expect, it, vi } from 'vitest';
import type { WorkerDeps } from '../deps';
import { createReviewJobs } from './reviews';

describe('reviews-nightly', () => {
  it('runs nightly before moves, once, and only with the engine configured', async () => {
    const runReviewInsights = vi.fn(async () => ({ competitors: 2, spikes: 1, proposals: 0, errors: 0 }));
    const on = createReviewJobs({ engineConfigured: () => true, runReviewInsights } as unknown as WorkerDeps);
    expect(on.nightly.cron).toBe('15 4 * * *');
    expect(on.nightly.queue).toMatchObject({ retryLimit: 0 });
    await on.nightly.handler({});
    expect(runReviewInsights).toHaveBeenCalledTimes(1);
    const off = createReviewJobs({ engineConfigured: () => false, runReviewInsights } as unknown as WorkerDeps);
    await off.nightly.handler({});
    expect(runReviewInsights).toHaveBeenCalledTimes(1);
  });
});
