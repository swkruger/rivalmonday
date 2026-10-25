import type PgBoss from 'pg-boss';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { appPoolMax, applyConcurrency, parseConcurrencyOverrides, QUEUE_CONCURRENCY } from './concurrency';
import type { WorkerDeps } from './deps';
import { createJobList } from './job-list';
import { defineJob } from './jobs';

// The job factories only touch deps/boss inside handlers, so empty stubs are enough to list the names.
const names = createJobList({} as WorkerDeps, {} as PgBoss, { envName: 'dev', env: {} }).map((j) => j.name);
const env = (v: string): NodeJS.ProcessEnv => ({ WORKER_QUEUE_CONCURRENCY: v });

describe('QUEUE_CONCURRENCY', () => {
  it('every QUEUE_CONCURRENCY key is a registered job name', () => {
    for (const key of Object.keys(QUEUE_CONCURRENCY)) expect(names).toContain(key);
  });

  it('holds the decision-6 values', () => {
    expect(QUEUE_CONCURRENCY).toEqual({
      'rival-search': 4, 'vendor-collect': 4, 'brief-client': 4, 'web-capture-page': 4,
      'starting-point-client': 3, 'engine-tag': 3, 'engine-review': 3,
      'prospect-snapshot': 2, 'rank-scan': 2, 'setup-suggestions': 2, 'runbook-tailor': 2, 'rival-monthly-client': 2,
    });
  });
});

describe('parseConcurrencyOverrides', () => {
  it('parses "brief-client=6,rival-search=5"', () => {
    expect(parseConcurrencyOverrides(env('brief-client=6,rival-search=5'), names)).toEqual({ 'brief-client': 6, 'rival-search': 5 });
  });

  it('is empty when unset or blank, and tolerates spaces', () => {
    expect(parseConcurrencyOverrides({}, names)).toEqual({});
    expect(parseConcurrencyOverrides(env('  '), names)).toEqual({});
    expect(parseConcurrencyOverrides(env(' brief-client = 2 , '), names)).toEqual({ 'brief-client': 2 });
  });

  it.each(['brief-client=9', 'brief-client=0', 'x=2', 'brief-client', 'brief-client=1.5', 'brief-client=abc'])('rejects "%s", naming the bad entry', (v) => {
    expect(() => parseConcurrencyOverrides(env(v), names)).toThrow(new RegExp(`WORKER_QUEUE_CONCURRENCY.*"${v}"`));
  });

  it('names the known queues for an unknown queue', () => {
    expect(() => parseConcurrencyOverrides(env('x=2'), ['a-queue', 'b-queue'])).toThrow(/a-queue, b-queue/);
  });
});

describe('appPoolMax', () => {
  it('appPoolMax of the defaults is 33', () => {
    expect(appPoolMax(Object.values(QUEUE_CONCURRENCY).map((c) => ({ localConcurrency: c })))).toBe(33);
  });

  it('counts unset and 1 as no extra connection', () => {
    expect(appPoolMax([{}, { localConcurrency: 1 }])).toBe(10);
  });
});

describe('applyConcurrency', () => {
  const a = defineJob({ name: 'a', schema: z.object({}), handler: async () => {} });
  const b = defineJob({ name: 'b', schema: z.object({}), handler: async () => {}, localConcurrency: 2 });

  it('stamps localConcurrency from the table; jobs not in it keep theirs', () => {
    const out = applyConcurrency([a, b], { a: 3 });
    expect(out.map((j) => j.localConcurrency)).toEqual([3, 2]);
  });

  it('applyConcurrency does not mutate its input', () => {
    const input = [a, b];
    const out = applyConcurrency(input, { a: 3, b: 5 });
    expect(a.localConcurrency).toBeUndefined();
    expect(b.localConcurrency).toBe(2);
    expect(input).toEqual([a, b]);
    expect(out[0]).not.toBe(a);
    expect(out[0]!.handler).toBe(a.handler);
  });
});
