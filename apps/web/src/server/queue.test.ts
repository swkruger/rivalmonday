import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ToolError } from '@cs/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BACKGROUND_OFF, type Boss, createBossQueue, createJobStatusLookup, refuseJobs } from './queue';

const createDbMock = vi.hoisted(() => vi.fn());
vi.mock('@cs/db', async (orig) => ({ ...(await orig<typeof import('@cs/db')>()), createDb: createDbMock }));

function fakeBoss(opts: { startError?: Error } = {}): Boss {
  return {
    on: vi.fn(),
    start: vi.fn(async () => {
      if (opts.startError) throw opts.startError;
    }),
    send: vi.fn(async () => 'job-id'),
    stop: vi.fn(async () => {}),
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

describe('refuseJobs (deviation 9, Review Focus 4)', () => {
  it('refuses every job with a message the user can read', async () => {
    await expect(refuseJobs('suggest-competitors', { clientId: 'x' }, 'x')).rejects.toSatisfy((e: unknown) => e instanceof ToolError && e.code === 'invalid_input' && e.message === BACKGROUND_OFF);
  });
});

describe('createBossQueue stop (S8)', () => {
  it('stops a started boss non-gracefully and is a no-op when never started', async () => {
    const working = fakeBoss();
    const q = createBossQueue(() => working);
    await q.stop();
    expect(working.stop).not.toHaveBeenCalled();
    await q.enqueue('brief-pdf', { briefId: 'b1' }, 'b1');
    await q.stop();
    expect(working.stop).toHaveBeenCalledWith({ graceful: false });
  });
});

describe('queue in DEMO or TEST', () => {
  let dir: string | null = null;
  afterEach(async () => {
    const { clearEnvCaches } = await import('./env-cache');
    await clearEnvCaches();
    vi.unstubAllEnvs();
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = null;
    createDbMock.mockReset();
  });

  it('refuses to enqueue and reads job status as no job without connecting', async () => {
    dir = mkdtempSync(join(tmpdir(), 'web-queue-'));
    const file = join(dir, 'dev-env.json');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DEV_PANEL', '1');
    vi.stubEnv('RM_DEV_ENV_FILE', file);
    const { writeDevEnv } = await import('./dev-guard');
    await writeDevEnv(file, 'demo');
    const { enqueueJob, jobStatus } = await import('./queue');
    await expect(enqueueJob('suggest-competitors', { clientId: 'x' }, 'x')).rejects.toThrow(BACKGROUND_OFF);
    await expect(jobStatus('suggest-competitors', 'x')).resolves.toBeNull();
    expect(createDbMock).not.toHaveBeenCalled();
  });
});
