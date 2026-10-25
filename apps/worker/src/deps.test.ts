import { describe, expect, it, vi } from 'vitest';

const createAiFromEnv = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock('@cs/ai', async (orig) => ({ ...(await orig<typeof import('@cs/ai')>()), createAiFromEnv, loadAiConfigFile: async () => ({}) }));
const vendorMocks = vi.hoisted(() => ({
  createDataForSeo: vi.fn(() => ({})),
  createStadiaStaticClient: vi.fn(() => ({})),
  refreshRankMap: vi.fn(async () => undefined),
  runRivalSearch: vi.fn(async (_deps: unknown, _id: string) => ({ status: 'done' as const })),
  collectMetaAds: vi.fn(async () => ({ status: 'ok' })),
  claimDueSources: vi.fn(),
}));
const robotsArgs = vi.hoisted(() => [] as unknown[][]);
vi.mock('@cs/collectors', async (orig) => {
  const real = await orig<typeof import('@cs/collectors')>();
  class RobotsPolicy extends real.RobotsPolicy {
    constructor(...args: ConstructorParameters<typeof real.RobotsPolicy>) {
      super(...args);
      robotsArgs.push(args);
    }
  }
  return { ...real, ...vendorMocks, RobotsPolicy };
});
import { HostRateLimiter } from '@cs/collectors';
import { createWorkerDeps, reviewsSkipReason } from './deps';

describe('reviewsSkipReason', () => {
  it('flags a missing REVIEWER_HASH_SALT', () => {
    expect(reviewsSkipReason({})).toMatch(/REVIEWER_HASH_SALT/);
  });

  it('flags a REVIEWER_HASH_SALT shorter than 32 characters', () => {
    expect(reviewsSkipReason({ REVIEWER_HASH_SALT: 'short' })).toMatch(/REVIEWER_HASH_SALT/);
  });

  it('is null once the salt is long enough', () => {
    expect(reviewsSkipReason({ REVIEWER_HASH_SALT: 's'.repeat(32) })).toBeNull();
  });
});

describe('aiGuard', () => {
  it('builds one shared guard for the daemon', () => {
    const deps = createWorkerDeps({ SERVICE_DATABASE_URL: 'postgres://u:p@127.0.0.1:1/x' } as NodeJS.ProcessEnv);
    expect(deps.aiGuard()).toBe(deps.aiGuard());
    expect(typeof deps.aiGuard()!.assertAllowed).toBe('function');
  });

  it('the *-once CLIs opt out: no guard is built or passed to Ai', async () => {
    const env = { SERVICE_DATABASE_URL: 'postgres://u:p@127.0.0.1:1/x' } as NodeJS.ProcessEnv;
    const off = createWorkerDeps(env, { aiGuard: false });
    expect(off.aiGuard()).toBeUndefined();
    createAiFromEnv.mockClear();
    await off.collectModelBatches().catch(() => undefined);
    expect(createAiFromEnv).toHaveBeenCalledTimes(1);
    expect((createAiFromEnv.mock.calls[0] as unknown[])[4]).toBeUndefined();
    const on = createWorkerDeps(env);
    createAiFromEnv.mockClear();
    await on.collectModelBatches().catch(() => undefined);
    expect((createAiFromEnv.mock.calls[0] as unknown[])[4]).toBe(on.aiGuard());
  });
});

describe('app pool (Phase 7c2)', () => {
  const DIRECT = 'postgres://u:p@127.0.0.1:1/direct';
  const POOLED = 'postgres://u:p@127.0.0.1:1/pooled';
  const clientOf = (deps: ReturnType<typeof createWorkerDeps>) => (deps.serviceDb() as unknown as { $client: { options: { max: number; prepare: boolean; database: string } } }).$client.options;

  it('uses the pooled URL without prepared statements, sized by appPoolMax', () => {
    const o = clientOf(createWorkerDeps({ SERVICE_DATABASE_URL: DIRECT, SERVICE_DATABASE_POOLED_URL: POOLED } as NodeJS.ProcessEnv, { appPoolMax: 33 }));
    expect(o).toMatchObject({ max: 33, prepare: false, database: 'pooled' });
  });

  it('falls back to the direct URL (prepared statements on) with max 5 by default', () => {
    const o = clientOf(createWorkerDeps({ SERVICE_DATABASE_URL: DIRECT, SERVICE_DATABASE_POOLED_URL: ' ' } as NodeJS.ProcessEnv));
    expect(o).toMatchObject({ max: 5, prepare: true, database: 'direct' });
  });
});

describe('vendor limiter (Phase 7c2)', () => {
  const env = { SERVICE_DATABASE_URL: 'postgres://u:p@127.0.0.1:1/x', DATAFORSEO_LOGIN: 'l', DATAFORSEO_PASSWORD: 'p', STADIA_API_KEY: 'k', SCRAPECREATORS_API_KEY: 's', APIFY_TOKEN: 't', EVIDENCE_FS_DIR: './.evidence-test' } as NodeJS.ProcessEnv;
  const calls = (m: { mock: { calls: unknown[][] } }) => m.mock.calls[0] as unknown[];

  it('vendor clients get the limited fetch', async () => {
    const deps = createWorkerDeps(env);
    await deps.runRivalSearch('run1');
    const rival = calls(vendorMocks.runRivalSearch)[0] as { dfs: unknown; meta: { fetch: unknown; apifyFetch: unknown } };
    void rival.dfs; // the lazy getter builds the DataForSEO client
    expect(typeof (calls(vendorMocks.createDataForSeo)[0] as { fetch: unknown }).fetch).toBe('function');
    expect(typeof rival.meta.fetch).toBe('function');
    expect(typeof rival.meta.apifyFetch).toBe('function');
    expect(rival.meta.fetch).not.toBe(rival.meta.apifyFetch);
    await deps.refreshRankMap('c1').catch(() => undefined);
    expect(typeof (calls(vendorMocks.createStadiaStaticClient)[0] as { fetch: unknown }).fetch).toBe('function');
  });

  it('openrouter and jev calls get their own limited fetches', async () => {
    createAiFromEnv.mockClear();
    await createWorkerDeps(env).collectModelBatches().catch(() => undefined);
    const http = (createAiFromEnv.mock.calls[0] as unknown[])[5] as { openrouter: unknown; jev: unknown };
    expect(typeof http.openrouter).toBe('function');
    expect(typeof http.jev).toBe('function');
    expect(http.openrouter).not.toBe(http.jev);
  });

  it('builds Ai once per deps and reuses its limited fetches', async () => {
    createAiFromEnv.mockClear();
    const a = createWorkerDeps(env);
    await a.collectModelBatches().catch(() => undefined);
    await a.collectModelBatches().catch(() => undefined);
    expect(createAiFromEnv).toHaveBeenCalledTimes(1);
  });
});

describe('web politeness (Phase 7c2)', () => {
  it('the robots policy takes its fetch slots from the shared host limiter', () => {
    robotsArgs.length = 0;
    createWorkerDeps({ SERVICE_DATABASE_URL: 'postgres://u:p@127.0.0.1:1/x' } as NodeJS.ProcessEnv);
    expect(robotsArgs).toHaveLength(1);
    expect(robotsArgs[0]![4]).toBeInstanceOf(HostRateLimiter);
  });
});

describe('CRAWL_HOST_ALLOWLIST (7c2)', () => {
  it('narrows the robots fetch to listed hosts; unset keeps the standard guard', async () => {
    robotsArgs.length = 0;
    createWorkerDeps({ NODE_ENV: 'development', CRAWL_HOST_ALLOWLIST: ' Listed.example, other.example ' });
    const withList = robotsArgs.at(-1)![0] as (url: string) => Promise<unknown>;
    await expect(withList('https://unlisted.example/robots.txt')).rejects.toMatchObject({ code: 'ssrf_blocked' });
    await expect(withList('https://www.listed.example/robots.txt')).rejects.toMatchObject({ code: 'ssrf_blocked' });
    expect(() => createWorkerDeps({ CRAWL_HOST_ALLOWLIST: ',', NODE_ENV: 'development' })).toThrow(/CRAWL_HOST_ALLOWLIST has no hosts/);
    createWorkerDeps({});
    expect(robotsArgs.at(-1)![0]).toBe((await import('@cs/collectors')).defaultFetchText);
  });
});

describe('createWorkerDeps rehearsal guard (7c2)', () => {
  it('createWorkerDeps throws in production when VENDOR_FAKE_MODE is set', () => {
    expect(() => createWorkerDeps({ NODE_ENV: 'production', VENDOR_FAKE_MODE: 'fixtures' })).toThrow(/refusing rehearsal settings outside staging: VENDOR_FAKE_MODE/);
  });
});
