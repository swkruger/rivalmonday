import { describe, expect, it, vi } from 'vitest';
import type { WorkerDeps } from '../deps';
import { createWebJobs } from './web';

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
});
