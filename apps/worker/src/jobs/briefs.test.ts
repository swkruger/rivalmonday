import { describe, expect, it, vi } from 'vitest';
import type { WorkerDeps } from '../deps';
import { createBriefJobs } from './briefs';

describe('brief jobs', () => {
  it('schedule enqueues one brief-client job per due client', async () => {
    const deps = { engineConfigured: () => true, listBriefDueClients: vi.fn(async () => ['c1', 'c2']) } as unknown as WorkerDeps;
    const enqueueBriefClient = vi.fn(async () => {});
    const jobs = createBriefJobs(deps, { enqueueBriefClient });
    await jobs.schedule.handler({});
    expect(enqueueBriefClient.mock.calls).toEqual([['c1'], ['c2']]);
    expect(jobs.schedule.cron).toBe('5 * * * *');
    expect(jobs.client.queue).toMatchObject({ policy: 'short', retryLimit: 0 });
  });

  it('schedule does nothing until the engine is configured', async () => {
    const deps = { engineConfigured: () => false, listBriefDueClients: vi.fn() } as unknown as WorkerDeps;
    await createBriefJobs(deps, { enqueueBriefClient: vi.fn() }).schedule.handler({});
    expect(deps.listBriefDueClients).not.toHaveBeenCalled();
  });

  it('client job generates the brief', async () => {
    const deps = { generateBrief: vi.fn(async () => ({ status: 'ready', briefId: 'b', kind: 'quiet', items: 0, dropped: { items: 0, sentences: 0 } })), deliveryConfigured: () => false } as unknown as WorkerDeps;
    await createBriefJobs(deps, { enqueueBriefClient: vi.fn() }).client.handler({ clientId: '00000000-0000-4000-8000-0000000000a1' });
    expect(deps.generateBrief).toHaveBeenCalledWith('00000000-0000-4000-8000-0000000000a1');
  });

  it('client job tells the AM the outcome once delivery is configured', async () => {
    const result = { status: 'ready', briefId: 'b', kind: 'quiet', items: 0, dropped: { items: 0, sentences: 0 } };
    const deps = { generateBrief: vi.fn(async () => result), deliveryConfigured: () => true, notifyBriefOutcome: vi.fn(async () => 2) } as unknown as WorkerDeps;
    await createBriefJobs(deps, { enqueueBriefClient: vi.fn() }).client.handler({ clientId: '00000000-0000-4000-8000-0000000000a1' });
    expect(deps.notifyBriefOutcome).toHaveBeenCalledWith(result, expect.any(Date));
  });
});
