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
const rehearsal = vi.hoisted(() => ({ createRehearsalAi: vi.fn((_o: unknown) => ({ rehearsal: true })), loadRehearsalLatency: vi.fn(async () => ({ brief_writer: { p50: 1, p90: 2, p99: 3 } })) }));
vi.mock('@cs/engine', async (orig) => ({ ...(await orig<typeof import('@cs/engine')>()), ...rehearsal }));
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
import { createWorkerDeps, parseLiveClientIds, reviewsSkipReason } from './deps';

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

describe('VENDOR_FAKE_MODE=fixtures (7c2)', () => {
  const env = { NODE_ENV: 'development', VENDOR_FAKE_MODE: 'fixtures', SERVICE_DATABASE_URL: 'postgres://u:p@127.0.0.1:1/x', EVIDENCE_FS_DIR: './.evidence-test' } as NodeJS.ProcessEnv;
  const last = (m: { mock: { calls: unknown[][] } }) => m.mock.calls.at(-1)![0] as Record<string, unknown>;

  it('vendor clients get fixture fetches (through the limiter) and dummy keys pass the presence checks', async () => {
    vendorMocks.createDataForSeo.mockClear();
    vendorMocks.createStadiaStaticClient.mockClear();
    const deps = createWorkerDeps(env);
    expect(deps.vendorsConfigured()).toBe(true);
    await deps.runRivalSearch('run1');
    const rival = last(vendorMocks.runRivalSearch) as { dfs: unknown; meta: { apiKey?: string; apifyToken?: string; fetch: typeof fetch; apifyFetch: typeof fetch } };
    expect(rival.dfs).toBeDefined(); // the lazy getter builds the DataForSEO client (dummy keys pass)
    const dfsOpts = last(vendorMocks.createDataForSeo) as { login: string; fetch: typeof fetch };
    expect(dfsOpts.login).toBeTruthy();
    expect(rival.meta.apiKey).toBeTruthy();
    expect(rival.meta.apifyToken).toBeTruthy();
    // The fixture answers instead of the network: an unknown URL is a 599, a known one a 200 with cost 0.
    expect((await dfsOpts.fetch('https://example.invalid/x')).status).toBe(599);
    expect((await rival.meta.fetch('https://example.invalid/x')).status).toBe(599);
    expect((await rival.meta.apifyFetch('https://example.invalid/x')).status).toBe(599);
    const ready = await dfsOpts.fetch('https://api.dataforseo.com/v3/serp/google/jobs/tasks_ready');
    expect(await ready.json()).toMatchObject({ status_code: 20000, cost: 0 });
    await deps.refreshRankMap('c1').catch(() => undefined);
    expect(vendorMocks.createStadiaStaticClient).toHaveBeenCalledTimes(1);
    expect(((await (last(vendorMocks.createStadiaStaticClient).fetch as typeof fetch)('https://example.invalid/x')).status)).toBe(599);
  });

  it('no faked-vendor key (dummy or operator-set) reaches the platform cost snapshot env; other cost keys do', () => {
    const deps = createWorkerDeps({ ...env, OPENROUTER_API_KEY: 'or-real', APIFY_TOKEN: 'fixture' });
    expect(deps.platformCosts().env).toEqual({ OPENROUTER_API_KEY: 'or-real' });
    const live = createWorkerDeps({ SERVICE_DATABASE_URL: env.SERVICE_DATABASE_URL, OPENROUTER_API_KEY: 'or-real', APIFY_TOKEN: 'apify-real' } as NodeJS.ProcessEnv);
    expect(live.platformCosts().env).toEqual({ OPENROUTER_API_KEY: 'or-real', APIFY_TOKEN: 'apify-real' });
  });

  it('without the switch nothing is faked and missing keys stay missing', () => {
    const deps = createWorkerDeps({ SERVICE_DATABASE_URL: 'postgres://u:p@127.0.0.1:1/x' } as NodeJS.ProcessEnv);
    expect(deps.vendorsConfigured()).toBe(false);
  });
});

describe('AI_PROVIDER_MODE=rehearsal (7c2)', () => {
  const env = { SERVICE_DATABASE_URL: 'postgres://u:p@127.0.0.1:1/x', NODE_ENV: 'test' } as NodeJS.ProcessEnv;

  it('parses REHEARSAL_LIVE_CLIENT_IDS (comma-separated, blanks dropped)', () => {
    expect([...parseLiveClientIds(' a, b ,,c ')]).toEqual(['a', 'b', 'c']);
    expect(parseLiveClientIds(undefined).size).toBe(0);
  });

  it('wraps the guarded live Ai in the rehearsal Ai, sharing the one guard', async () => {
    createAiFromEnv.mockClear();
    rehearsal.createRehearsalAi.mockClear();
    const deps = createWorkerDeps({ ...env, AI_PROVIDER_MODE: 'rehearsal', REHEARSAL_LIVE_CLIENT_IDS: 'c1,c2' });
    await deps.collectModelBatches().catch(() => undefined);
    expect(createAiFromEnv).toHaveBeenCalledTimes(1);
    const args = createAiFromEnv.mock.calls[0] as unknown[];
    expect(args[4]).toBe(deps.aiGuard());
    expect(typeof (args[5] as { openrouter: unknown }).openrouter).toBe('function');
    expect(rehearsal.createRehearsalAi).toHaveBeenCalledTimes(1);
    const o = rehearsal.createRehearsalAi.mock.calls[0]![0] as { live: unknown; liveClientIds: Set<string>; latency: unknown; guard: unknown; ledger: unknown };
    expect(o.live).toBe(createAiFromEnv.mock.results[0]!.value);
    expect([...o.liveClientIds]).toEqual(['c1', 'c2']);
    expect(o.latency).toEqual({ brief_writer: { p50: 1, p90: 2, p99: 3 } });
    expect(o.guard).toBe(deps.aiGuard());
    expect(o.ledger).toBeDefined();
  });

  it('live mode (or unset) builds only the prod Ai', async () => {
    rehearsal.createRehearsalAi.mockClear();
    for (const mode of ['live', undefined]) {
      createAiFromEnv.mockClear();
      await createWorkerDeps({ ...env, AI_PROVIDER_MODE: mode }).collectModelBatches().catch(() => undefined);
      expect(createAiFromEnv).toHaveBeenCalledTimes(1);
    }
    expect(rehearsal.createRehearsalAi).not.toHaveBeenCalled();
  });
});
