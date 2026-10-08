import { describe, expect, it, vi } from 'vitest';
import { type Boss, createBossQueue, createJobStatusLookup } from './queue';

function fakeBoss(opts: { startError?: Error } = {}): Boss {
  return {
    on: vi.fn(),
    start: vi.fn(async () => {
      if (opts.startError) throw opts.startError;
    }),
    send: vi.fn(async () => 'job-id'),
  };
}

describe('createBossQueue', () => {
  it('retries a fresh boss after a failed first start instead of wedging the process forever', async () => {
    const failing = fakeBoss({ startError: new Error('connection refused') });
    const working = fakeBoss();
    const launch = vi.fn().mockReturnValueOnce(failing).mockReturnValueOnce(working);
    const { enqueue } = createBossQueue(launch);

    // First enqueue surfaces the start failure...
    await expect(enqueue('brief-pdf', { briefId: 'b1' }, 'b1')).rejects.toThrow('connection refused');
    expect(launch).toHaveBeenCalledTimes(1);

    // ...but does not wedge the cache: the next enqueue launches and starts a fresh boss and succeeds.
    await expect(enqueue('brief-pdf', { briefId: 'b1' }, 'b1')).resolves.toBeUndefined();
    expect(launch).toHaveBeenCalledTimes(2);
    expect(working.send).toHaveBeenCalledWith('brief-pdf', { briefId: 'b1' }, { singletonKey: 'b1' });
    expect(failing.send).not.toHaveBeenCalled();
  });

  it('reuses the same started boss across concurrent and later successful calls', async () => {
    const working = fakeBoss();
    const launch = vi.fn().mockReturnValue(working);
    const { enqueue } = createBossQueue(launch);

    await Promise.all([enqueue('brief-pdf', { briefId: 'b1' }, 'b1'), enqueue('report-pdf', { reportId: 'r1' }, 'r1')]);
    await enqueue('brief-pdf', { briefId: 'b2' }, 'b2');

    expect(launch).toHaveBeenCalledTimes(1);
    expect(working.start).toHaveBeenCalledTimes(1);
    expect(working.send).toHaveBeenCalledTimes(3);
  });

  it('enqueues the 5b-1 onboarding jobs with their singleton keys', async () => {
    const working = fakeBoss();
    const { enqueue } = createBossQueue(() => working);
    await enqueue('suggest-competitors', { clientId: 'c1' }, 'suggest:c1');
    expect(working.send).toHaveBeenCalledWith('suggest-competitors', { clientId: 'c1' }, { singletonKey: 'suggest:c1' });
  });

  it('enqueues the 5b-2 prospect snapshot with its per-client singleton key', async () => {
    const working = fakeBoss();
    const { enqueue } = createBossQueue(() => working);
    await enqueue('prospect-snapshot', { clientId: 'c1', reportId: 'r1' }, 'prospect:c1');
    expect(working.send).toHaveBeenCalledWith('prospect-snapshot', { clientId: 'c1', reportId: 'r1' }, { singletonKey: 'prospect:c1' });
  });
});

describe('createJobStatusLookup', () => {
  it('returns the newest job for the queue and singleton key, or null when there is none', async () => {
    const created = new Date('2026-10-06T20:21:06Z');
    const completed = new Date('2026-10-06T20:22:05Z');
    const query = vi.fn().mockResolvedValueOnce([{ state: 'failed', created_on: created, completed_on: completed }]).mockResolvedValueOnce([]);
    const lookup = createJobStatusLookup(query);
    await expect(lookup('suggest-competitors', 'suggest:c1')).resolves.toEqual({ state: 'failed', createdOn: created, completedOn: completed });
    expect(query).toHaveBeenCalledWith('suggest-competitors', 'suggest:c1');
    await expect(lookup('suggest-competitors', 'suggest:c2')).resolves.toBeNull();
  });
});
