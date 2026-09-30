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

beforeAll(async () => {
  await boss.start();
  await registerJobs(boss, [echoJob], { pollingIntervalSeconds: 0.5 });
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
});
