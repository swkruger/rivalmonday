import { type Ai, type AiConfig, createAiFromEnv, DEFAULT_AI_CONFIG_PATH, loadAiConfigFile } from '@cs/ai';
import {
  capturePage, claimDuePages, claimDueSources, collectGbpProfile, computeTrackedSignals, failRivalRun, finaliseRivalSearch, listSignalClients, runRivalSearch, type RivalSearchDeps, sweepRivalRuns, collectGoogleAds, collectMetaAds, collectReadyJobs, collectReadyReviews,
  createDataForSeo, createFixtureFetch, type DataForSeoClient, allowlistedAssert, createGuardedFetchText, createPlaywrightRenderer, createPoliteRenderer, defaultFetchText, DFS_BASE_URL, discoverPages,
  clientsNeedingRankMap as rankClientsNeedingMap, createStadiaStaticClient, refreshRankMap as refreshMap, ensureSelfCompetitors, failProspectReport, failStaleRankScans as failStaleScans, HostRateLimiter, listRankClients as rankClients, markSourceResult, postJobTasks, postReviewTasks, releaseSources, type Renderer, requireSalt, RobotsPolicy,
  runProspectSnapshot, scanRankings, type SourceKind, type CapturePageResult, type PoliteRenderer, zeroFixtureVendorCosts,
} from '@cs/collectors';
import { DEFAULT_SUPPORT_EMAIL, type AiGuard, type CallScope } from '@cs/core';
import { createVendorLimiter } from '@cs/core/server';
import { type AgencyBranding, competitor, type OpsAlert, catalogRows, createAiGuard, createDb, createDecisionSampleSink, createLedgerSink, type Db } from '@cs/db';
import { createCatalog } from '@cs/verticals';
import {
  analyzeReview as runAnalyzeReview, reaskReview as runReaskReview, type BatchCollectResult, type BriefRunResult, collectModelBatches, createEmailSender, createWebhookSender,
  deliverDueBriefs, deliveryConfigFromEnv, diffCapture, diffRankScan, dispatchDue,
  checkBriefReadiness, createRehearsalAi, type EngineWork, loadRehearsalLatency, extractPrices as runExtractPrices, findEngineWork, generateBrief, generateStartingPoint, listBriefDueClients, listStartingPointDue, listBriefsMissingPdf, listMoveClients, listReportsMissingPdf, type MovesRunResult,
  notifyBriefOutcome, notifyRankScanSkipped, processAlert, replyToFor, recommendForMoves, renderBriefPdf, renderReportPdf, type ReviewInsightsResult, runAlertDigests, runQuarterlyReports,
  runReviewInsights, loadClientRunbook, skipPendingRunbook, scoreEvent as runScoreStage, sweepAlerts, type SweepResult, tagChange as runTagStage, updateMovesForClient,
} from '@cs/engine';
import { generateStarters } from '@cs/ask';
import {
  type AgencyClientBillingNoticeProps, type AgencyWelcomeProps, type BillingNoticeProps, type ClientBillingNoticeProps, createEmailTransportFromEnv, type OnboardingTipProps,
  type PlatformOpsAlertProps, type PlatformSignupNoticeProps, renderEmail, resolveBranding,
} from '@cs/email';
import { type LeadEmailDeps, listMonthlyRivalClients, normalizeAdminEmails, platformOperatorEmails, type PlatformCostLowPayload, type PlatformCostSnapshotDeps, type PlatformSpendAlertPayload, type SpendGuardDeps, unsubscribeToken } from '@cs/tools';
import { createStoreFromEnv, type ObjectStore } from '@cs/storage';
import { eq, inArray, sql } from 'drizzle-orm';
import { lookup } from 'node:dns/promises';
import { runLeadPreview } from './jobs/leads';
import { runRunbookTailor } from './jobs/runbooks';
import { failPendingSuggestions, runSetupReminders, runSetupSuggestions } from './jobs/setup';
import { rehearsalEnvErrors } from './env';
import { createPdfRenderer } from './pdf';
import { workerLog } from './log';

/** Phase 10 (R5): the sign-up lifecycle emails on the `billing_notice` outbox (Rival Monday-branded). */
export type OnboardingEmail =
  /** The sender adds `supportEmail` (7c2: the same address as the Reply-To). */
  | { template: 'agency_welcome'; props: Omit<AgencyWelcomeProps, 'branding' | 'supportEmail'> }
  | { template: 'platform_signup_notice'; props: Omit<PlatformSignupNoticeProps, 'branding'> }
  /** The sender adds `unsubscribeUrl` (signed with BETTER_AUTH_SECRET) and the one-click List-Unsubscribe headers. */
  | { template: 'onboarding_tip'; props: Omit<OnboardingTipProps, 'branding' | 'unsubscribeUrl'> };

/** Phase 10 (R12): Reply-To of every sign-up lifecycle email. */
export const DEFAULT_SUPPORT_REPLY_TO = DEFAULT_SUPPORT_EMAIL;

export interface BillingEmailSender {
  /** APP_URL without a trailing slash. */
  appUrl: string;
  /** Phase 10 (R13): `PLATFORM_ADMIN_EMAILS`, normalised; with active owner|staff operators, the sign-up notice recipients. */
  platformAdmins: string[];
  /**
   * Phase 10: welcome / sign-up notice / setup tip. Reply-To `SUPPORT_REPLY_TO ?? support@rivalmonday.app`; tips go on the
   * broadcast stream with `List-Unsubscribe` (`<APP_URL/u/<token>>`) + `List-Unsubscribe-Post: List-Unsubscribe=One-Click`.
   */
  sendOnboarding(to: string, agencyId: string, email: OnboardingEmail): Promise<void>;
  send(to: string, agencyId: string, props: Omit<BillingNoticeProps, 'branding'>): Promise<void>;
  /** Phase 9b: agency-branded client email (no platform name anywhere); From display name and reply-to are the agency's. */
  sendClient(to: string, agencyId: string, clientId: string, from: { agencyName: string; branding: AgencyBranding | null }, props: Pick<ClientBillingNoticeProps, 'kind' | 'actionUrl'>): Promise<void>;
  /** Phase 9b: Rival Monday-branded email to an agency admin about one of its clients' payments. */
  sendAgencyClient(to: string, agencyId: string, props: Omit<AgencyClientBillingNoticeProps, 'branding'>): Promise<void>;
}

export interface BriefReadinessDeps {
  run(now: Date): Promise<{ open: OpsAlert[]; toEmail: OpsAlert[]; resolved: number }>;
  send(to: string, alert: OpsAlert): Promise<void>;
  recipients(): Promise<string[]>;
}

export interface WorkerDeps {
  /** The spend guard every worker AI call asks first (cached 30 s). */
  /** The daemon's shared spend guard; `undefined` when built with `{ aiGuard: false }` (the `*-once` CLIs). */
  aiGuard(): AiGuard | undefined;
  claimDuePages(limit: number): Promise<string[]>;
  /** 7c2: `deferred` (+ `retryInMs`) when the page's host is busy or its next slot is > 10 s away. */
  capturePage(trackedPageId: string): Promise<CapturePageResult>;
  /** True once OPENROUTER_API_KEY is set — gates the intelligence engine (embeddings + decisions). */
  engineConfigured(): boolean;
  diffCapture(captureId: string): Promise<{ ran: boolean; changeIds: string[] }>;
  tagChange(changeId: string): Promise<{ ran: boolean; eventId: string | null }>;
  scoreEvent(eventId: string): Promise<{ scored: number; failed: number }>;
  findEngineWork(limit: number): Promise<EngineWork>;
  analyzeReview(reviewId: string): Promise<{ ran: boolean }>;
  reaskReview(reviewId: string): Promise<{ ran: boolean; questions: number }>;
  extractPrices(captureId: string): Promise<{ ran: boolean; points: number; ended: number }>;
  runReviewInsights(): Promise<ReviewInsightsResult>;
  collectModelBatches(): Promise<BatchCollectResult>;
  diffRankScan(scanId: string): Promise<{ ran: boolean; changeIds: string[] }>;
  updateMoves(clientId: string): Promise<MovesRunResult>;
  listMoveClients(): Promise<string[]>;
  /** Clients whose weekly brief window is open and whose brief is missing, retryable, or stale (spec §9.1). */
  listBriefDueClients(now: Date): Promise<string[]>;
  generateBrief(clientId: string): Promise<BriefRunResult>;
  /** Phase 12b: active clients due their one-off starting point (ready, or 48 h after activation). */
  listStartingPointDue(now: Date): Promise<string[]>;
  generateStartingPoint(clientId: string): Promise<BriefRunResult>;
  /** Phase 6b: model-written starter questions for one client (null = nothing written). */
  generateAskStarters(clientId: string): Promise<string[] | null>;
  /** Phase 11a: AI profile suggestions for a client's setup wizard (never throws; a failure is recorded as `failed`). */
  generateSetupSuggestions(clientId: string): Promise<{ status: 'ready' | 'failed' } | { skipped: string }>;
  /** Phase 14b: AI-tailors a client's runbook plays (never throws; an AI failure writes the untailored copy as `failed`). */
  tailorRunbook(clientId: string): Promise<{ status: 'done' | 'failed' | 'skipped'; rejected: string[] }>;
  /** Marks a still-`pending` client runbook `skipped` (the job ran where tailoring never happens), so the editor unlocks. */
  skipRunbookTailor(clientId: string): Promise<void>;
  /** Phase 11c: the free competitive preview for a verified lead plus its confirmation / agency-new / pool-new emails (never throws; failures are recorded as `failed`). */
  /** Phase 11c: the direct lead-mail sender deps (null when mail is not configured). */
  leadEmailDeps(): LeadEmailDeps | null;
  generateLeadPreview(leadId: string): Promise<{ status: 'ready' | 'failed' } | { skipped: string }>;
  /** Phase 11a Task 9: daily reminders to agency staff about open setups (needs delivery config). */
  setupReminders(now: Date): Promise<{ queued: number }>;
  recommendForMoves(clientId: string): Promise<{ created: number; skipped: number; failed: number }>;
  discoverPages(competitorId: string): Promise<{ selected: number; candidates: number; homepageStatus: string } | { skipped: string }>;
  /** True once DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD are both set — gates all vendor collection. */
  vendorsConfigured(): boolean;
  /** Links clients with a place id to their own business as a self competitor (reviews + GBP only). */
  ensureSelfCompetitors(): Promise<number>;
  claimDueSources(limit: number): Promise<{ competitorId: string; source: SourceKind }[]>;
  runSource(competitorId: string, source: 'gbp' | 'ads_google' | 'ads_meta', scope?: CallScope): Promise<{ status: string }>;
  /**
   * Posts reviews/jobs DataForSEO tasks. Reviews and jobs are handled independently: a failure
   * posting one never touches the other. Each item ends up 'posted' (task created), released
   * back to due-now with last_status 'post_failed' (a VendorError posting that chunk — retried
   * next tick), or 'skipped' (the competitor was ineligible, e.g. no placeId/cid or blank name —
   * never attempted). Reviews are not posted at all while REVIEWER_HASH_SALT is unusable (see
   * reviewsSkipReason) — they are marked 'skipped_no_salt'. Returns how many sources were released for retry, for logging.
   */
  postBatchTasks(items: { competitorId: string; source: 'reviews' | 'jobs' }[]): Promise<{ failed: number }>;
  /** `onSuggestionReviews`: called with the run id after a discovery review sample landed (Phase 12a). */
  pollVendorTasks(opts?: { onSuggestionReviews?: (runId: string) => Promise<void> }): Promise<{
    reviews: { collected: number; failed: number; reviews: number } | { skipped: string };
    jobs: { collected: number; failed: number; postings: number };
  }>;
  scanRankings(
    clientId: string,
    opts: { trigger: 'scheduled' | 'manual'; scanId?: string; requestedBy?: string },
  ): Promise<{ snapshots: number; failed: number; scanId: string | null; skipped?: 'cap' }>;
  listRankClients(): Promise<string[]>;
  /** Fails `running` rank scans older than RANK_SCAN_STALE_HOURS; returns how many. */
  failStaleRankScans(): Promise<number>;
  /** Of these clients, the ones with no `rank_map_image` row yet or a stale one (settings or map style changed). */
  clientsNeedingRankMap(clientIds: string[]): Promise<string[]>;
  /** Phase 13b: refreshes the client's rank-grid static map image; 'skipped' without STADIA_API_KEY. */
  refreshRankMap(clientId: string): Promise<'unchanged' | 'stored' | 'skipped'>;
  /** 5b-2 decision 10: the one-off prospect snapshot (vendor pulls + 3×3 rank scan + deterministic report). Never throws. */
  runProspectSnapshot(clientId: string, reportId: string): Promise<{ status: 'ready' | 'failed' }>;
  /** Phase 12a: one competitor-discovery run (paid vendor calls; the job checks vendorsConfigured first). */
  runRivalSearch(runId: string): Promise<{ status: 'done' | 'failed' | 'finalising' }>;
  /** Fails a still-live discovery run with `error` (e.g. vendors not configured). */
  failRivalRun(runId: string, error: string): Promise<void>;
  finaliseRivalSearch(runId: string, opts: { force: boolean }): Promise<'done' | 'waiting'>;
  sweepRivalRuns(now: Date): Promise<{ stale: number; finalised: number }>;
  /** Active clients only (prospects get no recurring work). */
  listSignalClients(): Promise<string[]>;
  /** `rival-monthly`: serviceable clients (active, not paused, agency not read_only/suspended) with a complete search profile (keywords, service area, place id). */
  listMonthlyRivalClients(): Promise<string[]>;
  /** Rates the client's tracked competitors into competitor_signal; returns how many were rated. */
  computeTrackedSignals(clientId: string, now: Date): Promise<number>;
  /** True once APP_URL and LINK_SIGNING_SECRET (at least 32 characters) are set — gates every delivery job. */
  deliveryConfigured(): boolean;
  sweepAlerts(now: Date): Promise<SweepResult>;
  processAlert(alertId: string, now: Date): Promise<{ status: string; release?: string }>;
  runAlertDigests(now: Date): Promise<{ clients: number; alerts: number; withdrawn: number }>;
  dispatchNotifications(now: Date): Promise<{ sent: number; failed: number; retried: number; skipped: number }>;
  deliverDueBriefs(now: Date): Promise<{ sent: string[]; autoApproved: number; overdue: number }>;
  notifyBriefOutcome(result: BriefRunResult, now: Date): Promise<number>;
  renderBriefPdf(briefId: string): Promise<{ key: string } | { skipped: string }>;
  /** Sent briefs (last 7 days) whose PDF never rendered — re-enqueued by the hourly delivery tick. */
  listBriefsMissingPdf(now: Date): Promise<string[]>;
  runQuarterlyReports(now: Date): Promise<{ created: string[] }>;
  renderReportPdf(reportId: string): Promise<{ key: string }>;
  /** Sent trend reports (last 7 days) whose PDF never rendered — re-enqueued by the hourly reports tick. */
  listReportsMissingPdf(now: Date): Promise<string[]>;
  /** Phase 6c: the service-role connection, for jobs that read/write tables directly (kb-embed). */
  serviceDb(): Db;
  /** Phase 8c: everything snapshotAll needs (vendor keys, owners, low-balance email sender). */
  platformCosts(): PlatformCostSnapshotDeps;
  /** 7c2: the hourly brief readiness check, its platform-branded staff email and the owner/staff recipient list. */
  briefReadiness(): BriefReadinessDeps;
  /** 7b1: the hourly spend guard's inputs (service db, APP_URL, staff list, platform-branded staff email sender). */
  spendGuard(): SpendGuardDeps;
  /** Phase 9a: platform-branded billing lifecycle email sender (direct transport send, outside the client outbox). */
  billingEmail(): BillingEmailSender;
  /** Phase 6c: KB_IMPORT_ENABLED === 'true'; gates kb-import and kb-sync. */
  kbImportEnabled(): boolean;
  /** Phase 6c: every address the host resolves to (SSRF guard for kb-import / kb-sync). */
  resolveHost(host: string): Promise<string[]>;
  /** Phase 6c: the shared polite renderer (robots, ≥ 3 s/host limiter, honest UA) — the only way kb-import/kb-sync may fetch. */
  politeRenderer(): Renderer;
  /** Phase 6c: embeds texts with the `embeddings` task (512 d). */
  embedTexts(texts: string[]): Promise<number[][]>;
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

/** Vendor keys `VENDOR_FAKE_MODE=fixtures` fills with a dummy when unset (the fixture fetch never sends them anywhere). */
const FIXTURE_VENDOR_KEYS = ['DATAFORSEO_LOGIN', 'DATAFORSEO_PASSWORD', 'SCRAPECREATORS_API_KEY', 'APIFY_TOKEN', 'STADIA_API_KEY'] as const;

const COST_ENV_KEYS = [
  'OPENROUTER_API_KEY', 'DATAFORSEO_LOGIN', 'DATAFORSEO_PASSWORD', 'SCRAPECREATORS_API_KEY', 'APIFY_TOKEN', 'ANTHROPIC_ADMIN_KEY', 'NEON_API_KEY', 'NEON_ORG_ID',
] as const;

/** `REHEARSAL_LIVE_CLIENT_IDS`: comma-separated client ids that keep the live models under `AI_PROVIDER_MODE=rehearsal`. */
export function parseLiveClientIds(raw: string | undefined): Set<string> {
  return new Set((raw ?? '').split(',').map((s) => s.trim()).filter(Boolean));
}

/** Everything is created lazily so importing this module has no side effects. */
/**
 * `appPoolMax` (7c2): size of the app connection pool (`appPoolMax(jobs)` in the daemon; default 5 for the CLIs). App
 * queries use `SERVICE_DATABASE_POOLED_URL` (Neon pooler, so no prepared statements; required in production via
 * `REQUIRED_PROD_ENV`) and fall back to `SERVICE_DATABASE_URL` in dev with the same pool size.
 */
export function createWorkerDeps(env: NodeJS.ProcessEnv, opts: { aiGuard?: boolean; appPoolMax?: number } = {}): WorkerDeps {
  // Every caller (daemon, *-once CLIs) refuses rehearsal switches outside staging; main.ts also checks earlier to exit before connecting.
  const rehearsalErrors = rehearsalEnvErrors(env);
  if (rehearsalErrors.length > 0) throw new Error(`worker env refused: ${rehearsalErrors.join('; ')}`);
  // 7c2 rehearsal: VENDOR_FAKE_MODE=fixtures answers DataForSEO/Apify/ScrapeCreators/Stadia from @cs/collectors templates
  // (still through the vendor limiter, never the network), ledgers them at $0, and fills unset vendor keys with a dummy so the
  // presence checks pass. OpenRouter/Jev are not faked here (AI_PROVIDER_MODE).
  const fakeVendors = env.VENDOR_FAKE_MODE === 'fixtures';
  // The dummies are for the vendor clients only. The platform cost snapshot gets no faked-vendor keys at all in this mode
  // (a dummy, ours or an operator's `fixture`, would make it call the vendors' real balance APIs; nothing real is spent there).
  const costEnv = fakeVendors ? Object.fromEntries(Object.entries(env).filter(([k]) => !(FIXTURE_VENDOR_KEYS as readonly string[]).includes(k))) : env;
  if (fakeVendors) env = { ...env, ...Object.fromEntries(FIXTURE_VENDOR_KEYS.filter((k) => !env[k]?.trim()).map((k) => [k, 'fixture'])) };
  const fixtureFetch = fakeVendors ? createFixtureFetch() : undefined;
  let db: { db: Db; close(): Promise<void> } | null = null;
  let store: ObjectStore | null = null;
  let renderer: PoliteRenderer | null = null;
  let ai: Promise<Ai> | null = null;
  // 7c2: one limiter per process for every vendor/AI call (Anthropic batches go through the SDK and are not limited). Waits
  // over 5 s are logged at debug with vendor and ms only.
  const vendors = createVendorLimiter(undefined, undefined, (vendor, ms) => workerLog.debug({ vendor, waitedMs: ms }, '[vendor-limiter] waited for a slot'));
  const vendorFetch = (v: 'dataforseo' | 'apify' | 'scrapecreators' | 'stadia') => vendors.limitedFetch(v, fixtureFetch);
  const vendorLedger = () => (fakeVendors ? zeroFixtureVendorCosts(createLedgerSink(getDb())) : createLedgerSink(getDb()));
  // In-process rate limiting: per-host politeness (spec §4.2) only holds with exactly one worker
  // replica. The deployment is a single always-on worker container by design; scaling out to
  // multiple replicas would need a shared (e.g. DB- or Redis-backed) limiter instead of this one.
  const limiter = new HostRateLimiter();
  // 7c2: robots.txt fetches take a slot from the same limiter as page renders.
  // 7c2 staging: CRAWL_HOST_ALLOWLIST narrows all three crawl paths (robots fetch, renderer incl. redirect hops, discovery
  // fetch) to exact listed hosts (still public-address checked). Unset = the standard guard. main.ts refuses it in production.
  // Fail closed: a non-blank value always installs the allowlist, even if it parses to zero hosts (then everything is refused).
  const crawlRaw = (env.CRAWL_HOST_ALLOWLIST ?? '').trim();
  const crawlAssert = crawlRaw ? allowlistedAssert(crawlRaw.split(',')) : undefined;
  const crawlFetchText = crawlAssert ? createGuardedFetchText({ assertUrl: crawlAssert }) : defaultFetchText;
  const robots = new RobotsPolicy(crawlFetchText, undefined, undefined, undefined, limiter);
  const catalog = createCatalog(() => catalogRows(getDb()), { ttlMs: 60_000 });
  const packs = catalog.packs;
  const generic = () => catalog.generic();
  /** R5: the client's runbook tier limits (null = the pack's). */
  const runbookTiers = async (clientId: string) => (await loadClientRunbook({ db: getDb(), packs, generic }, clientId)).tierLimits;

  const getDb = () => {
    if (!db) {
      const pooled = env.SERVICE_DATABASE_POOLED_URL?.trim() || undefined;
      const url = pooled ?? env.SERVICE_DATABASE_URL;
      if (!url) throw new Error('SERVICE_DATABASE_URL is required');
      db = createDb(url, { max: opts.appPoolMax ?? 5, prepare: !pooled });
    }
    return db.db;
  };
  const getStore = () => (store ??= createStoreFromEnv(env));
  const getRenderer = () => (renderer ??= createPoliteRenderer({ robots, limiter, renderer: createPlaywrightRenderer(crawlAssert ? { assertUrl: crawlAssert } : undefined) }));
  let dfs: DataForSeoClient | null = null;
  const getDfs = () => {
    if (!dfs) {
      if (!env.DATAFORSEO_LOGIN || !env.DATAFORSEO_PASSWORD) throw new Error('DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD are required');
      dfs = createDataForSeo({ login: env.DATAFORSEO_LOGIN, password: env.DATAFORSEO_PASSWORD, baseUrl: env.DATAFORSEO_BASE_URL || DFS_BASE_URL, ledger: vendorLedger(), fetch: vendorFetch('dataforseo') });
    }
    return dfs;
  };
  const loadCompetitors = (ids: string[]) => getDb().select().from(competitor).where(inArray(competitor.id, ids));
  const delivery = deliveryConfigFromEnv(env);
  const getDelivery = () => {
    if (!delivery) throw new Error('APP_URL and LINK_SIGNING_SECRET (at least 32 characters) are required for delivery');
    return delivery;
  };
  let emailTransport: ReturnType<typeof createEmailTransportFromEnv> | null = null;
  const getEmailTransport = () => (emailTransport ??= createEmailTransportFromEnv(env, createLedgerSink(getDb())));
  let senders: Parameters<typeof dispatchDue>[0]['senders'] | null = null;
  const getSenders = () => {
    if (!senders) {
      const web = createWebhookSender({ db: getDb() });
      senders = { email: createEmailSender({ transport: getEmailTransport(), fromAddress: getDelivery().fromAddress }), slack: web, teams: web };
    }
    return senders;
  };
  let pdf: ReturnType<typeof createPdfRenderer> | null = null;
  const getPdf = () => (pdf ??= createPdfRenderer());
  let warnedNoSalt = false;
  // A rejected init must not be cached forever (the worker keeps this deps object alive for its
  // whole lifetime): clear it so the next discoverPages call retries instead of replaying the same failure.
  /** Phase 7b1: one guard (shared 30 s cache) for the daemon's AI calls; the `*-once` CLIs build `Ai` without one. */
  let guard: AiGuard | null = null;
  const aiGuard = (): AiGuard | undefined => (opts.aiGuard === false ? undefined : (guard ??= createAiGuard(getDb())));
  /** Today's (prod) Ai: real OpenRouter/Jev through the limited fetches, behind the daemon's guard. */
  const liveAi = (cfg: AiConfig) =>
    createAiFromEnv(env, cfg, createLedgerSink(getDb()), createDecisionSampleSink(getDb()), aiGuard(), { openrouter: vendors.limitedFetch('openrouter'), jev: vendors.limitedFetch('jev') });
  // 7c2 rehearsal (staging only, refused elsewhere above): AI_PROVIDER_MODE=rehearsal answers every client with the $0
  // rehearsal AI except REHEARSAL_LIVE_CLIENT_IDS, which keep the live Ai. Both sides share the one guard.
  const buildAi = async (cfg: AiConfig): Promise<Ai> =>
    env.AI_PROVIDER_MODE === 'rehearsal'
      ? createRehearsalAi({
          live: liveAi(cfg), liveClientIds: parseLiveClientIds(env.REHEARSAL_LIVE_CLIENT_IDS), latency: await loadRehearsalLatency(),
          config: cfg, ledger: createLedgerSink(getDb()), guard: aiGuard(),
        })
      : liveAi(cfg);
  const getAi = () =>
    (ai ??= loadAiConfigFile(DEFAULT_AI_CONFIG_PATH)
      .then(buildAi)
      .catch((err) => {
        ai = null;
        throw err;
      }));

  const vendorsConfigured = () => Boolean(env.DATAFORSEO_LOGIN && env.DATAFORSEO_PASSWORD);
  // Lazy vendor clients: finalise/sweep never call a vendor, so they work without DataForSEO credentials.
  const rivalDeps = (): RivalSearchDeps => ({
    db: getDb(),
    get dfs() { return getDfs(); },
    meta: { apiKey: env.SCRAPECREATORS_API_KEY || undefined, apifyToken: env.APIFY_TOKEN || undefined, ledger: vendorLedger(), fetch: vendorFetch('scrapecreators'), apifyFetch: vendorFetch('apify') },
    packs,
    runbookTiers,
  });
  const runSource: WorkerDeps['runSource'] = async (competitorId, source, scope) => {
    const [c] = await loadCompetitors([competitorId]);
    if (!c) {
      await markSourceResult(getDb(), competitorId, source, 'missing');
      return { status: 'missing' };
    }
    const base = { db: getDb(), store: getStore() };
    try {
      const r =
        source === 'gbp' ? await collectGbpProfile({ ...base, dfs: getDfs() }, c, scope)
        : source === 'ads_google' ? await collectGoogleAds({ ...base, dfs: getDfs() }, c, scope)
        : await collectMetaAds({ ...base, ledger: vendorLedger(), apify: env.APIFY_TOKEN ? { token: env.APIFY_TOKEN } : undefined, scrapeCreators: env.SCRAPECREATORS_API_KEY ? { apiKey: env.SCRAPECREATORS_API_KEY } : undefined, fetch: vendorFetch('scrapecreators'), apifyFetch: vendorFetch('apify') }, c, scope);
      await markSourceResult(getDb(), competitorId, source, r.status);
      return r;
    } catch (err) {
      // The collectors already catch VendorError internally (returning status: 'vendor_error');
      // anything that reaches here is unexpected (DB error, bug, …) — record it rather than
      // leaving the source's last_status stale, then let it propagate.
      await markSourceResult(getDb(), competitorId, source, 'error');
      throw err;
    }
  };

  const leadEmailDeps = (): LeadEmailDeps | null => {
    const from = delivery?.fromAddress ?? env.EMAIL_FROM;
    const appUrl = env.APP_URL?.trim();
    return from && appUrl ? { service: getDb(), transport: getEmailTransport(), appUrl, fromAddress: from, platformAdmins: normalizeAdminEmails(env.PLATFORM_ADMIN_EMAILS) } : null;
  };

  return {
    aiGuard,
    claimDuePages: (limit) => claimDuePages(getDb(), limit),
    capturePage: (id) => capturePage({ db: getDb(), store: getStore(), renderer: getRenderer() }, id),
    engineConfigured: () => Boolean(env.OPENROUTER_API_KEY),
    async diffCapture(captureId) {
      return diffCapture({ db: getDb(), store: getStore(), ai: await getAi() }, captureId);
    },
    async tagChange(changeId) {
      const r = await runTagStage({ db: getDb(), ai: await getAi(), packs }, changeId);
      return r.ran ? { ran: true, eventId: r.result.eventId } : { ran: false, eventId: null };
    },
    async scoreEvent(eventId) {
      const { scored, failed } = await runScoreStage({ db: getDb(), packs, generic }, eventId);
      return { scored, failed };
    },
    findEngineWork: (limit) => findEngineWork(getDb(), { limit }),
    async analyzeReview(reviewId) {
      return { ran: (await runAnalyzeReview({ db: getDb(), ai: await getAi(), packs }, reviewId)).ran };
    },
    async reaskReview(reviewId) {
      const r = await runReaskReview({ db: getDb(), ai: await getAi(), packs }, reviewId);
      return { ran: r.ran, questions: r.questions };
    },
    async extractPrices(captureId) {
      const r = await runExtractPrices({ db: getDb(), store: getStore(), ai: await getAi(), packs }, captureId);
      return r.ran ? { ran: true, points: r.result.points, ended: r.result.ended } : { ran: false, points: 0, ended: 0 };
    },
    async runReviewInsights() {
      return runReviewInsights({ db: getDb(), ai: await getAi(), packs });
    },
    async collectModelBatches() {
      return collectModelBatches({ db: getDb(), ai: await getAi() });
    },
    async diffRankScan(scanId) {
      const r = await diffRankScan({ db: getDb() }, scanId);
      return r.ran ? { ran: true, changeIds: r.result.changeIds } : { ran: false, changeIds: [] };
    },
    updateMoves: (clientId) => updateMovesForClient({ db: getDb(), packs }, clientId),
    listMoveClients: () => listMoveClients(getDb()),
    listBriefDueClients: (now) => listBriefDueClients(getDb(), now),
    generateBrief: async (clientId) => generateBrief({ db: getDb(), ai: await getAi(), packs, generic }, clientId),
    listStartingPointDue: (now) => listStartingPointDue(getDb(), now),
    generateStartingPoint: async (clientId) => generateStartingPoint({ db: getDb(), ai: await getAi(), packs, generic }, clientId),
    generateAskStarters: async (clientId) => generateStarters({ service: getDb(), ai: await getAi() }, clientId),
    async generateSetupSuggestions(clientId) {
      let clients: { dfs: DataForSeoClient; ai: Ai };
      try {
        clients = { dfs: getDfs(), ai: await getAi() };
      } catch (err) {
        // Vendors or OpenRouter not configured: record `failed` so the wizard never waits on a run that cannot happen.
        await failPendingSuggestions(getDb(), clientId, err instanceof Error ? err.message : 'not configured');
        return { status: 'failed' };
      }
      return runSetupSuggestions({ db: getDb(), ...clients, packs }, clientId);
    },
    tailorRunbook: (clientId) => runRunbookTailor({ db: getDb(), getAi, packs, generic }, clientId),
    skipRunbookTailor: (clientId) => skipPendingRunbook(getDb(), clientId),
    leadEmailDeps,
    async generateLeadPreview(leadId) {
      return runLeadPreview({ db: getDb(), clients: async () => ({ dfs: getDfs(), ai: await getAi() }), email: leadEmailDeps() }, leadId);
    },
    recommendForMoves: async (clientId) => recommendForMoves({ db: getDb(), ai: await getAi(), packs, generic }, clientId),
    async discoverPages(competitorId) {
      const [c] = await getDb().select().from(competitor).where(eq(competitor.id, competitorId)).limit(1);
      if (!c?.domain) return { skipped: 'competitor has no domain' };
      return discoverPages(
        { db: getDb(), store: getStore(), renderer: getRenderer(), robots, fetchText: crawlFetchText, limiter, ai: await getAi() },
        { id: c.id, domain: c.domain, name: c.name },
      );
    },
    vendorsConfigured,
    ensureSelfCompetitors: () => ensureSelfCompetitors(getDb()),
    claimDueSources: (limit) => claimDueSources(getDb(), limit),
    runSource,
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
          workerLog.info(`[vendor-schedule] not posting reviews: ${reviewsSkip}`);
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
    async pollVendorTasks(opts = {}) {
      const base = { db: getDb(), store: getStore(), dfs: getDfs() };
      const skipReason = reviewsSkipReason(env);
      let reviews: { collected: number; failed: number; reviews: number } | { skipped: string };
      if (skipReason) {
        if (!warnedNoSalt) {
          warnedNoSalt = true;
          workerLog.info(`[vendor-poll] skipping reviews: ${skipReason}`);
        }
        reviews = { skipped: skipReason };
      } else {
        reviews = await collectReadyReviews({ ...base, salt: requireSalt(env), onSuggestionReviews: opts.onSuggestionReviews });
      }
      const jobs = await collectReadyJobs(base);
      return { reviews, jobs };
    },
    scanRankings: (clientId, opts) =>
      scanRankings(
        {
          db: getDb(), store: getStore(), dfs: getDfs(),
          onSkipped: async (s) => {
            if (!delivery) {
              workerLog.warn(`[rank-scan] ${clientId} skipped by the monthly cost cap; no agency notice sent (APP_URL / LINK_SIGNING_SECRET not set)`);
              return;
            }
            await notifyRankScanSkipped({ db: getDb(), delivery }, s);
          },
        },
        clientId, opts,
      ),
    listRankClients: () => rankClients(getDb()),
    failStaleRankScans: () => failStaleScans(getDb()),
    clientsNeedingRankMap: (ids) => rankClientsNeedingMap(getDb(), ids),
    refreshRankMap: (clientId) =>
      refreshMap({ db: getDb(), store: getStore(), maps: env.STADIA_API_KEY ? createStadiaStaticClient({ apiKey: env.STADIA_API_KEY, ledger: vendorLedger(), fetch: vendorFetch('stadia') }) : null }, clientId),
    async runProspectSnapshot(clientId, reportId) {
      if (!vendorsConfigured()) {
        await failProspectReport(getDb(), reportId, 'Vendor APIs are not configured (DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD)');
        return { status: 'failed' as const };
      }
      return runProspectSnapshot(
        { db: getDb(), runSource, scanRankings: (id, prospect) => scanRankings({ db: getDb(), store: getStore(), dfs: getDfs() }, id, { trigger: 'scheduled', prospect }) },
        clientId, reportId,
      );
    },
    runRivalSearch: (runId) => runRivalSearch(rivalDeps(), runId),
    failRivalRun: (runId, error) => failRivalRun(getDb(), runId, error),
    finaliseRivalSearch: (runId, opts) => finaliseRivalSearch(rivalDeps(), runId, opts),
    sweepRivalRuns: (now) => sweepRivalRuns(rivalDeps(), now),
    listSignalClients: () => listSignalClients(getDb()),
    listMonthlyRivalClients: () => listMonthlyRivalClients(getDb()),
    computeTrackedSignals: async (clientId, now) => (await computeTrackedSignals({ db: getDb(), packs, runbookTiers }, clientId, now)).length,
    deliveryConfigured: () => delivery !== null,
    setupReminders: (now) => runSetupReminders({ db: getDb(), delivery: getDelivery() }, now),
    sweepAlerts: (now) => sweepAlerts(getDb(), now),
    processAlert: async (alertId, now) => processAlert({ db: getDb(), ai: await getAi(), packs, delivery: getDelivery() }, alertId, now),
    runAlertDigests: (now) => runAlertDigests({ db: getDb(), delivery: getDelivery() }, now),
    dispatchNotifications: (now) => dispatchDue({ db: getDb(), senders: getSenders() }, now),
    deliverDueBriefs: (now) => deliverDueBriefs({ db: getDb(), delivery: getDelivery() }, now),
    notifyBriefOutcome: (result, now) => notifyBriefOutcome({ db: getDb(), delivery: getDelivery() }, result, now),
    renderBriefPdf: (briefId) => renderBriefPdf({ db: getDb(), store: getStore(), pdf: getPdf() }, briefId),
    runQuarterlyReports: (now) => runQuarterlyReports({ db: getDb(), packs, delivery: getDelivery() }, now),
    renderReportPdf: (reportId) => renderReportPdf({ db: getDb(), store: getStore(), pdf: getPdf() }, reportId),
    listBriefsMissingPdf: (now) => listBriefsMissingPdf(getDb(), now),
    listReportsMissingPdf: (now) => listReportsMissingPdf(getDb(), now),
    serviceDb: () => getDb(),
    platformCosts: () => ({
      service: getDb(),
      env: Object.fromEntries(COST_ENV_KEYS.flatMap((k) => (costEnv[k] ? [[k, costEnv[k]]] : []))),
      platformAdmins: normalizeAdminEmails(env.PLATFORM_ADMIN_EMAILS),
      appUrl: env.APP_URL ?? '',
      sendLowEmail: async (to: string, p: PlatformCostLowPayload) => {
        const from = delivery?.fromAddress ?? env.EMAIL_FROM;
        if (!from) throw new Error('EMAIL_FROM is required');
        const r = await renderEmail({ template: 'platform_cost_low', props: { ...p, branding: resolveBranding('Rival Monday', null) } });
        await getEmailTransport().send({ from: `"Rival Monday" <${from}>`, to, replyTo: null, subject: r.subject, html: r.html, text: r.text, tag: 'platform_cost_low', metadata: {} }, { agencyId: null, clientId: null });
      },
    }),
    briefReadiness: () => ({
      run: (now) => checkBriefReadiness(getDb(), now),
      recipients: () => platformOperatorEmails({ service: getDb(), platformAdmins: normalizeAdminEmails(env.PLATFORM_ADMIN_EMAILS) }, ['owner', 'staff']),
      send: async (to, alert) => {
        const from = delivery?.fromAddress ?? env.EMAIL_FROM;
        if (!from) throw new Error('EMAIL_FROM is required');
        const appUrl = env.APP_URL?.trim().replace(/\/+$/, '');
        if (!appUrl) throw new Error('APP_URL is required');
        const s = alert.summary as Pick<PlatformOpsAlertProps, 'checkpoint' | 'deliveryDate' | 'clients'>;
        const r = await renderEmail({
          template: 'platform_ops_alert',
          props: {
            branding: resolveBranding('Rival Monday', null), checkpoint: s.checkpoint, severity: alert.severity as PlatformOpsAlertProps['severity'], deliveryDate: s.deliveryDate,
            clients: s.clients.map((c) => ({ clientName: c.clientName, agencyName: c.agencyName })), healthUrl: `${appUrl}/platform/health`,
          },
        });
        await getEmailTransport().send({ from: `"Rival Monday" <${from}>`, to, replyTo: null, subject: r.subject, html: r.html, text: r.text, tag: 'platform_ops_alert', metadata: {} }, { agencyId: null, clientId: null });
      },
    }),
    spendGuard: () => ({
      service: getDb(),
      appUrl: env.APP_URL ?? '',
      platformAdmins: normalizeAdminEmails(env.PLATFORM_ADMIN_EMAILS),
      sendStaffEmail: async (to: string, p: PlatformSpendAlertPayload) => {
        const from = delivery?.fromAddress ?? env.EMAIL_FROM;
        if (!from) throw new Error('EMAIL_FROM is required');
        const r = await renderEmail({ template: 'platform_spend_alert', props: { ...p, branding: resolveBranding('Rival Monday', null) } });
        await getEmailTransport().send({ from: `"Rival Monday" <${from}>`, to, replyTo: null, subject: r.subject, html: r.html, text: r.text, tag: 'platform_spend_alert', metadata: {} }, { agencyId: null, clientId: null });
      },
    }),
    billingEmail: () => ({
      appUrl: (env.APP_URL ?? '').replace(/\/+$/, ''),
      platformAdmins: normalizeAdminEmails(env.PLATFORM_ADMIN_EMAILS),
      sendOnboarding: async (to, agencyId, email) => {
        const from = delivery?.fromAddress ?? env.EMAIL_FROM;
        if (!from) throw new Error('EMAIL_FROM is required');
        const appUrl = env.APP_URL?.trim().replace(/\/+$/, '');
        if (!appUrl) throw new Error('APP_URL is required');
        const branding = resolveBranding('Rival Monday', null);
        const replyTo = env.SUPPORT_REPLY_TO?.trim() || DEFAULT_SUPPORT_REPLY_TO;
        const base = { from: `"Rival Monday" <${from}>`, to, replyTo, tag: email.template, metadata: {} };
        const scope = { agencyId, clientId: null };
        if (email.template === 'onboarding_tip') {
          // The token is never logged; a missing secret throws so the row is retried once the worker is configured.
          const secret = env.BETTER_AUTH_SECRET?.trim();
          if (!secret) throw new Error('BETTER_AUTH_SECRET is required for setup-tip unsubscribe links');
          const unsubscribeUrl = `${appUrl}/u/${unsubscribeToken(agencyId, secret)}`;
          const r = await renderEmail({ template: 'onboarding_tip', props: { ...email.props, unsubscribeUrl, branding } });
          await getEmailTransport().send({
            ...base, subject: r.subject, html: r.html, text: r.text, stream: 'broadcast',
            headers: [{ Name: 'List-Unsubscribe', Value: `<${unsubscribeUrl}>` }, { Name: 'List-Unsubscribe-Post', Value: 'List-Unsubscribe=One-Click' }],
          }, scope);
          return;
        }
        const r = email.template === 'agency_welcome'
          ? await renderEmail({ template: 'agency_welcome', props: { ...email.props, branding, supportEmail: replyTo } })
          : await renderEmail({ template: 'platform_signup_notice', props: { ...email.props, branding } });
        await getEmailTransport().send({ ...base, subject: r.subject, html: r.html, text: r.text }, scope);
      },
      send: async (to, agencyId, props) => {
        const from = delivery?.fromAddress ?? env.EMAIL_FROM;
        if (!from) throw new Error('EMAIL_FROM is required');
        if (!env.APP_URL) throw new Error('APP_URL is required');
        const r = await renderEmail({ template: 'billing_notice', props: { ...props, branding: resolveBranding('Rival Monday', null) } });
        await getEmailTransport().send({ from: `"Rival Monday" <${from}>`, to, replyTo: null, subject: r.subject, html: r.html, text: r.text, tag: 'billing_notice', metadata: {} }, { agencyId, clientId: null });
      },
      sendClient: async (to, agencyId, clientId, ag, props) => {
        const from = delivery?.fromAddress ?? env.EMAIL_FROM;
        if (!from) throw new Error('EMAIL_FROM is required');
        const branding = resolveBranding(ag.agencyName, ag.branding);
        const r = await renderEmail({ template: 'client_billing_notice', props: { ...props, agencyName: branding.displayName, branding } });
        const replyTo = (await replyToFor(getDb(), agencyId, clientId))?.email ?? null;
        // Display name is the agency's; the sending address is the configured platform one until per-agency domains (decision 13).
        const fromName = branding.fromName.replace(/["\\\r\n]/g, '');
        await getEmailTransport().send({ from: `"${fromName}" <${from}>`, to, replyTo, subject: r.subject, html: r.html, text: r.text, tag: 'client_billing_notice', metadata: {} }, { agencyId, clientId });
      },
      sendAgencyClient: async (to, agencyId, props) => {
        const from = delivery?.fromAddress ?? env.EMAIL_FROM;
        if (!from) throw new Error('EMAIL_FROM is required');
        const r = await renderEmail({ template: 'agency_client_billing_notice', props: { ...props, branding: resolveBranding('Rival Monday', null) } });
        await getEmailTransport().send({ from: `"Rival Monday" <${from}>`, to, replyTo: null, subject: r.subject, html: r.html, text: r.text, tag: 'agency_client_billing_notice', metadata: {} }, { agencyId, clientId: null });
      },
    }),
    kbImportEnabled: () => env.KB_IMPORT_ENABLED?.trim() === 'true',
    resolveHost: async (host) => (await lookup(host, { all: true })).map((a) => a.address),
    politeRenderer: () => getRenderer(),
    async embedTexts(texts) {
      return (await (await getAi()).embed('embeddings', texts, { agencyId: null, clientId: null })).vectors;
    },
    async close() {
      await renderer?.close();
      await pdf?.close();
      await db?.close();
    },
  };
}
