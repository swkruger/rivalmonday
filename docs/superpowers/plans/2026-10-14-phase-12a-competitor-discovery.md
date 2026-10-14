# Phase 12a — Competitor discovery & rating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Lean plan format** (root `CLAUDE.md`): interfaces are binding; full code only for SQL/RLS, security-sensitive logic, non-obvious algorithms and decided copy.

**Goal:** "Find competitors" becomes a two-stage, cost-capped search that filters out non-competitors, rates candidates (Top rival / Worth watching / Minor) with signal icons, pre-ticks the top rivals, auto-attaches strong ad accounts, and re-rates tracked competitors weekly.

**Architecture:** Pure scoring in `packages/collectors/src/rivals/` (filters, Overlap, Activity, tier, ad matching, cost estimate); vendor adapters for Google `ads_advertisers` and Meta Ad Library keyword search; a `rival-search` worker job writing `discovery_run` + `competitor_suggestion`; a weekly `signals-weekly` job writing `competitor_signal` from stored data; `@cs/tools` read/write tools; Next.js competitors UI.

**Tech Stack:** TypeScript, Drizzle + Postgres (RLS), pg-boss, `@cs/tools`, Next.js App Router, Tailwind/shadcn, `radix-ui` Tooltip, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-14-phase-12-discovery-and-starting-point-design.md` — decisions D1–D9 and § 12a. Read it in full before Task 1.

## Global constraints
- Read `docs/gotchas-cross-cutting.md` and the `CLAUDE.md` of every package touched before coding.
- Vendor APIs only; never fetch a competitor website. `WEB_MONITORING_ENABLED` stays unset. Honest UA rules unchanged.
- Web reads are registered `@cs/tools` tools; web writes go through `runTool`. Page refusals → 404.
- `upsell_tag` never in any payload of this plan. Schedulers filter `client.status`: discovery `IN ('active','prospect')`; `signals-weekly` `= 'active'`. Event readers filter `retracted_at IS NULL`.
- Signals are tri-state: `null` = not checked/unavailable; `0`/`false` = checked, none. Never coerce `null` to 0 (UI, scoring, payloads).
- Every vendor call in this plan is ledgered with the real `{ agencyId, clientId }` scope.
- Cost cap per run from pack `discovery.cost_cap_usd` (3); max **5 runs per agency per UTC day**; 10-min per-client cooldown and one live run per client stay.
- Migrations in `packages/db/migrations/`: **next free number at execution time** (main ends 0051; phase-9 claims 0052–0053, phase-10 ≥ 0054). `pnpm --filter @cs/db generate`, then `--custom --name=<x>` for RLS. Never edit applied migrations. Every new table ENABLE + FORCE RLS (`db/src/tenant.test.ts:152`).
- Icons and chips: hand-written inline SVG, brand tokens only; tier chips `top` #0B2540/white, `watch` #47A8E7/white, `minor` #EEF2F6/#4A5D73.
- Copy (decided, verbatim): tiers "Top rival", "Worth watching", "Minor"; hidden reasons "Different kind of business", "Outside your service area", "This is your business", "Permanently closed", "Too little information"; empty "No competitors found yet. Add keywords and a service area, then search."; failure "The search didn't finish. Your earlier suggestions are still here. Try again later."; daily cap "Daily search limit reached. Try again tomorrow."; progress "Searching your area… {done} of {total} searches", "Checking ads and reviews for {n} businesses…"; partial "Some signals unavailable"; match chips "Matched automatically · Remove", "Possible {platform} account: {name} · Confirm"; tracked "Rated {weekday} {d} {Mon}".
- Commits end with the Co-Authored-By line from root `CLAUDE.md`; LF only.

## Decisions (plan-local)
- **P1** Directory `packages/collectors/src/rivals/` (`discovery/` is website page discovery). Entry point `startCompetitorSearch(deps, clientId, trigger)` in `packages/tools/src/rival-search.ts` (`startDiscovery` already means page discovery).
- **P2** Candidates are not `competitor` rows. Review-sample tasks use `vendor_task` with `competitor_id` now nullable and a new nullable `suggestion_id`, CHECK exactly one set. Candidate reviews are aggregated into `signals` only, never stored in `review`.
- **P3** Silent Google retire reuses the existing pattern (`ads/google.ts:111-117`: `isActive=false, endedAt=lastSeenAt`, no `endedCaptureId`) — no new `ad` column.
- **P4** The spec's `tier_change` event is **deferred** (BACKLOG → Unscheduled): `detected_change_subject_check` needs a capture or rank scan, and weekly re-rating has neither.
- **P5** No `DISCOVERY_FAKE_VENDORS` switch: no worker runs in E2E, so E2E uses seeded `discovery_run` / `competitor_suggestion` / `competitor_signal` rows (demo seed helpers).
- **P6** `agencyServiceable` (phase-9) is applied if present on `main` at Task 0; otherwise skip and file `Phase 9 merge → apply agencyServiceable to rival-search and signals-weekly`.
- **P7** Converting a prospect reuses its latest `done` run if `finished_at ≥ now() − 30 days` (no new run, suggestions keep their `run_id`).

## File structure
- `packages/collectors/src/rivals/` (new): `signals.ts` (zod `Signals`, `AdMatch`), `filters.ts`, `score.ts` (Overlap, Activity, tier), `chain.ts`, `match.ts` (`matchAdAccount`), `cost.ts`, `run.ts` (orchestrator), `review-sample.ts`, `index.ts`; tests beside each.
- `packages/collectors/src/vendors/dataforseo-advertisers.ts`, `vendors/meta-search.ts` (new); `local/maps.ts` (extend parsed fields); 40102 handling in `local/maps.ts`, `ads/google.ts`, `reviews/collect.ts`, `jobs/collect.ts`, `gbp/collect-gbp.ts`.
- `packages/collectors/src/signals/tracked.ts` (new) — weekly Signals from stored data.
- `packages/verticals/src/schema.ts`, `packs/dental.yaml`, `packs/hvac_plumbing.yaml`.
- `packages/db/src/schema/client-intel.ts`, `tenancy.ts`, `sources.ts`, new `schema/rivals.ts`; migrations (generated + custom RLS).
- `apps/worker/src/jobs/rivals.ts` (new), `deps.ts`, `main.ts`; `jobs/vendor.ts` (poll branch).
- `packages/tools/src/rival-search.ts` (new), `tools/competitors.ts`, `tools/schemas.ts`, `tools/onboarding.ts`, `tools/prospects.ts`, `deps.ts` (`QueueJob`), `limits.ts`.
- `apps/web/src/app/(app)/c/[clientId]/competitors/{page.tsx,competitor-controls.tsx,actions.ts}`, `competitors/[competitorId]/page.tsx`, new `apps/web/src/components/rival/{tier-chip.tsx,signal-pills.tsx,signal-icons.tsx,ad-match-chips.tsx}`.
- `packages/demo/src/` seed + `coverage.ts`; `apps/web/e2e/competitors-rivals.spec.ts`; `apps/web/scripts/e2e-affected-rules.ts`.

## Dependencies on in-flight work
- **phase-9 (9a executing):** migrations 0052–0053; `packages/db/src/filters.ts` `agencyServiceable` on schedulers. Re-check at Task 0 (P6).
- **phase-10 (planned):** edits `create_client` (`first_client_at`); migrations ≥ 0054. Rebase conflicts possible in `tools/onboarding.ts`.
- **Phase 11 (unplanned):** will call `startCompetitorSearch`; keep it exported from `@cs/tools`.

## Review focus
1. A client with no `place_id` / empty keywords / no service area: no run starts automatically, the button explains what's missing, nothing throws.
2. A vendor outage mid-stage-2 (Meta 5xx, DataForSEO 40102 on every ads call): candidates still list, affected pills show "not checked" (dotted), tiers fall back to the remaining signals, and nothing reads as "0 ads".
3. Two "Track selected" clicks (or two tabs) at the competitor limit must not exceed `competitor_limit`.
4. A chain/franchise candidate (Aire Serv fixture) must never auto-attach the brand or another city's advertiser.
5. A client user must see tiers and icons on tracked competitors but never suggestions, hidden lists, cost or `ad_matches` for untracked businesses.

---

### Task 0: Pre-flight and live vendor checks
- [ ] `git rebase main`; re-check every "Dependencies on in-flight work" item; set the migration numbers; record drift in `docs/work/phase-12.md`.
- [ ] With the owner's OK (a few cents), one live call each, saved as fixtures under `packages/collectors/test/fixtures/vendors/`: `dfs-maps-live-dental.json` (keyword "dentist", Granbury TX 32.4421,-97.7942) — list the distinct `category` values and fix the pack category lists in Task 2 to match; `dfs-ads-advertisers-live.json` (keyword "Aire Serv", same coordinate); `scrapecreators-adlibrary-search.json` (query "Granbury Dental Center") — confirm a page id field exists (if not, try the page-search endpoint and note which). Extend `vendors/fixtures.test.ts`.
- **Done when:** fixtures committed; `pnpm test:affected` green.

### Task 1: "No Search Results" is an empty success
**Goal:** DataForSEO 40102 at task level yields an empty, successful result in Maps, Google ads, reviews, jobs and GBP (folds in the BACKLOG item).
**Files:** `vendors/dataforseo.ts` (export `isNoResults(task)`), `local/maps.ts`, `ads/google.ts`, `reviews/collect.ts`, `jobs/collect.ts`, `gbp/collect-gbp.ts`; tests beside each.
**Interfaces:** `export function isNoResults(t: DfsTask): boolean` → `t.statusCode === 40102`.
**Behaviour:**
- Maps: returns `[]` (no throw). Ads: capture recorded as `ok` with zero items; existing active ads go through the normal 21-day unseen rule; `last_status = 'ok'`. Reviews/jobs: `vendor_task.status = 'done'`, zero items, observation written so the next diff has a baseline. GBP: `last_status = 'not_found'` (new status string) and no observation.
- Other non-OK codes keep today's behaviour.
**Tests:** per collector `40102 → empty success` using `dfsTask(null, { status_code: 40102, status_message: 'No Search Results.' })`; `other error still vendor_error`.
**Done when:** `pnpm --filter @cs/collectors exec vitest run maps google collect collect-gbp` green.

### Task 2: Pack schema — discovery section
**Goal:** packs carry discovery config.
**Files:** `packages/verticals/src/schema.ts`, `packs/dental.yaml`, `packs/hvac_plumbing.yaml` (both `version: 2`), loader tests.
**Interfaces:**
```ts
discovery: z.strictObject({
  seed_keywords: z.array(z.string().min(2)).max(5),
  categories: z.array(z.string()).min(1),
  related_categories: z.array(z.string()).default([]),
  grid: z.strictObject({ size: z.number().int().min(3).max(7), fallback_size: z.number().int().min(3).max(7) }),
  shortlist: z.number().int().min(5).max(30),
  cost_cap_usd: z.number().positive().max(10),
  tiers: z.strictObject({ top: z.strictObject({ overlap: z.number(), activity: z.number() }), watch: z.strictObject({ overlap: z.number(), activity: z.number() }) }),
})
```
**Behaviour:** values exactly as spec § "Vertical pack additions", category strings corrected to Task 0's live values. Category comparison is case-insensitive.
**Tests:** both packs parse; missing `discovery` fails; `grid.size 9` fails.
**Done when:** `pnpm --filter @cs/verticals test` green.

### Task 3: Schema + migrations
**Goal:** tables and columns from spec § 12a Data, plus P2.
**Files:** new `packages/db/src/schema/rivals.ts` (`discoveryRun`, `competitorSignal`), modify `client-intel.ts` (suggestion columns), `tenancy.ts` (`clientCompetitor.pendingAdMatches`), `sources.ts` (`vendorTask.competitorId` nullable, `suggestionId`); schema index; generated migration + custom RLS migration.
**Interfaces:** Drizzle exports `discoveryRun`, `competitorSignal`; types `DiscoveryRunRow`, `CompetitorSignalRow`; `DiscoveryRunStatus = 'queued'|'searching'|'checking'|'finalising'|'done'|'failed'`, `Tier = 'top'|'watch'|'minor'`. Columns exactly as the spec SQL. Generated part also adds:
```sql
ALTER TABLE vendor_task ALTER COLUMN competitor_id DROP NOT NULL;
ALTER TABLE vendor_task ADD COLUMN suggestion_id uuid REFERENCES competitor_suggestion(id) ON DELETE CASCADE;
ALTER TABLE vendor_task ADD CONSTRAINT vendor_task_subject_check CHECK ((competitor_id IS NULL) <> (suggestion_id IS NULL));
```
**Custom RLS migration (full):**
```sql
REVOKE INSERT, UPDATE, DELETE ON discovery_run, competitor_signal FROM app_user;
--> statement-breakpoint
ALTER TABLE discovery_run ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE discovery_run FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY discovery_run_select ON discovery_run FOR SELECT USING (agency_id = app_agency_id() AND app_client_visible(client_id));
--> statement-breakpoint
ALTER TABLE competitor_signal ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE competitor_signal FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY competitor_signal_select ON competitor_signal FOR SELECT USING (agency_id = app_agency_id() AND app_client_visible(client_id));
--> statement-breakpoint
REVOKE UPDATE ON client_competitor FROM app_user;
```
(`competitor_suggestion` keeps `GRANT UPDATE (status)` only — new columns are service-role written. `client_competitor` had no app_user UPDATE use; the revoke makes `pending_ad_matches` service-only. Verify with `grep -rn "update(clientCompetitor" packages apps` — if any tenant-tx update exists, grant that column back instead.)
**Tests:** `tenant.test.ts` passes (RLS on new tables); new `rivals-rls.test.ts`: agency B can't select agency A's run/signal; a client-scoped member sees only their client; app_user INSERT into `discovery_run` fails; `vendor_task_subject_check` rejects both/neither.
**Done when:** `pnpm --filter @cs/db test` green.

### Task 4: Pure scoring module
**Goal:** filters, Overlap, Activity, tier, chain detection, ad-account matching and cost estimate as pure functions.
**Files:** `rivals/{signals,filters,score,chain,match,cost}.ts` + tests; fixtures from the 2026-10-14 McCoy run (`rivals/test/mccoy-candidates.json`: include Dollar General, Reata Equine Hospital, Godley Animal Clinic, Vasectomy Pro, Charger Properties, the client itself, Granbury Dental Center, Archstone, Aspen Dental).
**Interfaces:**
```ts
export type Candidate = { placeId: string; cid: string|null; name: string; category: string|null; additionalCategories: string[];
  lat: number|null; lng: number|null; rating: number|null; votes: number|null; domain: string|null; phone: string|null;
  isClaimed: boolean|null; closed: boolean; ranks: number[] /* one per search it appeared in */ };
export type HiddenReason = 'wrong_category'|'outside_area'|'self'|'closed'|'thin';
export function filterCandidates(cands: Candidate[], ctx: { pack: DiscoveryConfig; area: ServiceArea; self: { placeId: string|null; cid: string|null; domain: string|null; phone: string|null } }):
  { kept: (Candidate & { distanceKm: number|null; categoryMatch: 'main'|'related' })[]; hidden: { candidate: Candidate; reason: HiddenReason }[] };
export function overlapScores(kept: …[], searches: number, radiusKm: number): Map<string /*placeId*/, number>; // normalised 0–1
export function activityScore(s: Signals, runMedianReviews30d: number): number | null;  // null when every term null
export function tierFor(overlap: number, activity: number | null, t: DiscoveryConfig['tiers']): Tier;
export function detectChains(raw: { name: string; placeId: string }[]): Set<string /*normalised brand*/>;
export function matchAdAccount(c: { name: string; city: string|null; domain: string|null; chain: boolean }, a: { name: string; domain: string|null }): 'strong'|'weak'|'none';
export function estimateCostUsd(plan: { searches: number; shortlist: number }): number;  // maps 0.002/search; per shortlisted: advertisers 0.0006 + ads 0.002 + meta 0.01 + reviews 0.0015
```
**Behaviour (non-obvious; implement exactly):**
- Self match on any of placeId, cid, normalised domain (strip `www.`, lowercase), digits-only phone.
- `w(r) = 1 / (1 + (r − 1) / 3)`; `presence = Σ w(ranks) / searches`; `overlap = norm(presence) × (main ? 1 : 0.5) × (1 − 0.5 × min(1, d / radius))`, `norm` = divide by the run's max presence; `d` null → factor 0.75.
- Activity per spec formula; drop `null` terms and renormalise weights; all null → `null`; `tierFor` with `activity null` uses overlap only (`top` needs activity, so max is `watch`).
- Name normalisation for chains/matching: lowercase, strip punctuation and suffixes (`llc, inc, pc, dds, dmd, of <city>`), collapse spaces. Chain = same normalised brand with ≥ 3 distinct placeIds in the raw results.
- `matchAdAccount`: strong = names equal after normalisation **and** (not chain **or** account name/domain contains the city or equals the domain); or domains equal. Weak = token Jaccard ≥ 0.6. Else none.
**Tests:** `drops Dollar General as wrong_category`, `drops equine hospital`, `drops the client itself by phone`, `keeps orthodontist as related (0.5)`, `rank 1 outweighs rank 18`, `activity renormalises with nulls`, `activity all null → null and tier ≤ watch`, `Aspen Dental detected as chain`, `Aire Serv brand account is weak for Granbury franchisee`, `"Aire Serv of Granbury" account is strong`, `domain equality is strong`, `estimate 7×7×5 + 20 shortlisted ≤ 3.0`.
**Done when:** `pnpm --filter @cs/collectors exec vitest run rivals` green.

### Task 5: Vendor adapters (advertisers, Meta search) + richer Maps parse
**Goal:** the three stage-2 lookups as ledgered adapters with fixtures.
**Files:** `vendors/dataforseo-advertisers.ts`, `vendors/meta-search.ts`, `local/maps.ts` (parse `category, additional_categories, address, latitude, longitude, phone, is_claimed, work_hours.current_status` into `MapsResult`), tests.
**Interfaces:**
```ts
export function searchGoogleAdvertisers(dfs: DataForSeo, q: { name: string; lat: number; lng: number }, scope: CallScope): Promise<{ id: string; name: string; domain: string|null; verified: boolean }[]>;
export function searchMetaPages(d: { apiKey?: string; apifyToken?: string; ledger: Ledger; fetch?: typeof fetch }, q: { name: string; country: 'US' }, scope: CallScope): Promise<{ pageId: string; pageName: string; activeAds: number }[] | null>; // null = unavailable
```
**Behaviour:** advertisers: `POST /serp/google/ads_advertisers/live/advanced` with `keyword`, `location_coordinate "lat,lng"`; 40102 → `[]`. Meta: ScrapeCreators keyword search (status ACTIVE), group results by page id, count ads; on ScrapeCreators error try Apify keyword URL (`search_type=keyword_unordered`); both fail → `null`. Both ledger with the passed scope. `MapsResult` new fields optional; existing callers unchanged.
**Tests:** fixture-driven parse for each; `40102 → []`; `Meta both vendors fail → null`; `ledger receives agency and client ids`.
**Done when:** `pnpm --filter @cs/collectors exec vitest run vendors maps` green.

### Task 6: Rival search orchestrator + review sample
**Goal:** `runRivalSearch` executes a `discovery_run` end to end (stage 1, filters, stage 2, finalise) within the cost cap.
**Files:** `rivals/run.ts`, `rivals/review-sample.ts`, `reviews/collect.ts` (suggestion branch), tests.
**Interfaces:**
```ts
export type RivalSearchDeps = { db: Db; dfs: DataForSeo; meta: MetaSearchDeps; packs: PackLoader; now?: () => Date };
export function runRivalSearch(deps: RivalSearchDeps, runId: string): Promise<{ status: 'done'|'failed'|'finalising' }>;
export function finaliseRivalSearch(deps: RivalSearchDeps, runId: string, opts: { force: boolean }): Promise<'done'|'waiting'>;
export function postReviewSamples(deps, runId: string, suggestions: { id: string; placeId: string }[]): Promise<void>; // depth 20, vendor_task.suggestion_id
```
**Behaviour:**
- Keywords = client keywords first, then pack seeds, dedupe, max 5. Grid from `gridPoints(center, radius, size)`; before stage 1 `estimateCostUsd`; over cap → `fallback_size`, then drop keywords from the end until under cap.
- Update `progress` every 10 searches; status `searching` → `checking` → `finalising` → `done`. Stage 1 fails (status `failed`, `error`) when < 50 % of searches succeed; earlier suggestions untouched.
- Upsert suggestions on `(client_id, place_id)` setting every new column + `run_id`, `last_seen_at`; never change `status` (dismissed stays dismissed). Hidden candidates are not stored; their counts go to `hidden`, the first 50 as `{ name, reason }` into `progress.hiddenList`.
- Stage 2 on the top `shortlist` by overlap: advertisers → `matchAdAccount` → `ads_search` with matched ids (depth 40) or domain fallback; Meta search → match pages; chain flag; then `postReviewSamples`. Each failure sets just that signal `null`. Store `ad_matches` (strong + weak only).
- Before stage 2, if spent `cost_usd` + stage-2 estimate > cap, shrink the shortlist.
- Review sample results (poll, Task 7) compute `reviews30d/90d/replyRate` into the suggestion's `signals`; `finaliseRivalSearch` recomputes activity/tier for the run; with `force` (30 min passed) it finishes with remaining review signals `null`.
**Tests (fake DFS + fake Meta):** `full run produces tiers and hidden counts`, `cost cap shrinks grid to 5×5`, `under 50% searches → failed, old suggestions kept`, `dismissed suggestion stays dismissed`, `Meta outage → metaPage null, tier still computed`, `force finalise leaves reviews null`.
**Done when:** `pnpm --filter @cs/collectors exec vitest run rivals reviews` green.

### Task 7: Worker jobs
**Goal:** run, finalise and weekly signals jobs; poll branch for suggestion review tasks.
**Files:** `apps/worker/src/jobs/rivals.ts`, `deps.ts`, `main.ts`, `jobs/vendor.ts`; `packages/collectors/src/signals/tracked.ts` + test.
**Interfaces:** jobs `rival-search` (`{ runId }`, `{...SINGLE_SHOT_QUEUE, expireInSeconds: 7200}`), `rival-finalise` (`{ runId }`, enqueued by the poll when a suggestion task lands and with `startAfter: 1800` from the run with `force: true`), `signals-weekly` (cron `'0 9 * * 1'`). `computeTrackedSignals(deps:{db, packs}, clientId, now): Promise<CompetitorSignalRow[]>`. Remove `suggest-competitors` job and `suggestCompetitors` usage (keep `local/suggest.ts` deleted only if no other importer — grep).
**Behaviour:** tracked Signals from stored data: rating/votes from latest `gbp_profile` observation; reviews30d/90d/replyRate from `review` (`posted_at`, `owner_answer`); googleAdsActive/new30d and metaAdsActive from `ad` (`is_active`, `first_seen_at`); `metaPage/googleAccount` = `'matched'` when ids pinned, else `'none'` if the last source run was `ok`, else `null`; presence from the latest `rank_snapshot` set. Overlap for tracked = latest suggestion overlap for that placeId, else presence-based. Upsert `competitor_signal`. Active clients only; P6 filter.
**Tests:** `computeTrackedSignals` with seeded ads/reviews/observations; `no ads source run → googleAdsActive null`; `prospect clients skipped by signals-weekly`.
**Done when:** `pnpm --filter @cs/worker exec vitest run rivals` and collectors `signals` green.

### Task 8: Tools — search, list, signals, accept, ad matches
**Goal:** the tool surface from spec § Tools, plus auto-run hooks.
**Files:** `packages/tools/src/rival-search.ts`, `tools/competitors.ts`, `tools/schemas.ts`, `tools/onboarding.ts`, `tools/prospects.ts`, `deps.ts` (`QueueJob` += `'rival-search'`), `limits.ts` (`RIVAL_SEARCHES_PER_AGENCY_DAY = 5`); tests.
**Interfaces:**
- `startCompetitorSearch(deps: ToolDeps, clientId: string, trigger: 'auto'|'manual'|'convert'): Promise<{ runId: string } | { refused: 'missing_profile'|'cooldown'|'running'|'daily_cap' }>` — inserts `discovery_run` (service role) then enqueues `rival-search` with singleton `rival:<clientId>`.
- `SuggestionView` adds `tier, category, distanceKm, signals: Signals, adMatches: AdMatch[], preselected: boolean`; `list_competitor_suggestions` output `{ suggestions, hidden: Record<HiddenReason, number>, hiddenList: { name: string; reason: HiddenReason }[] }`.
- `get_competitor_search_status` → `{ status, progress, kept, hidden, finishedAt } | { status: 'none' }`.
- `get_competitor_signals({ clientId })` → `{ competitors: { competitorId, tier, signals, computedAt }[] }`, `permission: 'read'`, `channels: ['web','mcp','ask']`.
- `accept_competitor_suggestions({ clientId, ids: uuid[] (1–10) })`, `confirm_ad_match({ clientId, competitorId, platform, accountId })`, `remove_ad_match(same)`; all `permission: 'manage', feature: 'manage_competitors'`, `access: 'write'`.
**Behaviour:**
- Atomic limit (security-sensitive; full SQL in the tx before inserts): `SELECT competitor_limit FROM client WHERE id = $1 FOR UPDATE;` then `SELECT count(*) FROM client_competitor WHERE client_id = $1;` — refuse when `count + newIds > limit`. Single accept uses the same helper.
- Accept attaches `strong` matches (append to `google_advertiser_ids`/`meta_page_ids` without duplicates, service tx) and writes `weak` ones to `client_competitor.pending_ad_matches`. Confirm moves one pending match to the competitor arrays; remove deletes it from arrays and pending, and for Google sets that advertiser's active ads to `is_active=false, ended_at=last_seen_at` (P3).
- `preselected` = top-tier suggestions ordered by overlap, up to `competitor_limit − tracked count`.
- Auto-run: `update_client_profile` (after commit, when keywords/serviceArea/placeId changed and all three present), `create_client` and prospect creation (when all three present), `convert_prospect` (P7). Refusals are silent for `auto`.
- Client roles: `list_competitor_suggestions` and search tools stay `permission: 'agency'` (unchanged).
**Tests:** `daily cap refuses the 6th run with the decided copy`, `missing place id → missing_profile`, `two concurrent bulk accepts at limit → one refused`, `strong match attached, weak pending`, `remove Google id retires its ads silently`, `client role sees get_competitor_signals but not suggestions`, `no upsell_tag in any payload` (snapshot keys), `convert reuses a 10-day-old run`.
**Done when:** `pnpm --filter @cs/tools exec vitest run competitors rival` green.

### Task 9: Suggestions UI
**Goal:** tier-grouped suggestion cards with icon pills, pre-ticked top rivals, bulk track, hidden list and progress.
**Files:** `apps/web/src/components/rival/{tier-chip,signal-pills,signal-icons}.tsx`, `competitors/competitor-controls.tsx` (`SuggestionsPanel`), `competitors/actions.ts` (`acceptSuggestionsAction`), `competitors/page.tsx`; component tests.
**Interfaces:** `<TierChip tier />`, `<SignalPills signals mode="suggestion"|"tracked" />` (pill states: active, hot, checked-none, not-checked; each wrapped in `radix-ui` Tooltip with text like "6 active Google ads, 2 started in the last 30 days"), `acceptSuggestionsAction(clientId, ids)`.
**Behaviour:** groups "Top rival" → "Worth watching" → "Minor" (headings only when non-empty); checkbox per card, pre-ticked from `preselected`; sticky "Track selected (n)"; disabled at limit with today's copy; "Show {n} hidden" disclosure listing name + decided reason label; progress copy from status polling (reuse the existing poll cadence); failure copy on `failed`. Hot = `googleAdsNew30d > 0`, `metaAdsActive > 0`, `reviews30d ≥ 5`. Keyboard: checkboxes and disclosure reachable; tooltips on focus.
**Tests:** `renders groups in order`, `pre-ticks preselected`, `not-checked pill has dotted style and "Not checked" tooltip`, `hidden list shows reason labels`.
**Done when:** `pnpm --filter @cs/web exec vitest run competitors rival` green.

### Task 10: Tracked list, profile, ad-match chips, demo coverage
**Goal:** tier + icons on tracked competitors (agency and client) and match chips for managers.
**Files:** `competitors/competitor-controls.tsx` (`TrackedCompetitorsTable`), `competitors/[competitorId]/page.tsx`, `components/rival/ad-match-chips.tsx`, `actions.ts` (confirm/remove), `packages/demo/src/*` (seed a done run, suggestions across tiers, `competitor_signal`, a pending weak match), `coverage.ts`, README coverage table.
**Behaviour:** tracked table adds Tier and Signals columns and "Rated {date}"; no signal row yet → "Not rated yet". Profile header shows chip + pills. Match chips only for `canManageCompetitors`. Client users see tier/pills only.
**Tests:** `client user sees tier column, no match chips`, demo `coverage.test.ts` green.
**Done when:** `pnpm --filter @cs/web exec vitest run competitors` and `pnpm --filter @cs/demo test` green.

### Task 11: E2E + live verification notes
**Goal:** end-to-end proof on seeded data; owner steps.
**Files:** `apps/web/e2e/competitors-rivals.spec.ts` (tag `@rivals`), `apps/web/scripts/e2e-affected-rules.ts` (`KNOWN_TAGS` + path rule for `components/rival/**` and `competitors/**`), `docs/work/phase-12.md` (owner verification).
**Tests:** `agency sees tier groups, pre-ticked top rivals, tracks two, hidden list opens`; `client user sees tiers on tracked list and no suggestions panel`; `remove auto-matched Meta page`.
**Owner verification (write into the work file):** on `cs_dev` with the worker running: run "Find competitors" for both clients → no wrong-category or self suggestions; Granbury Dental Center and Archstone rated Top rival or Worth watching; run cost ≤ $3 on `/platform/costs`; accept one → Meta/Google chips; next Monday `signals-weekly` fills tracked tiers.
**Done when:** `pnpm --filter @cs/web e2e:affected` green.
