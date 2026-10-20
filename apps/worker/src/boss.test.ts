import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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

const failJob = defineJob({ name: 'test-fail', schema: z.object({}), handler: async () => { throw new Error('nope'); }, queue: { retryLimit: 0 } });

const shortJob = defineJob({ name: 'test-short', schema: z.object({ id: z.string() }), handler: async () => {}, queue: { retryLimit: 0, policy: 'short' } });

beforeAll(async () => {
  await boss.start();
  await registerJobs(boss, [echoJob, singleShotJob, shortJob, outputJob, failJob], { pollingIntervalSeconds: 0.5 });
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
    vi.restoreAllMocks();
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
