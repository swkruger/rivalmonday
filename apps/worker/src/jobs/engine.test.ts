import { describe, expect, it, vi } from 'vitest';
import type { WorkerDeps } from '../deps';
import { createEngineJobs } from './engine';

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const queue = () => ({ enqueueDiff: vi.fn(async (_id: string) => {}), enqueueTag: vi.fn(async (_id: string) => {}), enqueueScore: vi.fn(async (_id: string) => {}) });

describe('engine jobs', () => {
  it('sweeps every 5 minutes and enqueues all found work', async () => {
    const deps = { engineConfigured: () => true, findEngineWork: vi.fn(async () => ({ diff: [U(1)], tag: [U(2)], score: [U(3)], rankDiff: [] })) } as unknown as WorkerDeps;
    const q = queue();
    const jobs = createEngineJobs(deps, q);
    await jobs.sweep.handler({});
    expect(jobs.sweep.cron).toBe('*/5 * * * *');
    expect([q.enqueueDiff.mock.calls, q.enqueueTag.mock.calls, q.enqueueScore.mock.calls]).toEqual([[[U(1)]], [[U(2)]], [[U(3)]]]);
  });

  it('skips the sweep without an OpenRouter key', async () => {
    const findEngineWork = vi.fn();
    const jobs = createEngineJobs({ engineConfigured: () => false, findEngineWork } as unknown as WorkerDeps, queue());
    await jobs.sweep.handler({});
    expect(findEngineWork).not.toHaveBeenCalled();
  });

  it('chains diff → tag → score', async () => {
    const deps = {
      diffCapture: vi.fn(async () => ({ ran: true, changeIds: [U(2), U(3)] })),
      tagChange: vi.fn(async (id: string) => ({ ran: true, eventId: id === U(2) ? U(9) : null })),
      scoreEvent: vi.fn(async () => ({ scored: 1, failed: 0 })),
    } as unknown as WorkerDeps;
    const q = queue();
    const jobs = createEngineJobs(deps, q);
    await jobs.diff.handler({ captureId: U(1) });
    expect(q.enqueueTag.mock.calls).toEqual([[U(2)], [U(3)]]);
    await jobs.tag.handler({ changeId: U(2) });
    await jobs.tag.handler({ changeId: U(3) });
    expect(q.enqueueScore.mock.calls).toEqual([[U(9)]]);
    await jobs.score.handler({ eventId: U(9) });
    expect(deps.scoreEvent).toHaveBeenCalledWith(U(9));
  });

  it('validates payloads', () => {
    const jobs = createEngineJobs({} as WorkerDeps, queue());
    expect(() => jobs.diff.schema.parse({ captureId: 'nope' })).toThrow();
    expect(() => jobs.tag.schema.parse({ changeId: U(1) })).not.toThrow();
  });

  it('registers diff, tag and score as no-retry queues (the sweep is the only retry path)', () => {
    const jobs = createEngineJobs({} as WorkerDeps, queue());
    for (const job of [jobs.diff, jobs.tag, jobs.score]) {
      expect(job.queue?.retryLimit).toBe(0);
    }
  });
});
