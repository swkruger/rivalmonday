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

  it('the sweep enqueues engine-listed-events with a per-capture singleton key', async () => {
    const sends: { name: string; data: unknown; opts: unknown }[] = [];
    const boss = { send: async (name: string, data: unknown, opts: unknown) => (sends.push({ name, data, opts }), 'job') } as unknown as PgBoss;
    const id = '00000000-0000-4000-8000-000000000002';
    const none = { diff: [], tag: [], score: [], rankDiff: [], reviews: [], prices: [], adPrices: [], postPrices: [], siteFeatures: [], reask: [], adImages: [], adImageReads: [] };
    const deps = { engineConfigured: () => true, findEngineWork: async () => ({ ...none, listedEvents: [id] }) } as unknown as WorkerDeps;
    const jobs = createJobList(deps, boss, { envName: 'dev', env: {} });
    expect(jobs.find((j) => j.name === 'engine-listed-events')).toBeDefined();
    await jobs.find((j) => j.name === 'engine-sweep')!.handler({});
    expect(sends).toEqual([{ name: 'engine-listed-events', data: { captureId: id }, opts: { singletonKey: `listed-events:${id}` } }]);
  });

  it('deferred ad image re-enqueues with startAfter and the same singleton key', async () => {
    const sends: { name: string; data: unknown; opts: unknown }[] = [];
    const boss = { send: async (name: string, data: unknown, opts: unknown) => (sends.push({ name, data, opts }), 'job') } as unknown as PgBoss;
    const deps = { adImagesEnabled: () => true, triageAdImage: async () => ({ status: 'deferred', retryInMs: 2_500 }) } as unknown as WorkerDeps;
    const jobs = createJobList(deps, boss, { envName: 'dev', env: {} });
    const adImage = jobs.find((j) => j.name === 'engine-ad-image')!;
    const adImageRead = jobs.find((j) => j.name === 'engine-ad-image-read');
    expect(adImageRead).toBeDefined();
    const id = '00000000-0000-4000-8000-000000000001';
    expect(await adImage.handler({ adId: id })).toEqual({ deferred: true });
    expect(sends).toEqual([{ name: 'engine-ad-image', data: { adId: id }, opts: { singletonKey: `ad-image:${id}`, startAfter: 3 } }]);
  });
});
