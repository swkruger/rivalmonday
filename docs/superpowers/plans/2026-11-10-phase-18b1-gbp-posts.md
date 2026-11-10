# Phase 18b-1 — Google posts & offers, GBP profile leftovers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Weekly Google-post pulls per tracked rival (offers → `promo`, others → `content`, prices → tracker "From a Google post"), and
booking-link / attribute / photo-push `profile_change` lines from the GBP data we already pay for.
**Architecture:** New `gbp_posts` source kind using the DataForSEO task route (pattern: jobs); post captures are
`google_business_profile` captures with `url 'gbp:posts'`, diffed by a new differ; a new `post_price_extract` stage mirrors the Meta
ad-price path; leftovers extend `extractGbpProfile` + `guardedGbpDiff`.
**Tech stack:** TypeScript, Drizzle, Vitest, pg-boss worker, Next.js App Router.
**Spec:** `docs/superpowers/specs/2026-11-10-phase-18b1-gbp-posts-design.md` (D1–D8 and Interfaces are binding; read it first).

## Global constraints
- Client text never names the vendor; copy strings exactly as spec § Copy. New strings reach `pnpm copy:review` (no sign-off by agents).
- Vendor calls only via the `DataForSeoClient` (ledger + limiter); scheduling only via `claimDueSources` (`clientWorkAllowed`).
- No new change types, channels or pack version. No model call in the differ. Price extraction rules-only (`pricesInBlock`) + `mapPricedTexts`.
- Model input through `redactForModel`. Event readers keep `retracted_at IS NULL`.
- New table ⇒ `TABLE_CLASS` (`packages/db/test/table-classes.ts`) + isolation-world rows. Never edit applied migrations; migration = next free number (0105 expected).
- Commits end `Co-Authored-By: <your model> <noreply@anthropic.com>`; LF only.
- Tests: implementers run focused tests only (foreground); `test:affected` + `e2e:affected` once at final review.

## Decisions
Spec D1–D8. Plan-level: Task 0 is a **stop point** — if the probe shows > $0.005/post task, or posts carry no stable id and no url, the
controller asks the owner before Task 2.

## File structure
- Create: `packages/db/migrations/0105_gbp_posts.sql` (+ drizzle meta), `packages/collectors/src/gbp/posts.ts` (+ test),
  `packages/engine/src/structured/gbp-posts.ts` (+ test), `packages/engine/src/prices/post-price-stage.ts` (+ test).
- Modify: `packages/db/src/schema/{insights,sources}.ts` (or where `ad` lives), `packages/db/test/table-classes.ts`, isolation world;
  `packages/collectors/src/{sources/kinds.ts,gbp/collect-gbp.ts,index.ts,vendors/fixture-fetch.ts}`; `apps/worker/src/jobs/vendor.ts`;
  `packages/engine/src/structured/{vendor-diff.ts,gbp.ts}`, `packages/engine/src/tag/structured.ts`, `packages/engine/src/drain.ts`,
  `apps/worker/src/{deps.ts,jobs/engine.ts}`; `packages/engine/src/prices/tracker.ts`, `packages/tools/src/tools/{schemas.ts,pricing.ts}`,
  `packages/tools/src/catalog/merge.ts`; web `pricing/price-card.tsx`, `competitors/[competitorId]/sections.tsx`; `docs/OPS.md`.

## Dependencies on in-flight work
None (no other unmerged branches at 2026-11-10). Re-check `git branch --no-merged main` and the last migration number in Task 0.

## Review focus
1. A post with no vendor id whose text is edited → new hash → reported as a new post; acceptable, but the old row must not keep an open price span forever (ended when unlisted).
2. A brief rendered from a pre-18b stored scorecard (no `googlePosts30d`) must still render (Task 8 test).
3. Empty or failed posts task (40102 / vendor error) must not end every post's price span or emit "removed" anything.
4. Old observations without `totalPhotos`/`bookOnlineUrl` must produce no booking/photo change on the first post-deploy pull.
5. Attribute lists that flicker between pulls (one pull drops a group) must not emit removed/added pairs (held two captures; a pull without `attributes` says nothing).
6. `gbp_post_id` price rows must not break the catalog merge, the price matrix "lowest" maths, or `price_point_subject_check` for existing web/ad rows.

---

### Task 0: Pre-flight + vendor probe (controller, stop point)
**Goal:** confirm endpoint paths, post item shape, price per task, and the leftover field names before code.
- [ ] `git fetch && git rebase main`; `git branch --no-merged main`; `ls packages/db/migrations | tail -2` (next free number).
- [ ] Leftover fields, $0: on cs_dev, load 3 recent `google_business_profile` vendor captures (`loadVendorCapturePayload`) and record the
      real keys for photo count, booking link and `attributes.available_attributes` shape. Note them in the work file.
- [ ] Sandbox, $0: `POST https://sandbox.dataforseo.com/v3/business_data/google/my_business_updates/task_post` + `task_get`; save the
      response as fixture `packages/collectors/src/gbp/__fixtures__/posts-task-get.json`.
- [ ] Live, ≤ $0.05: one task for one cs_dev rival with a known `place_id` (owner approved this spend with the plan); read the envelope `cost`.
- [ ] Write the findings (paths, item keys incl. id/offer fields, cost/task) in `docs/work/phase-18b.md` § Status; update spec Interfaces if names differ.
**Done when:** findings recorded; cost ≤ $0.005/task and a stable id-or-url exists, else stop and ask the owner.

### Task 1: Migration + schema
**Goal:** `gbp_post` table, `price_point.gbp_post_id`, `gbp_posts` source rows.
**Files:** migration `0105_gbp_posts.sql` (SQL exactly as spec § Migration; add RLS/grants copied from `ad`'s migration), Drizzle
schema `gbpPost` next to `ad` + `pricePoint.gbpPostId` + the new indexes/check, `table-classes.ts` (`gbp_post: 'global_public'`),
isolation-world rows (one `gbp_post` + one post-sourced `price_point`).
**Interfaces:** `gbpPost` Drizzle table with the spec columns (camelCase); `pricePoint.gbpPostId: uuid | null`.
**Tests (first):** `packages/db` schema test — inserting a `price_point` with both `ad_id` and `gbp_post_id` fails `price_point_subject_check`;
one with only `gbp_post_id` succeeds; the second open span with identical (post, vertical, service, unit, qualifier, amount) hits
`price_point_post_open_unique`; `rls-sweep` and `table-classes` tests pass with the new table.
**Done when:** `pnpm --filter @cs/db exec vitest run src/rls-sweep.test.ts src/isolation-world.test.ts <new test>` green; `pnpm --filter @cs/db exec tsc --noEmit`.

### Task 2: Posts collector
**Goal:** post tasks out, ready tasks in → capture + observations + `gbp_post` upsert.
**Files:** create `packages/collectors/src/gbp/posts.ts` + `posts.test.ts`; modify `sources/kinds.ts` (`'gbp_posts'`), `index.ts` exports,
`vendors/fixture-fetch.ts` (canned `my_business_updates` task_post/tasks_ready/task_get for rehearsal, from the Task 0 fixture).
**Interfaces (produces):** `GBP_POSTS_URL = 'gbp:posts'`; `parseGbpPost`, `GbpPost`, `postGbpPostTasks`, `collectReadyGbpPosts` exactly as spec.
**Behaviour:** `postId` fallback = first 32 hex of `sha256Hex(url ?? text)`; `vendor_task.kind 'google_posts'`; keyword `place_id:` first, else `cid:`,
else skipped; upsert `gbp_post` on `(competitor_id, external_id)`: insert sets first_*; conflict updates `text,url,button_url,is_offer,offer_*,last_capture_id,last_seen_at`
and clears `ended_*`; posts not listed in a **non-empty ok** capture get `ended_capture_id/ended_at`. A 40102 task → ok capture with `[]`, no ending.
**Follow pattern:** `jobs/post.ts`, `jobs/collect.ts`, `ads/upsert.ts`.
**Tests (first):** `parseGbpPost` on the fixture (id, text, postedAt ISO, offer flag, offerEnd); no-id post hashes url; no id + no text → null;
`postGbpPostTasks` sends `tag: competitorId`, skips competitors without place/cid, records `vendor_task` rows; `collectReadyGbpPosts` writes one
capture with `url 'gbp:posts'`, N observations `kind 'gbp_post'`, upserts rows; a second capture missing a post ends it; an empty (40102) capture ends none.
**Done when:** `pnpm --filter @cs/collectors exec vitest run src/gbp/posts.test.ts` green; tsc clean.

### Task 3: Worker wiring
**Goal:** `gbp_posts` sources are posted in batch and collected on the vendor poll.
**Files:** `apps/worker/src/jobs/vendor.ts` (+ test); `packages/collectors/src/local/self.ts` (`SELF_SOURCES` + `'gbp_posts'`), `sources/due.ts` (self literal + comment) (+ `due.test.ts`).
**Behaviour:** add `'gbp_posts'` to the batch set; claimed rows → load `place_id/cid` → `postGbpPostTasks`; whole-batch `VendorError` →
`releaseSources(…, 'post_failed')`; skipped competitors → `markSourceResult(…, 'skipped')`; `collectReadyGbpPosts` runs beside `collectReadyJobs`
and its counts join the `[vendor-poll]` log line.
**Tests (first):** vendor job test — a due `gbp_posts` source posts one task with the competitor tag; a thrown `VendorError` releases it to due-now;
a competitor without place/cid is marked `skipped`; the poll calls `collectReadyGbpPosts`; `claimDueSources` claims a self business's `gbp_posts` row (active client) and not a prospect's.
**Done when:** `pnpm --filter @cs/worker exec vitest run src/jobs/vendor.test.ts` green.

### Task 4: Posts differ + summaries
**Goal:** new posts → `promo` / `content` changes.
**Files:** create `packages/engine/src/structured/gbp-posts.ts` + test; modify `vendor-diff.ts` (dispatch by `cap.url === GBP_POSTS_URL`),
`tag/structured.ts` (summary copy), and whatever maps `details.field 'post'` service mapping in the tag stage (a post maps services like an ad).
**Interfaces:** `diffGbpPosts: SourceDiffer`; `POST_MAX_AGE_DAYS = 21`; `POST_MAX_SINGLE = 5`; details per spec.
**Behaviour:** spec § Differ. Offer = `post.offer || pricesInBlock(text).length > 0 || PROMO.test(text)`. `diffGbp` keeps ignoring `url 'gbp:posts'` captures.
**Tests (first):** first posts capture → `[]` (baseline handled by `diffVendorCapture`; assert via `diffVendorCapture`); a post seen before → no change;
new "Spring tune-up $79" → `promo`; a self-only competitor's new post → `[]`; new "We're hiring!" plain → `content`; post dated 30 days before capture → skipped; 7 new posts → 5 singles + 1
`gbp_post:more` with `count 2`; a GBP-info capture still goes to `diffGbp`; summaries equal the spec strings (e.g. `Posted an offer on Google: "Spring tune-up $79"`).
**Done when:** `pnpm --filter @cs/engine exec vitest run src/structured/gbp-posts.test.ts src/structured/vendor-diff.test.ts src/tag` green.

### Task 5: Profile leftovers
**Goal:** booking link, attributes and photo push as `profile_change`.
**Files:** `packages/collectors/src/gbp/collect-gbp.ts` (+ test), `packages/engine/src/structured/gbp.ts` (+ `gbp.test.ts`), `tag/structured.ts`.
**Interfaces:** `GbpProfile` (both copies) gains `totalPhotos: number | null`, `bookOnlineUrl: string | null`; `GbpSnapshot` gains `capturedAt: Date`;
`PHOTO_PUSH_MIN = 20`, window 21–35 days; `humanizeAttribute(name: string): string` exported from `gbp.ts`.
**Behaviour:** spec § Profile leftovers. Booking value: `null` when the field is absent from the payload, `'none'` when present but empty, else
lowercased host+path. Attributes value: `null` when `attributes` absent; sorted `group/name` of `available_attributes`. Emit per added/removed
attribute from the held "from" snapshot (same held logic as other `HELD_GBP` keys). Photo push not held; uses `capturedAt`.
**Tests (first):** extractor reads the Task 0 field names; old profile without `bookOnlineUrl` + new with one → nothing; booking added then seen twice →
one `profile_change field 'booking'` `kind 'added'`; attribute seen once → held; seen twice → `added` with label "online estimates" style humanised;
a pull with no `attributes` between two equal pulls → nothing; photos 100 → 125 over 28 days → `photos` change, 100 → 110 → nothing, no 21–35-day
base → nothing; scored `profile_change` from these stays < pack `routing.alert` (70) with default size (assert via the scoring helper).
**Done when:** `pnpm --filter @cs/engine exec vitest run src/structured/gbp.test.ts src/tag` and `pnpm --filter @cs/collectors exec vitest run src/gbp` green.

### Task 6: Post price stage
**Goal:** prices in posts → `price_point` spans with `gbp_post_id`.
**Files:** create `packages/engine/src/prices/post-price-stage.ts` + test; modify `engine/src/drain.ts`, `apps/worker/src/deps.ts`, `apps/worker/src/jobs/engine.ts` (+ their tests).
**Interfaces:** `POST_PRICE_STAGE = 'post_price_extract'`, `POST_PRICE_VERSION = 1`, `POST_PRICE_SINCE = new Date('<deploy date, set at merge>')`,
`POST_PRICE_MAX = 20`; `extractPostPrices(deps: { db; store; ai; packs }, captureId: string): Promise<StageOutcome<PriceRunResult>>`; worker dep
`extractPostPrices(captureId): Promise<{ ran: boolean; points: number; ended: number }>`.
**Behaviour:** spec § Prices; follow the Meta path of `extractAdPrices` (watermark per competitor+url, `competitorVerticals`, redacted state with
`source: 'gbp_post'`). End spans for posts ended by this capture and for open spans whose `offer_end < capturedAt`. Captures before `POST_PRICE_SINCE` skipped.
**Tests (first):** priced offer post → one span per mapped vertical with `gbp_post_id`, `promo true`; second capture listing it → `last_seen_at` advances,
no new row; capture where it is unlisted (non-empty) → span ended; empty capture → nothing ended; `offer_end` passed → ended; older capture than the
watermark → skipped; non-posts capture → throws; drain/engine job call it only for `url 'gbp:posts'` captures.
**Done when:** `pnpm --filter @cs/engine exec vitest run src/prices src/drain.test.ts` and `pnpm --filter @cs/worker exec vitest run src/jobs/engine.test.ts` green.

### Task 7: Tracker, tools, UI tag, merge, docs
**Goal:** post prices shown "From a Google post", never counted; merges safe; runbook updated.
**Files:** `packages/engine/src/prices/tracker.ts`, `packages/tools/src/tools/{schemas.ts,pricing.ts}`, `packages/tools/src/catalog/merge.ts`,
`apps/web/.../pricing/price-card.tsx`, `apps/web/.../competitors/[competitorId]/sections.tsx`, `docs/OPS.md` (new § "Google posts (18b-1)": source,
cost, how to check a run, `POST_PRICE_SINCE`), `packages/demo` only if its price seeds need the new enum (tsc tells).
**Behaviour:** `PriceNow.source` gains `'gbp_post'` (from `gbpPostId`), link = `gbp_post.url`; every place that excludes `meta_ad` from lowest/90-day/history
also excludes `gbp_post` (grep `'meta_ad'`); Promo chip counts it; UI tag "From a Google post" linking the post url (external, `rel="noopener"`) like the
"From an ad" tag; merge SQL uses `coalesce(tracked_page_id, ad_id, gbp_post_id)` at all three sites.
**Tests (first):** tracker returns `source 'gbp_post'` with the post url; `lowestUsd` ignores a cheaper `gbp_post` price; pricing tool schema accepts it;
merge test with a post-sourced span dedupes like an ad span; web component test (or E2E affected) renders the tag text.
**Done when:** `pnpm --filter @cs/engine exec vitest run src/prices`, `pnpm --filter @cs/tools exec vitest run src/tools/pricing src/catalog`,
`pnpm --filter web exec tsc --noEmit`, `pnpm design:lint` (if present) green; `pnpm copy:status` lists the new strings as unsigned.

### Task 8: Scorecard posts metric (D9)
**Goal:** "Google posts (30 days)" column, you vs each rival, in the brief scorecard.
**Files:** `packages/engine/src/briefs/scorecard.ts` (+ test), `packages/engine/src/structured/gbp-posts.ts` (`postCounts30d`), every scorecard row
renderer (grep `metaAdsActive` in `packages/email`, `packages/engine/src/briefs` PDF, `apps/web` brief page) + their label maps.
**Interfaces:** `ScorecardMetric` + `'googlePosts30d'`; `postCounts30d(db: Db, competitorIds: string[], now: Date): Promise<Map<string, number | null>>`
(null when the business has no ok `url 'gbp:posts'` capture; count of `gbp_post` with `coalesce(posted_at, first_seen_at) >= now − 30 d`).
**Behaviour:** rows only (tiles unchanged, length 4); evidence of the newest posts capture per business added after GBP evidence, within `SCORECARD_EVIDENCE_CAP`;
a stored scorecard without the key still parses and renders (column shows not-measured).
**Tests (first):** you 3 / rival 0 / unchecked rival null; a post 31 days old not counted; null `posted_at` counted by `first_seen_at`; old stored scorecard JSON
(no `googlePosts30d`) parses; email/PDF/web renderers show "Google posts (30 days)" with the not-measured mark for null.
**Done when:** `pnpm --filter @cs/engine exec vitest run src/briefs` + the touched email/web tests green; `pnpm --filter @cs/email` previews render.

### Final review (controller)
`pnpm test:affected` + `pnpm e2e:affected` once; top-model whole-branch review; one fix wave. Work file: owner steps (migrate 0105 → deploy worker
then web; first posts pull on staging; check one `promo` post and a "From a Google post" price; `pnpm copy:review`). Backlog: Q&A,
News, Tripadvisor/Trustpilot (18d), 18b-2 spec.
