import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AiPausedError } from '@cs/core';
import { createBoss, enqueue, registerJobs } from './boss';
import { defineJob } from './jobs';
import { workerLog } from './log';

const url = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/cs_test';
const boss = createBoss(url);

const received: string[] = [];
let resolveDone: () => void;
const done = new Promise<void>((r) => { resolveDone = r; });

const echoJob = defineJob({
  name: 'test-echo',
  schema: z.object({ message: z.string().min(1) }),
  handler: async (data) => {
    received.push(data.message);
    resolveDone();
  },
});

const singleShotJob = defineJob({
  name: 'test-single-shot',
  schema: z.object({}),
  handler: async () => {},
  queue: { retryLimit: 0, expireInSeconds: 7200 },
});

const outputJob = defineJob({ name: 'test-output', schema: z.object({}), handler: async () => ({ articleId: 'a1' }), queue: { retryLimit: 0, policy: 'short' } });

const aiRan: string[] = [];
const plainRan: string[] = [];
const aiJob = defineJob({ name: 'test-ai', schema: z.object({ id: z.string() }), usesAi: true, handler: async (d) => { aiRan.push(d.id); }, queue: { retryLimit: 0, policy: 'short' } });
const plainJob = defineJob({ name: 'test-plain', schema: z.object({ id: z.string() }), handler: async (d) => { plainRan.push(d.id); }, queue: { retryLimit: 0 } });
const aiState = { paused: false };
const cronRan: string[] = [];
const cronAiJob = defineJob({ name: 'test-cron-ai', schema: z.object({ id: z.string() }), usesAi: true, cron: '0 0 1 1 *', handler: async (d) => { cronRan.push(d.id); }, queue: { retryLimit: 0 } });
const pausedThrowJob = defineJob({ name: 'test-throws-paused', schema: z.object({ id: z.string() }), handler: async () => { throw new AiPausedError('platform'); }, queue: { retryLimit: 0, policy: 'short' } });

const failJob = defineJob({ name: 'test-fail', schema: z.object({}), handler: async () => { throw new Error('nope'); }, queue: { retryLimit: 0 } });

const shortJob = defineJob({ name: 'test-short', schema: z.object({ id: z.string() }), handler: async () => {}, queue: { retryLimit: 0, policy: 'short' } });

beforeAll(async () => {
  await boss.start();
  await registerJobs(boss, [echoJob, singleShotJob, shortJob, outputJob, failJob, aiJob, plainJob, cronAiJob, pausedThrowJob], { pollingIntervalSeconds: 0.5, aiPaused: async () => aiState.paused });
});
afterAll(async () => {
  await boss.stop({ graceful: false });
});

describe('worker jobs', () => {
  it('validates payloads before enqueueing', async () => {
    await expect(enqueue(boss, echoJob, { message: '' })).rejects.toThrow();
  });

  it('delivers a valid job to its handler', async () => {
    await enqueue(boss, echoJob, { message: 'hello' });
    await Promise.race([done, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15_000))]);
    expect(received).toEqual(['hello']);
  });

  it('applies per-job queue options (retry/expiry) to the pg-boss queue and its jobs', async () => {
    const q = await boss.getQueue(singleShotJob.name);
    expect(q).toMatchObject({ retryLimit: 0, expireInSeconds: 7200 });
    const id = await boss.send(singleShotJob.name, {}, { startAfter: 3600 });
    const job = await boss.getJobById(singleShotJob.name, id as string);
    expect(job).toMatchObject({ retryLimit: 0 });
    expect(Number(job?.expireIn ? (job.expireIn as { hours?: number }).hours : 0)).toBe(2);
    await boss.deleteJob(singleShotJob.name, id as string);
  });
});

describe('job output (Phase 6c)', () => {
  it('stores the returned object as the pg-boss job output', async () => {
    const id = (await boss.send(outputJob.name, {})) as string;
    const deadline = Date.now() + 15_000;
    for (;;) {
      const job = await boss.getJobById(outputJob.name, id);
      if (job?.state === 'completed') {
        expect(job.output).toEqual({ articleId: 'a1' });
        return;
      }
      if (Date.now() > deadline) throw new Error('timeout');
      await new Promise((r) => setTimeout(r, 300));
    }
  });
});

describe('job failures (Phase 7a1)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('runs handlers through runJob, so a throw still fails the pg-boss job', async () => {
    vi.spyOn(workerLog, 'child').mockReturnValue({ ...workerLog, error: vi.fn() });
    const id = (await boss.send(failJob.name, {})) as string;
    const deadline = Date.now() + 15_000;
    for (;;) {
      const job = await boss.getJobById(failJob.name, id);
      if (job?.state === 'failed') break;
      if (Date.now() > deadline) throw new Error('timeout');
      await new Promise((r) => setTimeout(r, 300));
    }
  });
});

describe('queue dedupe (Phase 3b)', () => {
  it('keeps one queued job per singleton key on a short-policy queue', async () => {
    expect((await boss.getQueue(shortJob.name))?.policy).toBe('short');
    const a = await boss.send(shortJob.name, { id: 'x' }, { singletonKey: 'k', startAfter: 3600 });
    const b = await boss.send(shortJob.name, { id: 'x' }, { singletonKey: 'k', startAfter: 3600 });
    expect(a).toBeTruthy();
    expect(b).toBeNull();
    await boss.deleteJob(shortJob.name, a as string);
  });

  it('forwards the singleton key when enqueueing', async () => {
    const send = vi.spyOn(boss, 'send').mockResolvedValueOnce('id');
    await enqueue(boss, echoJob, { message: 'k' }, { singletonKey: 'abc' });
    expect(send).toHaveBeenCalledWith('test-echo', { message: 'k' }, { singletonKey: 'abc' });
    send.mockRestore();
  });

  it('forwards startAfter when enqueueing (delayed jobs)', async () => {
    const id = (await enqueue(boss, shortJob, { id: 'later' }, { singletonKey: 'delayed', startAfter: 1800 })) as string;
    const job = await boss.getJobById(shortJob.name, id);
    expect(job!.startAfter.getTime() - Date.now()).toBeGreaterThan(1700_000);
    await boss.deleteJob(shortJob.name, id);
  });
});

describe('AI pause (Phase 7b1)', () => {
  afterEach(() => { vi.restoreAllMocks(); aiState.paused = false; });
  const waitFor = async (ok: () => boolean) => {
    const deadline = Date.now() + 15_000;
    while (!ok()) {
      if (Date.now() > deadline) throw new Error('timeout');
      await new Promise((r) => setTimeout(r, 200));
    }
  };

  it('usesAi batch deferred with the same singletonKey while paused', async () => {
    aiState.paused = true;
    const realSend = boss.send.bind(boss) as (...a: unknown[]) => Promise<string | null>;
    // The deferral (the only call with startAfter) is observed, not enqueued; the original enqueue is real.
    const send = vi.spyOn(boss, 'send').mockImplementation((async (...a: unknown[]) => ((a[2] as { startAfter?: number } | undefined)?.startAfter ? 'resent' : realSend(...a))) as never);
    const id = (await boss.send(aiJob.name, { id: 'p1' }, { singletonKey: 'key-1' })) as string;
    await waitFor(() => send.mock.calls.some((c) => (c[2] as { startAfter?: number } | undefined)?.startAfter === 600));
    expect(send).toHaveBeenCalledWith(aiJob.name, { id: 'p1' }, { startAfter: 600, singletonKey: 'key-1' });
    expect(aiRan).not.toContain('p1');
    const deadline = Date.now() + 15_000;
    for (;;) {
      const job = await boss.getJobById(aiJob.name, id);
      if (job?.state === 'completed') break;
      if (Date.now() > deadline) throw new Error('timeout');
      await new Promise((r) => setTimeout(r, 200));
    }
  });

  it('non-AI job runs while paused', async () => {
    aiState.paused = true;
    await boss.send(plainJob.name, { id: 'n1' });
    await waitFor(() => plainRan.includes('n1'));
  });

  it('usesAi job runs once the pause lifts', async () => {
    await boss.send(aiJob.name, { id: 'r1' });
    await waitFor(() => aiRan.includes('r1'));
  });

  it('cron-scheduled usesAi job deferred while paused is not re-sent (the next tick runs it; standard queues do not dedupe singletonKey)', async () => {
    aiState.paused = true;
    const realSend = boss.send.bind(boss) as (...a: unknown[]) => Promise<string | null>;
    const send = vi.spyOn(boss, 'send').mockImplementation((async (...a: unknown[]) => ((a[2] as { startAfter?: number } | undefined)?.startAfter ? 'resent' : realSend(...a))) as never);
    const id = (await boss.send(cronAiJob.name, { id: 'c1' })) as string;
    const deadline = Date.now() + 15_000;
    for (;;) {
      const job = await boss.getJobById(cronAiJob.name, id);
      if (job?.state === 'completed') {
        expect(job.output).toEqual({ deferred: 'ai_paused' });
        break;
      }
      if (Date.now() > deadline) throw new Error('timeout');
      await new Promise((r) => setTimeout(r, 200));
    }
    expect(send.mock.calls.filter((c) => (c[2] as { startAfter?: number } | undefined)?.startAfter)).toHaveLength(0);
    expect(cronRan).not.toContain('c1');
  });

  it('a platform AiPausedError from a job not flagged usesAi is still re-sent', async () => {
    const realSend = boss.send.bind(boss) as (...a: unknown[]) => Promise<string | null>;
    const send = vi.spyOn(boss, 'send').mockImplementation((async (...a: unknown[]) => ((a[2] as { startAfter?: number } | undefined)?.startAfter ? 'resent' : realSend(...a))) as never);
    await boss.send(pausedThrowJob.name, { id: 't1' }, { singletonKey: 'tk' });
    await waitFor(() => send.mock.calls.some((c) => (c[2] as { startAfter?: number } | undefined)?.startAfter === 600));
    expect(send).toHaveBeenCalledWith(pausedThrowJob.name, { id: 't1' }, { startAfter: 600, singletonKey: 'tk' });
  });
});

describe('local concurrency (Phase 7c2)', () => {
  afterEach(() => vi.restoreAllMocks());
  const waitFor = async (ok: () => boolean) => {
    const deadline = Date.now() + 15_000;
    while (!ok()) {
      if (Date.now() > deadline) throw new Error('timeout');
      await new Promise((r) => setTimeout(r, 100));
    }
  };
  /** Handlers block on a shared latch; tracks how many run at once. */
  const latched = () => {
    const s = { active: 0, peak: 0, finished: 0, ran: [] as string[], release: () => {} };
    let gate = new Promise<void>((r) => { s.release = r; });
    const handler = async (d: { id: string; fail?: boolean }) => {
      s.active++;
      s.peak = Math.max(s.peak, s.active);
      try {
        if (d.fail) throw new Error('poller boom');
        await gate;
        s.ran.push(d.id);
      } finally {
        s.active--;
        s.finished++;
      }
    };
    const reset = () => { gate = new Promise<void>((r) => { s.release = r; }); };
    return { s, handler, reset };
  };
  const schema = z.object({ id: z.string(), fail: z.boolean().optional() });
  /** Drops queued jobs an aborted earlier run left behind (they would be picked up here); stale active ones just expire. */
  const fresh = async (b: typeof boss, name: string) => { await b.purgeQueue(name); };

  it('a job with localConcurrency 3 runs 3 handlers at once', async () => {
    const { s, handler } = latched();
    const job = defineJob({ name: 'test-conc-3', schema, handler, localConcurrency: 3, queue: { retryLimit: 0 } });
    await fresh(boss, job.name);
    await registerJobs(boss, [job], { pollingIntervalSeconds: 0.5 });
    for (const id of ['a', 'b', 'c']) await boss.send(job.name, { id });
    await waitFor(() => s.active === 3);
    expect(s.peak).toBe(3);
    s.release();
    await waitFor(() => s.ran.length === 3);
  });

  it('a handler that throws on one poller does not stop the others', async () => {
    const { s, handler, reset } = latched();
    const job = defineJob({ name: 'test-conc-throw', schema, handler, localConcurrency: 2, queue: { retryLimit: 0 } });
    vi.spyOn(workerLog, 'child').mockReturnValue({ ...workerLog, error: vi.fn(), warn: vi.fn() });
    await fresh(boss, job.name);
    await registerJobs(boss, [job], { pollingIntervalSeconds: 0.5 });
    s.release();
    const failId = (await boss.send(job.name, { id: 'f', fail: true })) as string;
    await boss.send(job.name, { id: 'ok1' });
    await waitFor(() => s.ran.includes('ok1'));
    await waitFor(() => s.finished === 2);
    expect((await boss.getJobById(job.name, failId))?.state).toBe('failed');
    // Both pollers still pick up work: two blocked jobs run at the same time.
    reset();
    await boss.send(job.name, { id: 'x' });
    await boss.send(job.name, { id: 'y' });
    await waitFor(() => s.active === 2);
    s.release();
    await waitFor(() => s.ran.includes('x') && s.ran.includes('y'));
  });

  it('createQueue is called once per job', async () => {
    const createQueue = vi.spyOn(boss, 'createQueue');
    const updateQueue = vi.spyOn(boss, 'updateQueue');
    const work = vi.spyOn(boss, 'work');
    const job = defineJob({ name: 'test-conc-once', schema, handler: async () => {}, localConcurrency: 3, queue: { retryLimit: 0, policy: 'short' } });
    await registerJobs(boss, [job], { pollingIntervalSeconds: 0.5 });
    expect(createQueue).toHaveBeenCalledTimes(1);
    expect(updateQueue).toHaveBeenCalledTimes(1);
    expect(work).toHaveBeenCalledTimes(3);
    for (const call of work.mock.calls) expect(call[1]).toEqual({ pollingIntervalSeconds: 0.5, includeMetadata: true, batchSize: 1 });
    // One shared handler: the 7b1 deferral and runJob wrap every poller the same way.
    expect(new Set(work.mock.calls.map((c) => c[2])).size).toBe(1);
  });

  it('stop({ graceful, wait }) resolves only after every in-flight handler finished', async () => {
    const own = createBoss(url);
    await own.start();
    const { s, handler } = latched();
    const job = defineJob({ name: 'test-conc-stop', schema, handler, localConcurrency: 3, queue: { retryLimit: 0 } });
    await fresh(own, job.name);
    await registerJobs(own, [job], { pollingIntervalSeconds: 0.5 });
    for (const id of ['s1', 's2', 's3']) await own.send(job.name, { id });
    await waitFor(() => s.active === 3);
    let stopped = false;
    const stopping = own.stop({ graceful: true, wait: true, timeout: 20_000 }).then(() => { stopped = true; });
    await new Promise((r) => setTimeout(r, 1500));
    expect(stopped).toBe(false);
    s.release();
    await stopping;
    expect(s.finished).toBe(3);
    expect(s.ran.sort()).toEqual(['s1', 's2', 's3']);
  });
});
