import type PgBoss from 'pg-boss';
import { describe, expect, it, vi } from 'vitest';
import type { WorkerDeps } from '../deps';
import { createJobList } from '../job-list';
import { createWebJobs } from './web';

const P1 = '00000000-0000-4000-8000-0000000000a1';
const P2 = '00000000-0000-4000-8000-0000000000a2';

/** The real job list wired to a recording boss, so the enqueue options (singletonKey, startAfter) are what pg-boss gets. */
function wired(deps: Partial<WorkerDeps>) {
  const send = vi.fn(async (_name: string, _data: object, _opts: object) => 'job-id');
  const jobs = createJobList(deps as WorkerDeps, { send } as unknown as PgBoss, { envName: 'dev', env: {} });
  const job = (name: string) => jobs.find((j) => j.name === name)!;
  return { send, job };
}

describe('web jobs', () => {
  it('schedule job enqueues a capture job per claimed page', async () => {
    const enqueueCapture = vi.fn(async (_trackedPageId: string) => {});
    const deps = { claimDuePages: vi.fn(async () => ['p1', 'p2']) } as unknown as WorkerDeps;
    const jobs = createWebJobs(deps, { enqueueCapture });
    expect(jobs.schedule.name).toBe('web-schedule');
    expect(jobs.schedule.cron).toBe('*/15 * * * *');
    await jobs.schedule.handler({});
    expect(enqueueCapture.mock.calls.map((c) => c[0])).toEqual(['p1', 'p2']);
  });

  it('validates payloads of capture and discovery jobs', () => {
    const jobs = createWebJobs({} as WorkerDeps, { enqueueCapture: async () => {} });
    expect(() => jobs.capture.schema.parse({ trackedPageId: 'nope' })).toThrow();
    expect(() => jobs.discover.schema.parse({ competitorId: '00000000-0000-4000-8000-0000000000f1' })).not.toThrow();
  });

  it('enqueues an engine diff after an ok capture only', async () => {
    const capturePage = vi.fn(async (id: string) => (id === 'a' ? { status: 'ok', captureId: 'cap-a' } : { status: 'unchanged' }));
    const enqueueDiff = vi.fn(async (_id: string) => {});
    const jobs = createWebJobs({ capturePage } as unknown as WorkerDeps, { enqueueCapture: async () => {}, enqueueDiff });
    await jobs.capture.handler({ trackedPageId: 'a' });
    await jobs.capture.handler({ trackedPageId: 'b' });
    expect(enqueueDiff.mock.calls).toEqual([['cap-a']]);
  });

  it('dedupes queued page discovery per competitor (short policy)', () => {
    const jobs = createWebJobs({} as WorkerDeps, { enqueueCapture: async () => {} });
    expect(jobs.discover.queue?.policy).toBe('short');
  });

  it('capture queue is short (one queued job per page)', () => {
    expect(createWebJobs({} as WorkerDeps, { enqueueCapture: async () => {} }).capture.queue?.policy).toBe('short');
  });

  it('deferral re-enqueues with startAfter and the capture singletonKey', async () => {
    const capturePage = vi.fn(async () => ({ status: 'deferred' as const, retryInMs: 4001 }));
    const { send, job } = wired({ capturePage });
    expect(await job('web-capture-page').handler({ trackedPageId: P1 })).toEqual({ deferred: true, retryInSeconds: 5 });
    expect(send.mock.calls).toEqual([['web-capture-page', { trackedPageId: P1 }, { singletonKey: `capture:${P1}`, startAfter: 5 }]]);
  });

  it('schedule enqueue passes the singletonKey', async () => {
    const { send, job } = wired({ claimDuePages: vi.fn(async () => [P1, P2]) });
    await job('web-schedule').handler({});
    expect(send.mock.calls).toEqual([
      ['web-capture-page', { trackedPageId: P1 }, { singletonKey: `capture:${P1}` }],
      ['web-capture-page', { trackedPageId: P2 }, { singletonKey: `capture:${P2}` }],
    ]);
  });
});
