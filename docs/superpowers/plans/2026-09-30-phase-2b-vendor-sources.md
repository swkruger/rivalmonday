# Phase 2b — Vendor Data Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the non-website sources: competitor discovery from local search, Google Business Profile snapshots, Google reviews (pseudonymised), Google and Meta ads with first/last-seen history, Google Jobs hiring signals, and monthly geo-grid rankings — each stored as immutable evidence plus typed rows, scheduled in the worker, and cost-logged.

**Architecture:** A DataForSEO client (Basic auth, envelope/status handling, retries, `vendor_call` ledger) and small Apify / ScrapeCreators clients live in `@cs/collectors/src/vendors`. Every vendor response is stored as a gzipped `vendor_json` evidence object on a `capture` (source-specific), then normalised into global tables (`observation`, `review`, `ad`) or tenant tables (`competitor_suggestion`, `rank_snapshot`). Asynchronous DataForSEO endpoints (Reviews, Jobs) use `task_post` → `vendor_task` row → `tasks_ready` poll → `task_get`. A `competitor_source` table schedules each source per competitor, claimed exactly once like `tracked_page`.

**Tech Stack:** As Phase 2a. No new runtime libraries.

**Prerequisite:** Phase 2a merged. Vendor keys in `.env`: `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` (sandbox uses the same), `APIFY_TOKEN`, `SCRAPECREATORS_API_KEY` (optional fallback), `REVIEWER_HASH_SALT` (≥ 32 random chars).

**Spec:** [core platform spec](../specs/2026-09-29-core-platform-design.md) §4.1–§4.5 · **API reference (read it):** [docs/research/2026-09-30-phase-2-vendor-apis.md](../../research/2026-09-30-phase-2-vendor-apis.md) · **Roadmap:** [2026-09-29-roadmap.md](2026-09-29-roadmap.md)

## Global Constraints

- All Phase 1 and Phase 2a Global Constraints apply (tenant isolation below the model, service-role-only writes to global tables, immutable evidence, never edit applied migrations, Neon `cs_test` for tests via repo-root `.env`, commit trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`).
- **Every vendor response is evidence:** store the raw vendor JSON (gzipped) as a `vendor_json` evidence object before or alongside any parsed rows; parsed rows reference the capture.
- **Lenient parsing:** vendor item shapes marked UNVERIFIED in the API reference are parsed with `z.looseObject` and optional fields; an unparseable item is skipped and counted, never fatal. Task 12 locks real shapes from live samples.
- **Privacy (spec §4.5):** reviewer names, profile URLs and photos are never stored; reviewer identity is an HMAC-SHA256 of the profile name with `REVIEWER_HASH_SALT`; e-mail addresses and phone numbers in review text are redacted before storage.
- **Cost logging:** every vendor HTTP call writes exactly one `vendor_call` ledger row (vendor, operation without task ids, units, `cost` from the response when provided, latency, ok) via the service-role ledger sink; ledger failures never change the call's outcome.
- **US-first:** DataForSEO `location_code: 2840` (United States), `language_code: 'en'`; Meta Ad Library `country=US`.
- **Honest scope:** Meta does not disclose targeting for US commercial ads — never store or infer ad geo-targeting. Instagram Business Discovery is **out of scope** for this phase (needs a Facebook app + Page + review); it is recorded in the roadmap carry-over.
- Rankings (`rank_snapshot`) are **tenant-scoped** (they reveal which keywords a client tracks) — a deliberate refinement of spec §4.3's global list.

## Review Focus

1. **A vendor returns HTTP 200 with an API-level error** (`status_code` 40xxx/50xxx) — must surface as a typed `VendorError`, retry only retryable codes (40202 rate limit, 50xxx), and log the failed call. Pinned in Task 2.
2. **The same review pulled twice** (weekly overlap) — one `review` row, `last_seen_at` advanced, owner reply updated; never a duplicate. Pinned in Task 6.
3. **A Meta ad that stops appearing** — marked inactive with `ended_at`, history kept, not deleted. Pinned in Task 8.
4. **A client-scoped user** — sees suggestions and rank snapshots only for their client, and global review/ad/observation rows only for competitors their client tracks. Pinned in Task 1.
5. **Reviewer PII** — no reviewer name/URL/photo anywhere in rows or ledger; e-mails/phones redacted in stored text. Pinned in Tasks 3 and 6.

---

## File map

```
packages/db/src/schema/tenancy.ts          + client.services/keywords/serviceArea/placeId, competitor.cid/metaPageId
packages/db/src/schema/sources.ts          (new) competitor_source, vendor_task, observation, review, ad
packages/db/src/schema/client-intel.ts     (new) competitor_suggestion, rank_snapshot
packages/db/migrations/0009_*.sql, 0010_sources_rls.sql
packages/db/src/sources.test.ts            (new)
packages/collectors/src/vendors/
  errors.ts, dataforseo.ts, dfs-time.ts, apify.ts, scrapecreators.ts
packages/collectors/src/evidence/vendor-capture.ts, privacy.ts
packages/collectors/src/local/{grid,maps,suggest,accept}.ts
packages/collectors/src/sources/{kinds,ensure,due}.ts
packages/collectors/src/gbp/collect-gbp.ts
packages/collectors/src/reviews/{post,collect,upsert}.ts
packages/collectors/src/ads/{google,meta}.ts
packages/collectors/src/jobs/{post,collect}.ts
packages/collectors/src/rankings/scan.ts
packages/collectors/test/fake-dfs.ts
apps/worker/src/deps.ts, src/jobs/vendor.ts, src/cli/collect-once.ts
```

---

### Task 1: Schema for vendor data (global + tenant) with RLS

**Files:**
- Modify: `packages/db/src/schema/tenancy.ts`, `packages/db/src/schema/index.ts`
- Create: `packages/db/src/schema/sources.ts`, `packages/db/src/schema/client-intel.ts`
- Generated: `0009_vendor_sources.sql`; custom: `0010_sources_rls.sql`
- Test: `packages/db/src/sources.test.ts`; Modify: `packages/db/src/evidence.test.ts` (extend privilege guard list)

**Interfaces:**
- Produces:
  - `client` + `services: string[]` (vertical service ids), `keywords: string[]` (search keywords for discovery/rankings), `serviceArea: ServiceArea | null`, `placeId: string | null`; `interface ServiceArea { center: { lat: number; lng: number }; radiusKm: number; zips: string[] }`
  - `competitor` + `cid: string | null`, `metaPageId: string | null`
  - Global (service-role writes; app_user reads via `app_competitor_visible`): `observation`, `review`, `ad`
  - Global service-only (app_user sees nothing): `competitorSource`, `vendorTask`
  - Tenant: `competitorSuggestion` (app_user SELECT + UPDATE in scope), `rankSnapshot` (app_user SELECT in scope); `interface RankResult { rank: number; placeId: string | null; cid: string | null; domain: string | null; title: string }`

- [ ] **Step 1: Write the failing tests**

`packages/db/src/sources.test.ts`:
```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { errorText, IDS, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { ad, capture, competitorSource, competitorSuggestion, observation, rankSnapshot, review, vendorTask } from './schema';
import { withTenant } from './tenant';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const CAP_X = '00000000-0000-4000-8000-0000000000c1';
const CAP_Y = '00000000-0000-4000-8000-0000000000c2';

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.service.insert(capture).values([
    { id: CAP_X, competitorId: IDS.competitorX, source: 'google_reviews', status: 'ok', collectorVersion: 'dfs/1' },
    { id: CAP_Y, competitorId: IDS.competitorY, source: 'google_reviews', status: 'ok', collectorVersion: 'dfs/1' },
  ]);
  await dbs.service.insert(review).values([
    { competitorId: IDS.competitorX, source: 'google', dedupeKey: 'id:1', rating: 2, text: 'slow', firstCaptureId: CAP_X },
    { competitorId: IDS.competitorY, source: 'google', dedupeKey: 'id:2', rating: 5, text: 'great', firstCaptureId: CAP_Y },
  ]);
  await dbs.service.insert(ad).values([
    { competitorId: IDS.competitorX, platform: 'meta', externalId: 'm1' },
    { competitorId: IDS.competitorY, platform: 'google', externalId: 'g1' },
  ]);
  await dbs.service.insert(observation).values([
    { competitorId: IDS.competitorX, captureId: CAP_X, kind: 'gbp_profile', key: 'profile', data: { title: 'Smith' } },
    { competitorId: IDS.competitorY, captureId: CAP_Y, kind: 'gbp_profile', key: 'profile', data: { title: 'Bright' } },
  ]);
  await dbs.service.insert(competitorSource).values([{ competitorId: IDS.competitorX, source: 'gbp' }]);
  await dbs.service.insert(vendorTask).values([{ vendor: 'dataforseo', kind: 'google_reviews', externalTaskId: 't-1', competitorId: IDS.competitorX }]);
  await dbs.service.insert(competitorSuggestion).values([
    { agencyId: IDS.agencyA, clientId: IDS.clientA1, name: 'Cool Air', placeId: 'p1', appearances: 3, overlapScore: 0.5 },
    { agencyId: IDS.agencyA, clientId: IDS.clientA2, name: 'Dent Co', placeId: 'p2', appearances: 1, overlapScore: 0.1 },
  ]);
  await dbs.service.insert(rankSnapshot).values([
    { agencyId: IDS.agencyA, clientId: IDS.clientA1, keyword: 'ac repair', lat: 33.9, lng: -84.3, results: [] },
    { agencyId: IDS.agencyB, clientId: IDS.clientB1, keyword: 'ac repair', lat: 33.9, lng: -84.3, results: [] },
  ]);
});

describe('vendor data visibility', () => {
  it('global rows follow the client-competitor link', async () => {
    await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: [IDS.clientA1] }, async (tx) => {
      expect((await tx.select().from(review)).map((r) => r.dedupeKey)).toEqual(['id:1']);
      expect((await tx.select().from(ad)).map((r) => r.externalId)).toEqual(['m1']);
      expect((await tx.select().from(observation)).map((r) => r.competitorId)).toEqual([IDS.competitorX]);
      expect(await tx.select().from(competitorSource)).toEqual([]);
      expect(await tx.select().from(vendorTask)).toEqual([]);
    });
  });

  it('tenant rows follow agency and client scope', async () => {
    await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: [IDS.clientA1] }, async (tx) => {
      expect((await tx.select().from(competitorSuggestion)).map((s) => s.placeId)).toEqual(['p1']);
      expect((await tx.select().from(rankSnapshot)).map((r) => r.clientId)).toEqual([IDS.clientA1]);
    });
    await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, async (tx) => {
      expect((await tx.select().from(competitorSuggestion)).map((s) => s.placeId).sort()).toEqual(['p1', 'p2']);
      expect((await tx.select().from(rankSnapshot)).map((r) => r.clientId)).toEqual([IDS.clientA1]);
    });
  });

  it('lets app_user update only in-scope suggestions and never insert them', async () => {
    const n = await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: [IDS.clientA1] }, async (tx) => {
      const r = await tx.update(competitorSuggestion).set({ status: 'dismissed' }).returning();
      return r.length;
    });
    expect(n).toBe(1);
    const text = await errorText(
      withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) =>
        tx.insert(competitorSuggestion).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, name: 'x', appearances: 1, overlapScore: 0 }),
      ),
    );
    expect(text).toMatch(/permission denied/i);
  });
});
```

In `packages/db/src/evidence.test.ts`, extend the privilege-guard `tables` array with `'observation', 'review', 'ad', 'competitor_source', 'vendor_task', 'rank_snapshot'`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @cs/db test` → FAIL (new tables not exported).

- [ ] **Step 3: Schema**

`packages/db/src/schema/tenancy.ts`:
1. Add the `ServiceArea` type (exported) and these columns to `client` (keep existing columns and constraints):
```ts
export interface ServiceArea {
  center: { lat: number; lng: number };
  radiusKm: number;
  zips: string[];
}
```
```ts
    services: jsonb('services').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    keywords: jsonb('keywords').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    serviceArea: jsonb('service_area').$type<ServiceArea | null>(),
    placeId: text('place_id'),
```
2. Add to `competitor`:
```ts
  cid: text('cid').unique(),
  metaPageId: text('meta_page_id'),
```

`packages/db/src/schema/sources.ts`:
```ts
import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { capture } from './evidence';
import { competitor } from './tenancy';

const ts = (name: string) => timestamp(name, { withTimezone: true });
const competitorRef = () => uuid('competitor_id').notNull().references(() => competitor.id, { onDelete: 'cascade' });

/** Per-competitor schedule of each vendor source. Service role only. */
export const competitorSource = pgTable(
  'competitor_source',
  {
    competitorId: competitorRef(),
    source: text('source').notNull(), // SourceKind
    active: boolean('active').notNull().default(true),
    nextDueAt: ts('next_due_at').notNull().defaultNow(),
    lastRunAt: ts('last_run_at'),
    lastStatus: text('last_status'),
  },
  (t) => [primaryKey({ columns: [t.competitorId, t.source] }), index('competitor_source_due_idx').on(t.active, t.nextDueAt)],
);

/** Pending asynchronous vendor tasks (DataForSEO task_post). Service role only. */
export const vendorTask = pgTable('vendor_task', {
  id: uuid('id').primaryKey().defaultRandom(),
  vendor: text('vendor').notNull(),
  kind: text('kind').notNull(), // 'google_reviews' | 'google_jobs'
  externalTaskId: text('external_task_id').notNull().unique(),
  competitorId: competitorRef(),
  status: text('status').notNull().default('pending'), // pending | done | failed
  postedAt: ts('posted_at').notNull().defaultNow(),
  completedAt: ts('completed_at'),
  error: text('error'),
});

/** A typed fact extracted from a capture (GBP profile, job posting, …). Immutable. */
export const observation = pgTable(
  'observation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    competitorId: competitorRef(),
    captureId: uuid('capture_id').notNull().references(() => capture.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    key: text('key').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().notNull(),
    observedAt: ts('observed_at').notNull().defaultNow(),
  },
  (t) => [unique('observation_capture_kind_key_unique').on(t.captureId, t.kind, t.key), index('observation_competitor_kind_idx').on(t.competitorId, t.kind, t.observedAt)],
);

/** One public review. Reviewer identity is a salted hash only (spec §4.5). */
export const review = pgTable(
  'review',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    competitorId: competitorRef(),
    source: text('source').notNull().default('google'),
    dedupeKey: text('dedupe_key').notNull(),
    externalId: text('external_id'),
    rating: integer('rating'),
    text: text('text'),
    reviewerHash: text('reviewer_hash'),
    postedAt: ts('posted_at'),
    ownerAnswer: text('owner_answer'),
    ownerAnsweredAt: ts('owner_answered_at'),
    firstCaptureId: uuid('first_capture_id').references(() => capture.id, { onDelete: 'set null' }),
    firstSeenAt: ts('first_seen_at').notNull().defaultNow(),
    lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
  },
  (t) => [unique('review_dedupe_unique').on(t.competitorId, t.source, t.dedupeKey), index('review_competitor_posted_idx').on(t.competitorId, t.postedAt)],
);

/** One ad creative with our own first/last-seen history (inactive US ads vanish from Meta's library). */
export const ad = pgTable(
  'ad',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    competitorId: competitorRef(),
    platform: text('platform').notNull(), // 'meta' | 'google'
    externalId: text('external_id').notNull(),
    advertiserId: text('advertiser_id'),
    format: text('format'),
    title: text('title'),
    text: text('text'),
    mediaUrls: jsonb('media_urls').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    landingUrl: text('landing_url'),
    publisherPlatforms: jsonb('publisher_platforms').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    startedAt: ts('started_at'),
    endedAt: ts('ended_at'),
    isActive: boolean('is_active').notNull().default(true),
    firstSeenAt: ts('first_seen_at').notNull().defaultNow(),
    lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
    firstCaptureId: uuid('first_capture_id').references(() => capture.id, { onDelete: 'set null' }),
    lastCaptureId: uuid('last_capture_id').references(() => capture.id, { onDelete: 'set null' }),
  },
  (t) => [unique('ad_platform_external_unique').on(t.platform, t.externalId), index('ad_competitor_active_idx').on(t.competitorId, t.isActive)],
);
```

`packages/db/src/schema/client-intel.ts`:
```ts
import { doublePrecision, foreignKey, index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { capture } from './evidence';
import { agency, client } from './tenancy';

const ts = (name: string) => timestamp(name, { withTimezone: true });

export interface RankResult {
  rank: number;
  placeId: string | null;
  cid: string | null;
  domain: string | null;
  title: string;
}

/** Candidate competitors found in local search for a client. Tenant-owned. */
export const competitorSuggestion = pgTable(
  'competitor_suggestion',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    name: text('name').notNull(),
    domain: text('domain'),
    placeId: text('place_id'),
    cid: text('cid'),
    rating: doublePrecision('rating'),
    votes: integer('votes'),
    appearances: integer('appearances').notNull(),
    bestRank: integer('best_rank'),
    overlapScore: doublePrecision('overlap_score').notNull(),
    status: text('status').notNull().default('suggested'), // suggested | accepted | dismissed
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.clientId, t.agencyId], foreignColumns: [client.id, client.agencyId] }).onDelete('cascade'),
    unique('competitor_suggestion_client_place_unique').on(t.clientId, t.placeId),
    index('competitor_suggestion_agency_idx').on(t.agencyId),
  ],
);

/** Local-pack results for one keyword at one grid point. Tenant-owned (keywords reveal client strategy). */
export const rankSnapshot = pgTable(
  'rank_snapshot',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    keyword: text('keyword').notNull(),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    captureId: uuid('capture_id').references(() => capture.id, { onDelete: 'set null' }),
    results: jsonb('results').$type<RankResult[]>().notNull(),
    capturedAt: ts('captured_at').notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.clientId, t.agencyId], foreignColumns: [client.id, client.agencyId] }).onDelete('cascade'),
    index('rank_snapshot_client_idx').on(t.clientId, t.keyword, t.capturedAt),
  ],
);
```

`packages/db/src/schema/index.ts`:
```ts
export * from './client-intel';
export * from './evidence';
export * from './ledger';
export * from './sources';
export * from './tenancy';
```
Run `pnpm --filter @cs/db generate --name=vendor_sources` → `0009_vendor_sources.sql` (reorder if a FK precedes its target; note in report).

- [ ] **Step 4: RLS migration**

`pnpm --filter @cs/db generate --custom --name=sources_rls` → fill `0010_sources_rls.sql`:
```sql
REVOKE INSERT, UPDATE, DELETE ON competitor_source, vendor_task, observation, review, ad, rank_snapshot FROM app_user;
--> statement-breakpoint
REVOKE INSERT, DELETE ON competitor_suggestion FROM app_user;
--> statement-breakpoint
ALTER TABLE competitor_source ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE competitor_source FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE vendor_task ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE vendor_task FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE observation ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE observation FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY observation_visible ON observation FOR SELECT USING (app_competitor_visible(competitor_id));
--> statement-breakpoint
ALTER TABLE review ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE review FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY review_visible ON review FOR SELECT USING (app_competitor_visible(competitor_id));
--> statement-breakpoint
ALTER TABLE ad ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ad FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY ad_visible ON ad FOR SELECT USING (app_competitor_visible(competitor_id));
--> statement-breakpoint
ALTER TABLE competitor_suggestion ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE competitor_suggestion FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY competitor_suggestion_select ON competitor_suggestion FOR SELECT
  USING (agency_id = app_agency_id() AND app_client_visible(client_id));
--> statement-breakpoint
CREATE POLICY competitor_suggestion_update ON competitor_suggestion FOR UPDATE
  USING (agency_id = app_agency_id() AND app_client_visible(client_id))
  WITH CHECK (agency_id = app_agency_id() AND app_client_visible(client_id));
--> statement-breakpoint
ALTER TABLE rank_snapshot ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE rank_snapshot FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY rank_snapshot_select ON rank_snapshot FOR SELECT
  USING (agency_id = app_agency_id() AND app_client_visible(client_id));
```
(`competitor_source` and `vendor_task` get no policy: app_user sees no rows.)

- [ ] **Step 5: Run tests, migrate dev, commit**

Run: `pnpm --filter @cs/db test && pnpm --filter @cs/db typecheck` → PASS; `pnpm --filter @cs/db migrate` → applied.
```bash
git add packages/db
git commit -m "feat(db): vendor source tables (reviews, ads, observations, suggestions, rankings) with RLS

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: DataForSEO client with cost ledger

**Files:**
- Create: `packages/collectors/src/vendors/errors.ts`, `dataforseo.ts`, `dfs-time.ts`; `packages/collectors/test/fake-dfs.ts`
- Modify: `packages/collectors/src/index.ts`
- Test: `packages/collectors/src/vendors/dataforseo.test.ts`, `dfs-time.test.ts`, `dataforseo.live.test.ts`

**Interfaces:**
- Consumes: `CallScope`, `LedgerSink`, `VendorCallRecord` (`@cs/core`)
- Produces:
  - `class VendorError extends Error { vendor: string; code: number | null; retryable: boolean }`
  - `safeRecordVendorCall(ledger: LedgerSink, record: VendorCallRecord): Promise<void>` (never throws; logs)
  - `DFS_BASE_URL = 'https://api.dataforseo.com/v3'`, `DFS_SANDBOX_URL = 'https://sandbox.dataforseo.com/v3'`, `DFS_US = { location_code: 2840, language_code: 'en' }`
  - `interface DfsTask { id: string; statusCode: number; statusMessage: string; result: unknown[] }`, `isDfsOk(code: number): boolean`
  - `interface DataForSeoClient { post(path: string, tasks: Record<string, unknown>[], scope: CallScope): Promise<DfsTask[]>; get(path: string, scope: CallScope): Promise<DfsTask[]> }`
  - `createDataForSeo(opts: { login: string; password: string; baseUrl?: string; ledger: LedgerSink; fetch?: typeof fetch; sleep?: (ms: number) => Promise<void>; maxRetries?: number; now?: () => number; timeoutMs?: number }): DataForSeoClient`
  - `parseDfsTimestamp(value: unknown): Date | null` — accepts `"yyyy-mm-dd hh:mm:ss +00:00"`, ISO strings, and Unix seconds
  - Test helper `fakeDfs(handler: (method: 'POST' | 'GET', path: string, body?: Record<string, unknown>[]) => DfsTask[] | Promise<DfsTask[]>): DataForSeoClient & { calls: { method: string; path: string; body?: Record<string, unknown>[] }[] }` and `dfsTask(result: unknown[], overrides?: Partial<DfsTask>): DfsTask`

- [ ] **Step 1: Write the failing tests**

`packages/collectors/test/fake-dfs.ts`:
```ts
import type { DataForSeoClient, DfsTask } from '../src/vendors/dataforseo';

export function dfsTask(result: unknown[], overrides: Partial<DfsTask> = {}): DfsTask {
  return { id: '11111111-1111-4111-8111-111111111111', statusCode: 20000, statusMessage: 'Ok.', result, ...overrides };
}

export function fakeDfs(handler: (method: 'POST' | 'GET', path: string, body?: Record<string, unknown>[]) => DfsTask[] | Promise<DfsTask[]>) {
  const calls: { method: string; path: string; body?: Record<string, unknown>[] }[] = [];
  const client: DataForSeoClient & { calls: typeof calls } = {
    calls,
    async post(path, tasks) {
      calls.push({ method: 'POST', path, body: tasks });
      return handler('POST', path, tasks);
    },
    async get(path) {
      calls.push({ method: 'GET', path });
      return handler('GET', path);
    },
  };
  return client;
}
```

`packages/collectors/src/vendors/dfs-time.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseDfsTimestamp } from './dfs-time';

describe('parseDfsTimestamp', () => {
  it.each([
    ['2026-09-22 14:05:00 +00:00', '2026-09-22T14:05:00.000Z'],
    ['2026-09-22T14:05:00Z', '2026-09-22T14:05:00.000Z'],
    [1790000000, new Date(1790000000 * 1000).toISOString()],
  ])('%s', (input, iso) => expect(parseDfsTimestamp(input)?.toISOString()).toBe(iso));
  it.each([null, undefined, '', 'yesterday', {}])('returns null for %j', (v) => expect(parseDfsTimestamp(v)).toBeNull());
});
```

`packages/collectors/src/vendors/dataforseo.test.ts`:
```ts
import type { VendorCallRecord } from '@cs/core';
import { describe, expect, it, vi } from 'vitest';
import { createDataForSeo, VendorError } from './dataforseo';

const scope = { agencyId: null, clientId: null };
const ok = (tasks: unknown[], extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ status_code: 20000, status_message: 'Ok.', cost: 0.002, tasks, ...extra }), { status: 200 });
const task = (result: unknown[], code = 20000) => ({ id: 'abc', status_code: code, status_message: 'Ok.', cost: 0.002, result });

function setup(responses: Response[]) {
  const records: VendorCallRecord[] = [];
  const fetch = vi.fn(async () => responses.shift() ?? new Response('{}', { status: 500 }));
  let t = 0;
  const client = createDataForSeo({
    login: 'me', password: 'secret', ledger: { recordLlmCall: async () => {}, recordVendorCall: async (r) => { records.push(r); } },
    fetch: fetch as unknown as typeof globalThis.fetch, sleep: async () => {}, maxRetries: 2, now: () => (t += 10),
  });
  return { client, fetch, records };
}

describe('DataForSEO client', () => {
  it('posts tasks with Basic auth and returns normalised tasks', async () => {
    const { client, fetch, records } = setup([ok([task([{ items: [] }])])]);
    const tasks = await client.post('/serp/google/maps/live/advanced', [{ keyword: 'ac repair' }], scope);
    expect(tasks).toEqual([{ id: 'abc', statusCode: 20000, statusMessage: 'Ok.', result: [{ items: [] }] }]);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.dataforseo.com/v3/serp/google/maps/live/advanced');
    expect((init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from('me:secret').toString('base64')}`);
    expect(JSON.parse(init.body as string)).toEqual([{ keyword: 'ac repair' }]);
    expect(records).toEqual([{ ...scope, vendor: 'dataforseo', operation: '/serp/google/maps/live/advanced', units: 1, costUsd: 0.002, latencyMs: 10, ok: true }]);
  });

  it('strips task ids from the ledger operation on GET', async () => {
    const { client, records } = setup([ok([task([])])]);
    await client.get('/business_data/google/reviews/task_get/0f1e2d3c-4b5a-4968-8776-655443322110', scope);
    expect(records[0]?.operation).toBe('/business_data/google/reviews/task_get');
  });

  it('retries API rate limits (40202) then succeeds', async () => {
    const limited = new Response(JSON.stringify({ status_code: 40202, status_message: 'rate limit', tasks: [] }), { status: 200 });
    const { client, fetch } = setup([limited, ok([task([])])]);
    await expect(client.post('/x', [{}], scope)).resolves.toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('throws a typed non-retryable error for auth failures and logs the failed call', async () => {
    const denied = new Response(JSON.stringify({ status_code: 40100, status_message: 'not authorized', tasks: [] }), { status: 200 });
    const { client, records } = setup([denied]);
    const err = await client.post('/x', [{}], scope).catch((e) => e);
    expect(err).toBeInstanceOf(VendorError);
    expect(err).toMatchObject({ vendor: 'dataforseo', code: 40100, retryable: false });
    expect(records[0]).toMatchObject({ ok: false, costUsd: null });
  });

  it('throws on HTTP 500 after retries and on malformed bodies', async () => {
    const { client } = setup([new Response('x', { status: 500 }), new Response('x', { status: 500 }), new Response('x', { status: 500 })]);
    await expect(client.post('/x', [{}], scope)).rejects.toMatchObject({ code: 500, retryable: true });
    const bad = setup([new Response('not json', { status: 200 })]);
    await expect(bad.client.post('/x', [{}], scope)).rejects.toMatchObject({ retryable: false });
  });

  it('never lets a ledger failure change the outcome', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = createDataForSeo({
      login: 'a', password: 'b', fetch: (async () => ok([task([])])) as unknown as typeof fetch,
      ledger: { recordLlmCall: async () => {}, recordVendorCall: async () => { throw new Error('db down'); } },
    });
    await expect(client.post('/x', [{}], scope)).resolves.toHaveLength(1);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
```

`packages/collectors/src/vendors/dataforseo.live.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createDataForSeo, DFS_SANDBOX_URL } from './dataforseo';

const { DATAFORSEO_LOGIN: login, DATAFORSEO_PASSWORD: password } = process.env;

// Free sandbox (mock data, real response shapes). Runs only when credentials are present.
describe.skipIf(!login || !password)('DataForSEO sandbox contract', () => {
  it('returns a maps SERP task with items', async () => {
    const dfs = createDataForSeo({ login: login as string, password: password as string, baseUrl: DFS_SANDBOX_URL, ledger: { recordLlmCall: async () => {}, recordVendorCall: async () => {} } });
    const [t] = await dfs.post('/serp/google/maps/live/advanced', [{ keyword: 'hvac repair', location_code: 2840, language_code: 'en', depth: 10 }], { agencyId: null, clientId: null });
    expect(t?.statusCode).toBe(20000);
    expect(Array.isArray((t?.result[0] as { items?: unknown[] })?.items)).toBe(true);
  }, 60_000);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @cs/collectors exec vitest run src/vendors` → FAIL.

- [ ] **Step 3: Implement**

`packages/collectors/src/vendors/errors.ts`:
```ts
import type { LedgerSink, VendorCallRecord } from '@cs/core';

export class VendorError extends Error {
  constructor(readonly vendor: string, readonly code: number | null, message: string, readonly retryable: boolean, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'VendorError';
  }
}

/** The cost ledger must never change a vendor call's outcome. */
export async function safeRecordVendorCall(ledger: LedgerSink, record: VendorCallRecord): Promise<void> {
  try {
    await ledger.recordVendorCall(record);
  } catch (err) {
    console.error('[vendors] ledger write failed', err);
  }
}
```

`packages/collectors/src/vendors/dfs-time.ts`:
```ts
export function parseDfsTimestamp(value: unknown): Date | null {
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value * 1000);
  if (typeof value !== 'string' || value.trim() === '') return null;
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2}:\d{2})$/.exec(value.trim());
  const d = new Date(m ? `${m[1]}T${m[2]}${m[3]}` : value);
  return Number.isNaN(d.getTime()) ? null : d;
}
```

`packages/collectors/src/vendors/dataforseo.ts`:
```ts
import type { CallScope, LedgerSink } from '@cs/core';
import { z } from 'zod';
import { safeRecordVendorCall, VendorError } from './errors';

export { VendorError } from './errors';

export const DFS_BASE_URL = 'https://api.dataforseo.com/v3';
export const DFS_SANDBOX_URL = 'https://sandbox.dataforseo.com/v3';
export const DFS_US = { location_code: 2840, language_code: 'en' } as const;

const taskSchema = z.looseObject({
  id: z.string(),
  status_code: z.number(),
  status_message: z.string(),
  result: z.array(z.unknown()).nullish(),
});
const envelopeSchema = z.looseObject({
  status_code: z.number(),
  status_message: z.string(),
  cost: z.number().nullish(),
  tasks: z.array(taskSchema).nullish(),
});

export interface DfsTask {
  id: string;
  statusCode: number;
  statusMessage: string;
  result: unknown[];
}

export interface DataForSeoClient {
  post(path: string, tasks: Record<string, unknown>[], scope: CallScope): Promise<DfsTask[]>;
  get(path: string, scope: CallScope): Promise<DfsTask[]>;
}

export interface DataForSeoOptions {
  login: string;
  password: string;
  baseUrl?: string;
  ledger: LedgerSink;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
  now?: () => number;
  timeoutMs?: number;
}

export const isDfsOk = (code: number) => code >= 20000 && code < 30000;
const RETRY_HTTP = new Set([408, 429, 500, 502, 503, 504]);
const RETRY_API = new Set([40202, 50000, 50301, 50401]);
const TASK_ID_SUFFIX = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createDataForSeo(opts: DataForSeoOptions): DataForSeoClient {
  const base = opts.baseUrl ?? DFS_BASE_URL;
  const doFetch = opts.fetch ?? ((i: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(i, init));
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const maxRetries = opts.maxRetries ?? 2;
  const now = opts.now ?? Date.now;
  const timeoutMs = opts.timeoutMs ?? 130_000; // live endpoints may take up to 120 s
  const auth = `Basic ${Buffer.from(`${opts.login}:${opts.password}`).toString('base64')}`;

  async function call(method: 'POST' | 'GET', path: string, body: Record<string, unknown>[] | undefined, scope: CallScope): Promise<DfsTask[]> {
    const started = now();
    let ok = false;
    let cost: number | null = null;
    try {
      for (let attempt = 0; ; attempt++) {
        const canRetry = attempt < maxRetries;
        const backoff = () => sleep(1000 * 2 ** attempt);
        let res: Response;
        try {
          res = await doFetch(`${base}${path}`, {
            method,
            headers: { authorization: auth, 'content-type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: AbortSignal.timeout(timeoutMs),
          });
        } catch (err) {
          if (canRetry) { await backoff(); continue; }
          throw new VendorError('dataforseo', null, `Network error calling ${path}`, true, { cause: err });
        }
        if (!res.ok) {
          const retryable = RETRY_HTTP.has(res.status);
          if (retryable && canRetry) { await backoff(); continue; }
          throw new VendorError('dataforseo', res.status, `HTTP ${res.status} from ${path}`, retryable);
        }
        const parsed = envelopeSchema.safeParse(await res.json().catch(() => null));
        if (!parsed.success) throw new VendorError('dataforseo', null, `Unexpected response from ${path}`, false, { cause: parsed.error });
        const env = parsed.data;
        cost = env.cost ?? null;
        if (!isDfsOk(env.status_code)) {
          const retryable = RETRY_API.has(env.status_code);
          if (retryable && canRetry) { await backoff(); continue; }
          throw new VendorError('dataforseo', env.status_code, env.status_message, retryable);
        }
        ok = true;
        return (env.tasks ?? []).map((t) => ({ id: t.id, statusCode: t.status_code, statusMessage: t.status_message, result: t.result ?? [] }));
      }
    } finally {
      await safeRecordVendorCall(opts.ledger, {
        ...scope, vendor: 'dataforseo', operation: path.replace(TASK_ID_SUFFIX, ''), units: body?.length ?? 1,
        costUsd: ok ? cost : null, latencyMs: now() - started, ok,
      });
    }
  }

  return { post: (path, tasks, scope) => call('POST', path, tasks, scope), get: (path, scope) => call('GET', path, undefined, scope) };
}
```

`packages/collectors/src/index.ts` — add:
```ts
export * from './vendors/dataforseo';
export * from './vendors/dfs-time';
export * from './vendors/errors';
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @cs/collectors exec vitest run src/vendors && pnpm --filter @cs/collectors typecheck`
Expected: PASS; the sandbox contract test runs if `DATAFORSEO_LOGIN`/`DATAFORSEO_PASSWORD` are in `.env`.

- [ ] **Step 5: Commit**

```bash
git add packages/collectors
git commit -m "feat(collectors): DataForSEO client with typed errors, retries and cost ledger

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Vendor capture recorder and review privacy helpers

**Files:**
- Create: `packages/collectors/src/evidence/vendor-capture.ts`, `packages/collectors/src/evidence/privacy.ts`; Modify: `src/index.ts`
- Test: `packages/collectors/src/evidence/vendor-capture.test.ts`, `privacy.test.ts`

**Interfaces:**
- Consumes: `capture`, `evidence` (db); `ObjectStore`; `sha256Hex` (Phase 2a recorder)
- Produces:
  - `recordVendorCapture(deps: { db: Db; store: ObjectStore; now?: () => Date }, input: { competitorId: string; source: string; collectorVersion: string; url?: string | null; status: 'ok' | 'vendor_error'; error?: string | null; payload?: unknown }): Promise<{ captureId: string; objectKey: string | null }>` — payload stored at `evidence/{competitorId}/{captureId}/vendor.json.gz`
  - `pseudonymizeReviewer(name: string | null | undefined, salt: string): string | null` (HMAC-SHA256 hex of the trimmed, lowercased name; null for empty)
  - `redactContactInfo(text: string): string` (e-mails → `[email]`, phone numbers → `[phone]`)
  - `requireSalt(env: NodeJS.ProcessEnv): string` (throws unless `REVIEWER_HASH_SALT` ≥ 32 chars)

- [ ] **Step 1: Write the failing tests**

`packages/collectors/src/evidence/privacy.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { pseudonymizeReviewer, redactContactInfo, requireSalt } from './privacy';

const salt = 's'.repeat(32);

describe('pseudonymizeReviewer', () => {
  it('is stable, case/whitespace-insensitive and not reversible to the name', () => {
    const a = pseudonymizeReviewer('Jane Doe', salt);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(pseudonymizeReviewer('  jane doe ', salt)).toBe(a);
    expect(pseudonymizeReviewer('Jane Doe', 't'.repeat(32))).not.toBe(a);
    expect(a).not.toContain('jane');
  });
  it('returns null for missing names', () => {
    expect(pseudonymizeReviewer('', salt)).toBeNull();
    expect(pseudonymizeReviewer(undefined, salt)).toBeNull();
  });
});

describe('redactContactInfo', () => {
  it('redacts e-mails and phone numbers but keeps prices and years', () => {
    const out = redactContactInfo('Call me at (404) 555-0199 or +1 404.555.0199, mail jane@x.com. Paid $79 in 2026.');
    expect(out).toBe('Call me at [phone] or [phone], mail [email]. Paid $79 in 2026.');
  });
});

describe('requireSalt', () => {
  it('requires a long salt', () => {
    expect(() => requireSalt({})).toThrow(/REVIEWER_HASH_SALT/);
    expect(() => requireSalt({ REVIEWER_HASH_SALT: 'short' })).toThrow(/REVIEWER_HASH_SALT/);
    expect(requireSalt({ REVIEWER_HASH_SALT: salt })).toBe(salt);
  });
});
```

`packages/collectors/src/evidence/vendor-capture.test.ts`:
```ts
import { capture, evidence } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { gunzipSync } from 'node:zlib';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { recordVendorCapture } from './vendor-capture';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('recordVendorCapture', () => {
  it('stores the raw payload as gzipped vendor_json evidence', async () => {
    const store = createMemoryStore();
    const r = await recordVendorCapture({ db: dbs.service, store }, { competitorId: IDS.competitorX, source: 'google_ads', collectorVersion: 'dfs/1', status: 'ok', payload: { items: [1, 2] } });
    expect(r.objectKey).toBe(`evidence/${IDS.competitorX}/${r.captureId}/vendor.json.gz`);
    expect(JSON.parse(gunzipSync(Buffer.from((await store.get(r.objectKey as string)) ?? [])).toString())).toEqual({ items: [1, 2] });
    const [ev] = await dbs.service.select().from(evidence).where(eq(evidence.captureId, r.captureId));
    expect(ev).toMatchObject({ kind: 'vendor_json', contentType: 'application/gzip' });
  });

  it('records vendor errors without evidence', async () => {
    const r = await recordVendorCapture({ db: dbs.service, store: createMemoryStore() }, { competitorId: IDS.competitorX, source: 'google_ads', collectorVersion: 'dfs/1', status: 'vendor_error', error: '40100 not authorized' });
    expect(r.objectKey).toBeNull();
    const [c] = await dbs.service.select().from(capture).where(eq(capture.id, r.captureId));
    expect(c).toMatchObject({ status: 'vendor_error', error: '40100 not authorized' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @cs/collectors exec vitest run src/evidence` → FAIL (new modules missing).

- [ ] **Step 3: Implement**

`packages/collectors/src/evidence/privacy.ts`:
```ts
import { createHmac } from 'node:crypto';

export function pseudonymizeReviewer(name: string | null | undefined, salt: string): string | null {
  const n = name?.trim().toLowerCase();
  if (!n) return null;
  return createHmac('sha256', salt).update(n).digest('hex');
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// North American and international formats with at least 10 digits; won't match "$79" or "2026".
const PHONE = /(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;

export function redactContactInfo(text: string): string {
  return text.replace(EMAIL, '[email]').replace(PHONE, '[phone]');
}

export function requireSalt(env: NodeJS.ProcessEnv): string {
  const salt = env.REVIEWER_HASH_SALT;
  if (!salt || salt.length < 32) throw new Error('REVIEWER_HASH_SALT must be set to at least 32 random characters');
  return salt;
}
```

`packages/collectors/src/evidence/vendor-capture.ts`:
```ts
import { capture, type Db, evidence } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { sha256Hex } from './recorder';

export interface VendorCaptureInput {
  competitorId: string;
  source: string;
  collectorVersion: string;
  url?: string | null;
  status: 'ok' | 'vendor_error';
  error?: string | null;
  payload?: unknown;
}

export async function recordVendorCapture(
  deps: { db: Db; store: ObjectStore; now?: () => Date },
  input: VendorCaptureInput,
): Promise<{ captureId: string; objectKey: string | null }> {
  const captureId = randomUUID();
  const capturedAt = (deps.now ?? (() => new Date()))();
  const row = {
    id: captureId, competitorId: input.competitorId, source: input.source, url: input.url ?? null, status: input.status,
    error: input.error ?? null, collectorVersion: input.collectorVersion, capturedAt,
  };
  if (input.status !== 'ok' || input.payload === undefined) {
    await deps.db.insert(capture).values(row);
    return { captureId, objectKey: null };
  }
  const json = JSON.stringify(input.payload);
  const body = new Uint8Array(gzipSync(json));
  const objectKey = `evidence/${input.competitorId}/${captureId}/vendor.json.gz`;
  await deps.store.put(objectKey, body, 'application/gzip');
  await deps.db.transaction(async (tx) => {
    await tx.insert(capture).values(row);
    await tx.insert(evidence).values({ captureId, kind: 'vendor_json', objectKey, sha256: sha256Hex(json), bytes: body.byteLength, contentType: 'application/gzip' });
  });
  return { captureId, objectKey };
}
```

`src/index.ts` — add `export * from './evidence/privacy';` and `export * from './evidence/vendor-capture';`.

- [ ] **Step 4: Run tests, typecheck, commit**

Run: `pnpm --filter @cs/collectors exec vitest run src/evidence && pnpm --filter @cs/collectors typecheck` → PASS.
```bash
git add packages/collectors
git commit -m "feat(collectors): vendor evidence capture and reviewer privacy helpers

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Local search — grid, maps parsing, competitor suggestions and acceptance

**Files:**
- Create: `packages/collectors/src/local/grid.ts`, `maps.ts`, `suggest.ts`, `accept.ts`; `packages/collectors/src/sources/kinds.ts`, `ensure.ts`; Modify: `src/index.ts`
- Test: `packages/collectors/src/local/grid.test.ts`, `maps.test.ts`, `suggest.test.ts`, `accept.test.ts`

**Interfaces:**
- Consumes: `DataForSeoClient`, `DFS_US` (Task 2); `client`, `competitor`, `clientCompetitor`, `competitorSuggestion`, `competitorSource`, `withTenant` (db); `AccessContext`
- Produces:
  - `gridPoints(center: { lat: number; lng: number }, radiusKm: number, size: number): { lat: number; lng: number }[]` (size×size, row-major, center included when size is odd)
  - `interface MapsPlace { placeId: string | null; cid: string | null; title: string; domain: string | null; url: string | null; rank: number; rating: number | null; votes: number | null; category: string | null; address: string | null; lat: number | null; lng: number | null }`
  - `parseMapsItems(result: unknown[]): MapsPlace[]`; `mapsSearch(dfs, q: { keyword: string; lat: number; lng: number; zoom?: number; depth?: number }, scope): Promise<{ places: MapsPlace[]; raw: unknown[] }>`
  - `SOURCE_KINDS = ['gbp', 'reviews', 'ads_google', 'ads_meta', 'jobs'] as const`, `SourceKind`
  - `ensureCompetitorSources(db: Db, competitorId: string): Promise<void>`
  - `suggestCompetitors(deps: { db: Db; dfs: DataForSeoClient }, clientId: string, opts?: { gridSize?: number; maxKeywords?: number }): Promise<{ suggested: number; searches: number }>`
  - `acceptSuggestion(deps: { service: Db; app: Db }, ctx: AccessContext, suggestionId: string): Promise<{ competitorId: string }>`

- [ ] **Step 1: Write the failing tests**

`packages/collectors/src/local/grid.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { gridPoints } from './grid';

describe('gridPoints', () => {
  it('returns size×size points spanning the radius, centered', () => {
    const pts = gridPoints({ lat: 33.9, lng: -84.3 }, 10, 3);
    expect(pts).toHaveLength(9);
    expect(pts[4]).toEqual({ lat: 33.9, lng: -84.3 });
    const dLat = (pts[0]?.lat ?? 0) - 33.9;
    expect(Math.abs(dLat * 111.32)).toBeCloseTo(10, 0);
  });
  it('returns just the center for size 1', () => {
    expect(gridPoints({ lat: 1, lng: 2 }, 5, 1)).toEqual([{ lat: 1, lng: 2 }]);
  });
});
```

`packages/collectors/src/local/maps.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { dfsTask, fakeDfs } from '../../test/fake-dfs';
import { mapsSearch, parseMapsItems } from './maps';

const result = [{
  items: [
    { type: 'maps_search', rank_absolute: 1, title: 'Smith HVAC', domain: 'smithhvac.example', url: 'https://smithhvac.example/', place_id: 'p1', cid: '111', rating: { value: 4.6, votes_count: 210 }, category: 'HVAC contractor', address: '1 Main St', latitude: 33.9, longitude: -84.3 },
    { type: 'maps_paid_item', rank_absolute: 2, title: 'Ad Co' },
    { type: 'maps_search', rank_absolute: 3, title: 'No Site Plumbing', place_id: 'p3' },
    { type: 'maps_search', title: 42 },
  ],
}];

describe('parseMapsItems', () => {
  it('keeps organic places, tolerates missing fields, skips malformed items', () => {
    expect(parseMapsItems(result)).toEqual([
      { placeId: 'p1', cid: '111', title: 'Smith HVAC', domain: 'smithhvac.example', url: 'https://smithhvac.example/', rank: 1, rating: 4.6, votes: 210, category: 'HVAC contractor', address: '1 Main St', lat: 33.9, lng: -84.3 },
      { placeId: 'p3', cid: null, title: 'No Site Plumbing', domain: null, url: null, rank: 3, rating: null, votes: null, category: null, address: null, lat: null, lng: null },
    ]);
  });
});

describe('mapsSearch', () => {
  it('queries the live maps endpoint with a coordinate', async () => {
    const dfs = fakeDfs(() => [dfsTask(result)]);
    const r = await mapsSearch(dfs, { keyword: 'ac repair', lat: 33.9, lng: -84.3 }, { agencyId: null, clientId: null });
    expect(r.places).toHaveLength(2);
    expect(dfs.calls[0]).toEqual({
      method: 'POST', path: '/serp/google/maps/live/advanced',
      body: [{ keyword: 'ac repair', location_coordinate: '33.9,-84.3,14z', language_code: 'en', depth: 20 }],
    });
  });
});
```

`packages/collectors/src/local/suggest.test.ts`:
```ts
import { client, competitorSuggestion } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { dfsTask, fakeDfs } from '../../test/fake-dfs';
import { suggestCompetitors } from './suggest';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.service.update(client).set({ keywords: ['ac repair', 'furnace repair'], placeId: 'self', serviceArea: { center: { lat: 33.9, lng: -84.3 }, radiusKm: 10, zips: [] } }).where(eq(client.id, IDS.clientA1));
});

describe('suggestCompetitors', () => {
  it('aggregates places across grid points and keywords, excluding the client itself', async () => {
    const dfs = fakeDfs(() => [dfsTask([{ items: [
      { type: 'maps_search', rank_absolute: 1, title: 'Me', place_id: 'self' },
      { type: 'maps_search', rank_absolute: 2, title: 'Smith HVAC', place_id: 'p1', domain: 'smithhvac.example', rating: { value: 4.6, votes_count: 210 } },
    ] }])]);
    const r = await suggestCompetitors({ db: dbs.service, dfs }, IDS.clientA1, { gridSize: 1, maxKeywords: 2 });
    expect(r).toEqual({ suggested: 1, searches: 2 });
    const rows = await dbs.service.select().from(competitorSuggestion);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ agencyId: IDS.agencyA, clientId: IDS.clientA1, placeId: 'p1', appearances: 2, bestRank: 2, overlapScore: 1, status: 'suggested' });
    // Idempotent
    await suggestCompetitors({ db: dbs.service, dfs }, IDS.clientA1, { gridSize: 1, maxKeywords: 2 });
    expect(await dbs.service.select().from(competitorSuggestion)).toHaveLength(1);
  });

  it('refuses clients without keywords or service area', async () => {
    await expect(suggestCompetitors({ db: dbs.service, dfs: fakeDfs(() => []) }, IDS.clientA2)).rejects.toThrow(/keywords|service area/i);
  });
});
```

`packages/collectors/src/local/accept.test.ts`:
```ts
import { createAccessContext } from '@cs/core';
import { clientCompetitor, competitor, competitorSource, competitorSuggestion } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { acceptSuggestion } from './accept';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const SUG = '00000000-0000-4000-8000-0000000000d1';

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.service.insert(competitorSuggestion).values({ id: SUG, agencyId: IDS.agencyA, clientId: IDS.clientA1, name: 'Cool Air', domain: 'coolair.example', placeId: 'p9', cid: '999', appearances: 3, overlapScore: 0.6 });
});

describe('acceptSuggestion', () => {
  it('creates the global competitor, links it to the client, schedules sources and marks accepted', async () => {
    const ctx = createAccessContext({ agencyId: IDS.agencyA, userId: 'am', role: 'account_manager', clientScope: [IDS.clientA1], features: [] });
    const { competitorId } = await acceptSuggestion({ service: dbs.service, app: dbs.app }, ctx, SUG);
    const [c] = await dbs.service.select().from(competitor).where(eq(competitor.id, competitorId));
    expect(c).toMatchObject({ name: 'Cool Air', domain: 'coolair.example', placeId: 'p9', cid: '999' });
    expect(await dbs.service.select().from(clientCompetitor).where(eq(clientCompetitor.competitorId, competitorId))).toHaveLength(1);
    expect((await dbs.service.select().from(competitorSource).where(eq(competitorSource.competitorId, competitorId))).map((s) => s.source).sort()).toEqual(['ads_google', 'ads_meta', 'gbp', 'jobs', 'reviews']);
    const [s] = await dbs.service.select().from(competitorSuggestion).where(eq(competitorSuggestion.id, SUG));
    expect(s?.status).toBe('accepted');
  });

  it('reuses an existing competitor with the same place id', async () => {
    await dbs.service.insert(competitor).values({ name: 'Cool Air LLC', placeId: 'p9' });
    const ctx = createAccessContext({ agencyId: IDS.agencyA, userId: 'am', role: 'agency_admin', clientScope: 'all', features: [] });
    const { competitorId } = await acceptSuggestion({ service: dbs.service, app: dbs.app }, ctx, SUG);
    expect(await dbs.service.select().from(competitor).where(eq(competitor.placeId, 'p9'))).toEqual([expect.objectContaining({ id: competitorId })]);
  });

  it('refuses suggestions outside the caller scope', async () => {
    const ctx = createAccessContext({ agencyId: IDS.agencyA, userId: 'am', role: 'account_manager', clientScope: [IDS.clientA2], features: [] });
    await expect(acceptSuggestion({ service: dbs.service, app: dbs.app }, ctx, SUG)).rejects.toThrow(/not found/i);
    const ctxB = createAccessContext({ agencyId: IDS.agencyB, userId: 'x', role: 'agency_admin', clientScope: 'all', features: [] });
    await expect(acceptSuggestion({ service: dbs.service, app: dbs.app }, ctxB, SUG)).rejects.toThrow(/not found/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @cs/collectors exec vitest run src/local` → FAIL.

- [ ] **Step 3: Implement**

`packages/collectors/src/local/grid.ts`:
```ts
const KM_PER_DEG_LAT = 111.32;

/** Square grid of size×size points covering ±radiusKm around the center (equirectangular approximation). */
export function gridPoints(center: { lat: number; lng: number }, radiusKm: number, size: number): { lat: number; lng: number }[] {
  if (size <= 1) return [{ lat: center.lat, lng: center.lng }];
  const kmPerDegLng = KM_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180);
  const step = (2 * radiusKm) / (size - 1);
  const round = (n: number) => Math.round(n * 1e6) / 1e6;
  const pts: { lat: number; lng: number }[] = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const northKm = radiusKm - row * step;
      const eastKm = -radiusKm + col * step;
      pts.push({ lat: round(center.lat + northKm / KM_PER_DEG_LAT), lng: round(center.lng + eastKm / kmPerDegLng) });
    }
  }
  return pts;
}
```

`packages/collectors/src/local/maps.ts`:
```ts
import type { CallScope } from '@cs/core';
import { z } from 'zod';
import { type DataForSeoClient, DFS_US } from '../vendors/dataforseo';

export interface MapsPlace {
  placeId: string | null;
  cid: string | null;
  title: string;
  domain: string | null;
  url: string | null;
  rank: number;
  rating: number | null;
  votes: number | null;
  category: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
}

const itemSchema = z.looseObject({
  type: z.literal('maps_search'),
  title: z.string(),
  rank_absolute: z.number(),
  domain: z.string().nullish(),
  url: z.string().nullish(),
  place_id: z.string().nullish(),
  cid: z.string().nullish(),
  rating: z.looseObject({ value: z.number().nullish(), votes_count: z.number().nullish() }).nullish(),
  category: z.string().nullish(),
  address: z.string().nullish(),
  latitude: z.number().nullish(),
  longitude: z.number().nullish(),
});

export function parseMapsItems(result: unknown[]): MapsPlace[] {
  const items = (result[0] as { items?: unknown[] } | undefined)?.items ?? [];
  const out: MapsPlace[] = [];
  for (const raw of items) {
    const p = itemSchema.safeParse(raw);
    if (!p.success) continue;
    const i = p.data;
    out.push({
      placeId: i.place_id ?? null, cid: i.cid ?? null, title: i.title, domain: i.domain ?? null, url: i.url ?? null, rank: i.rank_absolute,
      rating: i.rating?.value ?? null, votes: i.rating?.votes_count ?? null, category: i.category ?? null, address: i.address ?? null,
      lat: i.latitude ?? null, lng: i.longitude ?? null,
    });
  }
  return out;
}

export async function mapsSearch(
  dfs: DataForSeoClient,
  q: { keyword: string; lat: number; lng: number; zoom?: number; depth?: number },
  scope: CallScope,
): Promise<{ places: MapsPlace[]; raw: unknown[] }> {
  const [task] = await dfs.post(
    '/serp/google/maps/live/advanced',
    [{ keyword: q.keyword, location_coordinate: `${q.lat},${q.lng},${q.zoom ?? 14}z`, language_code: DFS_US.language_code, depth: q.depth ?? 20 }],
    scope,
  );
  const raw = task?.result ?? [];
  return { places: parseMapsItems(raw), raw };
}
```

`packages/collectors/src/sources/kinds.ts`:
```ts
export const SOURCE_KINDS = ['gbp', 'reviews', 'ads_google', 'ads_meta', 'jobs'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];
```

`packages/collectors/src/sources/ensure.ts`:
```ts
import { competitorSource, type Db } from '@cs/db';
import { SOURCE_KINDS } from './kinds';

/** Creates a due-now schedule row for every vendor source of a competitor (idempotent). */
export async function ensureCompetitorSources(db: Db, competitorId: string): Promise<void> {
  await db.insert(competitorSource).values(SOURCE_KINDS.map((source) => ({ competitorId, source }))).onConflictDoNothing();
}
```

`packages/collectors/src/local/suggest.ts`:
```ts
import { client, competitorSuggestion, type Db } from '@cs/db';
import { eq, sql } from 'drizzle-orm';
import type { DataForSeoClient } from '../vendors/dataforseo';
import { gridPoints } from './grid';
import { mapsSearch } from './maps';

export async function suggestCompetitors(
  deps: { db: Db; dfs: DataForSeoClient },
  clientId: string,
  opts: { gridSize?: number; maxKeywords?: number } = {},
): Promise<{ suggested: number; searches: number }> {
  const [c] = await deps.db.select().from(client).where(eq(client.id, clientId)).limit(1);
  if (!c) throw new Error(`Client ${clientId} not found`);
  const keywords = c.keywords.slice(0, opts.maxKeywords ?? 2);
  if (keywords.length === 0 || !c.serviceArea) throw new Error('Client needs keywords and a service area before competitor discovery');

  const points = gridPoints(c.serviceArea.center, c.serviceArea.radiusKm, opts.gridSize ?? 3);
  const scope = { agencyId: c.agencyId, clientId: c.id };
  const agg = new Map<string, { name: string; domain: string | null; placeId: string | null; cid: string | null; rating: number | null; votes: number | null; appearances: number; bestRank: number }>();
  let searches = 0;
  for (const keyword of keywords) {
    for (const pt of points) {
      const { places } = await mapsSearch(deps.dfs, { keyword, lat: pt.lat, lng: pt.lng }, scope);
      searches++;
      for (const p of places) {
        if (c.placeId && p.placeId === c.placeId) continue;
        const key = p.placeId ?? p.cid ?? p.title.toLowerCase();
        const cur = agg.get(key);
        if (cur) {
          cur.appearances++;
          cur.bestRank = Math.min(cur.bestRank, p.rank);
        } else {
          agg.set(key, { name: p.title, domain: p.domain, placeId: p.placeId, cid: p.cid, rating: p.rating, votes: p.votes, appearances: 1, bestRank: p.rank });
        }
      }
    }
  }
  const rows = [...agg.values()].filter((a) => a.placeId).map((a) => ({
    agencyId: c.agencyId, clientId: c.id, name: a.name, domain: a.domain, placeId: a.placeId, cid: a.cid, rating: a.rating, votes: a.votes,
    appearances: a.appearances, bestRank: a.bestRank, overlapScore: a.appearances / searches,
  }));
  if (rows.length > 0) {
    await deps.db.insert(competitorSuggestion).values(rows).onConflictDoUpdate({
      target: [competitorSuggestion.clientId, competitorSuggestion.placeId],
      set: { appearances: sql`excluded.appearances`, bestRank: sql`excluded.best_rank`, overlapScore: sql`excluded.overlap_score`, rating: sql`excluded.rating`, votes: sql`excluded.votes` },
    });
  }
  return { suggested: rows.length, searches };
}
```

`packages/collectors/src/local/accept.ts`:
```ts
import type { AccessContext } from '@cs/core';
import { clientCompetitor, competitor, competitorSuggestion, type Db, withTenant } from '@cs/db';
import { eq } from 'drizzle-orm';
import { ensureCompetitorSources } from '../sources/ensure';

/** Visibility is checked through RLS as the caller; the global competitor is written by the service role. */
export async function acceptSuggestion(deps: { service: Db; app: Db }, ctx: AccessContext, suggestionId: string): Promise<{ competitorId: string }> {
  const [s] = await withTenant(deps.app, ctx, (tx) => tx.select().from(competitorSuggestion).where(eq(competitorSuggestion.id, suggestionId)).limit(1));
  if (!s) throw new Error('Suggestion not found');

  let [existing] = s.placeId ? await deps.service.select().from(competitor).where(eq(competitor.placeId, s.placeId)).limit(1) : [];
  if (!existing && s.domain) [existing] = await deps.service.select().from(competitor).where(eq(competitor.domain, s.domain)).limit(1);
  const competitorId =
    existing?.id ??
    (await deps.service.insert(competitor).values({ name: s.name, domain: s.domain, placeId: s.placeId, cid: s.cid }).returning({ id: competitor.id }))[0]?.id;
  if (!competitorId) throw new Error('Could not create competitor');

  await withTenant(deps.app, ctx, async (tx) => {
    await tx.insert(clientCompetitor).values({ agencyId: s.agencyId, clientId: s.clientId, competitorId }).onConflictDoNothing();
    await tx.update(competitorSuggestion).set({ status: 'accepted' }).where(eq(competitorSuggestion.id, s.id));
  });
  await ensureCompetitorSources(deps.service, competitorId);
  return { competitorId };
}
```

`src/index.ts` — add exports for `./local/accept`, `./local/grid`, `./local/maps`, `./local/suggest`, `./sources/ensure`, `./sources/kinds`.

- [ ] **Step 4: Run tests, typecheck, commit**

Run: `pnpm --filter @cs/collectors exec vitest run src/local && pnpm --filter @cs/collectors typecheck` → PASS.
```bash
git add packages/collectors
git commit -m "feat(collectors): local-search competitor suggestions and acceptance

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Google Business Profile collector

**Files:**
- Create: `packages/collectors/src/gbp/collect-gbp.ts`; Modify: `src/index.ts`
- Test: `packages/collectors/src/gbp/collect-gbp.test.ts`

**Interfaces:**
- Consumes: Tasks 2–4; `observation`, `competitor` (db)
- Produces:
  - `DFS_COLLECTOR_VERSION = 'dfs/1'`
  - `extractGbpProfile(item: unknown): Record<string, unknown> | null` — `{ title, category, additionalCategories, rating, votes, phone, url, domain, isClaimed, currentStatus, cid, placeId, workHours, services, attributes }` (the last three kept raw/unknown)
  - `collectGbpProfile(deps: { db: Db; store: ObjectStore; dfs: DataForSeoClient }, c: { id: string; placeId: string | null; cid: string | null }): Promise<{ status: 'ok' | 'vendor_error' | 'skipped'; captureId?: string }>`

- [ ] **Step 1: Write the failing test**

`packages/collectors/src/gbp/collect-gbp.test.ts`:
```ts
import { competitor, observation } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { dfsTask, fakeDfs } from '../../test/fake-dfs';
import { VendorError } from '../vendors/errors';
import { collectGbpProfile } from './collect-gbp';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

const item = {
  type: 'google_business_info', title: 'Smith HVAC', category: 'HVAC contractor', additional_categories: ['Plumber'],
  rating: { value: 4.6, votes_count: 210 }, phone: '+14045550199', url: 'https://smithhvac.example/', domain: 'smithhvac.example',
  is_claimed: true, current_status: 'opened', cid: '111', place_id: 'p1', work_time: { work_hours: { timetable: {} } }, services: [{ name: 'AC tune-up' }],
};

describe('collectGbpProfile', () => {
  it('stores raw evidence and a gbp_profile observation, and learns the cid', async () => {
    const dfs = fakeDfs(() => [dfsTask([{ items: [item] }])]);
    const r = await collectGbpProfile({ db: dbs.service, store: createMemoryStore(), dfs }, { id: IDS.competitorX, placeId: 'p1', cid: null });
    expect(r.status).toBe('ok');
    expect(dfs.calls[0]?.body).toEqual([{ keyword: 'place_id:p1', location_code: 2840, language_code: 'en' }]);
    const [o] = await dbs.service.select().from(observation).where(eq(observation.competitorId, IDS.competitorX));
    expect(o).toMatchObject({ kind: 'gbp_profile', key: 'profile' });
    expect(o?.data).toMatchObject({ title: 'Smith HVAC', rating: 4.6, votes: 210, isClaimed: true, additionalCategories: ['Plumber'] });
    const [c] = await dbs.service.select().from(competitor).where(eq(competitor.id, IDS.competitorX));
    expect(c?.cid).toBe('111');
  });

  it('skips competitors without place id or cid', async () => {
    expect(await collectGbpProfile({ db: dbs.service, store: createMemoryStore(), dfs: fakeDfs(() => []) }, { id: IDS.competitorX, placeId: null, cid: null })).toEqual({ status: 'skipped' });
  });

  it('records vendor errors as captures', async () => {
    const dfs = fakeDfs(() => { throw new VendorError('dataforseo', 40100, 'not authorized', false); });
    const r = await collectGbpProfile({ db: dbs.service, store: createMemoryStore(), dfs }, { id: IDS.competitorX, placeId: 'p1', cid: null });
    expect(r.status).toBe('vendor_error');
  });
});
```

- [ ] **Step 2: Run to verify it fails**, then implement.

`packages/collectors/src/gbp/collect-gbp.ts`:
```ts
import { competitor, type Db, observation } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { recordVendorCapture } from '../evidence/vendor-capture';
import { type DataForSeoClient, DFS_US } from '../vendors/dataforseo';
import { VendorError } from '../vendors/errors';

export const DFS_COLLECTOR_VERSION = 'dfs/1';

const gbpSchema = z.looseObject({
  title: z.string().nullish(),
  category: z.string().nullish(),
  additional_categories: z.array(z.string()).nullish(),
  rating: z.looseObject({ value: z.number().nullish(), votes_count: z.number().nullish() }).nullish(),
  phone: z.string().nullish(),
  url: z.string().nullish(),
  domain: z.string().nullish(),
  is_claimed: z.boolean().nullish(),
  current_status: z.string().nullish(),
  cid: z.string().nullish(),
  place_id: z.string().nullish(),
  work_time: z.unknown().optional(),
  services: z.unknown().optional(),
  attributes: z.unknown().optional(),
});

export function extractGbpProfile(item: unknown): Record<string, unknown> | null {
  const p = gbpSchema.safeParse(item);
  if (!p.success) return null;
  const i = p.data;
  return {
    title: i.title ?? null, category: i.category ?? null, additionalCategories: i.additional_categories ?? [],
    rating: i.rating?.value ?? null, votes: i.rating?.votes_count ?? null, phone: i.phone ?? null, url: i.url ?? null,
    domain: i.domain ?? null, isClaimed: i.is_claimed ?? null, currentStatus: i.current_status ?? null, cid: i.cid ?? null,
    placeId: i.place_id ?? null, workHours: i.work_time ?? null, services: i.services ?? null, attributes: i.attributes ?? null,
  };
}

export async function collectGbpProfile(
  deps: { db: Db; store: ObjectStore; dfs: DataForSeoClient },
  c: { id: string; placeId: string | null; cid: string | null },
): Promise<{ status: 'ok' | 'vendor_error' | 'skipped'; captureId?: string }> {
  const keyword = c.placeId ? `place_id:${c.placeId}` : c.cid ? `cid:${c.cid}` : null;
  if (!keyword) return { status: 'skipped' };
  const base = { competitorId: c.id, source: 'google_business_profile', collectorVersion: DFS_COLLECTOR_VERSION };
  let raw: unknown[];
  try {
    const [task] = await deps.dfs.post('/business_data/google/my_business_info/live', [{ keyword, ...DFS_US }], { agencyId: null, clientId: null });
    raw = task?.result ?? [];
  } catch (err) {
    if (!(err instanceof VendorError)) throw err;
    const r = await recordVendorCapture(deps, { ...base, status: 'vendor_error', error: `${err.code ?? ''} ${err.message}`.trim() });
    return { status: 'vendor_error', captureId: r.captureId };
  }
  const { captureId } = await recordVendorCapture(deps, { ...base, status: 'ok', payload: raw });
  const profile = extractGbpProfile((raw[0] as { items?: unknown[] } | undefined)?.items?.[0]);
  if (profile) {
    await deps.db.insert(observation).values({ competitorId: c.id, captureId, kind: 'gbp_profile', key: 'profile', data: profile });
    if (!c.cid && typeof profile.cid === 'string') {
      await deps.db.update(competitor).set({ cid: profile.cid }).where(and(eq(competitor.id, c.id), isNull(competitor.cid)));
    }
  }
  return { status: 'ok', captureId };
}
```
Export from `src/index.ts`. Note: `competitor.cid` is unique — if another competitor already holds that cid, the update fails; wrap the update in try/catch and `console.warn` a duplicate-competitor notice (a duplicate means two competitor rows describe one business — flag for merge in Phase 3).

- [ ] **Step 3: Run tests, typecheck, commit**

Run: `pnpm --filter @cs/collectors exec vitest run src/gbp && pnpm --filter @cs/collectors typecheck` → PASS.
```bash
git add packages/collectors
git commit -m "feat(collectors): Google Business Profile snapshots

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Google reviews (async tasks, dedupe, privacy)

**Files:**
- Create: `packages/collectors/src/reviews/post.ts`, `collect.ts`, `upsert.ts`; Modify: `src/index.ts`
- Test: `packages/collectors/src/reviews/upsert.test.ts`, `reviews.test.ts`

**Interfaces:**
- Consumes: Tasks 2–5; `vendorTask`, `review` (db)
- Produces:
  - `postReviewTasks(deps: { db: Db; dfs: DataForSeoClient }, competitors: { id: string; placeId: string | null; cid: string | null; backfill?: boolean }[]): Promise<{ posted: number }>` (depth 100 weekly, 700 on backfill; `sort_by: 'newest'`; `tag` = competitor id)
  - `collectReadyTasks(deps, kind: 'google_reviews' | 'google_jobs', readyPath: string, getPath: (id: string) => string, handle: (task: DfsTask, vt: VendorTaskRow) => Promise<void>): Promise<{ collected: number; failed: number }>` (shared by Task 9; marks tasks pending > 48 h as failed)
  - `collectReadyReviews(deps: { db: Db; store: ObjectStore; dfs: DataForSeoClient; salt: string }): Promise<{ collected: number; failed: number; reviews: number }>`
  - `upsertReviews(db: Db, competitorId: string, captureId: string, items: unknown[], salt: string, now?: Date): Promise<{ upserted: number; skipped: number }>`

- [ ] **Step 1: Write the failing tests**

`packages/collectors/src/reviews/upsert.test.ts`:
```ts
import { capture, review } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { upsertReviews } from './upsert';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const CAP = '00000000-0000-4000-8000-0000000000c1';
const salt = 's'.repeat(32);

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.service.insert(capture).values({ id: CAP, competitorId: IDS.competitorX, source: 'google_reviews', status: 'ok', collectorVersion: 'dfs/1' });
});

const item = (over: Record<string, unknown> = {}) => ({
  type: 'google_reviews_search', review_id: 'r1', rating: { value: 2 }, review_text: 'Slow. Call 404-555-0199', timestamp: '2026-09-20 10:00:00 +00:00',
  profile_name: 'Jane Doe', profile_url: 'https://maps.google.com/contrib/1', profile_image_url: 'https://x/img.jpg', owner_answer: null, ...over,
});

describe('upsertReviews', () => {
  it('stores pseudonymised, redacted reviews without reviewer identity', async () => {
    expect(await upsertReviews(dbs.service, IDS.competitorX, CAP, [item(), { junk: true }], salt)).toEqual({ upserted: 1, skipped: 1 });
    const [r] = await dbs.service.select().from(review);
    expect(r).toMatchObject({ dedupeKey: 'id:r1', externalId: 'r1', rating: 2, text: 'Slow. Call [phone]', firstCaptureId: CAP });
    expect(r?.reviewerHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(r)).not.toMatch(/Jane|contrib|img\.jpg/);
    expect(r?.postedAt?.toISOString()).toBe('2026-09-20T10:00:00.000Z');
  });

  it('dedupes repeated pulls and picks up a later owner reply', async () => {
    await upsertReviews(dbs.service, IDS.competitorX, CAP, [item()], salt, new Date('2026-09-21T00:00:00Z'));
    await upsertReviews(dbs.service, IDS.competitorX, CAP, [item({ owner_answer: 'Sorry! Email us at help@smith.example', owner_timestamp: '2026-09-22 09:00:00 +00:00' })], salt, new Date('2026-09-28T00:00:00Z'));
    const rows = await dbs.service.select().from(review);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ownerAnswer: 'Sorry! Email us at [email]' });
    expect(rows[0]?.lastSeenAt.toISOString()).toBe('2026-09-28T00:00:00.000Z');
    expect(rows[0]?.firstSeenAt.toISOString()).toBe('2026-09-21T00:00:00.000Z');
  });

  it('falls back to a content hash when review_id is missing', async () => {
    await upsertReviews(dbs.service, IDS.competitorX, CAP, [item({ review_id: null })], salt);
    const [r] = await dbs.service.select().from(review);
    expect(r?.dedupeKey).toMatch(/^h:[0-9a-f]{64}$/);
  });
});
```

`packages/collectors/src/reviews/reviews.test.ts`:
```ts
import { review, vendorTask } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { dfsTask, fakeDfs } from '../../test/fake-dfs';
import { collectReadyReviews } from './collect';
import { postReviewTasks } from './post';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});
const TASK = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('review tasks', () => {
  it('posts one task per competitor and records it as pending', async () => {
    const dfs = fakeDfs(() => [dfsTask([], { id: TASK, statusCode: 20100, statusMessage: 'Task Created.' })]);
    expect(await postReviewTasks({ db: dbs.service, dfs }, [{ id: IDS.competitorX, placeId: 'p1', cid: null, backfill: true }])).toEqual({ posted: 1 });
    expect(dfs.calls[0]?.body).toEqual([{ place_id: 'p1', location_code: 2840, language_code: 'en', depth: 700, sort_by: 'newest', tag: IDS.competitorX }]);
    const [vt] = await dbs.service.select().from(vendorTask);
    expect(vt).toMatchObject({ externalTaskId: TASK, kind: 'google_reviews', status: 'pending', competitorId: IDS.competitorX });
  });

  it('collects ready tasks into reviews and marks them done', async () => {
    await dbs.service.insert(vendorTask).values({ vendor: 'dataforseo', kind: 'google_reviews', externalTaskId: TASK, competitorId: IDS.competitorX });
    const dfs = fakeDfs((_m, path) => {
      if (path.endsWith('/tasks_ready')) return [dfsTask([{ id: TASK, tag: IDS.competitorX }, { id: 'unknown-task' }])];
      return [dfsTask([{ items: [{ review_id: 'r1', rating: { value: 5 }, review_text: 'Great', timestamp: '2026-09-20 10:00:00 +00:00', profile_name: 'A' }] }], { id: TASK })];
    });
    const r = await collectReadyReviews({ db: dbs.service, store: createMemoryStore(), dfs, salt: 's'.repeat(32) });
    expect(r).toEqual({ collected: 1, failed: 0, reviews: 1 });
    expect(dfs.calls.map((c) => c.path)).toEqual(['/business_data/google/reviews/tasks_ready', `/business_data/google/reviews/task_get/${TASK}`]);
    expect(await dbs.service.select().from(review)).toHaveLength(1);
    const [vt] = await dbs.service.select().from(vendorTask).where(eq(vendorTask.externalTaskId, TASK));
    expect(vt?.status).toBe('done');
  });
});
```

- [ ] **Step 2: Run to verify they fail**, then implement.

`packages/collectors/src/reviews/upsert.ts`:
```ts
import { type Db, review } from '@cs/db';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { pseudonymizeReviewer, redactContactInfo } from '../evidence/privacy';
import { sha256Hex } from '../evidence/recorder';
import { parseDfsTimestamp } from '../vendors/dfs-time';

const reviewSchema = z.looseObject({
  review_id: z.string().nullish(),
  rating: z.looseObject({ value: z.number().nullish() }).nullish(),
  review_text: z.string().nullish(),
  timestamp: z.union([z.string(), z.number()]).nullish(),
  profile_name: z.string().nullish(),
  owner_answer: z.string().nullish(),
  owner_timestamp: z.union([z.string(), z.number()]).nullish(),
});

export async function upsertReviews(db: Db, competitorId: string, captureId: string, items: unknown[], salt: string, now = new Date()): Promise<{ upserted: number; skipped: number }> {
  const rows: (typeof review.$inferInsert)[] = [];
  let skipped = 0;
  for (const raw of items) {
    const p = reviewSchema.safeParse(raw);
    if (!p.success || (!p.data.review_id && !p.data.review_text && !p.data.timestamp)) {
      skipped++;
      continue;
    }
    const i = p.data;
    const reviewerHash = pseudonymizeReviewer(i.profile_name, salt);
    const text = i.review_text ? redactContactInfo(i.review_text) : null;
    const postedAt = parseDfsTimestamp(i.timestamp);
    const dedupeKey = i.review_id ? `id:${i.review_id}` : `h:${sha256Hex(`${reviewerHash ?? ''}|${postedAt?.toISOString() ?? ''}|${text ?? ''}`)}`;
    rows.push({
      competitorId, source: 'google', dedupeKey, externalId: i.review_id ?? null, rating: i.rating?.value != null ? Math.round(i.rating.value) : null,
      text, reviewerHash, postedAt, ownerAnswer: i.owner_answer ? redactContactInfo(i.owner_answer) : null,
      ownerAnsweredAt: parseDfsTimestamp(i.owner_timestamp), firstCaptureId: captureId, firstSeenAt: now, lastSeenAt: now,
    });
  }
  if (rows.length > 0) {
    await db.insert(review).values(rows).onConflictDoUpdate({
      target: [review.competitorId, review.source, review.dedupeKey],
      set: {
        lastSeenAt: sql`excluded.last_seen_at`,
        ownerAnswer: sql`coalesce(excluded.owner_answer, ${review.ownerAnswer})`,
        ownerAnsweredAt: sql`coalesce(excluded.owner_answered_at, ${review.ownerAnsweredAt})`,
      },
    });
  }
  return { upserted: rows.length, skipped };
}
```

`packages/collectors/src/reviews/post.ts`:
```ts
import { type Db, vendorTask } from '@cs/db';
import { type DataForSeoClient, DFS_US, isDfsOk } from '../vendors/dataforseo';

export async function postReviewTasks(
  deps: { db: Db; dfs: DataForSeoClient },
  competitors: { id: string; placeId: string | null; cid: string | null; backfill?: boolean }[],
): Promise<{ posted: number }> {
  const eligible = competitors.filter((c) => c.placeId || c.cid);
  let posted = 0;
  for (let i = 0; i < eligible.length; i += 100) {
    const batch = eligible.slice(i, i + 100);
    const tasks = await deps.dfs.post(
      '/business_data/google/reviews/task_post',
      batch.map((c) => ({ ...(c.placeId ? { place_id: c.placeId } : { cid: c.cid }), ...DFS_US, depth: c.backfill ? 700 : 100, sort_by: 'newest', tag: c.id })),
      { agencyId: null, clientId: null },
    );
    const rows = tasks
      .map((t, idx) => ({ t, c: batch[idx] }))
      .filter(({ t, c }) => c && isDfsOk(t.statusCode))
      .map(({ t, c }) => ({ vendor: 'dataforseo', kind: 'google_reviews', externalTaskId: t.id, competitorId: (c as { id: string }).id }));
    if (rows.length > 0) await deps.db.insert(vendorTask).values(rows).onConflictDoNothing();
    posted += rows.length;
  }
  return { posted };
}
```

`packages/collectors/src/reviews/collect.ts`:
```ts
import { type Db, vendorTask } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { DFS_COLLECTOR_VERSION } from '../gbp/collect-gbp';
import { recordVendorCapture } from '../evidence/vendor-capture';
import type { DataForSeoClient, DfsTask } from '../vendors/dataforseo';
import { isDfsOk } from '../vendors/dataforseo';
import { upsertReviews } from './upsert';

export type VendorTaskRow = typeof vendorTask.$inferSelect;
const scope = { agencyId: null, clientId: null };

/** Shared poll loop for async DataForSEO endpoints: tasks_ready → task_get for our pending tasks. */
export async function collectReadyTasks(
  deps: { db: Db; dfs: DataForSeoClient },
  kind: 'google_reviews' | 'google_jobs',
  readyPath: string,
  getPath: (id: string) => string,
  handle: (task: DfsTask, vt: VendorTaskRow) => Promise<void>,
): Promise<{ collected: number; failed: number }> {
  await deps.db
    .update(vendorTask)
    .set({ status: 'failed', error: 'not ready after 48h', completedAt: sql`now()` })
    .where(and(eq(vendorTask.kind, kind), eq(vendorTask.status, 'pending'), lt(vendorTask.postedAt, sql`now() - interval '48 hours'`)));

  const [ready] = await deps.dfs.get(readyPath, scope);
  const readyIds = (ready?.result ?? []).map((r) => (r as { id?: unknown }).id).filter((id): id is string => typeof id === 'string');
  if (readyIds.length === 0) return { collected: 0, failed: 0 };
  const pending = await deps.db.select().from(vendorTask).where(and(eq(vendorTask.kind, kind), eq(vendorTask.status, 'pending'), inArray(vendorTask.externalTaskId, readyIds)));

  let collected = 0;
  let failed = 0;
  for (const vt of pending) {
    try {
      const [task] = await deps.dfs.get(getPath(vt.externalTaskId), scope);
      if (!task || !isDfsOk(task.statusCode)) throw new Error(task?.statusMessage ?? 'empty task');
      await handle(task, vt);
      await deps.db.update(vendorTask).set({ status: 'done', completedAt: sql`now()` }).where(eq(vendorTask.id, vt.id));
      collected++;
    } catch (err) {
      await deps.db.update(vendorTask).set({ status: 'failed', error: String(err instanceof Error ? err.message : err).slice(0, 500), completedAt: sql`now()` }).where(eq(vendorTask.id, vt.id));
      failed++;
    }
  }
  return { collected, failed };
}

export async function collectReadyReviews(deps: { db: Db; store: ObjectStore; dfs: DataForSeoClient; salt: string }): Promise<{ collected: number; failed: number; reviews: number }> {
  let reviews = 0;
  const r = await collectReadyTasks(
    deps,
    'google_reviews',
    '/business_data/google/reviews/tasks_ready',
    (id) => `/business_data/google/reviews/task_get/${id}`,
    async (task, vt) => {
      const { captureId } = await recordVendorCapture(deps, { competitorId: vt.competitorId, source: 'google_reviews', collectorVersion: DFS_COLLECTOR_VERSION, status: 'ok', payload: task.result });
      const items = (task.result[0] as { items?: unknown[] } | undefined)?.items ?? [];
      reviews += (await upsertReviews(deps.db, vt.competitorId, captureId, items, deps.salt)).upserted;
    },
  );
  return { ...r, reviews };
}
```
Export all three modules from `src/index.ts`.

- [ ] **Step 3: Run tests, typecheck, commit**

Run: `pnpm --filter @cs/collectors exec vitest run src/reviews && pnpm --filter @cs/collectors typecheck` → PASS.
```bash
git add packages/collectors
git commit -m "feat(collectors): Google reviews via async tasks with dedupe and pseudonymisation

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Google ads (Ads Transparency via DataForSEO `ads_search`)

**Files:**
- Create: `packages/collectors/src/ads/google.ts`, `packages/collectors/src/ads/upsert.ts`; Modify: `src/index.ts`
- Test: `packages/collectors/src/ads/google.test.ts`

**Interfaces:**
- Consumes: Tasks 2–3; `ad` (db)
- Produces:
  - `interface NormalizedAd { externalId: string; advertiserId: string | null; format: string | null; title: string | null; text: string | null; mediaUrls: string[]; landingUrl: string | null; publisherPlatforms: string[]; startedAt: Date | null; endedAt: Date | null; isActive: boolean }`
  - `upsertAds(db: Db, competitorId: string, platform: 'google' | 'meta', captureId: string, ads: NormalizedAd[], opts: { markMissingInactive: boolean; now?: Date }): Promise<{ upserted: number; deactivated: number }>` — keeps `first_seen_at`/`first_capture_id`, advances `last_seen_at`/`last_capture_id`; when `markMissingInactive`, active ads of that competitor/platform not in `ads` get `is_active=false`, `ended_at=now`
  - `normalizeGoogleAd(item: unknown, now: Date): NormalizedAd | null` (active when `last_shown` within 14 days)
  - `collectGoogleAds(deps: { db: Db; store: ObjectStore; dfs: DataForSeoClient }, c: { id: string; domain: string | null }): Promise<{ status: 'ok' | 'vendor_error' | 'skipped'; ads?: number }>`

- [ ] **Step 1: Write the failing test**

`packages/collectors/src/ads/google.test.ts`:
```ts
import { ad } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { dfsTask, fakeDfs } from '../../test/fake-dfs';
import { collectGoogleAds, normalizeGoogleAd } from './google';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

const now = new Date('2026-09-30T00:00:00Z');
const item = (creative: string, lastShown: string) => ({
  type: 'ads_search', advertiser_id: 'AR1', creative_id: creative, title: 'Smith HVAC', url: 'https://adstransparency.google.com/x', format: 'image',
  preview_image: { url: `https://img/${creative}.png` }, first_shown: '2026-09-01 00:00:00 +00:00', last_shown: lastShown,
});

describe('google ads', () => {
  it('normalises creatives and derives activity from last_shown', () => {
    expect(normalizeGoogleAd(item('c1', '2026-09-29 00:00:00 +00:00'), now)).toMatchObject({ externalId: 'c1', isActive: true, endedAt: null, mediaUrls: ['https://img/c1.png'], format: 'image' });
    expect(normalizeGoogleAd(item('c2', '2026-08-01 00:00:00 +00:00'), now)).toMatchObject({ isActive: false, endedAt: new Date('2026-08-01T00:00:00Z') });
    expect(normalizeGoogleAd({ type: 'ads_search' }, now)).toBeNull();
  });

  it('collects by domain and upserts ads', async () => {
    const dfs = fakeDfs(() => [dfsTask([{ items: [item('c1', '2026-09-29 00:00:00 +00:00')] }])]);
    const r = await collectGoogleAds({ db: dbs.service, store: createMemoryStore(), dfs }, { id: IDS.competitorX, domain: 'smithhvac.example' });
    expect(r).toEqual({ status: 'ok', ads: 1 });
    expect(dfs.calls[0]?.body).toEqual([{ target: 'smithhvac.example', location_code: 2840, depth: 40 }]);
    expect((await dbs.service.select().from(ad)).map((a) => [a.platform, a.externalId])).toEqual([['google', 'c1']]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**, then implement.

`packages/collectors/src/ads/upsert.ts`:
```ts
import { ad, type Db } from '@cs/db';
import { and, eq, notInArray, sql } from 'drizzle-orm';

export interface NormalizedAd {
  externalId: string;
  advertiserId: string | null;
  format: string | null;
  title: string | null;
  text: string | null;
  mediaUrls: string[];
  landingUrl: string | null;
  publisherPlatforms: string[];
  startedAt: Date | null;
  endedAt: Date | null;
  isActive: boolean;
}

export async function upsertAds(
  db: Db,
  competitorId: string,
  platform: 'google' | 'meta',
  captureId: string,
  ads: NormalizedAd[],
  opts: { markMissingInactive: boolean; now?: Date },
): Promise<{ upserted: number; deactivated: number }> {
  const now = opts.now ?? new Date();
  if (ads.length > 0) {
    await db
      .insert(ad)
      .values(ads.map((a) => ({ ...a, competitorId, platform, firstSeenAt: now, lastSeenAt: now, firstCaptureId: captureId, lastCaptureId: captureId })))
      .onConflictDoUpdate({
        target: [ad.platform, ad.externalId],
        set: {
          isActive: sql`excluded.is_active`, endedAt: sql`excluded.ended_at`, lastSeenAt: sql`excluded.last_seen_at`, lastCaptureId: sql`excluded.last_capture_id`,
          text: sql`coalesce(excluded.text, ${ad.text})`, mediaUrls: sql`excluded.media_urls`, publisherPlatforms: sql`excluded.publisher_platforms`,
        },
      });
  }
  let deactivated = 0;
  if (opts.markMissingInactive) {
    const seen = ads.map((a) => a.externalId);
    const conds = [eq(ad.competitorId, competitorId), eq(ad.platform, platform), eq(ad.isActive, true)];
    if (seen.length > 0) conds.push(notInArray(ad.externalId, seen));
    const rows = await db.update(ad).set({ isActive: false, endedAt: now }).where(and(...conds)).returning({ id: ad.id });
    deactivated = rows.length;
  }
  return { upserted: ads.length, deactivated };
}
```

`packages/collectors/src/ads/google.ts`:
```ts
import type { Db } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { z } from 'zod';
import { recordVendorCapture } from '../evidence/vendor-capture';
import { DFS_COLLECTOR_VERSION } from '../gbp/collect-gbp';
import { type DataForSeoClient, DFS_US } from '../vendors/dataforseo';
import { parseDfsTimestamp } from '../vendors/dfs-time';
import { VendorError } from '../vendors/errors';
import { type NormalizedAd, upsertAds } from './upsert';

const ACTIVE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const itemSchema = z.looseObject({
  creative_id: z.string(),
  advertiser_id: z.string().nullish(),
  title: z.string().nullish(),
  format: z.string().nullish(),
  preview_image: z.looseObject({ url: z.string().nullish() }).nullish(),
  first_shown: z.union([z.string(), z.number()]).nullish(),
  last_shown: z.union([z.string(), z.number()]).nullish(),
});

export function normalizeGoogleAd(item: unknown, now: Date): NormalizedAd | null {
  const p = itemSchema.safeParse(item);
  if (!p.success) return null;
  const i = p.data;
  const lastShown = parseDfsTimestamp(i.last_shown);
  const isActive = lastShown ? now.getTime() - lastShown.getTime() <= ACTIVE_WINDOW_MS : true;
  return {
    externalId: i.creative_id, advertiserId: i.advertiser_id ?? null, format: i.format ?? null, title: i.title ?? null, text: null,
    mediaUrls: i.preview_image?.url ? [i.preview_image.url] : [], landingUrl: null, publisherPlatforms: ['google'],
    startedAt: parseDfsTimestamp(i.first_shown), endedAt: isActive ? null : lastShown, isActive,
  };
}

export async function collectGoogleAds(
  deps: { db: Db; store: ObjectStore; dfs: DataForSeoClient },
  c: { id: string; domain: string | null },
): Promise<{ status: 'ok' | 'vendor_error' | 'skipped'; ads?: number }> {
  if (!c.domain) return { status: 'skipped' };
  const base = { competitorId: c.id, source: 'google_ads', collectorVersion: DFS_COLLECTOR_VERSION };
  let raw: unknown[];
  try {
    const [task] = await deps.dfs.post('/serp/google/ads_search/live/advanced', [{ target: c.domain, location_code: DFS_US.location_code, depth: 40 }], { agencyId: null, clientId: null });
    raw = task?.result ?? [];
  } catch (err) {
    if (!(err instanceof VendorError)) throw err;
    await recordVendorCapture(deps, { ...base, status: 'vendor_error', error: `${err.code ?? ''} ${err.message}`.trim() });
    return { status: 'vendor_error' };
  }
  const { captureId } = await recordVendorCapture(deps, { ...base, status: 'ok', payload: raw });
  const now = new Date();
  const items = (raw[0] as { items?: unknown[] } | undefined)?.items ?? [];
  const ads = items.map((i) => normalizeGoogleAd(i, now)).filter((a): a is NormalizedAd => a !== null);
  await upsertAds(deps.db, c.id, 'google', captureId, ads, { markMissingInactive: false, now });
  return { status: 'ok', ads: ads.length };
}
```
Export both from `src/index.ts`.

- [ ] **Step 3: Run tests, typecheck, commit**

Run: `pnpm --filter @cs/collectors exec vitest run src/ads && pnpm --filter @cs/collectors typecheck` → PASS.
```bash
git add packages/collectors
git commit -m "feat(collectors): Google Ads Transparency creatives with activity history

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Meta ads (Apify primary, ScrapeCreators fallback)

**Files:**
- Create: `packages/collectors/src/vendors/apify.ts`, `scrapecreators.ts`, `packages/collectors/src/ads/meta.ts`; Modify: `src/index.ts`
- Test: `packages/collectors/src/ads/meta.test.ts`

**Interfaces:**
- Consumes: Tasks 2–3, 7; `LedgerSink`
- Produces:
  - `APIFY_META_ACTOR = 'curious_coder~facebook-ads-library-scraper'`; `metaLibraryUrl(pageId: string, country?: string): string`
  - `fetchMetaAdsApify(opts: { token: string; ledger: LedgerSink; fetch?: typeof fetch }, pageId: string): Promise<unknown[]>`
  - `fetchMetaAdsScrapeCreators(opts: { apiKey: string; ledger: LedgerSink; fetch?: typeof fetch; maxPages?: number }, pageId: string): Promise<unknown[]>`
  - `normalizeMetaAd(raw: unknown): NormalizedAd | null` — tolerant of camelCase / snake_case (`adArchiveID`|`adArchiveId`|`ad_archive_id`, `isActive`|`is_active`, `startDate`|`start_date` as Unix seconds or date string, `snapshot.body.text`, `snapshot.images[]` strings or `{original_image_url|resized_image_url|url}`, `snapshot.videos[]` `video_hd_url|videoHdUrl|video_preview_image_url|videoPreviewImageUrl`, `snapshot.link_url|linkUrl`, `publisherPlatform|publisher_platform`)
  - `collectMetaAds(deps: { db: Db; store: ObjectStore; ledger: LedgerSink; apify?: { token: string }; scrapeCreators?: { apiKey: string }; fetch?: typeof fetch }, c: { id: string; metaPageId: string | null }): Promise<{ status: 'ok' | 'vendor_error' | 'skipped'; ads?: number; deactivated?: number; vendor?: string }>`

- [ ] **Step 1: Write the failing test**

`packages/collectors/src/ads/meta.test.ts`:
```ts
import { ad } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { collectMetaAds, normalizeMetaAd } from './meta';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});
const ledger = { recordLlmCall: async () => {}, recordVendorCall: vi.fn(async () => {}) };

const apifyItem = { adArchiveID: 'A1', pageID: '99', isActive: true, startDate: 1790000000, publisherPlatform: ['FACEBOOK', 'INSTAGRAM'], snapshot: { body: { text: '$79 tune-up' }, images: [{ original_image_url: 'https://img/1.jpg' }], linkUrl: 'https://smithhvac.example/specials' } };
const scItem = { ad_archive_id: 'S1', is_active: true, start_date: 1790000000, publisher_platform: ['FACEBOOK'], snapshot: { body: { text: 'Beat the heat' }, videos: [{ video_preview_image_url: 'https://img/v.jpg' }] } };

describe('normalizeMetaAd', () => {
  it('handles both vendor casings', () => {
    expect(normalizeMetaAd(apifyItem)).toMatchObject({ externalId: 'A1', text: '$79 tune-up', mediaUrls: ['https://img/1.jpg'], landingUrl: 'https://smithhvac.example/specials', publisherPlatforms: ['FACEBOOK', 'INSTAGRAM'], isActive: true, startedAt: new Date(1790000000 * 1000) });
    expect(normalizeMetaAd(scItem)).toMatchObject({ externalId: 'S1', text: 'Beat the heat', mediaUrls: ['https://img/v.jpg'] });
    expect(normalizeMetaAd({ foo: 1 })).toBeNull();
  });
});

describe('collectMetaAds', () => {
  it('uses Apify, and marks ads that disappeared as ended', async () => {
    await dbs.service.insert(ad).values({ competitorId: IDS.competitorX, platform: 'meta', externalId: 'OLD', isActive: true });
    const fetch = vi.fn(async () => new Response(JSON.stringify([apifyItem]), { status: 201 }));
    const r = await collectMetaAds({ db: dbs.service, store: createMemoryStore(), ledger, apify: { token: 't' }, fetch: fetch as unknown as typeof globalThis.fetch }, { id: IDS.competitorX, metaPageId: '99' });
    expect(r).toMatchObject({ status: 'ok', ads: 1, deactivated: 1, vendor: 'apify' });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.apify.com/v2/actors/curious_coder~facebook-ads-library-scraper/run-sync-get-dataset-items');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer t');
    expect(JSON.parse(init.body as string)).toMatchObject({ urls: [{ url: expect.stringContaining('view_all_page_id=99') }], 'scrapePageAds.activeStatus': 'active', 'scrapePageAds.countryCode': 'US' });
    const rows = await dbs.service.select().from(ad);
    expect(rows.find((a) => a.externalId === 'OLD')).toMatchObject({ isActive: false });
    expect(rows.find((a) => a.externalId === 'A1')).toMatchObject({ isActive: true });
  });

  it('falls back to ScrapeCreators when Apify fails', async () => {
    const fetch = vi.fn(async (u: string) =>
      u.includes('apify') ? new Response('boom', { status: 500 }) : new Response(JSON.stringify({ success: true, results: [scItem], cursor: null }), { status: 200 }),
    );
    const r = await collectMetaAds({ db: dbs.service, store: createMemoryStore(), ledger, apify: { token: 't' }, scrapeCreators: { apiKey: 'k' }, fetch: fetch as unknown as typeof globalThis.fetch }, { id: IDS.competitorX, metaPageId: '99' });
    expect(r).toMatchObject({ status: 'ok', ads: 1, vendor: 'scrapecreators' });
    const scCall = fetch.mock.calls.find((c) => String(c[0]).includes('scrapecreators')) as unknown as [string, RequestInit];
    expect(scCall[0]).toContain('/v1/facebook/adLibrary/company/ads?pageId=99');
    expect((scCall[1].headers as Record<string, string>)['x-api-key']).toBe('k');
  });

  it('skips competitors without a Meta page id and reports vendor errors when all vendors fail', async () => {
    expect(await collectMetaAds({ db: dbs.service, store: createMemoryStore(), ledger }, { id: IDS.competitorX, metaPageId: null })).toEqual({ status: 'skipped' });
    const fetch = vi.fn(async () => new Response('x', { status: 500 }));
    const r = await collectMetaAds({ db: dbs.service, store: createMemoryStore(), ledger, apify: { token: 't' }, fetch: fetch as unknown as typeof globalThis.fetch }, { id: IDS.competitorX, metaPageId: '99' });
    expect(r.status).toBe('vendor_error');
  });
});
```

- [ ] **Step 2: Run to verify it fails**, then implement.

`packages/collectors/src/vendors/apify.ts`:
```ts
import type { LedgerSink } from '@cs/core';
import { safeRecordVendorCall, VendorError } from './errors';

export const APIFY_META_ACTOR = 'curious_coder~facebook-ads-library-scraper';

export function metaLibraryUrl(pageId: string, country = 'US'): string {
  const u = new URL('https://www.facebook.com/ads/library/');
  u.search = new URLSearchParams({ active_status: 'active', ad_type: 'all', country, view_all_page_id: pageId, media_type: 'all' }).toString();
  return u.toString();
}

export async function fetchMetaAdsApify(opts: { token: string; ledger: LedgerSink; fetch?: typeof fetch }, pageId: string): Promise<unknown[]> {
  const doFetch = opts.fetch ?? globalThis.fetch;
  const started = Date.now();
  let items: unknown[] = [];
  let ok = false;
  try {
    const res = await doFetch(`https://api.apify.com/v2/actors/${APIFY_META_ACTOR}/run-sync-get-dataset-items`, {
      method: 'POST',
      headers: { authorization: `Bearer ${opts.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        urls: [{ url: metaLibraryUrl(pageId) }], count: 200, limitPerSource: 200, scrapeAdDetails: false,
        'scrapePageAds.activeStatus': 'active', 'scrapePageAds.countryCode': 'US', 'scrapePageAds.sortBy': 'most_recent',
      }),
      signal: AbortSignal.timeout(310_000), // Apify sync runs time out at 300 s (HTTP 408)
    });
    if (!res.ok) throw new VendorError('apify', res.status, `Apify HTTP ${res.status}`, res.status === 408 || res.status >= 500);
    const body = await res.json().catch(() => null);
    if (!Array.isArray(body)) throw new VendorError('apify', null, 'Apify returned a non-array body', false);
    items = body;
    ok = true;
    return items;
  } catch (err) {
    if (err instanceof VendorError) throw err;
    throw new VendorError('apify', null, 'Network error calling Apify', true, { cause: err });
  } finally {
    await safeRecordVendorCall(opts.ledger, { agencyId: null, clientId: null, vendor: 'apify', operation: APIFY_META_ACTOR, units: items.length, costUsd: null, latencyMs: Date.now() - started, ok });
  }
}
```

`packages/collectors/src/vendors/scrapecreators.ts`:
```ts
import type { LedgerSink } from '@cs/core';
import { safeRecordVendorCall, VendorError } from './errors';

export async function fetchMetaAdsScrapeCreators(opts: { apiKey: string; ledger: LedgerSink; fetch?: typeof fetch; maxPages?: number }, pageId: string): Promise<unknown[]> {
  const doFetch = opts.fetch ?? globalThis.fetch;
  const out: unknown[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < (opts.maxPages ?? 3); page++) {
    const params = new URLSearchParams({ pageId, country: 'US', status: 'ACTIVE' });
    if (cursor) params.set('cursor', cursor);
    const started = Date.now();
    let ok = false;
    let credits: number | null = null;
    try {
      const res = await doFetch(`https://api.scrapecreators.com/v1/facebook/adLibrary/company/ads?${params}`, { headers: { 'x-api-key': opts.apiKey }, signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new VendorError('scrapecreators', res.status, `ScrapeCreators HTTP ${res.status}`, res.status >= 500 || res.status === 429);
      const body = (await res.json().catch(() => null)) as { results?: unknown[]; cursor?: string | null; credits_charged?: number } | null;
      if (!body || !Array.isArray(body.results)) throw new VendorError('scrapecreators', null, 'Unexpected ScrapeCreators body', false);
      out.push(...body.results);
      credits = body.credits_charged ?? null;
      cursor = body.cursor ?? null;
      ok = true;
    } catch (err) {
      if (err instanceof VendorError) throw err;
      throw new VendorError('scrapecreators', null, 'Network error calling ScrapeCreators', true, { cause: err });
    } finally {
      // costUsd unknown (credit-based); credits recorded as units.
      await safeRecordVendorCall(opts.ledger, { agencyId: null, clientId: null, vendor: 'scrapecreators', operation: 'facebook/adLibrary/company/ads', units: credits ?? 1, costUsd: null, latencyMs: Date.now() - started, ok });
    }
    if (!cursor) break;
  }
  return out;
}
```

`packages/collectors/src/ads/meta.ts`:
```ts
import type { LedgerSink } from '@cs/core';
import type { Db } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { recordVendorCapture } from '../evidence/vendor-capture';
import { fetchMetaAdsApify } from '../vendors/apify';
import { parseDfsTimestamp } from '../vendors/dfs-time';
import { VendorError } from '../vendors/errors';
import { fetchMetaAdsScrapeCreators } from '../vendors/scrapecreators';
import { type NormalizedAd, upsertAds } from './upsert';

export const META_COLLECTOR_VERSION = 'meta/1';
type Obj = Record<string, unknown>;
const pick = (o: Obj | undefined, keys: string[]): unknown => {
  for (const k of keys) if (o && o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};
const str = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : typeof v === 'number' ? String(v) : null);

export function normalizeMetaAd(raw: unknown): NormalizedAd | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Obj;
  const externalId = str(pick(o, ['adArchiveID', 'adArchiveId', 'ad_archive_id']));
  if (!externalId) return null;
  const snap = (pick(o, ['snapshot']) ?? {}) as Obj;
  const body = pick(snap, ['body']) as Obj | undefined;
  const images = (Array.isArray(snap.images) ? snap.images : []).map((i) =>
    typeof i === 'string' ? i : str(pick(i as Obj, ['original_image_url', 'originalImageUrl', 'resized_image_url', 'resizedImageUrl', 'url'])),
  );
  const videos = (Array.isArray(snap.videos) ? snap.videos : []).map((v) =>
    str(pick(v as Obj, ['video_preview_image_url', 'videoPreviewImageUrl', 'video_hd_url', 'videoHdUrl', 'video_sd_url', 'videoSdUrl'])),
  );
  const platforms = pick(o, ['publisherPlatform', 'publisher_platform', 'publisherPlatforms']);
  const isActive = pick(o, ['isActive', 'is_active']);
  const start = parseDfsTimestamp(pick(o, ['startDate', 'start_date']));
  const end = parseDfsTimestamp(pick(o, ['endDate', 'end_date']));
  return {
    externalId, advertiserId: str(pick(o, ['pageID', 'pageId', 'page_id'])), format: str(pick(snap, ['display_format', 'displayFormat'])),
    title: str(pick(snap, ['title'])), text: str(body ? pick(body, ['text']) : pick(snap, ['body'])),
    mediaUrls: [...images, ...videos].filter((u): u is string => Boolean(u)), landingUrl: str(pick(snap, ['link_url', 'linkUrl'])),
    publisherPlatforms: Array.isArray(platforms) ? platforms.filter((p): p is string => typeof p === 'string') : [],
    startedAt: start, endedAt: isActive === false ? end : null, isActive: isActive !== false,
  };
}

export async function collectMetaAds(
  deps: { db: Db; store: ObjectStore; ledger: LedgerSink; apify?: { token: string }; scrapeCreators?: { apiKey: string }; fetch?: typeof fetch },
  c: { id: string; metaPageId: string | null },
): Promise<{ status: 'ok' | 'vendor_error' | 'skipped'; ads?: number; deactivated?: number; vendor?: string }> {
  if (!c.metaPageId) return { status: 'skipped' };
  const base = { competitorId: c.id, source: 'meta_ads', collectorVersion: META_COLLECTOR_VERSION };
  const attempts: [string, () => Promise<unknown[]>][] = [];
  if (deps.apify) attempts.push(['apify', () => fetchMetaAdsApify({ token: deps.apify!.token, ledger: deps.ledger, fetch: deps.fetch }, c.metaPageId!)]);
  if (deps.scrapeCreators) attempts.push(['scrapecreators', () => fetchMetaAdsScrapeCreators({ apiKey: deps.scrapeCreators!.apiKey, ledger: deps.ledger, fetch: deps.fetch }, c.metaPageId!)]);
  const errors: string[] = [];
  for (const [vendor, run] of attempts) {
    let raw: unknown[];
    try {
      raw = await run();
    } catch (err) {
      if (!(err instanceof VendorError)) throw err;
      errors.push(`${vendor}: ${err.code ?? ''} ${err.message}`.trim());
      continue;
    }
    const { captureId } = await recordVendorCapture(deps, { ...base, status: 'ok', payload: { vendor, items: raw } });
    const ads = raw.map(normalizeMetaAd).filter((a): a is NormalizedAd => a !== null);
    // Only the active set was requested, so anything previously active and now missing has ended.
    const r = await upsertAds(deps.db, c.id, 'meta', captureId, ads, { markMissingInactive: true });
    return { status: 'ok', ads: r.upserted, deactivated: r.deactivated, vendor };
  }
  await recordVendorCapture(deps, { ...base, status: 'vendor_error', error: errors.join(' | ') || 'no Meta vendor configured' });
  return { status: 'vendor_error' };
}
```
Export the three modules from `src/index.ts`. Note on safety: `markMissingInactive` is only applied after a **successful** vendor response; if a vendor returns an empty list for an advertiser that still has live ads, ads would be ended incorrectly — Task 12's live check verifies the actor returns the active set for a known advertiser before this runs on real data.

- [ ] **Step 3: Run tests, typecheck, commit**

Run: `pnpm --filter @cs/collectors exec vitest run src/ads && pnpm --filter @cs/collectors typecheck` → PASS.
```bash
git add packages/collectors
git commit -m "feat(collectors): Meta Ad Library via Apify with ScrapeCreators fallback

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Hiring signals from Google Jobs

**Files:**
- Create: `packages/collectors/src/jobs/post.ts`, `collect.ts`; Modify: `src/index.ts`
- Test: `packages/collectors/src/jobs/jobs.test.ts`

**Interfaces:**
- Consumes: `collectReadyTasks`, `VendorTaskRow` (Task 6); `observation`, `competitor`, `vendorTask` (db)
- Produces:
  - `postJobTasks(deps: { db: Db; dfs: DataForSeoClient }, competitors: { id: string; name: string }[]): Promise<{ posted: number }>` (`keyword` = competitor name, `depth: 20`, `tag` = id)
  - `employerMatches(employer: string | null | undefined, competitorName: string): boolean` (normalised: lowercase alphanumerics, suffixes like "llc/inc/co" removed; either contains the other)
  - `collectReadyJobs(deps: { db: Db; store: ObjectStore; dfs: DataForSeoClient }): Promise<{ collected: number; failed: number; postings: number }>` — observations `kind: 'job_posting'`, `key: job_id`, data `{ title, employer, location, sourceUrl, salary, contractType, postedAt }`

- [ ] **Step 1: Write the failing test**

`packages/collectors/src/jobs/jobs.test.ts`:
```ts
import { observation, vendorTask } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { dfsTask, fakeDfs } from '../../test/fake-dfs';
import { collectReadyJobs, employerMatches } from './collect';
import { postJobTasks } from './post';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});
const TASK = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('jobs', () => {
  it('matches employers loosely', () => {
    expect(employerMatches('Smith HVAC, LLC', 'Smith HVAC')).toBe(true);
    expect(employerMatches('smith hvac and plumbing inc', 'Smith HVAC')).toBe(true);
    expect(employerMatches('Jones Heating', 'Smith HVAC')).toBe(false);
    expect(employerMatches(null, 'Smith HVAC')).toBe(false);
  });

  it('posts, collects matching postings as observations', async () => {
    const dfsPost = fakeDfs(() => [dfsTask([], { id: TASK, statusCode: 20100 })]);
    expect(await postJobTasks({ db: dbs.service, dfs: dfsPost }, [{ id: IDS.competitorX, name: 'Smith HVAC' }])).toEqual({ posted: 1 });
    expect(dfsPost.calls[0]?.body).toEqual([{ keyword: 'Smith HVAC', location_code: 2840, language_code: 'en', depth: 20, tag: IDS.competitorX }]);

    const dfs = fakeDfs((_m, path) =>
      path.endsWith('/tasks_ready')
        ? [dfsTask([{ id: TASK }])]
        : [dfsTask([{ items: [
            { type: 'google_jobs_item', job_id: 'j1', title: 'HVAC Technician', employer_name: 'Smith HVAC LLC', location: 'Dunwoody, GA', source_url: 'https://jobs/1', salary: '$25–35/hr', contract_type: 'Full-time', timestamp: '2026-09-24 00:00:00 +00:00' },
            { type: 'google_jobs_item', job_id: 'j2', title: 'Cook', employer_name: 'Diner Co' },
          ] }], { id: TASK })],
    );
    const r = await collectReadyJobs({ db: dbs.service, store: createMemoryStore(), dfs });
    expect(r).toEqual({ collected: 1, failed: 0, postings: 1 });
    expect(dfs.calls[1]?.path).toBe(`/serp/google/jobs/task_get/advanced/${TASK}`);
    const obs = await dbs.service.select().from(observation);
    expect(obs.map((o) => [o.kind, o.key])).toEqual([['job_posting', 'j1']]);
    expect(obs[0]?.data).toMatchObject({ title: 'HVAC Technician', location: 'Dunwoody, GA', sourceUrl: 'https://jobs/1' });
    expect((await dbs.service.select().from(vendorTask))[0]?.status).toBe('done');
  });
});
```

- [ ] **Step 2: Run to verify it fails**, then implement.

`packages/collectors/src/jobs/post.ts`:
```ts
import { type Db, vendorTask } from '@cs/db';
import { type DataForSeoClient, DFS_US, isDfsOk } from '../vendors/dataforseo';

export async function postJobTasks(deps: { db: Db; dfs: DataForSeoClient }, competitors: { id: string; name: string }[]): Promise<{ posted: number }> {
  let posted = 0;
  for (let i = 0; i < competitors.length; i += 100) {
    const batch = competitors.slice(i, i + 100);
    const tasks = await deps.dfs.post('/serp/google/jobs/task_post', batch.map((c) => ({ keyword: c.name, ...DFS_US, depth: 20, tag: c.id })), { agencyId: null, clientId: null });
    const rows = tasks
      .map((t, idx) => ({ t, c: batch[idx] }))
      .filter(({ t, c }) => c && isDfsOk(t.statusCode))
      .map(({ t, c }) => ({ vendor: 'dataforseo', kind: 'google_jobs', externalTaskId: t.id, competitorId: (c as { id: string }).id }));
    if (rows.length > 0) await deps.db.insert(vendorTask).values(rows).onConflictDoNothing();
    posted += rows.length;
  }
  return { posted };
}
```

`packages/collectors/src/jobs/collect.ts`:
```ts
import { competitor, type Db, observation } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { recordVendorCapture } from '../evidence/vendor-capture';
import { DFS_COLLECTOR_VERSION } from '../gbp/collect-gbp';
import { collectReadyTasks } from '../reviews/collect';
import type { DataForSeoClient } from '../vendors/dataforseo';
import { parseDfsTimestamp } from '../vendors/dfs-time';

const norm = (s: string) => s.toLowerCase().replace(/\b(llc|inc|co|corp|company|ltd)\b/g, '').replace(/[^a-z0-9]+/g, '');

export function employerMatches(employer: string | null | undefined, competitorName: string): boolean {
  if (!employer) return false;
  const a = norm(employer);
  const b = norm(competitorName);
  return a.length > 0 && b.length > 0 && (a.includes(b) || b.includes(a));
}

const jobSchema = z.looseObject({
  job_id: z.string(),
  title: z.string().nullish(),
  employer_name: z.string().nullish(),
  location: z.string().nullish(),
  source_url: z.string().nullish(),
  salary: z.string().nullish(),
  contract_type: z.string().nullish(),
  timestamp: z.union([z.string(), z.number()]).nullish(),
});

export async function collectReadyJobs(deps: { db: Db; store: ObjectStore; dfs: DataForSeoClient }): Promise<{ collected: number; failed: number; postings: number }> {
  let postings = 0;
  const r = await collectReadyTasks(deps, 'google_jobs', '/serp/google/jobs/tasks_ready', (id) => `/serp/google/jobs/task_get/advanced/${id}`, async (task, vt) => {
    const [c] = await deps.db.select().from(competitor).where(eq(competitor.id, vt.competitorId)).limit(1);
    if (!c) return;
    const { captureId } = await recordVendorCapture(deps, { competitorId: c.id, source: 'google_jobs', collectorVersion: DFS_COLLECTOR_VERSION, status: 'ok', payload: task.result });
    const items = (task.result[0] as { items?: unknown[] } | undefined)?.items ?? [];
    const rows = items
      .map((i) => jobSchema.safeParse(i))
      .filter((p) => p.success && employerMatches(p.data.employer_name, c.name))
      .map((p) => {
        const j = (p as { data: z.infer<typeof jobSchema> }).data;
        return {
          competitorId: c.id, captureId, kind: 'job_posting', key: j.job_id,
          data: { title: j.title ?? null, employer: j.employer_name ?? null, location: j.location ?? null, sourceUrl: j.source_url ?? null, salary: j.salary ?? null, contractType: j.contract_type ?? null, postedAt: parseDfsTimestamp(j.timestamp)?.toISOString() ?? null },
        };
      });
    if (rows.length > 0) await deps.db.insert(observation).values(rows).onConflictDoNothing();
    postings += rows.length;
  });
  return { ...r, postings };
}
```
Export both from `src/index.ts`.

- [ ] **Step 3: Run tests, typecheck, commit**

Run: `pnpm --filter @cs/collectors exec vitest run src/jobs && pnpm --filter @cs/collectors typecheck` → PASS.
```bash
git add packages/collectors
git commit -m "feat(collectors): hiring signals from Google Jobs

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Monthly geo-grid rank scans

**Files:**
- Create: `packages/collectors/src/rankings/scan.ts`; Modify: `src/index.ts`
- Test: `packages/collectors/src/rankings/scan.test.ts`

**Interfaces:**
- Consumes: `gridPoints`, `mapsSearch` (Task 4); `client`, `rankSnapshot`, `RankResult` (db)
- Produces: `scanRankings(deps: { db: Db; dfs: DataForSeoClient }, clientId: string, opts?: { gridSize?: number; maxKeywords?: number; depth?: number }): Promise<{ snapshots: number }>` — one `rank_snapshot` per keyword × point; ledger scope is the client

- [ ] **Step 1: Write the failing test**

`packages/collectors/src/rankings/scan.test.ts`:
```ts
import { client, rankSnapshot } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { dfsTask, fakeDfs } from '../../test/fake-dfs';
import { scanRankings } from './scan';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.service.update(client).set({ keywords: ['ac repair'], serviceArea: { center: { lat: 33.9, lng: -84.3 }, radiusKm: 8, zips: [] } }).where(eq(client.id, IDS.clientA1));
});

describe('scanRankings', () => {
  it('stores one tenant-scoped snapshot per keyword and grid point', async () => {
    const dfs = fakeDfs(() => [dfsTask([{ items: [{ type: 'maps_search', rank_absolute: 1, title: 'Smith HVAC', place_id: 'p1', domain: 'smithhvac.example' }] }])]);
    expect(await scanRankings({ db: dbs.service, dfs }, IDS.clientA1, { gridSize: 3 })).toEqual({ snapshots: 9 });
    const rows = await dbs.service.select().from(rankSnapshot);
    expect(rows).toHaveLength(9);
    expect(rows[0]).toMatchObject({ agencyId: IDS.agencyA, clientId: IDS.clientA1, keyword: 'ac repair' });
    expect(rows[0]?.results).toEqual([{ rank: 1, placeId: 'p1', cid: null, domain: 'smithhvac.example', title: 'Smith HVAC' }]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**, then implement.

`packages/collectors/src/rankings/scan.ts`:
```ts
import { client, type Db, type RankResult, rankSnapshot } from '@cs/db';
import { eq } from 'drizzle-orm';
import { gridPoints } from '../local/grid';
import { mapsSearch } from '../local/maps';
import type { DataForSeoClient } from '../vendors/dataforseo';

export async function scanRankings(
  deps: { db: Db; dfs: DataForSeoClient },
  clientId: string,
  opts: { gridSize?: number; maxKeywords?: number; depth?: number } = {},
): Promise<{ snapshots: number }> {
  const [c] = await deps.db.select().from(client).where(eq(client.id, clientId)).limit(1);
  if (!c?.serviceArea || c.keywords.length === 0) return { snapshots: 0 };
  const points = gridPoints(c.serviceArea.center, c.serviceArea.radiusKm, opts.gridSize ?? 7);
  const scope = { agencyId: c.agencyId, clientId: c.id };
  let snapshots = 0;
  for (const keyword of c.keywords.slice(0, opts.maxKeywords ?? 5)) {
    for (const pt of points) {
      const { places } = await mapsSearch(deps.dfs, { keyword, lat: pt.lat, lng: pt.lng, depth: opts.depth ?? 20 }, scope);
      const results: RankResult[] = places.map((p) => ({ rank: p.rank, placeId: p.placeId, cid: p.cid, domain: p.domain, title: p.title }));
      await deps.db.insert(rankSnapshot).values({ agencyId: c.agencyId, clientId: c.id, keyword, lat: pt.lat, lng: pt.lng, results });
      snapshots++;
    }
  }
  return { snapshots };
}
```
Export from `src/index.ts`. Cost note for the README: 7×7 grid × 5 keywords = 245 live Maps calls ≈ $0.49 per client per month.

- [ ] **Step 3: Run tests, typecheck, commit**

Run: `pnpm --filter @cs/collectors exec vitest run src/rankings && pnpm --filter @cs/collectors typecheck` → PASS.
```bash
git add packages/collectors
git commit -m "feat(collectors): monthly geo-grid rank snapshots

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Source scheduling and worker jobs

**Files:**
- Create: `packages/collectors/src/sources/due.ts`; Modify: `src/index.ts`
- Create: `apps/worker/src/jobs/vendor.ts`; Modify: `apps/worker/src/deps.ts`, `apps/worker/src/main.ts`, `apps/worker/src/cli/collect-once.ts`
- Modify: `.env.example`, `README.md`
- Test: `packages/collectors/src/sources/due.test.ts`, `apps/worker/src/jobs/vendor.test.ts`

**Interfaces:**
- Consumes: everything above; `competitorSource`, `competitor`, `client` (db)
- Produces:
  - `claimDueSources(db: Db, limit: number): Promise<{ competitorId: string; source: SourceKind }[]>` (weekly advance; `FOR UPDATE SKIP LOCKED`)
  - `markSourceResult(db: Db, competitorId: string, source: SourceKind, status: string): Promise<void>`
  - `WorkerDeps` gains: `claimDueSources(limit)`, `runSource(competitorId, source)`, `postBatchTasks(items: { competitorId: string; source: 'reviews' | 'jobs' }[])`, `pollVendorTasks()`, `scanRankings(clientId)`, `listRankClients()`, `suggestCompetitors(clientId)`
  - Jobs: `vendor-schedule` (cron `*/30 * * * *`), `vendor-collect` (`{ competitorId, source }`), `vendor-poll` (cron `*/10 * * * *`), `rank-schedule` (cron `0 6 1 * *`), `rank-scan` (`{ clientId }`), `suggest-competitors` (`{ clientId }`)

- [ ] **Step 1: Write the failing tests**

`packages/collectors/src/sources/due.test.ts`:
```ts
import { competitorSource } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { claimDueSources, markSourceResult } from './due';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.service.insert(competitorSource).values([
    { competitorId: IDS.competitorX, source: 'gbp', nextDueAt: sql`now() - interval '1 minute'` },
    { competitorId: IDS.competitorX, source: 'reviews', nextDueAt: sql`now() + interval '1 day'` },
    { competitorId: IDS.competitorY, source: 'gbp', active: false, nextDueAt: sql`now() - interval '1 day'` },
  ]);
});

describe('claimDueSources', () => {
  it('claims due active sources once', async () => {
    expect(await claimDueSources(dbs.service, 10)).toEqual([{ competitorId: IDS.competitorX, source: 'gbp' }]);
    expect(await claimDueSources(dbs.service, 10)).toEqual([]);
    await markSourceResult(dbs.service, IDS.competitorX, 'gbp', 'ok');
    const rows = (await dbs.service.execute(sql`SELECT last_status FROM competitor_source WHERE source = 'gbp' AND competitor_id = ${IDS.competitorX}`)) as unknown as { last_status: string }[];
    expect(rows[0]?.last_status).toBe('ok');
  });
});
```

`apps/worker/src/jobs/vendor.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import type { WorkerDeps } from '../deps';
import { createVendorJobs } from './vendor';

describe('vendor jobs', () => {
  it('batches reviews/jobs into async task posts and enqueues the rest', async () => {
    const deps = {
      claimDueSources: vi.fn(async () => [
        { competitorId: 'c1', source: 'reviews' }, { competitorId: 'c2', source: 'jobs' }, { competitorId: 'c1', source: 'gbp' }, { competitorId: 'c1', source: 'ads_meta' },
      ]),
      postBatchTasks: vi.fn(async () => {}),
    } as unknown as WorkerDeps;
    const enqueueCollect = vi.fn(async () => {});
    const jobs = createVendorJobs(deps, { enqueueCollect, enqueueRankScan: async () => {} });
    await jobs.schedule.handler({});
    expect(deps.postBatchTasks).toHaveBeenCalledWith([{ competitorId: 'c1', source: 'reviews' }, { competitorId: 'c2', source: 'jobs' }]);
    expect(enqueueCollect.mock.calls.map((c) => c[0])).toEqual([{ competitorId: 'c1', source: 'gbp' }, { competitorId: 'c1', source: 'ads_meta' }]);
    expect(jobs.schedule.cron).toBe('*/30 * * * *');
    expect(jobs.poll.cron).toBe('*/10 * * * *');
    expect(jobs.rankSchedule.cron).toBe('0 6 1 * *');
  });

  it('rejects unknown sources in collect payloads', () => {
    const jobs = createVendorJobs({} as WorkerDeps, { enqueueCollect: async () => {}, enqueueRankScan: async () => {} });
    expect(() => jobs.collect.schema.parse({ competitorId: '00000000-0000-4000-8000-0000000000f1', source: 'reviews' })).toThrow();
    expect(() => jobs.collect.schema.parse({ competitorId: '00000000-0000-4000-8000-0000000000f1', source: 'gbp' })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify they fail**, then implement.

`packages/collectors/src/sources/due.ts`:
```ts
import type { Db } from '@cs/db';
import { sql } from 'drizzle-orm';
import type { SourceKind } from './kinds';

export async function claimDueSources(db: Db, limit: number): Promise<{ competitorId: string; source: SourceKind }[]> {
  const rows = (await db.execute(sql`
    UPDATE competitor_source SET next_due_at = now() + interval '7 days'
     WHERE (competitor_id, source) IN (
       SELECT competitor_id, source FROM competitor_source
        WHERE active AND next_due_at <= now()
        ORDER BY next_due_at LIMIT ${limit}
        FOR UPDATE SKIP LOCKED)
    RETURNING competitor_id, source`)) as unknown as { competitor_id: string; source: SourceKind }[];
  return rows.map((r) => ({ competitorId: r.competitor_id, source: r.source }));
}

export async function markSourceResult(db: Db, competitorId: string, source: SourceKind, status: string): Promise<void> {
  await db.execute(sql`UPDATE competitor_source SET last_status = ${status}, last_run_at = now() WHERE competitor_id = ${competitorId} AND source = ${source}`);
}
```
Export from `src/index.ts`.

`apps/worker/src/jobs/vendor.ts`:
```ts
import { z } from 'zod';
import type { WorkerDeps } from '../deps';
import { defineJob } from '../jobs';

const BATCH = new Set(['reviews', 'jobs']);

export function createVendorJobs(
  deps: WorkerDeps,
  queue: { enqueueCollect(p: { competitorId: string; source: 'gbp' | 'ads_google' | 'ads_meta' }): Promise<void>; enqueueRankScan(clientId: string): Promise<void> },
) {
  const schedule = defineJob({
    name: 'vendor-schedule', schema: z.looseObject({}), cron: '*/30 * * * *',
    handler: async () => {
      const due = await deps.claimDueSources(500);
      const batch = due.filter((d) => BATCH.has(d.source)) as { competitorId: string; source: 'reviews' | 'jobs' }[];
      if (batch.length > 0) await deps.postBatchTasks(batch);
      for (const d of due) if (!BATCH.has(d.source)) await queue.enqueueCollect(d as { competitorId: string; source: 'gbp' | 'ads_google' | 'ads_meta' });
    },
  });
  const collect = defineJob({
    name: 'vendor-collect',
    schema: z.object({ competitorId: z.uuid(), source: z.enum(['gbp', 'ads_google', 'ads_meta']) }),
    handler: async ({ competitorId, source }) => {
      console.log(`[vendor-collect] ${competitorId} ${source} → ${JSON.stringify(await deps.runSource(competitorId, source))}`);
    },
  });
  const poll = defineJob({
    name: 'vendor-poll', schema: z.looseObject({}), cron: '*/10 * * * *',
    handler: async () => {
      const r = await deps.pollVendorTasks();
      if (r.reviews.collected + r.jobs.collected > 0) console.log(`[vendor-poll] ${JSON.stringify(r)}`);
    },
  });
  const rankSchedule = defineJob({
    name: 'rank-schedule', schema: z.looseObject({}), cron: '0 6 1 * *',
    handler: async () => {
      for (const id of await deps.listRankClients()) await queue.enqueueRankScan(id);
    },
  });
  const rankScan = defineJob({
    name: 'rank-scan', schema: z.object({ clientId: z.uuid() }),
    handler: async ({ clientId }) => {
      console.log(`[rank-scan] ${clientId} → ${JSON.stringify(await deps.scanRankings(clientId))}`);
    },
  });
  const suggest = defineJob({
    name: 'suggest-competitors', schema: z.object({ clientId: z.uuid() }),
    handler: async ({ clientId }) => {
      console.log(`[suggest-competitors] ${clientId} → ${JSON.stringify(await deps.suggestCompetitors(clientId))}`);
    },
  });
  return { schedule, collect, poll, rankSchedule, rankScan, suggest };
}
```

`apps/worker/src/deps.ts` — extend `WorkerDeps` and `createWorkerDeps` (keep the Phase 2a members). Add the imports (`client`, `competitor`, `createDataForSeo`, `DFS_BASE_URL`, collectors functions, `requireSalt`, `markSourceResult`, `claimDueSources`, `inArray`, `sql`) and:
```ts
  claimDueSources(limit: number): Promise<{ competitorId: string; source: SourceKind }[]>;
  runSource(competitorId: string, source: 'gbp' | 'ads_google' | 'ads_meta'): Promise<{ status: string }>;
  postBatchTasks(items: { competitorId: string; source: 'reviews' | 'jobs' }[]): Promise<void>;
  pollVendorTasks(): Promise<{ reviews: { collected: number; failed: number }; jobs: { collected: number; failed: number } }>;
  scanRankings(clientId: string): Promise<{ snapshots: number }>;
  listRankClients(): Promise<string[]>;
  suggestCompetitors(clientId: string): Promise<{ suggested: number; searches: number }>;
```
Implementation inside `createWorkerDeps` (lazy DataForSEO client; the ledger is `createLedgerSink(getDb())`):
```ts
  let dfs: DataForSeoClient | null = null;
  const getDfs = () => {
    if (!dfs) {
      if (!env.DATAFORSEO_LOGIN || !env.DATAFORSEO_PASSWORD) throw new Error('DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD are required');
      dfs = createDataForSeo({ login: env.DATAFORSEO_LOGIN, password: env.DATAFORSEO_PASSWORD, baseUrl: env.DATAFORSEO_BASE_URL ?? DFS_BASE_URL, ledger: createLedgerSink(getDb()) });
    }
    return dfs;
  };
  const loadCompetitors = (ids: string[]) => getDb().select().from(competitor).where(inArray(competitor.id, ids));
```
```ts
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
```

`apps/worker/src/main.ts` — create and register the vendor jobs next to the web jobs:
```ts
const vendor = createVendorJobs(deps, {
  enqueueCollect: async (p) => { await enqueue(boss, vendor.collect, p); },
  enqueueRankScan: async (clientId) => { await enqueue(boss, vendor.rankScan, { clientId }); },
});
await registerJobs(boss, [heartbeatJob, web.schedule, web.capture, web.discover, vendor.schedule, vendor.collect, vendor.poll, vendor.rankSchedule, vendor.rankScan, vendor.suggest]);
```

`apps/worker/src/cli/collect-once.ts` — add options `--place-id`, `--cid`, `--meta-page-id`, `--vendors` (boolean). When `--vendors` is set: store the ids on the competitor (service role), call `ensureCompetitorSources`, then run `deps.runSource` for `gbp`, `ads_google`, `ads_meta` and `deps.postBatchTasks` for reviews and jobs, and print each result; print a reminder that reviews/jobs arrive via `vendor-poll` (or run `pnpm --filter @cs/worker collect-once --poll` which calls `deps.pollVendorTasks()` once — add that flag too).

`.env.example` — append:
```
# Phase 2b vendors
DATAFORSEO_LOGIN=
DATAFORSEO_PASSWORD=
# DATAFORSEO_BASE_URL=https://sandbox.dataforseo.com/v3   # free mock data, real shapes
APIFY_TOKEN=
SCRAPECREATORS_API_KEY=
REVIEWER_HASH_SALT=   # at least 32 random characters; never change once reviews are stored
```
`README.md` — add a "Vendor sources (Phase 2b)" section: sources and cadence (weekly per competitor; reviews/jobs async via `vendor-poll`; rankings monthly), env vars, cost estimates from the API reference, privacy rules, and `collect-once --vendors` / `--poll` usage.

- [ ] **Step 3: Run tests, typecheck, commit**

Run: `pnpm --filter @cs/collectors test && pnpm --filter @cs/collectors typecheck && pnpm --filter @cs/worker test && pnpm --filter @cs/worker typecheck` → PASS.
```bash
git add packages/collectors apps/worker .env.example README.md
git commit -m "feat(worker): scheduled vendor collection, polling and rank scans

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Live verification and fixture lock-in

This task turns the UNVERIFIED items in the API reference into verified facts before real data flows. It uses real keys from `.env` (sandbox first, then minimal production calls ≈ $0.05 total).

**Files:**
- Create: `packages/collectors/test/fixtures/vendors/*.json` (sanitised samples), `packages/collectors/src/vendors/fixtures.test.ts`
- Modify: parsers from Tasks 4–9 only if real shapes differ; `docs/research/2026-09-30-phase-2-vendor-apis.md` (append a "Verified 2026-10-xx" section)

- [ ] **Step 1: Sandbox pass** — with `DATAFORSEO_BASE_URL=https://sandbox.dataforseo.com/v3`, call once each: maps live (`location_coordinate` with the `z` suffix — if rejected, try without and fix `mapsSearch`), my_business_info live, reviews task_post → tasks_ready → task_get, ads_search live, jobs task_post → task_get/advanced. Save each raw response to `test/fixtures/vendors/dfs-<endpoint>.json` after replacing any `profile_name`, `profile_url`, `profile_image_url` values with `"REDACTED"`.
- [ ] **Step 2: Production spot check** — unset the sandbox URL and run `pnpm --filter @cs/worker collect-once --domain <a large national HVAC brand you are comfortable monitoring> --place-id <its place id> --meta-page-id <its page id> --vendors`, then `--poll` after ~45 minutes. Confirm: GBP observation present; Google ads rows with `first_shown`/`last_shown`; Meta ads rows (verify the actor returns the advertiser's active ads — compare with the public Ad Library page; if it returns zero while ads exist, switch `markMissingInactive` off for Apify results and record why); reviews stored without identity; jobs postings filtered by employer.
- [ ] **Step 3: Apify output casing** — save one raw Apify item to `test/fixtures/vendors/apify-meta-ad.json` and one ScrapeCreators item; add `fixtures.test.ts` asserting `normalizeMetaAd`, `normalizeGoogleAd`, `extractGbpProfile`, `parseMapsItems`, `upsertReviews` (via a stub db is not needed — call the pure parsing parts) produce non-null, sensible values for every fixture. Fix normalisers if a field name differs.
- [ ] **Step 4: Review-id stability** — note in the API reference whether `review_id` was present and plan a re-pull a week later (add a carry-over line in the roadmap: "compare review_ids across two weekly pulls; if unstable, switch dedupe to the content-hash key").
- [ ] **Step 5: Full verification and commit**

Run: `pnpm typecheck && pnpm test` → all green.
```bash
git add packages/collectors docs/research
git commit -m "test(collectors): lock vendor response shapes with live-verified fixtures

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Phase 2b exit criteria

- `pnpm typecheck && pnpm test` green.
- For one real competitor: GBP observation, reviews (pseudonymised), Google and Meta ad rows with first/last seen, and hiring observations exist, each linked to a `vendor_json` capture; `vendor_call` rows show costs.
- Client-scoped users see only their own suggestions/rank snapshots and only tracked competitors' vendor data (tests).
- API reference updated with verified shapes; fixtures committed.

Next: Phase 3 (intelligence engine) plan, written against the merged Phase 2 code.
