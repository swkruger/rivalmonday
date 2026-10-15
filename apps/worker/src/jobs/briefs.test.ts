import { describe, expect, it, vi } from 'vitest';
import type { WorkerDeps } from '../deps';
import { createBriefJobs, createStartingPointJobs } from './briefs';

describe('brief jobs', () => {
  it('schedule enqueues one brief-client job per due client', async () => {
    const deps = { engineConfigured: () => true, listBriefDueClients: vi.fn(async () => ['c1', 'c2']) } as unknown as WorkerDeps;
    const enqueueBriefClient = vi.fn(async () => {});
    const jobs = createBriefJobs(deps, { enqueueBriefClient, enqueueAskStarters: vi.fn() });
    await jobs.schedule.handler({});
    expect(enqueueBriefClient.mock.calls).toEqual([['c1'], ['c2']]);
    expect(jobs.schedule.cron).toBe('5 * * * *');
    expect(jobs.client.queue).toMatchObject({ policy: 'short', retryLimit: 0 });
  });

  it('schedule does nothing until the engine is configured', async () => {
    const deps = { engineConfigured: () => false, listBriefDueClients: vi.fn() } as unknown as WorkerDeps;
    await createBriefJobs(deps, { enqueueBriefClient: vi.fn(), enqueueAskStarters: vi.fn() }).schedule.handler({});
    expect(deps.listBriefDueClients).not.toHaveBeenCalled();
  });

  it('client job generates the brief', async () => {
    const deps = { generateBrief: vi.fn(async () => ({ status: 'ready', briefId: 'b', kind: 'quiet', items: 0, dropped: { items: 0, sentences: 0 } })), deliveryConfigured: () => false } as unknown as WorkerDeps;
    await createBriefJobs(deps, { enqueueBriefClient: vi.fn(), enqueueAskStarters: vi.fn() }).client.handler({ clientId: '00000000-0000-4000-8000-0000000000a1' });
    expect(deps.generateBrief).toHaveBeenCalledWith('00000000-0000-4000-8000-0000000000a1');
  });

  it('client job tells the AM the outcome once delivery is configured', async () => {
    const result = { status: 'ready', briefId: 'b', kind: 'quiet', items: 0, dropped: { items: 0, sentences: 0 } };
    const deps = { generateBrief: vi.fn(async () => result), deliveryConfigured: () => true, notifyBriefOutcome: vi.fn(async () => 2) } as unknown as WorkerDeps;
    await createBriefJobs(deps, { enqueueBriefClient: vi.fn(), enqueueAskStarters: vi.fn() }).client.handler({ clientId: '00000000-0000-4000-8000-0000000000a1' });
    expect(deps.notifyBriefOutcome).toHaveBeenCalledWith(result, expect.any(Date));
  });

  it('brief client job enqueues ask-starters on success and on quiet brief', async () => {
    const A = '00000000-0000-4000-8000-0000000000a1';
    const run = async (result: object | Error) => {
      const generateBrief = vi.fn(async () => { if (result instanceof Error) throw result; return result; });
      const deps = { generateBrief, deliveryConfigured: () => false } as unknown as WorkerDeps;
      const enqueueAskStarters = vi.fn(async () => {});
      await createBriefJobs(deps, { enqueueBriefClient: vi.fn(), enqueueAskStarters }).client.handler({ clientId: A }).catch(() => {});
      return enqueueAskStarters.mock.calls;
    };
    const dropped = { items: 0, sentences: 0 };
    expect(await run({ status: 'ready', briefId: 'b', kind: 'standard', items: 3, dropped })).toEqual([[A]]);
    expect(await run({ status: 'ready', briefId: 'b', kind: 'quiet', items: 0, dropped })).toEqual([[A]]);
    expect(await run({ status: 'failed', briefId: 'b', error: 'x' })).toEqual([]);
    expect(await run({ status: 'skipped', reason: 'r' })).toEqual([]);
    expect(await run(new Error('boom'))).toEqual([]);
  });
});

describe('starting point jobs', () => {
  const A = '00000000-0000-4000-8000-0000000000a1';
  it('schedule runs at :15 hourly and enqueues one starting-point-client job per due client', async () => {
    const deps = { engineConfigured: () => true, listStartingPointDue: vi.fn(async () => ['c1', 'c2']) } as unknown as WorkerDeps;
    const enqueueStartingPointClient = vi.fn(async () => {});
    const jobs = createStartingPointJobs(deps, { enqueueStartingPointClient });
    await jobs.schedule.handler({});
    expect(enqueueStartingPointClient.mock.calls).toEqual([['c1'], ['c2']]);
    expect(jobs.schedule.name).toBe('starting-point-schedule');
    expect(jobs.schedule.cron).toBe('15 * * * *');
    expect(jobs.client.name).toBe('starting-point-client');
    expect(jobs.client.queue).toMatchObject({ policy: 'short', retryLimit: 2 });
  });

  it('schedule does nothing until the engine is configured', async () => {
    const deps = { engineConfigured: () => false, listStartingPointDue: vi.fn() } as unknown as WorkerDeps;
    await createStartingPointJobs(deps, { enqueueStartingPointClient: vi.fn() }).schedule.handler({});
    expect(deps.listStartingPointDue).not.toHaveBeenCalled();
  });

  it('client job generates the starting point and tells the AM once delivery is configured', async () => {
    const result = { status: 'ready', briefId: 'b', kind: 'starting_point', items: 3, dropped: { items: 0, sentences: 0 } };
    const deps = { generateStartingPoint: vi.fn(async () => result), deliveryConfigured: () => true, notifyBriefOutcome: vi.fn(async () => 2) } as unknown as WorkerDeps;
    await createStartingPointJobs(deps, { enqueueStartingPointClient: vi.fn() }).client.handler({ clientId: A });
    expect(deps.generateStartingPoint).toHaveBeenCalledWith(A);
    expect(deps.notifyBriefOutcome).toHaveBeenCalledWith(result, expect.any(Date));
  });

  it('client job skips the notice without delivery', async () => {
    const deps = { generateStartingPoint: vi.fn(async () => ({ status: 'skipped', reason: 'r' })), deliveryConfigured: () => false, notifyBriefOutcome: vi.fn() } as unknown as WorkerDeps;
    await createStartingPointJobs(deps, { enqueueStartingPointClient: vi.fn() }).client.handler({ clientId: A });
    expect(deps.notifyBriefOutcome).not.toHaveBeenCalled();
  });
});
