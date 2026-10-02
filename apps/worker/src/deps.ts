import { type Ai, createAiFromEnv, DEFAULT_AI_CONFIG_PATH, loadAiConfigFile } from '@cs/ai';
import {
  capturePage, claimDuePages, claimDueSources, collectGbpProfile, collectGoogleAds, collectMetaAds, collectReadyJobs, collectReadyReviews,
  createDataForSeo, type DataForSeoClient, createPlaywrightRenderer, createPoliteRenderer, defaultFetchText, DFS_BASE_URL, discoverPages,
  HostRateLimiter, markSourceResult, postJobTasks, postReviewTasks, releaseSources, type Renderer, requireSalt, RobotsPolicy, scanRankings,
  type SourceKind, suggestCompetitors,
} from '@cs/collectors';
import type { CaptureStatus } from '@cs/core';
import { client, competitor, createDb, createLedgerSink, type Db } from '@cs/db';
import { createPackLoader, diffWebCapture, type EngineWork, findEngineWork, scoreEvent as runScoreStage, tagChange as runTagStage } from '@cs/engine';
import { createStoreFromEnv, type ObjectStore } from '@cs/storage';
import { eq, inArray, sql } from 'drizzle-orm';

export interface WorkerDeps {
  claimDuePages(limit: number): Promise<string[]>;
  capturePage(trackedPageId: string): Promise<{ status: CaptureStatus | 'missing'; captureId?: string }>;
  /** True once OPENROUTER_API_KEY is set — gates the intelligence engine (embeddings + decisions). */
  engineConfigured(): boolean;
  diffCapture(captureId: string): Promise<{ ran: boolean; changeIds: string[] }>;
  tagChange(changeId: string): Promise<{ ran: boolean; eventId: string | null }>;
  scoreEvent(eventId: string): Promise<{ scored: number; failed: number }>;
  findEngineWork(limit: number): Promise<EngineWork>;
  discoverPages(competitorId: string): Promise<{ selected: number; candidates: number; homepageStatus: string } | { skipped: string }>;
  /** True once DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD are both set — gates all vendor collection. */
  vendorsConfigured(): boolean;
  claimDueSources(limit: number): Promise<{ competitorId: string; source: SourceKind }[]>;
  runSource(competitorId: string, source: 'gbp' | 'ads_google' | 'ads_meta'): Promise<{ status: string }>;
  /**
   * Posts reviews/jobs DataForSEO tasks. Reviews and jobs are handled independently: a failure
   * posting one never touches the other. Each item ends up 'posted' (task created), released
   * back to due-now with last_status 'post_failed' (a VendorError posting that chunk — retried
   * next tick), or 'skipped' (the competitor was ineligible, e.g. no placeId/cid or blank name —
   * never attempted). Reviews are not posted at all while REVIEWER_HASH_SALT is unusable (see
   * reviewsSkipReason) — they are marked 'skipped_no_salt'. Returns how many sources were released for retry, for logging.
   */
  postBatchTasks(items: { competitorId: string; source: 'reviews' | 'jobs' }[]): Promise<{ failed: number }>;
  pollVendorTasks(): Promise<{
    reviews: { collected: number; failed: number; reviews: number } | { skipped: string };
    jobs: { collected: number; failed: number; postings: number };
  }>;
  scanRankings(clientId: string): Promise<{ snapshots: number; failed: number }>;
  listRankClients(): Promise<string[]>;
  suggestCompetitors(clientId: string): Promise<{ suggested: number; searches: number }>;
  close(): Promise<void>;
}

/**
 * Returns a human-readable reason reviews must be skipped this poll (REVIEWER_HASH_SALT missing
 * or too short), or null once the salt is usable. Pulled out of pollVendorTasks so the
 * missing-salt branch is unit-testable without a live DB/DataForSEO client.
 */
export function reviewsSkipReason(env: NodeJS.ProcessEnv): string | null {
  try {
    requireSalt(env);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
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
  const packs = createPackLoader();

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
      dfs = createDataForSeo({ login: env.DATAFORSEO_LOGIN, password: env.DATAFORSEO_PASSWORD, baseUrl: env.DATAFORSEO_BASE_URL || DFS_BASE_URL, ledger: createLedgerSink(getDb()) });
    }
    return dfs;
  };
  const loadCompetitors = (ids: string[]) => getDb().select().from(competitor).where(inArray(competitor.id, ids));
  let warnedNoSalt = false;
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
    engineConfigured: () => Boolean(env.OPENROUTER_API_KEY),
    async diffCapture(captureId) {
      const r = await diffWebCapture({ db: getDb(), store: getStore(), ai: await getAi() }, captureId);
      return r.ran ? { ran: true, changeIds: r.result.changeIds } : { ran: false, changeIds: [] };
    },
    async tagChange(changeId) {
      const r = await runTagStage({ db: getDb(), ai: await getAi(), packs }, changeId);
      return r.ran ? { ran: true, eventId: r.result.eventId } : { ran: false, eventId: null };
    },
    async scoreEvent(eventId) {
      const { scored, failed } = await runScoreStage({ db: getDb(), packs }, eventId);
      return { scored, failed };
    },
    findEngineWork: (limit) => findEngineWork(getDb(), { limit }),
    async discoverPages(competitorId) {
      const [c] = await getDb().select().from(competitor).where(eq(competitor.id, competitorId)).limit(1);
      if (!c?.domain) return { skipped: 'competitor has no domain' };
      return discoverPages({ db: getDb(), renderer: getRenderer(), robots, fetchText: defaultFetchText, limiter, ai: await getAi() }, { id: c.id, domain: c.domain });
    },
    vendorsConfigured: () => Boolean(env.DATAFORSEO_LOGIN && env.DATAFORSEO_PASSWORD),
    claimDueSources: (limit) => claimDueSources(getDb(), limit),
    async runSource(competitorId, source) {
      const [c] = await loadCompetitors([competitorId]);
      if (!c) {
        await markSourceResult(getDb(), competitorId, source, 'missing');
        return { status: 'missing' };
      }
      const base = { db: getDb(), store: getStore() };
      try {
        const r =
          source === 'gbp' ? await collectGbpProfile({ ...base, dfs: getDfs() }, c)
          : source === 'ads_google' ? await collectGoogleAds({ ...base, dfs: getDfs() }, c)
          : await collectMetaAds({ ...base, ledger: createLedgerSink(getDb()), apify: env.APIFY_TOKEN ? { token: env.APIFY_TOKEN } : undefined, scrapeCreators: env.SCRAPECREATORS_API_KEY ? { apiKey: env.SCRAPECREATORS_API_KEY } : undefined }, c);
        await markSourceResult(getDb(), competitorId, source, r.status);
        return r;
      } catch (err) {
        // The collectors already catch VendorError internally (returning status: 'vendor_error');
        // anything that reaches here is unexpected (DB error, bug, …) — record it rather than
        // leaving the source's last_status stale, then let it propagate.
        await markSourceResult(getDb(), competitorId, source, 'error');
        throw err;
      }
    },
    async postBatchTasks(items) {
      const reviewIds = items.filter((i) => i.source === 'reviews').map((i) => i.competitorId);
      const jobIds = items.filter((i) => i.source === 'jobs').map((i) => i.competitorId);
      let failed = 0;
      // Reviews and jobs are posted and resolved independently below: a VendorError in one must
      // never affect the other's status (each has its own postedIds/failedIds from its own call).
      // Reviews can only be collected with a usable REVIEWER_HASH_SALT (vendor-poll skips them
      // otherwise), so never pay to post tasks that would just expire unfetched.
      const reviewsSkip = reviewIds.length > 0 ? reviewsSkipReason(env) : null;
      if (reviewsSkip) {
        if (!warnedNoSalt) {
          warnedNoSalt = true;
          console.log(`[vendor-schedule] not posting reviews: ${reviewsSkip}`);
        }
        for (const id of reviewIds) await markSourceResult(getDb(), id, 'reviews', 'skipped_no_salt');
      } else if (reviewIds.length > 0) {
        const rows = await loadCompetitors(reviewIds);
        const firstPull = new Set(((await getDb().execute(sql`
          SELECT c.id FROM competitor c WHERE c.id = ANY(ARRAY[${sql.join(reviewIds.map((id) => sql`${id}`), sql`, `)}]::uuid[])
            AND NOT EXISTS (SELECT 1 FROM review r WHERE r.competitor_id = c.id)`)) as unknown as { id: string }[]).map((r) => r.id));
        const { postedIds, failedIds } = await postReviewTasks({ db: getDb(), dfs: getDfs() }, rows.map((c) => ({ id: c.id, placeId: c.placeId, cid: c.cid, backfill: firstPull.has(c.id) })));
        const posted = new Set(postedIds);
        const failedSet = new Set(failedIds);
        for (const id of reviewIds) if (!failedSet.has(id)) await markSourceResult(getDb(), id, 'reviews', posted.has(id) ? 'posted' : 'skipped');
        if (failedIds.length > 0) {
          await releaseSources(getDb(), failedIds.map((id) => ({ competitorId: id, source: 'reviews' as const })), 'post_failed');
          failed += failedIds.length;
        }
      }
      if (jobIds.length > 0) {
        const rows = await loadCompetitors(jobIds);
        const { postedIds, failedIds } = await postJobTasks({ db: getDb(), dfs: getDfs() }, rows.map((c) => ({ id: c.id, name: c.name })));
        const posted = new Set(postedIds);
        const failedSet = new Set(failedIds);
        for (const id of jobIds) if (!failedSet.has(id)) await markSourceResult(getDb(), id, 'jobs', posted.has(id) ? 'posted' : 'skipped');
        if (failedIds.length > 0) {
          await releaseSources(getDb(), failedIds.map((id) => ({ competitorId: id, source: 'jobs' as const })), 'post_failed');
          failed += failedIds.length;
        }
      }
      return { failed };
    },
    async pollVendorTasks() {
      const base = { db: getDb(), store: getStore(), dfs: getDfs() };
      const skipReason = reviewsSkipReason(env);
      let reviews: { collected: number; failed: number; reviews: number } | { skipped: string };
      if (skipReason) {
        if (!warnedNoSalt) {
          warnedNoSalt = true;
          console.log(`[vendor-poll] skipping reviews: ${skipReason}`);
        }
        reviews = { skipped: skipReason };
      } else {
        reviews = await collectReadyReviews({ ...base, salt: requireSalt(env) });
      }
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
