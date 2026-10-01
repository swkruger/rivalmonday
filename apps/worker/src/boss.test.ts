import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createBoss, enqueue, registerJobs } from './boss';
import { defineJob } from './jobs';

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

beforeAll(async () => {
  await boss.start();
  await registerJobs(boss, [echoJob, singleShotJob], { pollingIntervalSeconds: 0.5 });
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
