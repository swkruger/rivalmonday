import { type Ai, createAiFromEnv, DEFAULT_AI_CONFIG_PATH, loadAiConfigFile } from '@cs/ai';
import {
  capturePage, claimDuePages, claimDueSources, collectGbpProfile, collectGoogleAds, collectMetaAds, collectReadyJobs, collectReadyReviews,
  createDataForSeo, type DataForSeoClient, createPlaywrightRenderer, createPoliteRenderer, defaultFetchText, DFS_BASE_URL, discoverPages,
  HostRateLimiter, markSourceResult, postJobTasks, postReviewTasks, type Renderer, requireSalt, RobotsPolicy, scanRankings, type SourceKind,
  suggestCompetitors,
} from '@cs/collectors';
import type { CaptureStatus } from '@cs/core';
import { client, competitor, createDb, createLedgerSink, type Db } from '@cs/db';
import { createStoreFromEnv, type ObjectStore } from '@cs/storage';
import { eq, inArray, sql } from 'drizzle-orm';

export interface WorkerDeps {
  claimDuePages(limit: number): Promise<string[]>;
  capturePage(trackedPageId: string): Promise<{ status: CaptureStatus | 'missing' }>;
  discoverPages(competitorId: string): Promise<{ selected: number; candidates: number; homepageStatus: string } | { skipped: string }>;
  /** True once DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD are both set — gates all vendor collection. */
  vendorsConfigured(): boolean;
  claimDueSources(limit: number): Promise<{ competitorId: string; source: SourceKind }[]>;
  runSource(competitorId: string, source: 'gbp' | 'ads_google' | 'ads_meta'): Promise<{ status: string }>;
  postBatchTasks(items: { competitorId: string; source: 'reviews' | 'jobs' }[]): Promise<void>;
  pollVendorTasks(): Promise<{ reviews: { collected: number; failed: number }; jobs: { collected: number; failed: number } }>;
  scanRankings(clientId: string): Promise<{ snapshots: number }>;
  listRankClients(): Promise<string[]>;
  suggestCompetitors(clientId: string): Promise<{ suggested: number; searches: number }>;
  close(): Promise<void>;
}

/** Everything is created lazily so importing this module has no side effects. */
export function createWorkerDeps(env: NodeJS.ProcessEnv): WorkerDeps {
  let db: { db: Db; close(): Promise<void> } | null = null;
  let store: ObjectStore | null = null;
  let renderer: Renderer | null = null;
  let ai: Promise<Ai> | null = null;
  const robots = new RobotsPolicy(defaultFetchText);
  // In-process rate limiting: per-host politeness (spec §4.2) only holds with exactly one worker
  // replica. The deployment is a single always-on worker container by design; scaling out to
  // multiple replicas would need a shared (e.g. DB- or Redis-backed) limiter instead of this one.
  const limiter = new HostRateLimiter();

  const getDb = () => {
    if (!db) {
      const url = env.SERVICE_DATABASE_URL;
      if (!url) throw new Error('SERVICE_DATABASE_URL is required');
      db = createDb(url);
    }
    return db.db;
  };
  const getStore = () => (store ??= createStoreFromEnv(env));
  const getRenderer = () => (renderer ??= createPoliteRenderer({ robots, limiter, renderer: createPlaywrightRenderer() }));
  let dfs: DataForSeoClient | null = null;
  const getDfs = () => {
    if (!dfs) {
      if (!env.DATAFORSEO_LOGIN || !env.DATAFORSEO_PASSWORD) throw new Error('DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD are required');
      dfs = createDataForSeo({ login: env.DATAFORSEO_LOGIN, password: env.DATAFORSEO_PASSWORD, baseUrl: env.DATAFORSEO_BASE_URL ?? DFS_BASE_URL, ledger: createLedgerSink(getDb()) });
    }
    return dfs;
  };
  const loadCompetitors = (ids: string[]) => getDb().select().from(competitor).where(inArray(competitor.id, ids));
  // A rejected init must not be cached forever (the worker keeps this deps object alive for its
  // whole lifetime): clear it so the next discoverPages call retries instead of replaying the same failure.
  const getAi = () =>
    (ai ??= loadAiConfigFile(DEFAULT_AI_CONFIG_PATH)
      .then((cfg) => createAiFromEnv(env, cfg, createLedgerSink(getDb())))
      .catch((err) => {
        ai = null;
        throw err;
      }));

  return {
    claimDuePages: (limit) => claimDuePages(getDb(), limit),
    capturePage: (id) => capturePage({ db: getDb(), store: getStore(), renderer: getRenderer() }, id),
    async discoverPages(competitorId) {
      const [c] = await getDb().select().from(competitor).where(eq(competitor.id, competitorId)).limit(1);
      if (!c?.domain) return { skipped: 'competitor has no domain' };
      return discoverPages({ db: getDb(), renderer: getRenderer(), robots, fetchText: defaultFetchText, limiter, ai: await getAi() }, { id: c.id, domain: c.domain });
    },
    vendorsConfigured: () => Boolean(env.DATAFORSEO_LOGIN && env.DATAFORSEO_PASSWORD),
    claimDueSources: (limit) => claimDueSources(getDb(), limit),
    async runSource(competitorId, source) {
      const [c] = await loadCompetitors([competitorId]);
      if (!c) return { status: 'missing' };
      const base = { db: getDb(), store: getStore() };
      const r =
        source === 'gbp' ? await collectGbpProfile({ ...base, dfs: getDfs() }, c)
        : source === 'ads_google' ? await collectGoogleAds({ ...base, dfs: getDfs() }, c)
        : await collectMetaAds({ ...base, ledger: createLedgerSink(getDb()), apify: env.APIFY_TOKEN ? { token: env.APIFY_TOKEN } : undefined, scrapeCreators: env.SCRAPECREATORS_API_KEY ? { apiKey: env.SCRAPECREATORS_API_KEY } : undefined }, c);
      await markSourceResult(getDb(), competitorId, source, r.status);
      return r;
    },
    async postBatchTasks(items) {
      const reviewIds = items.filter((i) => i.source === 'reviews').map((i) => i.competitorId);
      const jobIds = items.filter((i) => i.source === 'jobs').map((i) => i.competitorId);
      if (reviewIds.length > 0) {
        const rows = await loadCompetitors(reviewIds);
        const firstPull = new Set(((await getDb().execute(sql`
          SELECT c.id FROM competitor c WHERE c.id = ANY(ARRAY[${sql.join(reviewIds.map((id) => sql`${id}`), sql`, `)}]::uuid[])
            AND NOT EXISTS (SELECT 1 FROM review r WHERE r.competitor_id = c.id)`)) as unknown as { id: string }[]).map((r) => r.id));
        await postReviewTasks({ db: getDb(), dfs: getDfs() }, rows.map((c) => ({ id: c.id, placeId: c.placeId, cid: c.cid, backfill: firstPull.has(c.id) })));
        for (const id of reviewIds) await markSourceResult(getDb(), id, 'reviews', 'posted');
      }
      if (jobIds.length > 0) {
        const rows = await loadCompetitors(jobIds);
        await postJobTasks({ db: getDb(), dfs: getDfs() }, rows.map((c) => ({ id: c.id, name: c.name })));
        for (const id of jobIds) await markSourceResult(getDb(), id, 'jobs', 'posted');
      }
    },
    async pollVendorTasks() {
      const base = { db: getDb(), store: getStore(), dfs: getDfs() };
      const reviews = await collectReadyReviews({ ...base, salt: requireSalt(env) });
      const jobs = await collectReadyJobs(base);
      return { reviews, jobs };
    },
    scanRankings: (clientId) => scanRankings({ db: getDb(), dfs: getDfs() }, clientId),
    async listRankClients() {
      const rows = await getDb().select({ id: client.id }).from(client).where(sql`${client.serviceArea} IS NOT NULL AND jsonb_array_length(${client.keywords}) > 0`);
      return rows.map((r) => r.id);
    },
    suggestCompetitors: (clientId) => suggestCompetitors({ db: getDb(), dfs: getDfs() }, clientId),
    async close() {
      await renderer?.close();
      await db?.close();
    },
  };
}
