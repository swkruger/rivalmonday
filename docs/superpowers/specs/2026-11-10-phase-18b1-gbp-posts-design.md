# Phase 18b-1 — Google posts & offers, GBP profile leftovers (design)

**Date:** 2026-11-10 · **Branch:** `phase-18b` · **Brief:** `docs/work/phase-18b.md`
**Scope source:** core spec §4.2 (GBP posts, weekly, DataForSEO Business Data, never built), §4.4 (typed observations + evidence),
§6.1 (structured diffs, 10-min settle), §6.2/§6.3 (types, scoring), §6.6 (price time series), §1.5 rules 1–2.
This doc holds **new decisions and interfaces only**; everything else follows the core spec and the 18a specs.

## Intent
Two Google signals a local-service owner cares about and we don't report yet:
1. **A rival's Google posts and offers.** "Spring tune-up $79 this month" is posted on the Google profile, not on the
   website or in ads. Offers should reach the brief; ordinary posts stay in the feed only.
2. **Profile details we already pay for and ignore** (in the `my_business_info` payload): booking link, attributes
   ("offers online estimates", "veteran-owned"), photo count.

**Anti-goals:** no false alert from one vendor glitch (two-capture confirm, as 18a-1); no back-catalogue flood on the
first pull (silent baseline + post-date cutoff); client text never names the vendor; nothing usage-billed.

## Decisions (owner chose "as recommended", 2026-11-10)
| # | Decision |
|---|---|
| D1 | **Split:** 18b-1 = GBP posts/offers + profile leftovers + Task 0 price probe. **18b-2** (later, own spec) = organic SERP + AI Overview (reuse `client.rank_keywords`, Sunday scan) and LSA/Google Guaranteed (badge + brief line only, after a reliable source is shown). Out of 18b: Google Q&A, News, Tripadvisor/Trustpilot (backlog; revisit with 18d). |
| D2 | **Cadence:** posts pulled **weekly** per tracked rival (new source kind `gbp_posts`, own `competitor_source` row, 7-day `next_due_at`). If the Task 0 probe shows > $0.005/task, stop and ask the owner (fallback: weekly for the Top-rival tier, monthly for others). |
| D3 | **Self posts too (owner, 2026-11-10):** the client's own business is pulled weekly like rivals (`gbp_posts` joins `SELF_SOURCES` and the self literal in `claimDueSources`). Self posts make no events and no prices (the differ and price stage skip a competitor that is only a client's self business, as other self captures do). |
| D9 | **Posts metric (owner, 2026-11-10):** the brief scorecard gains row metric `googlePosts30d` = Google posts dated (else first seen) in the last 30 days, per business incl. you. `null` until a posts capture exists for that business (never 0). Rows only, not a tile (tiles stay 4). Shown wherever scorecard rows render (app brief, email, PDF); posts captures' evidence joins `evidenceIds`. |
| D4 | **Posts → events:** a new post is an `offer` post when `pricesInBlock` finds a price, or its text matches `PROMO` (`engine/src/prices/observe.ts`, the rule that sets `price_point.promo`). Offer → `promo`; other → `content` (pack weight 0.2, so it archives and stays in the feed). Existing change types: **no pack bump**. |
| D5 | **Post prices → `price_point`** with new FK `gbp_post_id`, tagged **"From a Google post"**. Like ad prices (18a-1 O6), they are **shown, not counted** in a lowest price, a 90-day change or a history, and they count towards the Promo chip. Rules-only extraction (`pricesInBlock`) + `mapPricedTexts` service mapping. |
| D6 | **Channel:** post captures use `capture.source = 'google_business_profile'` with `capture.url = 'gbp:posts'`, so channel labels, notification preferences and `CHANNELS` are unchanged ("Google Business Profile"). `diffGbp` already filters on `url IS NULL`; the differ dispatches posts captures by url. |
| D7 | **Profile leftovers become `profile_change` lines** (brief-only): booking link added/removed/changed, attributes added/removed, photo push (≥ 20 new photos within 21–35 days). All through the two-capture hold. Q&A count not used. |
| D8 | **First pull is a silent baseline** (as every vendor source), and a post dated more than **21 days** before the capture never makes an event (late-listed old posts). |

## Interfaces (binding)

### Collector (`packages/collectors/src/gbp/posts.ts`, new)
- Endpoint family (Task 0 verifies exact paths and item shape): `POST /business_data/google/my_business_updates/task_post`,
  `GET …/tasks_ready`, `GET …/task_get/{id}`. Task body `{ keyword: 'place_id:<id>' | 'cid:<cid>', ...DFS_US, depth: 20, tag: competitorId }`.
- `postGbpPostTasks(deps: { db; dfs }, competitors: { id: string; placeId: string | null; cid: string | null }[], chunkSize = 100): Promise<{ posted: number; postedIds: string[]; failedIds: string[] }>`
  — mirror `jobs/post.ts`; `vendor_task.kind = 'google_posts'`; competitors with neither id are skipped (source result `skipped`).
- `collectReadyGbpPosts(deps: { db; store; dfs }): Promise<{ collected: number; failed: number; posts: number }>` — mirror
  `jobs/collect.ts` via `collectReadyTasks`; writes one capture (`source 'google_business_profile'`, `url 'gbp:posts'`,
  `collectorVersion DFS_COLLECTOR_VERSION`), one `observation` per post (`kind 'gbp_post'`, `key = postId`), and upserts `gbp_post`.
- `parseGbpPost(raw: unknown): GbpPost | null` (pure):
  ```ts
  export interface GbpPost { postId: string; text: string | null; url: string | null; buttonUrl: string | null; postedAt: string | null }
  ```
  Item (Task 0, sandbox + live 2026-11-10): `type 'google_business_post'`, `post_text`, `url`, `images_url`, `post_date`, `timestamp`,
  `links[{title,url}]`; **no id field and no offer marker**. `postId` = the `lpsid` query parameter of `url` (unique per post), else first
  32 hex of `sha256Hex(url ?? post_text)`; null when there's neither. `postedAt` = `parseDfsTimestamp(timestamp)`; `buttonUrl` = `links[0].url`.
- `SOURCE_KINDS` gains `'gbp_posts'`; `ensureCompetitorSources` creates it for new competitors; the migration backfills rows
  for existing competitors (self businesses included) that have a `gbp` row. `SELF_SOURCES` and the `claimDueSources` self literal gain `'gbp_posts'`.
- Worker `apps/worker/src/jobs/vendor.ts`: `gbp_posts` claimed sources go to `postGbpPostTasks` (batch, like jobs, with
  `releaseSources` on a whole-batch failure); `collectReadyGbpPosts` runs on the same poll as `collectReadyJobs`.

### Migration `0105_gbp_posts` (next free number at execution time)
```sql
CREATE TABLE gbp_post (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id uuid NOT NULL REFERENCES competitor(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  text text, url text, button_url text,
  posted_at timestamptz,
  first_capture_id uuid NOT NULL REFERENCES capture(id),
  last_capture_id uuid NOT NULL REFERENCES capture(id),
  first_seen_at timestamptz NOT NULL, last_seen_at timestamptz NOT NULL,
  ended_capture_id uuid REFERENCES capture(id), ended_at timestamptz,
  CONSTRAINT gbp_post_external_unique UNIQUE (competitor_id, external_id)
);
CREATE INDEX gbp_post_competitor_idx ON gbp_post (competitor_id) WHERE ended_at IS NULL;
-- RLS/grants: identical to `ad` (global public competitor fact; cs_worker writes, cs_web reads through tools).
ALTER TABLE price_point ADD COLUMN gbp_post_id uuid REFERENCES gbp_post(id) ON DELETE CASCADE;
ALTER TABLE price_point DROP CONSTRAINT price_point_subject_check;
ALTER TABLE price_point ADD CONSTRAINT price_point_subject_check
  CHECK (num_nonnulls(tracked_page_id, ad_id, gbp_post_id) = 1);
CREATE UNIQUE INDEX price_point_post_open_unique ON price_point (gbp_post_id, vertical_id, service_id, unit, qualifier, amount)
  WHERE ended_at IS NULL AND gbp_post_id IS NOT NULL;
CREATE INDEX price_point_post_idx ON price_point (gbp_post_id) WHERE gbp_post_id IS NOT NULL;
INSERT INTO competitor_source (competitor_id, source)
  SELECT competitor_id, 'gbp_posts' FROM competitor_source WHERE source = 'gbp' ON CONFLICT DO NOTHING;
```
`TABLE_CLASS` gets `gbp_post` (same class as `ad`) + isolation-world rows. Catalog merge (`tools/catalog/merge.ts`) dedupes
`gbp_post_id` spans the same way it dedupes `ad_id` spans.

### Differ (`packages/engine/src/structured/gbp-posts.ts`, new)
- `diffGbpPosts: SourceDiffer`. `vendor-diff.ts` dispatch: `google_business_profile` + `cap.url === GBP_POSTS_URL` → `diffGbpPosts`, else `diffGbp`.
- New = an observation key in this capture that no earlier posts capture of this competitor listed (no lookback cap: posts are permanent ids).
- Skip posts with `postedAt` < `capturedAt − 21 d` (D8); null `postedAt` counts as new.
- One change per new post, `blockKey 'gbp_post:<postId>'`, `kind 'added'`, `afterText` = post text (≤ 300 chars),
  `details { changeType: 'promo' | 'content', field: 'post', postId, offer: boolean, url }`. More than 5 new posts in one
  capture → the 5 newest as single changes plus one aggregate `content` change `blockKey 'gbp_post:more'` with `count`.
- `promo` vs `content`: D4, decided here (no model call). Removed posts are not reported.

### Profile leftovers (`collect-gbp.ts` + `structured/gbp.ts`)
- `GbpProfile` gains `totalPhotos: number | null`, `bookOnlineUrl: string | null` (Task 0 confirms field names against stored cs_dev
  captures; `attributes` is already extracted). Old observations lack them → compared only when both pulls carry them (existing rule).
- `HELD_GBP` gains `gbp:booking` (normalised host+path of `bookOnlineUrl`; absent vs present counts as a value: `'none'` when the
  field is present and empty) and `gbp:attributes` (sorted, joined list of `available_attributes` `group/name`).
- `diffGbpProfiles` emits: booking → `profile_change` `field 'booking'` (`kind 'added' | 'removed' | 'modified'`);
  attributes → one `profile_change` per added/removed attribute, `field 'attribute'`, `blockKey 'gbp:attribute:<group/name>'`.
- Photo push: `GbpSnapshot` gains `capturedAt`; `diffGbp` may look through the existing 6 candidates. Emit `profile_change`
  `field 'photos'`, `blockKey 'gbp:photos'`, `details.after` = month bucket (novelty), when `after.totalPhotos − base.totalPhotos ≥ 20`
  where `base` is the newest snapshot captured 21–35 days before `after`. No base → nothing. Not held (counts don't flicker; a drop is ignored).

### Prices (`packages/engine/src/prices/post-price-stage.ts`, new)
- `extractPostPrices(deps, captureId)`, stage `post_price_extract` v1, `POST_PRICE_SINCE` = deploy date. Mirror the Meta path of
  `extractAdPrices`: watermark, listed posts without an open span priced, open spans advanced; spans end when a non-empty capture
  no longer lists the post (no vendor offer dates exist). Max 20 priced posts per capture. Model state `source: 'gbp_post'`.
- Run from the engine drain (`engine/src/drain.ts`) and the worker engine job (`apps/worker/src/jobs/engine.ts`, `deps.ts`) next to `extractAdPrices`, for posts captures only.
- `PriceNow.source` and `PriceNowView.source` gain `'gbp_post'` (describe: "a price in one of their Google posts"); tracker
  derives it from `gbpPostId`, link = `gbp_post.url`; `lowestUsd`, 90-day change and history skip it (as `meta_ad`).

### Copy (decided; goes to `pnpm copy:review`)
- Price tag: **"From a Google post"**.
- Summaries (`tag/structured.ts`): `promo` post → `Posted an offer on Google: "<text ≤ 80>"`; `content` post → `Posted on Google: "<text ≤ 80>"`;
  aggregate → `Posted <n> updates on Google`; booking added → `Added an online booking link to its Google profile`;
  removed → `Removed the online booking link from its Google profile`; changed → `Changed the online booking link on its Google profile`;
  attribute added → `Google profile now shows "<label>"`; removed → `Google profile no longer shows "<label>"`;
  photos → `Added <n> photos to its Google profile in <d> days`.
- `<label>`: humanised attribute name (`has_wheelchair_accessible_entrance` → "wheelchair accessible entrance"; strip leading `has_`/`is_`/`offers_` → "offers" kept as a word). Help glossary: no new term.

### Scorecard (`packages/engine/src/briefs/scorecard.ts`)
- `ScorecardMetric` gains `'googlePosts30d'`; `Scorecard.rows[].values` must still parse stored scorecards that lack it (use a partial record or a
  default of `null`; zod 4 enum records are exhaustive). Helper `postCounts30d(db, competitorIds, now): Map<string, number | null>` in `engine/src/structured/gbp-posts.ts`.
- Column label: **"Google posts (30 days)"**; `null` renders as the existing not-measured mark.

## Cost
Measured **$0.003 per post task** (live, 2026-11-10) → ≤ 5 rivals + you ≈ $0.018/client/week on top of ≈ $0.54 today. Leftovers: $0.
Task 0: one sandbox call ($0) + one live task on one cs_dev rival (≤ $0.05), reported before anything else is built.

## Left to the builder
Exact vendor field names (Task 0), test fixtures, worker poll wiring, label humaniser details.

## Out / backlog
Q&A; News; Tripadvisor/Trustpilot (with 18d); 18b-2 organic/AI Overview/LSA (own spec).
