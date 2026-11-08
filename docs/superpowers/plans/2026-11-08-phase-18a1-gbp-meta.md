# Phase 18a-1 — GBP + Meta briefing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Brief what GBP and the Meta Ad Library already give us: closures (alert), profile edits (brief), Facebook Page-like growth (brief + trend), Meta ad-copy prices (price tracker, shown not counted), event ads (named).

**Architecture:** Three new change types flow through the existing structured-diff → tag → score → brief pipeline. Page likes become `observation` rows (`kind: 'meta_page'`); ad prices become `price_point` rows keyed by `ad_id` via a new `ad_price_extract` engine stage. No new vendor call, env var or schedule.

**Tech Stack:** TypeScript, Drizzle + Postgres (Neon), pg-boss worker, vitest, Next.js App Router, `@cs/ui`.

**Spec:** `docs/superpowers/specs/2026-11-08-phase-18a1-gbp-meta-design.md` (owner-approved 2026-11-08; O1–O6, D1–D6). Read it with this plan.

## Global constraints

- Read `docs/gotchas-cross-cutting.md` and the `CLAUDE.md` of every package you touch before coding.
- No new vendor calls except the single Task 0 GBP check (owner approves the spend first). No new env var.
- Model input through `redactForModel` (ad text, event names). Prices are rules-only (`pricesInBlock`); a discount never becomes a price.
- New tool ⇒ `ISOLATION_FIXTURES` entry; out-of-scope client/competitor ⇒ `not_found`. Web reads are registered `@cs/tools` tools.
- Every user-facing string goes through copy sign-off (`pnpm copy:status`); dates in viewer tz; DS v1 rules on UI.
- Migrations: next free number at execution (expect 0101); never edit applied ones. LF only. Commits end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` (subagents: own model).
- Implementers run focused tests only; `pnpm test:affected` + `pnpm --filter @cs/web e2e:affected` once at the final review.

## Decisions

Spec O1–O6 and D1–D6 are binding. Plan-level calls: one migration for all schema + pack data (Task 2); `ad_price_extract` reads the ad ids listed in a capture from its stored payload (not `ad.last_capture_id`, which later captures overwrite); `AD_PRICE_SINCE` = the date Task 8 is committed (sweep cutoff); `observation.observed_at` = the capture's `captured_at` for `meta_page` rows (backfill and live alike).

## File structure

- `packages/core/src/domain.ts` — change types. `packages/db/src/schema/{engine,insights,sources}.ts` — `ChangeDetails`, `ChangeItem`, `ScoreFactors`, `price_point`, `ad`.
- `packages/verticals/{src/schema.ts,packs/*.yaml}` — weights, size key, version 5.
- `packages/engine/src/score/score.ts`; `structured/{gbp,ads,meta-page}.ts`; `prices/{ad-price-stage,tracker}.ts`; `sweep.ts`, `drain.ts`; `briefs/evidence.ts`.
- `packages/collectors/src/ads/{meta,upsert}.ts`; new `packages/collectors/src/ads/meta-page.ts`.
- `packages/tools/src/tools/{audience,pricing}.ts`, `catalog/merge.ts`, `isolation/fixtures.ts`; `packages/db/test/isolation-world.ts`.
- `packages/email/src/labels.ts`; `packages/core/src/help/glossary.ts`; `apps/web/src/lib/labels.ts`; competitor + pricing pages.
- `apps/worker/src/jobs/engine.ts`; new CLI `apps/worker/src/cli/meta-page-backfill.ts` (+ args file/test, pattern `rescore-args.ts`).

## Dependencies on in-flight work (re-check in Task 0)

- `brief-report` (unmerged): `topicOf` (`@cs/core` `brief-report.ts`) and `GROUP_PHRASE` (`@cs/email`) must cover every `CHANGE_LABELS` key; it edits `briefs/{generate,summary,review,deliver}.ts`, `email/src/labels.ts`. If merged first, Task 3 adds the three types there.
- Migration number: `brief-report` likely takes 0100.

## Review focus

1. GBP status flipping `open`/`close` on every pull must never emit anything (Task 4 test).
2. A pull with no `work_time` between two closed pulls must not emit reopened/closed (missing = no compare; Task 4 test).
3. A capture alternating Apify and ScrapeCreators payloads keeps one likes series per page id (Task 5 test).
4. Ad copy "$20 off any repair" yields no price; "$79 AC tune-up" yields one (Task 8 test).
5. A competitor with two Meta pages shows the larger page's likes, never the sum; another client's competitor ⇒ `not_found` (Task 7 tests).

---

### Task 0: Pre-flight and live checks

**Files:** modify `docs/work/phase-18a.md` (findings), this plan (fixes).

- [ ] `git fetch && git rebase main` (or onto `brief-report` if merged). Re-check every "Dependencies" line and each file path in this plan; fix the plan where the code moved.
- [ ] Set up the worktree for implementation: `pnpm install`, own test DB (`/rm-kickoff` §1 commands), `pnpm --filter @cs/worker exec vitest run src/boss.test.ts` once.
- [ ] Note the next free migration number in the work file.
- [ ] **GBP closed value (paid, ≈ $0.01 — ask the owner first):** one DataForSEO `business_data/google/my_business_info` call for a known permanently closed listing (owner picks or approves one). Record where the closed value lands (`current_status`, `work_time.work_hours.current_status`, absent `work_time`, or no result). If GBP carries no closed value: switch Task 4's closed source to the rank-scan `closed` flag (`collectors/src/local/maps.ts`) and update Task 4's Behaviour before dispatching it.
- [ ] **Meta shapes (free):** in `cs_dev`, read 3+ stored `meta_ads` capture payloads (Apify and ScrapeCreators) and record the real shapes of `snapshot.page_like_count`, `snapshot.page_name` and `snapshot.event`. Fix Task 5/6 field paths if they differ.
- **Done when:** work file has the four findings; plan fixed; commit `docs(phase-18a): pre-flight`.

### Task 1: Change types and scoring

**Goal:** `status_change`, `profile_change`, `audience_growth` exist and score as D1.
**Files:** modify `packages/core/src/domain.ts`, `packages/db/src/schema/engine.ts`, `packages/verticals/src/schema.ts`, `packages/verticals/packs/{generic,hvac_plumbing,dental}.yaml`, `packages/engine/src/score/score.ts`; tests `packages/engine/src/score/score.test.ts`, `packages/verticals/src/packs.test.ts`.

**Interfaces:**
- `CHANGE_TYPES` += `'status_change' | 'profile_change' | 'audience_growth'`.
- `ChangeDetails` += `direction?: 'closed' | 'reopened'; statusBefore?: string; statusAfter?: string; likesBefore?: number; likesAfter?: number; pct?: number; days?: number`. `ScoreFactors` += `profileCap: boolean`.
- Pack `scoring.size.audience_pct_for_full: z.number().positive().default(20)`; `scoring.version: 5`; `type_weights`: `status_change 1.0`, `profile_change 0.8`, `audience_growth 0.7`.
- `WHOLE_BUSINESS_TYPES` += the three.

**Behaviour:**
- `sizeFactor`: `status_change` → `1` when `direction === 'closed'`, else `size.default`; `audience_growth` → `curve(d.pct, s.audience_pct_for_full)`.
- `noveltyFactor` is skipped (= 1) for `status_change` with `direction === 'closed'`.
- `profile_change` routed `alert` → `brief`, `profileCap: true`.

**Tests (TDD):** `closed status_change scores 100 and alerts with novelty 0.9`; `reopened scores 60 → brief`; `profile_change never alerts even with thresholds {alert: 10, brief: 5}` (`profileCap` true); `audience_growth pct 15 scores ≈ 52.5 → brief`; packs test: every shipped pack has the three weights and version 5.
**Done when:** `pnpm --filter @cs/engine exec vitest run src/score` and `pnpm --filter @cs/verticals test` pass; `pnpm -r exec tsc --noEmit` clean for core/db/verticals/engine.

### Task 2: Migration (schema + pack data)

**Goal:** `price_point` accepts ad rows, `ad.event` exists, stored vertical configs carry the new keys.
**Files:** `packages/db/migrations/<next>_wider_sources_gbp_meta.sql` (+ drizzle meta via `pnpm --filter @cs/db generate` for the schema part, then append the data part), `packages/db/src/schema/{insights,sources}.ts`, `packages/db/test/table-classes.ts` (unchanged class; confirm), migration test if the package has one for 0099.

**Interfaces:** `pricePoint.trackedPageId` nullable; `pricePoint.adId: uuid('ad_id').references(() => ad.id, { onDelete: 'cascade' })`; `ad.event: jsonb('event').$type<{ name: string; startsAt: string | null } | null>()`.

```sql
ALTER TABLE price_point ALTER COLUMN tracked_page_id DROP NOT NULL;
ALTER TABLE price_point ADD COLUMN ad_id uuid REFERENCES ad(id) ON DELETE CASCADE;
ALTER TABLE price_point ADD CONSTRAINT price_point_subject_check CHECK ((tracked_page_id IS NULL) <> (ad_id IS NULL));
DROP INDEX price_point_open_unique;
CREATE UNIQUE INDEX price_point_open_unique ON price_point (tracked_page_id, vertical_id, service_id, unit, qualifier, amount)
  WHERE ended_at IS NULL AND tracked_page_id IS NOT NULL;
CREATE UNIQUE INDEX price_point_ad_open_unique ON price_point (ad_id, vertical_id, service_id, unit, qualifier, amount)
  WHERE ended_at IS NULL AND ad_id IS NOT NULL;
CREATE INDEX price_point_ad_idx ON price_point (ad_id) WHERE ad_id IS NOT NULL;
ALTER TABLE ad ADD COLUMN event jsonb;
-- 18a-1 D1: new change-type weights, audience size curve, scoring v5 for the shipped packs. DB-created verticals
-- inherit generic's via assemblePack. vertical.updated_at left alone (see 0099). Idempotent.
-- backfill:start
UPDATE vertical
SET config = jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(config,
      '{type_weights,status_change}', '1.0'::jsonb, true),
      '{type_weights,profile_change}', '0.8'::jsonb, true),
      '{type_weights,audience_growth}', '0.7'::jsonb, true),
      '{scoring,size,audience_pct_for_full}', '20'::jsonb, true),
      '{scoring,version}', '5'::jsonb, true)
WHERE id IN ('generic', 'hvac_plumbing', 'dental')
  AND jsonb_typeof(config -> 'type_weights') = 'object'
  AND jsonb_typeof(config #> '{scoring,size}') = 'object'
  AND coalesce((config #>> '{scoring,version}')::int, 0) < 5;
```

**Tests:** db test `price_point rejects a row with both or neither of tracked_page_id/ad_id`; `deleting an ad cascades its price points`; the migration runs twice without change (pattern of 0099's test if present).
**Done when:** `pnpm --filter @cs/db test` passes on the worktree DB; `git ls-files --eol | grep crlf` empty.

### Task 3: Labels, wording, glossary

**Goal:** the new types read well everywhere.
**Files:** `packages/email/src/labels.ts`, `packages/engine/src/briefs/evidence.ts`, `packages/core/src/help/glossary.ts`, `apps/web/src/lib/labels.ts` (if change types are labelled there), `brief-report`'s `topicOf`/`GROUP_PHRASE` (if merged), help guides in `docs/help/pages/` that list change types; `docs/copy/signoff.json` via `pnpm copy:review` (owner signs later).

**Interfaces / decided copy:**
- `CHANGE_LABELS`: `status_change: 'opening status change'`, `profile_change: 'profile change'`, `audience_growth: 'audience growth'`.
- `export const GBP_STATUS_PHRASE: Record<string, string> = { closed_forever: 'permanently closed', temporarily_closed: 'temporarily closed', open: 'open' }` in `briefs/evidence.ts`; evidence text for `status_change` renders `status: <phrase>` (`open` for any transient value).
- Writer rule (append to `EVIDENCE_WORDING`): `'For an opening status change, say the business is "listed as permanently closed" or "listed as temporarily closed" on Google; never say it went out of business or why.'`
- Glossary: **Opening status change** — "Google now lists the business as closed, or open again after being closed." **Profile change** — "The business changed its name, website, opening hours or description on its Google profile." **Audience growth** — "The business's Facebook Page gained a large share of likes in about four weeks."

**Tests:** labels test: every `CHANGE_TYPES` key has a `CHANGE_LABELS` entry; evidence test: a `status_change` before/after renders "permanently closed"; glossary tests pass.
**Done when:** `pnpm --filter @cs/email test`, engine `briefs` tests, `@cs/core` glossary tests pass; `pnpm copy:status` lists the new strings as todo (not failing CI's non-strict run).

### Task 4: GBP differ — status, profile, two-pull hold

**Goal:** D2.
**Files:** modify `packages/engine/src/structured/gbp.ts`; test `packages/engine/src/structured/gbp.test.ts`.
**Interfaces:** `GbpProfile.description?: string | null`; `statusClass(s: string | null | undefined): string | null`; `HELD_GBP: readonly { key: string; value: (p: GbpProfile) => string | null }[]` replacing `HELD_GBP_FIELDS` (keep the export name `HELD_GBP_FIELDS` only if other modules import it — grep).

**Behaviour:**
- `diffGbpProfiles`: status emits `status_change` when `statusClass` differs (`direction` closed if after-class ≠ `open`, reopened if after-class = `open`; `statusBefore/After` raw); `title`, `domain`, `hours`, `description` emit `profile_change` with `field`; description before/after text truncated to 300 chars as `description: …`. Address/category/service/rating unchanged.
- `guardedGbpDiff`: held keys = address, title, domain, status, hours, description; the existing "seen twice, from the last confirmed value" loop runs over `HELD_GBP` value functions:

```ts
const statusClass = (s: string | null | undefined) => (!present(s) ? null : TRANSIENT_STATUS.test(s) ? 'open' : s.toLowerCase());
const text = (f: 'address' | 'title' | 'domain' | 'description') => (p: GbpProfile) => (present(p[f]) ? norm(p[f] as string) : null);
export const HELD_GBP = [
  { key: 'gbp:address', value: text('address') }, { key: 'gbp:title', value: text('title') }, { key: 'gbp:domain', value: text('domain') },
  { key: 'gbp:status', value: (p: GbpProfile) => statusClass(p.currentStatus) }, { key: 'gbp:hours', value: hoursText },
  { key: 'gbp:description', value: text('description') },
] as const;
// heldValue(s, h) = s ? h.value(s.profile) : null; loop body unchanged, `pick(from.profile, after.profile, h.key)`.
```

**Tests (TDD):** `open/close flips never emit`; `closed_forever seen once is held`; `closed_forever seen twice emits status_change direction closed from the last open capture`; `closed → open twice emits reopened`; `missing work_time between closed pulls emits nothing`; `hours change needs two pulls`; `description rewrite emits profile_change truncated to 300`; `title change emits profile_change (was content)`; existing address/rating tests still pass.
**Done when:** `pnpm --filter @cs/engine exec vitest run src/structured/gbp` passes.

### Task 5: Meta page likes — observation + backfill CLI

**Goal:** a `meta_page` reading per Meta capture, live and backfilled.
**Files:** create `packages/collectors/src/ads/meta-page.ts` (+ test); modify `packages/collectors/src/ads/meta.ts`; create `apps/worker/src/cli/meta-page-backfill.ts`, `meta-page-backfill-args.ts` (+ test); worker `package.json` script `meta-page-backfill`.
**Interfaces:**
- `export interface MetaPageReading { pageId: string; pageName: string | null; likes: number }`; `pageReadingFrom(items: unknown[], pageId: string): MetaPageReading | null` — first item whose page id matches (or any item when none carries an id) with a numeric `snapshot.page_like_count`.
- `writeMetaPageObservation(db: Db, c: { competitorId: string; captureId: string; capturedAt: Date }, r: MetaPageReading): Promise<void>` — `observation` `{ kind: 'meta_page', key: pageId, data: r, observedAt: capturedAt }`, `onConflictDoNothing` on `(capture_id, kind, key)`.
- CLI `pnpm --filter @cs/worker meta-page-backfill [--competitor <uuid>] [--dry-run]` — for every ok `meta_ads` capture, read the payload from the object store, write the observation; prints `{ captures, written, skipped }`; idempotent; never creates changes.

**Behaviour:** `collectMetaPage` writes the observation right after `recordVendorCapture` for both vendors. Follow pattern: `rescore` CLI (`rescore-args.ts`).
**Tests:** `apify item yields likes and page name`; `scrapecreators item yields the same reading shape`; `no numeric like count → null`; `second write for the same capture is a no-op`; args test for the CLI.
**Done when:** collectors + worker focused tests pass.

### Task 6: `audience_growth` differ

**Goal:** D3 brief line.
**Files:** create `packages/engine/src/structured/meta-page.ts` (+ test); modify `packages/engine/src/structured/vendor-diff.ts` (meta_ads differ = ads + audience).
**Interfaces:** `diffAudience: SourceDiffer`; constants `AUDIENCE_MIN_PCT = 15`, `AUDIENCE_MIN_GAIN = 50`, `AUDIENCE_WINDOW_DAYS = [21, 35] as const`, `AUDIENCE_TARGET_DAYS = 28`, `AUDIENCE_COOLDOWN_DAYS = 28`. Change: `{ kind: 'modified', blockKey: 'meta:likes:<pageId>', beforeText: 'Facebook Page likes: <n>', afterText: 'Facebook Page likes: <m>', details: { changeType: 'audience_growth', pageId, likesBefore, likesAfter, pct, days }, beforeCaptureId }`.

**Behaviour:**
- Current = this capture's `meta_page` observation (key = page id from the capture URL); base = the page's reading with `observed_at` in [cap − 35 d, cap − 21 d] closest to cap − 28 d.
- Emit iff base > 0, `pct = round1((m − n) / n × 100) ≥ 15`, `m − n ≥ 50`, and no `detected_change` with `details->>'changeType' = 'audience_growth'` and the same `pageId` for this competitor in the last 28 days. Drops never emit.
- `DIFFERS.meta_ads` runs `diffAds` then `diffAudience` and concatenates (return a `DifferResult`).

**Tests (TDD):** `+20 % and +80 likes over 28 d emits`; `+20 % but +30 likes does not`; `+10 % does not`; `no reading 21–35 d back does not`; `a drop does not`; `second rise within 28 d of an emitted one does not`; `picks the reading closest to 28 d`.
**Done when:** engine `structured` focused tests pass.

### Task 7: `get_audience_trend` tool + competitor page stat

**Goal:** D3 trend, web only.
**Files:** create `packages/tools/src/tools/audience.ts`; modify tool registry/index, `tools/schemas.ts`, `packages/tools/src/isolation/fixtures.ts`; modify `apps/web/src/app/(app)/c/[clientId]/competitors/[competitorId]/page.tsx`; help copy for the stat in `apps/web/src/help/copy/`.
**Interfaces:** `get_audience_trend` — `access: 'read'`, `permission: 'read'`, `channels: ['web']`, `feature: 'dashboard'`, input `{ clientId: uuid, competitorId: uuid }`, output `AudienceTrend = z.object({ pages: z.array(z.object({ pageId: z.string(), pageName: z.string().nullable(), points: z.array(z.object({ week: z.string(), likes: z.number().int() })) })) })`. `week` = ISO-week Monday `YYYY-MM-DD` (UTC); newest reading per week; last 52 weeks; pages sorted by latest likes desc.
**Behaviour:** scope like `get_competitor_profile` (`workspaceClient` + `requireTracked`; global `observation` read via `deps.service`). Page: one `Kpi` "Facebook Page likes" (value = latest likes of `pages[0]`, caption = page name, trace = its points via the existing `Kpi` trace) rendered **only when `pages[0].points.length >= 4`**; nothing otherwise. Fetch inside the page's existing `Suspense` pattern.
**Tests (TDD):** tool: `newest reading per ISO week`; `two pages sorted by latest likes, never summed`; `other client's competitor → not_found` (isolation fixture); page/component test: `stat hidden with 3 weekly points, shown with 4`.
**Done when:** `pnpm --filter @cs/tools test` (incl. isolation) and the web focused test pass.

### Task 8: Event ads + `ad_price_extract` stage

**Goal:** D4 and D5 collection side.
**Files:** modify `packages/collectors/src/ads/{meta,upsert}.ts`, `packages/db/src/schema/engine.ts` (`ChangeItem.event?`), `packages/engine/src/structured/ads.ts`; create `packages/engine/src/prices/ad-price-stage.ts` (+ test); modify `packages/engine/src/sweep.ts`, `packages/engine/src/drain.ts`, `apps/worker/src/jobs/engine.ts`.
**Interfaces:**
- `NormalizedAd.event: { name: string; startsAt: string | null } | null` (from `snapshot.event`; Task 0 shape); upsert writes `ad.event`.
- `ChangeItem.event?: { name: string; startsAt: string | null }`; ad item label appends ` — promotes event "<name>" (<YYYY-MM-DD>)` (date omitted when null).
- `AD_PRICE_STAGE = 'ad_price_extract'`, `AD_PRICE_VERSION = 1`, `AD_PRICE_SINCE = new Date('<commit date>T00:00:00Z')`; `extractAdPrices(deps: { db: Db; store: ObjectStore; ai: Ai; packs: PackLoader }, captureId: string): Promise<StageOutcome<PriceRunResult>>`.
- Sweep result `adPrices: string[]` (ok `meta_ads` captures, `captured_at >= AD_PRICE_SINCE`, tracked competitor, not finished, oldest first); drain loop + worker job `engine-ad-price` (`usesAi: true`, `{ captureId }`), pattern `engine-price`.

**Behaviour:**
- Listed ads = external ids from the capture's stored payload `items` → `ad` rows (meta). For each listed ad with `text` and no open span: `pricesInBlock(redactForModel(text, { businessNames }))`; service via `buildPriceQuestions` + `price_block_map` keyed by `sha256Hex(text)` (task `price_decisions`, state `{ competitor, ad_text, source: 'meta_ad' }`); insert spans with `adId`, `trackedPageId: null`. Listed ads with open spans: advance `last_seen_at`/`last_capture_id`. Ads with `ended_capture_id = cap.id`: end open spans.
- Skip when a newer `meta_ads` capture of the same URL already finished this stage (watermark, pattern `extractPrices`). Cap 40 priced ads per capture. Google ads never.
- No `price_change` events.

**Tests (TDD):** `event name and date reach ad.event and the item label`; `null event stays null`; `"$79 AC tune-up" creates one span with ad_id`; `"$20 off any repair" creates none`; `ad ended in this capture ends its span`; `returned ad gets a new span`; `capture before AD_PRICE_SINCE is not swept`; `older capture after a processed newer one is skipped`.
**Done when:** collectors + engine focused tests pass; `pnpm --filter @cs/worker exec tsc --noEmit` clean.

### Task 9: Price readers — shown, not counted

**Goal:** D5 readers + O6.
**Files:** modify `packages/engine/src/prices/tracker.ts`, `packages/tools/src/tools/pricing.ts`, `packages/tools/src/catalog/merge.ts`, `packages/tools/src/tools/schemas.ts` (`PriceMatrixView`), `packages/db/test/isolation-world.ts`, pricing page in `apps/web/src/app/(app)/c/[clientId]/` (find via `PriceMatrixView` import), `packages/demo/src/pricing.ts` only if types break.
**Interfaces:** `PriceNow.source: 'web' | 'meta_ad'`; `PriceNow.url` = page URL, else `metaPageUrl(ad.advertiserId)`. Decided copy: tag text **"From an ad"**.
**Behaviour:** `priceMatrix` left-joins `tracked_page` and `ad`. Every lowest / change-vs-90-days / history computation filters `tracked_page_id IS NOT NULL` (`lowestUsdAt`, `priceHistory`, any `lowestUsd` over `PriceNow[]` — exclude `source === 'meta_ad'`). `catalog/merge.ts` vertical and area merges dedupe open rows by `coalesce(tracked_page_id, ad_id)` instead of `tracked_page_id`. Isolation world gains one ad-sourced `price_point`.
**Tests (TDD):** `ad price listed with source meta_ad and Ad Library url`; `ad price below the web price does not change the cell's lowest or 90-day change`; `priceHistory ignores ad rows`; `vertical merge keeps one open ad row per ad`; page test: `"From an ad" tag on ad rows only`.
**Done when:** tools (incl. isolation) + engine prices + web focused tests pass.

### Task 10: Docs, rescore, wrap

**Files:** `docs/work/phase-18a.md` (Interfaces, rollout steps), help guides touched by Tasks 3/7/9 (`kb:seed` keys unchanged), `docs/OPS.md` (backfill + rescore commands).
- [ ] Rollout lines in the work file: migrate → `meta-page-backfill --dry-run` then real → `rescore --dry-run` then real.
- [ ] `pnpm copy:status` todo list recorded for the owner's sign-off.
- **Done when:** final review runs `pnpm test:affected` + `pnpm --filter @cs/web e2e:affected` (once, per process).
