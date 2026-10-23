import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
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

const failJob = defineJob({ name: 'test-fail', schema: z.object({}), handler: async () => { throw new Error('nope'); }, queue: { retryLimit: 0 } });

const shortJob = defineJob({ name: 'test-short', schema: z.object({ id: z.string() }), handler: async () => {}, queue: { retryLimit: 0, policy: 'short' } });

beforeAll(async () => {
  await boss.start();
  await registerJobs(boss, [echoJob, singleShotJob, shortJob, outputJob, failJob, aiJob, plainJob], { pollingIntervalSeconds: 0.5, aiPaused: async () => aiState.paused });
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
});
