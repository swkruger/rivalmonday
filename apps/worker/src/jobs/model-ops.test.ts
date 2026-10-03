import { describe, expect, it, vi } from 'vitest';
import type { WorkerDeps } from '../deps';
import { createModelOpsJobs } from './model-ops';

describe('model-batch-poll', () => {
  it('runs every 15 minutes without pg-boss retries, and does nothing until the engine is configured', async () => {
    const collect = vi.fn(async () => ({ checked: 1, ended: 1, applied: 1, failed: 0, expired: 0 }));
    let configured = false;
    const { batchPoll } = createModelOpsJobs({ engineConfigured: () => configured, collectModelBatches: collect } as unknown as WorkerDeps);
    expect(batchPoll).toMatchObject({ name: 'model-batch-poll', cron: '*/15 * * * *', queue: { retryLimit: 0 } });
    await batchPoll.handler({});
    expect(collect).not.toHaveBeenCalled();
    configured = true;
    await batchPoll.handler({});
    expect(collect).toHaveBeenCalledTimes(1);
  });
});
