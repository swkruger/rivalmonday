# Phase 18a-2 — Web readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Before `WEB_MONITORING_ENABLED` goes on, the crawler briefs rival website tools (`site_feature`), new rival pages (`new_page`, via a 28-day re-discovery) and JSON-LD Offer prices, keeps markup-only changes, fixes tracked-page hygiene and stops discovery for prospects. Everything ships dark and is proven on stored-HTML fixtures.

**Architecture:** Pure markup parsers in `@cs/collectors` (`web/markup.ts`) feed three places: the recorder's hash-first check (`capture.markup_sha`), a new engine stage `site_features` (two-capture confirmation, `observation` rows) and `price_extract` (JSON-LD pseudo-blocks). Re-discovery extends `discoverPages` with a refresh mode over a new `site_url` memory, scheduled by a worker cron; the web diff stage emits `new_page` on the first capture of an appeared page. Both new types are structured changes on the `web` channel (`isStructuredChange`).

**Tech Stack:** TypeScript, Drizzle + Postgres, pg-boss worker, vitest, Next.js (copy only).

**Spec:** `docs/superpowers/specs/2026-11-08-phase-18a2-web-readiness-design.md` (O1–O4, D1–D7). Read it with this plan.

## Global constraints

- Read `docs/gotchas-cross-cutting.md` and the `CLAUDE.md` of every package you touch before coding.
- **No live crawling, no vendor calls, no new env var.** `WEB_MONITORING_ENABLED` stays unset; tests use fixture HTML stored through the in-memory/FS store. The only fetch path stays the SSRF-guarded polite renderer/`fetchText`; UA, robots (5xx ⇒ disallow), ≥ 3 s/host and the limiter are unchanged.
- `redactForModel` for every model input (page text for classification/tagging, offer names, feature evidence text).
- Rules-only prices: a discount or `priceSpecification`-only offer never becomes a price.
- New change type ⇒ `CHANGE_LABELS`, evidence wording, glossary, pack weight, `detailsSignature` case (`packages/engine/src/score/score-stage.ts`), `brief-report` `topicOf`/`GROUP_PHRASE` if merged. Scoring change ⇒ pack bump + migration data + `pnpm --filter @cs/verticals seed-sql` (regenerates `packages/db/src/catalog-seed.sql.ts`; 18a-1 forgot it).
- New table ⇒ `TABLE_CLASS` + world rows. No new tool and no new page read (so `packages/demo/src/coverage.ts` is unchanged — re-check if a task adds one). No `toLocaleString` in tsx.
- Copy through `pnpm copy:status`/sign-off. Migrations: next free number (0101, Task 0 re-checks); never edit applied ones. LF only. Commits end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` (subagents: own model).
- Implementers run focused tests only; `pnpm test:affected` + `pnpm --filter @cs/web e2e:affected` once at the final review.

## Decisions

Spec O1–O4 and D1–D7 are binding. Plan-level calls: one migration for schema + pack data (Task 2); `site_url`/`site_discovery` live in `packages/db/src/schema/evidence.ts` next to `tracked_page`; `MAX_ACTIVE_PAGES` moves to `@cs/core` (tools `limits.ts` re-exports); the re-discovery scheduler reuses the `discover-pages` job; `new_page` is written by the web diff stage (no new stage); `site_features` gets its own sweep list, drain step and worker job (pattern: `engine-price`).

## File structure

- `packages/core/src/domain.ts` (types, `MAX_ACTIVE_PAGES`), `site-features.ts` (create: categories/labels), `help/glossary.ts`.
- `packages/db/src/schema/{evidence,engine}.ts`, `packages/db/migrations/0102_web_readiness.sql`, `packages/db/test/{table-classes,isolation-world}.ts`, `packages/db/src/catalog-seed.sql.ts` (generated).
- `packages/verticals/{src/schema.ts,packs/*.yaml}`.
- `packages/collectors/src/web/markup.ts` (+ `markup-registry.ts`, fixtures under `src/web/__fixtures__/markup/`), `evidence/recorder.ts`, `discovery/{discover,sitemap,page-key}.ts`, `schedule/due-discovery.ts`.
- `packages/engine/src/{score/score.ts,score/score-stage.ts,tag/{structured,tag-stage}.ts,model-ops/resolve.ts,events/retract.ts,briefs/{evidence,writer}.ts,web/{diff-stage,site-feature-stage}.ts,prices/{json-ld,price-stage}.ts,sweep.ts,drain.ts}`.
- `packages/tools/src/{tools/competitors.ts,tools/prospects.ts,tools/pages.ts,limits.ts}`; `apps/web/src/app/(app)/c/[clientId]/competitors/actions.ts` (copy).
- `apps/worker/src/{jobs/web.ts,jobs/engine.ts,deps.ts,job-list.ts}`; `packages/email/src/labels.ts`.

## Dependencies on in-flight work (re-check in Task 0)

- 18a-1 is on this branch (migration 0100, `profileCap`, pack v5, catalog seed already regenerated at v5). 18a-2 builds on its tip. *Re-checked Task 0 (2026-11-08): `main` = 4b305a7e, no rebase needed.*
- `brief-report` (unmerged, docs only at 376d8c0c, no migration yet): `topicOf` (`@cs/core` `brief-report.ts`) and `GROUP_PHRASE` (`@cs/email`) must cover `site_feature`/`new_page` (`offers` topic). Not merged ⇒ the work file's "Assumes" note carries it to brief-report's pre-flight (it also takes the migration after 0101).
- Ask eval re-record at merge (18a-1 already needs one) also covers the `search_events` enum and `Discovery` enum changes.

## Review focus

1. Widget present → absent once → present emits nothing; present → absent → absent emits one `removed` (Task 7).
2. No `new_page` on initial discovery, truncated sitemap runs, or a page that was known but untracked (Tasks 9, 11).
3. Recorder: same text + new script ⇒ `ok` with HTML; same text + same markup ⇒ `unchanged` (Task 5).
4. JSON-LD: discount/`priceSpecification`/non-USD offers yield nothing (missing currency = USD); text + JSON-LD of the same price give one span (Task 8).
5. `manual` inactive pages stay inactive; http/https/www variants are one page; `add_tracked_page` reuses the row (Tasks 9, 10).
6. Prospect ⇒ `deferred`, discovered on conversion; worker scheduler idle while the switch is off (Tasks 10, 12).
7. Every changed `source === 'web'` branch keeps web text diffs byte-identical (Task 6 regression tests).

---

### Task 0: Pre-flight

**Files:** modify `docs/work/phase-18a.md`, this plan (fixes).

- [x] Rebase onto `main` (or `brief-report` if merged); re-check the Dependencies lines and every path here; fix the plan where code moved.
- [x] Next free migration number (expect 0101; `git show brief-report:docs/work/brief-report.md` — it planned `<n>_brief_report ≥ 0100`).
- [x] `grep -rn "source === 'web'\|source !== 'web'" packages/engine/src packages/tools/src` — list every branch for Task 6 (known: `tag/tag-stage.ts`, `model-ops/resolve.ts` ×3, `events/retract.ts`, `briefs/evidence.ts`, `diff.ts`, `tools/evidence.ts`). Confirm web diff changes never set `details.changeType`.
- [x] Confirm `apps/worker/src/env.ts` reads `WEB_MONITORING_ENABLED` (it does for the staging check) and that it reaches the worker (Docker/Railway env, not `turbo.json` — the worker is not a turbo task at runtime).
- [x] Confirm no code sets `tracked_page.active = false` today (Task 2's CHECK would break it).
- **Done when:** findings in the work file; commit `docs(phase-18a): 18a-2 pre-flight`.

### Task 1: Change types, categories and scoring

**Goal:** D1 types score as the spec table.
**Files:** modify `packages/core/src/domain.ts`; create `packages/core/src/site-features.ts` (+ export from index); modify `packages/email/src/labels.ts` (`CHANGE_LABELS`: `site_feature: 'website tool change'`, `new_page: 'new website page'` — the existing `labels.test.ts` iterates `CHANGE_TYPES`, so the labels land with the types; pre-flight fix), `packages/db/src/schema/engine.ts` (`ChangeDetails`, `ScoreFactors`), `packages/verticals/src/schema.ts`, `packages/verticals/packs/{generic,hvac_plumbing,dental}.yaml`, `packages/engine/src/score/{score,score-stage}.ts`, `packages/engine/src/tag/structured.ts` (`SERVICE_MAPPED_TYPES`); tests `score.test.ts`, `score-stage.test.ts`, `packages/verticals/src/packs.test.ts`, `packages/core/src/domain.test.ts`.

**Interfaces:**
- `CHANGE_TYPES` += `'site_feature' | 'new_page'`.
- `SITE_FEATURE_CATEGORIES = ['online_booking','live_chat','financing','review_widget'] as const`; `SITE_FEATURE_CATEGORY_LABEL: Record<SiteFeatureCategory, string>` = `online booking`, `live chat`, `financing`, `review widget` (no call tracking — ruling 2026-11-08, owner may overturn).
- `ChangeDetails` += `feature?: string; category?: string; vendor?: string; pageUrl?: string; pageType?: string; pageKey?: string`; `direction?: 'closed' | 'reopened' | 'added' | 'removed'`. `ScoreFactors` += `briefOnly: boolean`.
- Packs: `type_weights.site_feature 0.7`, `new_page 0.7`; `scoring.version 6`.
- `WHOLE_BUSINESS_TYPES` += both; `SERVICE_MAPPED_TYPES` += `new_page`; `BRIEF_ONLY_TYPES = new Set(['site_feature','new_page'])`.
- `detailsSignature`: `site_feature` → `` `site_feature|${d.feature ?? ''}|${d.direction ?? ''}` ``; `new_page` → `` `new_page|${d.pageKey ?? ''}` ``.

**Behaviour:** `scoreForClient` caps `alert` → `brief` for `BRIEF_ONLY_TYPES` and records `briefOnly`; `profileCap` unchanged. `direction` widening must not change `status_change` sizing (`=== 'closed'`).
**Tests (TDD):** `site_feature added scores 42 → brief`; `site_feature with thresholds {alert:10,brief:5} routes brief, briefOnly true`; `new_page none-service scores 42, unmatched 8`; `detailsSignature distinguishes added/removed and two page keys`; packs: every shipped pack has both weights and version 6; domain: categories have labels.
**Done when:** `npx vitest run src/score` (engine), `pnpm --filter @cs/verticals test`, `pnpm --filter @cs/core test`, `pnpm --filter @cs/email exec vitest run src/labels` pass; tsc clean for core/db/verticals/engine/email.

### Task 2: Migration 0102 (schema; pack v6 data already in Task 1's 0101_web_readiness_pack_v6 — do not repeat it) and table classes

**Goal:** columns, two `service_only` tables, pack v6 in stored configs, regenerated seed.
**Files:** `packages/db/src/schema/evidence.ts` (`capture.markupSha`, `trackedPage.{inactiveReason, appearedAt}`, `siteUrl`, `siteDiscovery`); generate `0102_web_readiness` with `pnpm --filter @cs/db generate --name=web_readiness`, then append the hand SQL below; `packages/db/test/{table-classes,isolation-world}.ts`; `packages/db/src/catalog-seed.sql.ts` via `pnpm --filter @cs/verticals seed-sql`; test `packages/db/src/web-readiness.test.ts` (create; pattern `wider-sources-backfill.test.ts`); fix `packages/collectors/src/schedule/due-pages.test.ts:28` (inserts `active: false` ⇒ add `inactiveReason: 'manual'`, the only fixture the CHECK breaks — pre-flight).

Generated part must be equivalent to (drizzle emits FKs as separate `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY` statements — fine; reorder by hand only if needed). The `tracked_page` CHECK is **not** declared in the Drizzle schema (it must run after the `UPDATE` backfill below, and a schema `check()` would put it in the generated part, before the backfill); add a one-line comment on `inactiveReason` pointing at 0101.

```sql
ALTER TABLE "capture" ADD COLUMN "markup_sha" text;
ALTER TABLE "tracked_page" ADD COLUMN "inactive_reason" text;
ALTER TABLE "tracked_page" ADD COLUMN "appeared_at" timestamp with time zone;
CREATE TABLE "site_url" (
  "competitor_id" uuid NOT NULL REFERENCES "competitor"("id") ON DELETE CASCADE,
  "url_key" text NOT NULL, "url" text NOT NULL, "source" text NOT NULL,
  "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "site_url_pk" PRIMARY KEY ("competitor_id", "url_key"),
  CONSTRAINT "site_url_source_check" CHECK (source IN ('sitemap', 'nav'))
);
CREATE TABLE "site_discovery" (
  "competitor_id" uuid PRIMARY KEY REFERENCES "competitor"("id") ON DELETE CASCADE,
  "last_run_at" timestamp with time zone, "next_due_at" timestamp with time zone DEFAULT now() NOT NULL,
  "homepage_status" text, "urls" integer DEFAULT 0 NOT NULL, "truncated" boolean DEFAULT false NOT NULL,
  "runs" integer DEFAULT 0 NOT NULL
);
CREATE INDEX "site_discovery_due_idx" ON "site_discovery" ("next_due_at");
```

Hand part (append, `--> statement-breakpoint` between statements):

```sql
UPDATE tracked_page SET inactive_reason = 'manual' WHERE NOT active AND inactive_reason IS NULL;
ALTER TABLE tracked_page ADD CONSTRAINT tracked_page_inactive_reason_check CHECK (
  (active AND inactive_reason IS NULL) OR (NOT active AND inactive_reason IN ('gone', 'duplicate', 'replaced', 'manual')));
ALTER TABLE site_url ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_url FORCE ROW LEVEL SECURITY;
REVOKE ALL ON site_url FROM app_user;
ALTER TABLE site_discovery ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_discovery FORCE ROW LEVEL SECURITY;
REVOKE ALL ON site_discovery FROM app_user;
-- 18a-2 D1: site_feature/new_page weights, scoring v6 for the shipped packs (DB-created verticals inherit generic's). Idempotent.
-- backfill:start
UPDATE vertical
SET config = jsonb_set(jsonb_set(jsonb_set(config,
      '{type_weights,site_feature}', '0.7'::jsonb, true),
      '{type_weights,new_page}', '0.7'::jsonb, true),
      '{scoring,version}', '6'::jsonb, true)
WHERE id IN ('generic', 'hvac_plumbing', 'dental')
  AND jsonb_typeof(config -> 'type_weights') = 'object'
  AND coalesce((config #>> '{scoring,version}')::int, 0) < 6;
```

**Behaviour:** `TABLE_CLASS`: `site_url`, `site_discovery` → `service_only`; one world row each (competitor X). Verify service roles reach the tables through 0001's default privileges (`packages/db/src/rls-sweep.test.ts`, `packages/db/src/isolation-world.test.ts`). Pattern for the RLS/REVOKE lines: `0094_ops_alert.sql`.
**Tests:** `tracked_page rejects active=false without a reason and active=true with one`; `existing inactive rows become manual`; `backfill block re-runs without change`; `catalog seed carries type weights v6` (existing seed test if any); isolation-world + rls-sweep pass.
**Done when:** `pnpm --filter @cs/db test` passes on the worktree DB; `generate` reports "No schema changes"; no CRLF.

### Task 3: Labels, evidence wording, glossary

**Files:** `packages/email/src/labels.ts`, `packages/engine/src/briefs/writer.ts` (`EVIDENCE_WORDING`), `packages/core/src/help/glossary.ts`, `brief-report`'s `topicOf`/`GROUP_PHRASE` if merged; tests `labels.test.ts`, glossary tests, writer prompt test.

**Decided copy (owner signs in `pnpm copy:review`):**
- `CHANGE_LABELS`: already added in Task 1 (`site_feature: 'website tool change'`, `new_page: 'new website page'`); only check them here.
- `EVIDENCE_WORDING` += `'For a website tool change, name the kind of tool (for example "online booking" or "live chat") and never the software company behind it.'` and `'For a new website page, say the page appeared on their website and what it is titled; do not claim a new service, price or area unless the evidence text states it.'`
- Glossary: **Website tool change** — "The business added or removed a tool on its website, such as online booking, live chat or financing." **New website page** — "A page that newly appeared on the business's website, found when we re-check its site map and menu each month."

**Tests:** every `CHANGE_TYPES` key has a label; writer system prompt contains both lines; glossary ids unique.
**Done when:** `pnpm --filter @cs/email test`, engine `src/briefs` tests, `@cs/core` tests pass; `pnpm copy:status` lists the new strings as todo.

### Task 4: Markup parsers (pure)

**Goal:** D2.
**Files:** create `packages/collectors/src/web/markup.ts`, `markup-registry.ts`, `markup.test.ts`, create fixtures `packages/collectors/src/web/__fixtures__/markup/*.html` (new folder; hand-written, one per registry entry + JSON-LD cases); export from `packages/collectors/src/index.ts`.

**Interfaces:**
```ts
export interface SiteFeatureSignature { id: string; category: SiteFeatureCategory; vendor: string; hosts: readonly string[]; path?: RegExp; tags: readonly ('script' | 'iframe' | 'link' | 'a')[]; since: number }
export const SITE_FEATURE_REGISTRY: readonly SiteFeatureSignature[]; export const SITE_FEATURE_REGISTRY_VERSION = 1;
export interface SiteFeature { id: string; category: SiteFeatureCategory; vendor: string; url: string }
export function siteFeatures(html: string): SiteFeature[];          // unique by id, sorted by id
export interface StructuredOffer { type: 'Offer' | 'AggregateOffer'; name: string | null; description: string | null; price: string | number | null; lowPrice: string | number | null; currency: string | null; hasPriceSpecification: boolean }
export function jsonLdOffers(html: string): StructuredOffer[];      // ≤ 50
export function markupSha(html: string): string;
```

**Behaviour:**
- Attribute scan by regex over `<script|iframe|link|a ...>` tags; resolve protocol-relative `//host`; relative URLs never match. Host match = exact or `.`-suffix (`connect.podium.com` matches `podium.com`; `notpodium.com` does not). `a` tags only for entries listing `'a'` (booking/financing).
- Registry seed per spec D2; every entry has a fixture test. Builder confirms hosts from vendor embed docs (reading docs is fine; crawling competitor sites is not); drop unconfirmable ones.
- `jsonLdOffers`: bodies of `script[type="application/ld+json"]` (case-insensitive type, any attribute order), `JSON.parse` in try/catch, walk objects/arrays/`@graph`, `@type` string or array; Offers under `offers` inherit the parent's `name`/`description` when their own are missing.
- `markupSha` = sha256 of `features.map(id).join(',') + '\n' + offers.map(type|name|price|lowPrice|currency|spec).join('\n')`.

**Tests (TDD):** each fixture detects exactly its id; `notpodium.com` and a relative `/podium.js` don't match; inline `<script>Podium...</script>` doesn't match; broken JSON-LD is skipped; `@graph` Product → Offer found with inherited name; sha stable under attribute order/whitespace and differs when a widget is added.
**Done when:** `pnpm --filter @cs/collectors exec vitest run src/web/markup` passes.

### Task 5: Recorder keeps markup-only changes

**Goal:** D3.
**Files:** modify `packages/collectors/src/evidence/recorder.ts`, `recorder.test.ts`.

**Behaviour:** compute `markupSha(page.html)` for ok renders; the "last" query also selects `capture.markupSha`; `unchanged` only when text sha **and** markup sha equal (stored `null` ≠ anything). Write `markupSha` on both `ok` and `unchanged` rows. `WEB_COLLECTOR_VERSION = 'web/2'`. Failed renders keep `null`.
**Tests (TDD):** `same text, new booking script ⇒ ok with html/text/screenshot`; `same text and markup ⇒ unchanged with markup_sha`; `previous capture without markup_sha ⇒ ok`; `markup_sha stored on ok`.
**Done when:** `pnpm --filter @cs/collectors exec vitest run src/evidence` passes.

### Task 6: Structured changes on the web channel

**Goal:** `isStructuredChange` routing; summaries and questions for the new types.
**Files:** modify `packages/engine/src/tag/{structured,tag-stage}.ts`, `model-ops/resolve.ts`, `events/retract.ts` (summary + `supersedePriorChanges`), `briefs/evidence.ts`; tests next to each.

**Task 0 grep (complete list):** replace — `tag/tag-stage.ts:149` (`head.source !== 'web'` ⇒ structured path; also select `details`), `model-ops/resolve.ts:104, :136, :166`, `events/retract.ts:24`, `briefs/evidence.ts:42`. Keep (capture/price checks, not change routing) — `diff.ts:10`, `web/diff-stage.ts:92`, `web/blocks.ts:32`, `prices/price-stage.ts:85`, `tools/evidence.ts:147` (capture view), `tools/pricing.ts:19` (price source). Web diff rows never set `details` (column default `'{}'`), so `isStructuredChange` is false for every existing web change.

**Interfaces:** `export const isStructuredChange = (c: { source: string; details: ChangeDetails }) => c.source !== 'web' || typeof c.details?.changeType === 'string';` in `tag/structured.ts`.

**Behaviour:**
- Replace each branch from Task 0 that picks tag questions, summary or evidence lines. Capture-type checks (`cap.source !== 'web'` in stages, `diff.ts`, `tools/evidence.ts`) stay.
- `buildStructuredSummary`: `site_feature` → `Added online booking to its website` / `Removed live chat from its website` (category label from `@cs/core`, never the vendor); `new_page` → `Added a new page to its website: "<h1 or path>"`.
- `buildStructuredQuestions('new_page')` asks the service mapping (already generic); `site_feature` needs none beyond the default.
- `supersedePriorChanges` (capture subject): add `AND (details->>'changeType') IS DISTINCT FROM 'site_feature'`.
**Tests (TDD):** a web text diff produces the same tag questions, summary and evidence text as before (snapshot of an existing fixture); a `site_feature` web change is tagged via the structured path and its summary has no vendor; a web-diff re-run at a higher version never supersedes a `site_feature` row.
**Done when:** engine focused tests for `src/tag`, `src/events`, `src/briefs`, `src/model-ops` pass.

### Task 7: `site_features` stage

**Goal:** D4.
**Files:** create `packages/engine/src/web/site-feature-stage.ts` (+ test); modify `packages/engine/src/sweep.ts` (`EngineWork.siteFeatures`), `drain.ts`, `index.ts`; `apps/worker/src/jobs/engine.ts` (job `engine-site-features`, `usesAi: false`; `engine-sweep` enqueues via a new `queue.enqueueSiteFeatures` and counts it in its log line/empty check), `apps/worker/src/deps.ts`, `job-list.ts` (queue impl, pattern `enqueuePrice`). Tests asserting the full `EngineWork`/`DrainResult` shape (sweep, drain, worker `engine.test.ts`) gain the new key.

**Interfaces:** `SITE_FEATURE_STAGE = 'site_features'`, `SITE_FEATURE_VERSION = 1`, `SITE_FEATURE_COOLDOWN_DAYS = 28`; `detectSiteFeatures(deps: { db; store }, captureId): Promise<StageOutcome<{ observed: number; changes: string[]; skipped?: string }>>`.

**Behaviour:** exactly spec D4 steps 1–6. Sweep SQL: ok web captures with `tracked_page_id`, competitor tracked by some client, no done run at this version, and `EXISTS` a later capture of the same page with status in (`ok`,`unchanged`); order by `captured_at`. Load other pages' latest observations in one query (`DISTINCT ON (key)` over `observation_competitor_kind_idx`). Inactive pages are ignored. `observed_at` = N's `captured_at`. Change text: `` `${label}: ${vendor} (on ${path})` ``, redacted for model on read (existing path).
**Tests (TDD, fixtures through the test store):** baseline writes an observation, no change; A→B(added)→S unchanged ⇒ one `added`; present→absent(N)→present(S) ⇒ nothing; present→absent→absent(S ok) ⇒ `removed`; other active page still has it ⇒ no `removed`; cooldown blocks a second change in 28 d; out-of-order capture ⇒ observation only; registry `since` newer than the previous observation ⇒ baseline; no successor ⇒ not offered by the sweep.
**Done when:** engine `src/web/site-feature-stage`, `src/sweep`, `src/drain` tests pass; worker `jobs` tests pass.

### Task 8: JSON-LD prices in `price_extract`

**Goal:** D5.
**Files:** create `packages/engine/src/prices/json-ld.ts` (+ test); modify `packages/engine/src/prices/price-stage.ts`, `price-stage.test.ts`.

**Interfaces:** `export function offerPrices(offers: StructuredOffer[]): { text: string; sha: string; obs: PriceObservation[] }[]`.

**Behaviour:** per spec D5. The stage loads the capture's `page.html.gz` once (same evidence row `ensureBlocks` reads), appends JSON-LD pseudo-blocks after text blocks, then one `mapPricedTexts` call and the existing `PRICE_MAX_BLOCKS` truncation. The model state for a pseudo-block is `{ competitor, page_url, page_type, text: redactForModel(text).slice(0, MAX_STATE_TEXT), prices }`. Dedupe with text observations by `keyOf`. Rows are ordinary page rows: `tracked_page_id` set, so the tracker's `PriceNow.source` is `'web'` (the code's value; the spec's "`'page'`" means this) and they count toward lowest price/90-day change.
**Tests (TDD):** `Offer price 129 USD ⇒ exact 129`; `AggregateOffer lowPrice 79 ⇒ from 79`; `name "$20 off tune-up" ⇒ none`; `priceSpecification only ⇒ none`; `EUR ⇒ none`; `no currency ⇒ treated as USD (exact)`; `"1,299.00" ⇒ 1299`; `0 or > MAX_PRICE ⇒ none`; stage: a page with the same price in text and JSON-LD writes one span; a capture whose JSON-LD offer disappears ends that span; the block map caches by `jsonld|` sha (second run makes no model call).
**Done when:** engine `src/prices` tests pass.

### Task 9: Re-discovery (refresh mode) and tracked-page hygiene

**Goal:** D6 store, modes, new pages, gone/duplicate/replaced.
**Files:** create `packages/collectors/src/discovery/page-key.ts` (+ test); modify `discovery/{discover,sitemap}.ts`, `discover.test.ts`, `sitemap.test.ts`, `packages/collectors/src/index.ts` (export `pageKey`, `REDISCOVERY_DAYS`, `EVENT_PAGE_TYPES`); move `MAX_ACTIVE_PAGES` to `packages/core/src/domain.ts` (`packages/tools/src/limits.ts` re-exports; `discoverPages`' `opts.max ?? 25` uses it).

**Interfaces:**
```ts
export function pageKey(url: string): string | null;   // 'example.com/services/ac-repair?b=2&a=1' → 'example.com/services/ac-repair?a=1&b=2'
export async function collectSitemapUrls(...): Promise<{ urls: string[]; truncated: boolean }>;
export const EVENT_PAGE_TYPES: ReadonlySet<PageType>;   // service, service_area, pricing, promo
export const REDISCOVERY_MAX_CLASSIFY = 20;
export const REDISCOVERY_DAYS = 28;                      // defined here (Task 10 imports it)
discoverPages(...) → { mode: 'initial' | 'refresh'; selected: number; candidates: number; newPages: number; deactivated: number; truncated: boolean; homepageStatus }
```

**Behaviour:** per spec D6 bullets "One `discoverPages`, two modes", "Room", "Tracked-page hygiene". Candidates are keyed by `pageKey` (stored URL = first seen, prefer https). Home not ok ⇒ existing placeholder logic + `site_discovery` upsert (`last_run_at`, `homepage_status`, `runs+1`), no `site_url` writes. Every upsert that sets `active = true` also sets `inactive_reason = NULL` and only touches rows that are new or inactive `gone`. Classification failures fall back to `guessPageType` as today. `site_discovery` upsert at the end (`urls`, `truncated`, `runs+1`, `last_run_at`, and `next_due_at = greatest(existing, now() + REDISCOVERY_DAYS)` — also on the home-not-ok path — so a tool-started run is not followed by a scheduled one the next day; pre-flight fix, spec D6 "every 28 days").
**Tests (TDD):** pageKey folds http/https/www/trailing slash/tracking params; initial run = selection + `site_url` baseline, no `appeared_at`; refresh with one new nav service URL ⇒ tracked with `appeared_at`; new `blog` URL ⇒ in `site_url`, not tracked; truncated this or previous run ⇒ sitemap-only new URLs ignored, nav ones kept; 21 new URLs ⇒ 20 classified; full (25) ⇒ replaces a `blog` page (`replaced`), never a pinned/manual one; 404 page missing from candidates ⇒ `gone`, re-activated when back; `manual` row never re-activated; duplicate http/https rows ⇒ one stays active.
**Done when:** `pnpm --filter @cs/collectors exec vitest run src/discovery` passes.

### Task 10: Scheduling and `add_tracked_page`

**Goal:** 28-day cadence, worker gate, key-aware manual add.
**Files:** create `packages/collectors/src/schedule/due-discovery.ts` (+ test; export from `packages/collectors/src/index.ts`); modify `apps/worker/src/jobs/web.ts` (job `discover-schedule`, cron `0 4 * * *`), `apps/worker/src/deps.ts`, `job-list.ts`; `packages/tools/src/tools/pages.ts` (+ `pages.test.ts`).

**Interfaces:** `claimDueDiscoveries(db: Db, limit: number): Promise<string[]>`; `DISCOVERY_SCHEDULE_BATCH = 25`; `REDISCOVERY_DAYS` imported from Task 9. `createWebJobs(deps, queue, opts: { webMonitoring: boolean })`; `createJobList` passes `webMonitoring: opts.env.WEB_MONITORING_ENABLED?.trim() === 'true'` (pre-flight: the worker reads this var nowhere today except the staging check in `env.ts`; it reaches the worker through the host env — Railway/Docker — not `turbo.json`).

**Behaviour:**
- Claim (one transaction): insert `site_discovery` rows for eligible competitors without one (`ON CONFLICT DO NOTHING`), then `UPDATE … SET next_due_at = now() + interval '28 days' WHERE next_due_at <= now() AND competitor_id IN (eligible) … FOR UPDATE SKIP LOCKED LIMIT n RETURNING`. Eligible = `competitor.domain IS NOT NULL` and `EXISTS client_competitor` with `clientWorkAllowed('cl')` and `agencyServiceable`. Same DST-safe test approach as `due-pages.test.ts`.
- `discover-schedule` returns at once (logged once) unless `opts.webMonitoring`; enqueues `discover-pages` with singleton `discover:<id>`.
- `add_tracked_page`: look up an existing row of the competitor by `pageKey`; if found, update it (pinned, active, `inactive_reason NULL`, daily) instead of inserting; the active-page limit uses `@cs/core` `MAX_ACTIVE_PAGES`.
**Tests (TDD):** claims due/no-row competitors once, not concurrently twice; skips prospects, spend-paused, untracked and domain-less; job idles with the switch unset; `add_tracked_page` with `http://www.` of an existing `https://` row returns that row's id and re-activates a `manual` row (a human action may).
**Done when:** collectors `src/schedule`, worker `jobs`, tools `pages` tests pass.

### Task 11: `new_page` from the web diff stage

**Goal:** D6 "Event".
**Files:** modify `packages/engine/src/web/diff-stage.ts`, `diff-stage.test.ts`.

**Interfaces:** `NEW_PAGE_MAX_AGE_DAYS = 14`; `NEW_PAGE_TEXT_CHARS = 600`.
**Behaviour:** in the compute phase, when there is no previous ok capture, read `tracked_page.appeared_at`/`pageType`/`url`; if `appeared_at` is set and `captured_at − appeared_at ≤ 14 d`, return one candidate; the write phase inserts the `detected_change` (`source 'web'`, `kind 'added'`, `block_key 'page:<trackedPageId>'`, `after_capture_id` = this capture, `after_text` = path + h1 + up to two h2 block texts, `details { changeType: 'new_page', pageUrl, pageType, pageKey }`, `stage_version` = `WEB_DIFF_VERSION`, status `pending`). No version bump. Pages without `appeared_at` keep today's baseline behaviour.
**Tests (TDD):** first capture of an appeared page ⇒ one `new_page` change; first capture without `appeared_at` ⇒ none; appeared 20 days ago ⇒ none; second capture ⇒ normal diff only; the change tags through the structured path (Task 6) and scores 42 for a `none` service.
**Done when:** engine `src/web` tests pass.

### Task 12: Prospect gate

**Goal:** D7.
**Files:** modify `packages/tools/src/tools/{competitors,prospects}.ts` (+ tests), `apps/web/src/app/(app)/c/[clientId]/competitors/actions.ts` (copy map).

**Interfaces:** `export type Discovery = 'queued' | 'disabled' | 'deferred' | 'not_needed'`; `startDiscovery(deps, competitorId, clientId): Promise<Discovery>`; tool output enums += `deferred`.
**Behaviour:** order: switch off ⇒ `disabled`; client fails `clientWorkAllowed` (service read of `client`) ⇒ `deferred`; then today's checks. `accept_competitor_suggestion`, its bulk twin and `add_competitor` pass their `clientId`. `convert_prospect`, after `postCommitSeatSync`, calls `startDiscovery` for each `client_competitor` of the client (errors logged, never fail the conversion). Copy: `deferred: 'Website page discovery starts once monitoring runs for this client.'` In `actions.ts` the `DISCOVERY` map gains `deferred`, and the bulk-accept note (line ~63) picks `disabled` > `deferred` > `queued`.
**Tests (TDD):** prospect add ⇒ `deferred`, no job; active client ⇒ `queued`; switch off ⇒ `disabled` even for a prospect; convert enqueues `discover-pages` once per competitor without pages; spend-paused ⇒ `deferred`.
**Done when:** tools `competitors`, `prospects` tests pass; web typecheck clean.

### Task 13: Docs, rollout, help

**Files:** `docs/work/phase-18a.md` (Interfaces + Rollout for 18a-2), `docs/OPS.md` (new section "Switching on website monitoring (18a-2)"), `docs/help/pages/client.changes.{agency,client}.md`, `client.pricing.md`, `client.competitors.detail.{agency,client}.md` (`kb:seed` keys unchanged).

- [ ] Work file: migrations 0101 (pack v6) + 0102 (schema), both change types, `capture.markup_sha`, `site_url`/`site_discovery`, `tracked_page.{inactive_reason, appeared_at}`, stage `site_features`, jobs `discover-schedule`/`engine-site-features`, `Discovery.deferred`, `WEB_COLLECTOR_VERSION web/2`, registry v1.
- [ ] OPS: after `rivalmonday.app/bot` loads: set `WEB_MONITORING_ENABLED=true` on **web and worker**; first `discover-schedule` runs baseline every tracked competitor (≤ 25/day; no events on a first run); `collect-once` dry checks; how to read `site_discovery`; registry update = add entry with `since` = new version (no stage bump); crawler-ban link.
- [ ] Help: changes guides list the two new types; pricing guide says prices also come from a page's structured price data; competitor detail guides: pages are re-checked monthly and new pages added automatically.
- [ ] Re-score not needed (new types only on new captures). Backlog: tracked-pages and prospect items closed; own-site prices kept; new item "later → competitor-page website tools section".
- **Done when:** `pnpm copy:status` lists the new strings; work file ≤ ~12 KB; commit `docs(phase-18a): 18a-2 interfaces, rollout, ops`.
