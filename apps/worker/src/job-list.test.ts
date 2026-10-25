import type PgBoss from 'pg-boss';
import { describe, expect, it } from 'vitest';
import type { WorkerDeps } from './deps';
import { createJobList } from './job-list';

/** main.ts builds the job list with a late-bound deps Proxy that throws if touched before `createWorkerDeps` runs. */
const throwing = <T extends object>(what: string): T =>
  new Proxy({} as T, {
    get: (_t, key) => {
      throw new Error(`${what} used during construction (${String(key)})`);
    },
  });

describe('createJobList', () => {
  it('does not touch deps (or the boss) while building the list', () => {
    const jobs = createJobList(throwing<WorkerDeps>('deps'), throwing<PgBoss>('boss'), { envName: 'dev', env: {} });
    expect(jobs.length).toBeGreaterThan(10);
    expect(new Set(jobs.map((j) => j.name)).size).toBe(jobs.length);
  });
});
