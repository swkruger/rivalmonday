# Phase 3b — Structured Sources, Cross-Channel Merge & Moves Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Feed every structured source — Google/Meta ads, Google Business Profile, Google reviews, Google Jobs and geo-grid rank scans — into the same `detected_change` → `event` → `event_score` pipeline as the web, merge the same offer seen in several channels into one event, and detect the seven spec §6.4 competitor moves nightly per client.

**Architecture:** Structured diffs are plain set/threshold comparisons (no model calls) in a new `vendor_diff` stage keyed by vendor capture, plus a tenant-private `rank_diff` stage keyed by rank scan; both write `detected_change` rows whose `details.changeType` fixes the event type. The existing `tag` stage dispatches structured changes to a new path that asks the `DecisionProvider` only for service mapping (and "is this ad an offer?"), then a shared merge step attaches the change to an existing event when the facts are identical or a Noul "same offer?" says yes. Scoring gains size curves for the new types, tenant scoping for rank events and an alert age cap; a nightly moves stage evaluates seven pure rule functions per client × competitor and keeps `move` / `move_event` rows with an emerging → active → fading → closed lifecycle.

**Tech Stack:** As Phase 3a (TypeScript, Drizzle 0.44 + Neon Postgres 18 with pgvector, pg-boss 10.4, vitest, `@cs/ai` OpenRouter + Jev). No new dependencies.

**Spec:** [core platform spec](../specs/2026-09-29-core-platform-design.md) §4.2–§4.5, §6.1 (structured sources), §6.2 (cross-channel merge), §6.3 (size curves), §6.4 (moves), §7.3 · **Roadmap:** [2026-09-29-roadmap.md](2026-09-29-roadmap.md) · **Previous plan (patterns to copy):** [3a](2026-10-01-phase-3a-web-changes-to-scored-events.md) — its "Phase 3 overview" table defines this plan's scope.

**Prerequisite:** Phase 3a merged (`main` at `06f0cb4` or later; `cs_dev` migrated to `0016`). `.env` has `OPENROUTER_API_KEY`.

---

## Decisions taken in this plan (review these first)

The spec leaves these open; each is the smallest choice that keeps the pipeline honest. The user should confirm or correct them before execution starts.

1. **New change type `rank_change`.** Spec §6.3 sizes "rank delta" events but §6.2's type list has no rank type. `CHANGE_TYPES` gains `rank_change` (pack weight 0.5).
2. **Rank events are tenant-private.** `rank_snapshot` is tenant data (a client's keywords reveal its strategy — Phase 2b decision), so rank changes and rank events carry `agency_id`/`client_id`, are visible to and scored for that one client only, and are never merged.
3. **One change per capture for ads and jobs.** Ads started / ads stopped / new job postings in one vendor capture form one detected change whose `details.count` drives the size curve ("count of new ads", spec §6.3) — a launch of 15 creatives is one event, not 15 alerts.
4. **What "ad started / stopped" means.** Started = first seen in this capture *and* the vendor's start date is within 30 days (an old creative newly in view is not news) *and* not first seen already inactive. Stopped = ended by this capture (new column `ad.ended_capture_id`). Google creatives end when *we* have not seen them for 21 days (our `last_seen_at`, the 2b carry-over) or the vendor's `last_shown` is older than 14 days.
5. **Not events:** removed job postings (postings flicker between pulls), edited reviews (kept as `review_revision` history for 3c's themes), GBP attributes and the open/closed-now status.
6. **Vendor captures are diffed only after a 10-minute settle delay** — collectors write ad/review/job/GBP rows *after* the capture row, so an immediate diff would see nothing.
7. **Detection thresholds are engine constants** (structured detection is global, per competitor, so it can't follow one client's vertical): rating moves ≥ 0.1, review spike z ≥ 2 with ≥ 4 reviews, rank average moves ≥ 3 positions or top-3 share moves ≥ 25 points. **Scoring curves and move thresholds live in the vertical packs** (spec §6.3/§10.5).
8. **Merge rules.** Only `price_change`, `promo`, `ad_started`, `new_service` merge, within ±14 days, same competitor and same tenant scope. Identical non-empty numeric facts merge without a model call (fixes "same price in two blocks → two events"); two price changes with *different* facts never merge (a second price cut is news); otherwise up to 3 candidates sharing a service get one Noul "same offer?" call, threshold 0.8. A merged-into event keeps its existing scores (no re-score).
9. **Alert age cap.** An event older than the pack's `alert_max_age_days` (7) when scored can be at most `brief` — closes the 3a carry-over "routing ignores event age" before Phase 4 alerts.
10. **Moves.** Status: `emerging` → `active` (held ≥ 7 days or confidence ≥ 0.7) → `fading` (rule no longer holds, or newest evidence > 30 days old) → closed (`closed_at`, rule not held for 30 days). Confidence = 0.4 + 0.15 × extra events + 0.15 × extra channels, capped at 1. A move needs ≥ 1 supporting event (no evidence, no claim). Territory matching uses the client's ZIPs and an optional `serviceArea.towns` list. The reputation-slump "complaint-theme spike" half waits for 3c themes.
11. **Carry-over taken now:** Google advertiser-id pinning + our-own activity; several Meta pages per competitor; edited reviews; same price in two blocks; routing ignores event age; sweep enqueue dedupe (pg-boss `short` policy + `singletonKey`); `engine-once` argument validation and exit code. **Deferred to 3c** (web-diff quality, not structured sources): volatile learning on alignment results, churn-guard gaps, camelCase consent tokens, `extractZips` accuracy, score-sweep backoff, stage-version retraction.

---

## Global Constraints

- All Phase 1, 2a, 2b and 3a Global Constraints apply: tenant isolation below the model, service-role-only writes to global tables, never edit applied migrations (`cs_dev` is at `0016`; this plan adds `0017`–`0021`), Neon `cs_test` for tests via the repo-root `.env`, commit trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`, never stage `.env`, `.claude/`, `App/`, `.superpowers/`.
- **Stages are idempotent** (spec §6): claim via `stage_run (stage, stage_version, subject_id)` using `runStage` from `packages/engine/src/stage.ts`; never call a model inside a DB transaction; outputs and the `done` marker commit together; `MAX_STAGE_ATTEMPTS = 5`.
- **Structured diffs never call a model.** Only tagging (service mapping, ad offer) and merging (same offer?) do, through `ai.decide('decisions', …)` with `{ agencyId: null, clientId: null }` scope for global changes.
- **No PII to any model** (spec §4.5): every text sent in a decision state or embedding goes through `redactContactInfo` (from `@cs/collectors`). Review text never enters a structured change, summary or model state — review-velocity changes carry counts and averages only.
- **Tenant data never lands in a global row.** Rank changes/events always carry `agency_id` + `client_id` (DB CHECK constraints enforce the pair); RLS hides them from every other tenant; scoring, novelty and merging filter by tenant.
- **Model routing lives only in `packages/ai/config/ai.yaml`** — tasks `decisions` and `embeddings` (unchanged).
- **Weights, curves and move thresholds live in the vertical pack YAML** (spec §6.3, §10.5); every `event_score` stores its full factor breakdown (now including `staleCap`).
- **Any numeric change is always flagged** (spec §6.1): money facts in an ad force `offer: true`; money changes are never masked.
- **Never point the web crawler at real competitors** until `https://rivalmonday.com/bot` exists. `collect-once --vendors` calls vendor APIs only.
- **Run the full test suite in the foreground** (`pnpm typecheck && pnpm test`, ~8 minutes); a backgrounded run collides with the next on the shared `cs_test`. Neon occasionally times out (`ETIMEDOUT`) — re-run once.
- **Dates in tests:** `day(n)` from `packages/engine/test/seed.ts` is 2026-10-01 06:00 UTC + n days — after "now" while this plan is executed. Stages that compare against the clock take an explicit `now` option; pass it in tests.

## Review Focus

1. **The first vendor capture of a source** (onboarding, the first per-page Meta capture after Task 4, the first Google pull after pinning advertisers) — must be a silent baseline, never "40 ads started". Pinned in Task 6 (baseline + per-page scoping).
2. **A vendor capture swept before its collector finished writing rows** — must not be diffed (and marked done) as "nothing changed". Pinned in Task 6 (settle delay: the stage refuses without claiming, the sweep skips it).
3. **A rank change for client A1 when agency B's client B1 tracks the same competitor** — B1 must never see it, be scored for it, or have a global event merged with it. Pinned in Task 3 (RLS), Task 9 (diff), Task 11 (merge scope) and Task 12 (scoring + novelty).
4. **A franchise competitor with two Meta pages where one page's pull fails** — the successful page must not end the other page's ads. Pinned in Task 4.
5. **The same price in two blocks of one page, and the same offer on the website and in a Meta ad** — one event with two evidence links; a *second, different* price cut stays a separate event. Pinned in Task 11.

---

## File map

```
packages/core/src/domain.ts                     CHANGE_TYPES + rank_change, CHANNELS (Task 1)
packages/verticals/src/schema.ts, packs/*.yaml  size curves, alert_max_age_days, move thresholds (Task 1)
packages/db/src/schema/tenancy.ts               competitor.meta_page_ids/google_advertiser_ids; ServiceArea.towns (Tasks 2, 4)
packages/db/src/schema/sources.ts               ad.ended_capture_id, review_revision (Task 2)
packages/db/src/schema/client-intel.ts          rank_scan, rank_snapshot.scan_id (Task 2)
packages/db/src/schema/engine.ts                ChangeDetails; detected_change/event tenant + details; move, move_event (Task 3); ScoreFactors.staleCap (Task 12)
packages/db/migrations/0017_vendor_history.sql (gen + backfill), 0018_vendor_history_rls.sql (custom)
packages/db/migrations/0019_engine_structured.sql (gen), 0020_engine_structured_rls.sql (custom), 0021_drop_meta_page_id.sql (gen)
packages/db/src/vendor-history.test.ts (new), engine.test.ts
packages/collectors/src/ads/{upsert,google,meta}.ts   pinning, own activity, per-page Meta (Task 4)
packages/collectors/src/reviews/upsert.ts       review revisions (Task 5)
packages/collectors/src/rankings/scan.ts        rank_scan grouping (Task 5)
packages/collectors/src/gbp/collect-gbp.ts      profile address (Task 5)
packages/engine/src/structured/vendor-diff.ts   vendor diff stage + differ registry (Task 6)
packages/engine/src/structured/ads.ts (6), jobs.ts + gbp.ts (7), reviews.ts (8), rank.ts (9)
packages/engine/src/diff.ts                     web/vendor dispatcher (Task 6)
packages/engine/src/tag/structured.ts           structured tagging (Task 10)
packages/engine/src/merge/merge.ts              cross-channel merge (Task 11)
packages/engine/src/score/score.ts, score-stage.ts   curves, tenant scope, age cap (Task 12)
packages/engine/src/moves/rules.ts (13), moves-stage.ts (14)
packages/engine/src/sweep.ts, drain.ts, index.ts, tag/tag-stage.ts
packages/engine/test/fake-ai.ts, test/seed.ts
apps/worker/src/jobs.ts, boss.ts, deps.ts, main.ts, jobs/engine.ts, jobs/moves.ts (new), cli/engine-once.ts, cli/collect-once.ts
docs/research/2026-09-30-phase-2-vendor-apis.md, docs/superpowers/plans/2026-09-29-roadmap.md, docs/superpowers/specs/2026-09-29-core-platform-design.md, docs/HANDOVER.md (Task 16)
```

---

### Task 1: Domain types and vertical-pack knobs

**Files:**
- Modify: `packages/core/src/domain.ts`, `packages/core/src/domain.test.ts`
- Modify: `packages/verticals/src/schema.ts`, `packages/verticals/packs/hvac_plumbing.yaml`, `packages/verticals/packs/dental.yaml`, `packages/verticals/src/packs.test.ts`
- Modify: `packages/engine/src/score/score.test.ts`, `packages/engine/src/sweep.test.ts` (scoring version expectation)

**Interfaces:**
- Produces (`@cs/core`): `CHANGE_TYPES` now `[..., 'rating_change', 'rank_change', 'content', 'cosmetic']`; `CHANNELS = ['web', 'google_ads', 'meta_ads', 'google_business_profile', 'google_reviews', 'google_jobs', 'rank'] as const`; `type Channel`.
- Produces (`@cs/verticals`, `VerticalPack`): `scoring.size.{ads_for_full, jobs_for_full, review_z_for_full, rating_delta_for_full, rank_delta_for_full, structured_min}`, `scoring.alert_max_age_days`, `move_thresholds.{price_war_cuts_90d, ad_burst_starts_30d, promo_blitz_window_days}`; both packs at `scoring.version: 2` with `type_weights.rank_change: 0.5`.

- [ ] **Step 1: Write the failing tests**

In `packages/core/src/domain.test.ts`, replace the change-types expectation and add a channels test:

```ts
import { CADENCES, CAPTURE_STATUSES, CHANGE_TYPES, CHANNELS, MOVE_TYPES, PAGE_TYPES } from './domain';

  it('lists the spec change types plus rank_change (Phase 3b)', () => {
    expect(CHANGE_TYPES).toEqual([
      'price_change', 'promo', 'new_service', 'service_removed', 'service_area_change', 'new_location',
      'hiring', 'ad_started', 'ad_stopped', 'review_spike', 'rating_change', 'rank_change', 'content', 'cosmetic',
    ]);
  });

  it('lists the channels a change can come from (capture sources plus rank scans)', () => {
    expect(CHANNELS).toEqual(['web', 'google_ads', 'meta_ads', 'google_business_profile', 'google_reviews', 'google_jobs', 'rank']);
  });
```

Append to `packages/verticals/src/packs.test.ts` (it already imports `loadVerticalPack` and `describe/it/expect`; add any missing import):

```ts
describe('Phase 3b pack knobs', () => {
  it.each(['hvac_plumbing', 'dental'])('%s weights rank_change and carries the structured size curves, age cap and move thresholds', async (id) => {
    const p = await loadVerticalPack(id);
    expect(p.type_weights.rank_change).toBe(0.5);
    expect(p.scoring.version).toBe(2);
    expect(p.scoring.size).toMatchObject({ ads_for_full: 5, jobs_for_full: 5, review_z_for_full: 4, rating_delta_for_full: 0.3, rank_delta_for_full: 5, structured_min: 0.3 });
    expect(p.scoring.alert_max_age_days).toBe(7);
    expect(p.move_thresholds).toMatchObject({ price_war_cuts_90d: 2, ad_burst_starts_30d: 3, promo_blitz_window_days: 14 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @cs/core test && pnpm --filter @cs/verticals test`
Expected: FAIL — `CHANNELS` is not exported; `rank_change` missing from `CHANGE_TYPES`; `p.scoring.size.ads_for_full` undefined.

- [ ] **Step 3: Implement**

`packages/core/src/domain.ts` — replace `CHANGE_TYPES` and add `CHANNELS` below it:

```ts
export const CHANGE_TYPES = [
  'price_change', 'promo', 'new_service', 'service_removed', 'service_area_change', 'new_location',
  'hiring', 'ad_started', 'ad_stopped', 'review_spike', 'rating_change', 'rank_change', 'content', 'cosmetic',
] as const;
export type ChangeType = (typeof CHANGE_TYPES)[number];

/** Where a detected change came from: the `capture.source` of its evidence, or `rank` for tenant-private rank scans. */
export const CHANNELS = ['web', 'google_ads', 'meta_ads', 'google_business_profile', 'google_reviews', 'google_jobs', 'rank'] as const;
export type Channel = (typeof CHANNELS)[number];
```

`packages/verticals/src/schema.ts` — extend `move_thresholds` and `scoring` (keep every existing field):

```ts
  move_thresholds: z.object({
    hiring_push_postings_30d: z.number().int().positive(),
    rating_drop_90d: z.number().positive(),
    ad_surge_multiplier: z.number().gt(1),
    complaint_spike_multiplier: z.number().gt(1),
    /** Price war: this many price cuts on overlapping services inside the 90-day window. */
    price_war_cuts_90d: z.number().int().positive().default(2),
    /** Price war (promo + ad burst): this many ads started in the last 30 days alongside a promo. */
    ad_burst_starts_30d: z.number().int().positive().default(3),
    /** Promo blitz: promos in two or more channels within this many days. */
    promo_blitz_window_days: z.number().int().positive().default(14),
  }),
```

```ts
      size: z
        .object({
          default: weight.default(0.6),
          price_pct_for_full: z.number().positive().default(20),
          price_min: weight.default(0.3),
          /** Spec §6.3 size curves for structured types: value / *_for_full, floored at structured_min, capped at 1. */
          ads_for_full: z.number().positive().default(5),
          jobs_for_full: z.number().positive().default(5),
          review_z_for_full: z.number().positive().default(4),
          rating_delta_for_full: z.number().positive().default(0.3),
          rank_delta_for_full: z.number().positive().default(5),
          structured_min: weight.default(0.3),
        })
        .prefault({}),
```

and, next to `novelty_window_days` inside `scoring`:

```ts
      /** An event older than this when scored is never an alert (capped to brief): backlogs must not page anyone. */
      alert_max_age_days: z.number().int().positive().default(7),
```

Both pack YAMLs (`hvac_plumbing.yaml` and `dental.yaml`): add `rank_change: 0.5` under `type_weights` (between `rating_change` and `content`), add the three move thresholds, and replace the `scoring:` block. For `hvac_plumbing.yaml` the result is:

```yaml
type_weights:
  price_change: 1.0
  promo: 0.85
  new_service: 0.7
  service_removed: 0.5
  service_area_change: 0.9
  new_location: 0.9
  hiring: 0.5
  ad_started: 0.6
  ad_stopped: 0.3
  review_spike: 0.6
  rating_change: 0.7
  rank_change: 0.5
  content: 0.2
  cosmetic: 0.0

move_thresholds:
  hiring_push_postings_30d: 3
  rating_drop_90d: 0.2
  ad_surge_multiplier: 2.0
  complaint_spike_multiplier: 2.0
  price_war_cuts_90d: 2
  ad_burst_starts_30d: 3
  promo_blitz_window_days: 14

scoring:
  version: 2
  routing: { alert: 70, brief: 40 }
  size:
    { default: 0.6, price_pct_for_full: 20, price_min: 0.3, ads_for_full: 5, jobs_for_full: 5, review_z_for_full: 4, rating_delta_for_full: 0.3, rank_delta_for_full: 5, structured_min: 0.3 }
  relevance: { matched: 1.0, unmapped: 0.6, unmatched: 0.2, outside_territory: 0.3 }
  novelty_similarity_floor: 0.5
  novelty_window_days: 365
  alert_max_age_days: 7
```

In `dental.yaml` keep its existing weight and threshold *values* (do not copy HVAC's); only add `rank_change: 0.5`, the three new `move_thresholds` lines with the values above, bump `scoring.version` to `2`, extend `size` with the six new keys (values above) and add `alert_max_age_days: 7`.

Update the two tests that pin the scoring version: in `packages/engine/src/score/score.test.ts` line 19 change `scoringVersion: 1` to `scoringVersion: 2` (that test scores with the real pack). Leave `packages/engine/src/sweep.test.ts` (its `factors` literal is just stored data) unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @cs/core test && pnpm --filter @cs/verticals test && pnpm --filter @cs/engine test -- score && pnpm typecheck`
Expected: PASS. (`typecheck` catches any exhaustive `Record<ChangeType, …>` that now needs `rank_change`; there are none in 3a code — `WEB_CHANGE_TYPES` is a subset.)

- [ ] **Step 5: Commit**

```bash
git add packages/core packages/verticals packages/engine/src/score/score.test.ts
git commit -m "feat(core,verticals): rank_change type, channels, structured size curves and move thresholds

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Vendor history schema (Meta pages, Google advertisers, ad end, review revisions, rank scans)

**Files:**
- Modify: `packages/db/src/schema/tenancy.ts`, `packages/db/src/schema/sources.ts`, `packages/db/src/schema/client-intel.ts`
- Create: `packages/db/src/vendor-history.test.ts`
- Generated + hand-edited: `packages/db/migrations/0017_vendor_history.sql`; custom: `packages/db/migrations/0018_vendor_history_rls.sql`

**Interfaces:**
- Produces (`@cs/db`):
  - `competitor.metaPageIds: string[]` (jsonb, default `[]`) and `competitor.googleAdvertiserIds: string[]` (jsonb, default `[]`). `competitor.metaPageId` **stays** in this task (dropped in Task 4 once no code reads it).
  - `ServiceArea.towns?: string[]` (jsonb type only, no migration).
  - `ad.endedCaptureId: string | null` — the capture whose collection ended the ad.
  - `reviewRevision` → table `review_revision (id, review_id, competitor_id, rating, text, replaced_at, replaced_by_capture_id)`: the *replaced* version of an edited review.
  - `rankScan` → table `rank_scan (id, agency_id, client_id, status 'running'|'done'|'failed', snapshots, failed, started_at, finished_at)`; `rankSnapshot.scanId: string | null`.
  - RLS: `review_revision` readable via competitor visibility; `rank_scan` by tenant scope; app_user writes neither.

- [ ] **Step 1: Write the failing test**

`packages/db/src/vendor-history.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { errorText, IDS, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { ad, capture, competitor, rankScan, rankSnapshot, review, reviewRevision } from './schema';
import { withTenant } from './tenant';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const CAP = '00000000-0000-4000-8000-0000000000c1';

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.service.insert(capture).values({ id: CAP, competitorId: IDS.competitorX, source: 'google_reviews', status: 'ok', collectorVersion: 'dfs/1' });
});

describe('vendor history tables', () => {
  it('competitors carry several Meta pages and pinned Google advertiser ids (empty by default)', async () => {
    await dbs.service.update(competitor).set({ metaPageIds: ['111', '222'], googleAdvertiserIds: ['AR1'] }).where(eq(competitor.id, IDS.competitorX));
    const [x] = await dbs.owner.select().from(competitor).where(eq(competitor.id, IDS.competitorX));
    const [y] = await dbs.owner.select().from(competitor).where(eq(competitor.id, IDS.competitorY));
    expect(x).toMatchObject({ metaPageIds: ['111', '222'], googleAdvertiserIds: ['AR1'] });
    expect(y).toMatchObject({ metaPageIds: [], googleAdvertiserIds: [] });
  });

  it('review revisions follow competitor visibility and only the service role writes them', async () => {
    const [r] = await dbs.service.insert(review).values({ competitorId: IDS.competitorX, dedupeKey: 'id:r1', rating: 5, text: 'Great' }).returning({ id: review.id });
    await dbs.service.insert(reviewRevision).values({ reviewId: r!.id, competitorId: IDS.competitorX, rating: 5, text: 'Great', replacedByCaptureId: CAP });
    const seen = (clientScope: 'all' | string[]) => withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope }, (tx) => tx.select().from(reviewRevision));
    expect(await seen([IDS.clientA1])).toHaveLength(1);
    expect(await seen([IDS.clientA2])).toHaveLength(0);
    expect(
      await errorText(withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) => tx.insert(reviewRevision).values({ reviewId: r!.id, competitorId: IDS.competitorX, rating: 1, text: 'x' }))),
    ).toMatch(/permission denied/i);
  });

  it('rank scans group snapshots and are private to the client tenant', async () => {
    const [scan] = await dbs.service.insert(rankScan).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1 }).returning();
    expect(scan).toMatchObject({ status: 'running', snapshots: 0, failed: 0, finishedAt: null });
    await dbs.service.insert(rankSnapshot).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, scanId: scan!.id, keyword: 'ac repair', lat: 1, lng: 2, results: [] });
    expect(await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: [IDS.clientA1] }, (tx) => tx.select().from(rankScan))).toHaveLength(1);
    expect(await withTenant(dbs.app, { agencyId: IDS.agencyB, clientScope: 'all' }, (tx) => tx.select().from(rankScan))).toHaveLength(0);
    expect(await errorText(dbs.service.insert(rankScan).values({ agencyId: IDS.agencyB, clientId: IDS.clientA1 }))).toMatch(/foreign key/i);
  });

  it('an ad records the capture that ended it', async () => {
    const [row] = await dbs.service.insert(ad).values({ competitorId: IDS.competitorX, platform: 'meta', externalId: 'm1', isActive: false, endedCaptureId: CAP }).returning();
    expect(row?.endedCaptureId).toBe(CAP);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cs/db test -- vendor-history`
Expected: FAIL — TypeScript/vitest cannot find `rankScan`, `reviewRevision`, `metaPageIds`.

- [ ] **Step 3: Change the schema**

`packages/db/src/schema/tenancy.ts` — `ServiceArea` gains towns, competitor gains two columns (keep `metaPageId` for now):

```ts
export interface ServiceArea {
  center: { lat: number; lng: number };
  radiusKm: number;
  zips: string[];
  /** Towns/cities served, matched case-insensitively against event text by the territory-expansion move (spec §6.4). */
  towns?: string[];
}
```

```ts
export const competitor = pgTable('competitor', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  domain: text('domain').unique(),
  placeId: text('place_id').unique(),
  cid: text('cid').unique(),
  /** Deprecated by metaPageIds; dropped in migration 0021 (Phase 3b Task 4). */
  metaPageId: text('meta_page_id'),
  /** Every Facebook page whose ads belong to this competitor (franchise brands run ads from franchisee pages). */
  metaPageIds: jsonb('meta_page_ids').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  /** Google Ads Transparency advertiser ids pinned to this competitor; when set, ads are queried by id, not by domain. */
  googleAdvertiserIds: jsonb('google_advertiser_ids').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  createdAt: createdAt(),
});
```

`packages/db/src/schema/sources.ts` — in `ad`, after `lastCaptureId`:

```ts
    /** The capture whose collection ended this ad (Meta: missing from the active set; Google: unseen too long). Cleared if the ad returns. */
    endedCaptureId: uuid('ended_capture_id').references(() => capture.id, { onDelete: 'set null' }),
```

and at the end of the file:

```ts
/** The replaced version of an edited review (3b carry-over): the review row always holds the latest text. Immutable. */
export const reviewRevision = pgTable(
  'review_revision',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reviewId: uuid('review_id').notNull().references(() => review.id, { onDelete: 'cascade' }),
    competitorId: competitorRef(),
    rating: integer('rating'),
    text: text('text'),
    replacedAt: ts('replaced_at').notNull().defaultNow(),
    replacedByCaptureId: uuid('replaced_by_capture_id').references(() => capture.id, { onDelete: 'set null' }),
  },
  (t) => [index('review_revision_review_idx').on(t.reviewId, t.replacedAt)],
);
```

`packages/db/src/schema/client-intel.ts` — add `rankScan` **above** `rankSnapshot`, and a `scanId` column on `rankSnapshot`:

```ts
/** One geo-grid rank scan run of a client (groups its snapshots so rank deltas compare scan to scan). Tenant-scoped. */
export const rankScan = pgTable(
  'rank_scan',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    status: text('status').notNull().default('running'), // running | done | failed
    snapshots: integer('snapshots').notNull().default(0),
    failed: integer('failed').notNull().default(0),
    startedAt: ts('started_at').notNull().defaultNow(),
    finishedAt: ts('finished_at'),
  },
  (t) => [
    foreignKey({ columns: [t.clientId, t.agencyId], foreignColumns: [client.id, client.agencyId] }).onDelete('cascade'),
    index('rank_scan_client_idx').on(t.clientId, t.finishedAt),
  ],
);
```

```ts
    scanId: uuid('scan_id').references(() => rankScan.id, { onDelete: 'cascade' }),
```

(place `scanId` after `captureId` in `rankSnapshot`). Export nothing new from `schema/index.ts` — it already re-exports these files.

- [ ] **Step 4: Generate the migration and add the backfill**

Run: `pnpm --filter @cs/db generate --name=vendor_history`
Expected: `packages/db/migrations/0017_vendor_history.sql` containing `ALTER TABLE "competitor" ADD COLUMN "meta_page_ids" …`, `… "google_advertiser_ids" …`, `ALTER TABLE "ad" ADD COLUMN "ended_capture_id" …`, `CREATE TABLE "review_revision"`, `CREATE TABLE "rank_scan"`, `ALTER TABLE "rank_snapshot" ADD COLUMN "scan_id"` and their FKs/indexes. It must contain **no** `DROP COLUMN` (we kept `meta_page_id`). If drizzle-kit orders a FK before the table it references, move the statement down (gotcha from `0002`).

Append the backfill to the end of `0017_vendor_history.sql` (editing a just-generated, not-yet-applied migration is fine):

```sql
--> statement-breakpoint
UPDATE "competitor" SET "meta_page_ids" = jsonb_build_array("meta_page_id") WHERE "meta_page_id" IS NOT NULL;
```

Run: `pnpm --filter @cs/db generate --custom --name=vendor_history_rls` and fill `0018_vendor_history_rls.sql`:

```sql
REVOKE INSERT, UPDATE, DELETE ON review_revision, rank_scan FROM app_user;
--> statement-breakpoint
ALTER TABLE review_revision ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE review_revision FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY review_revision_visible ON review_revision FOR SELECT USING (app_competitor_visible(competitor_id));
--> statement-breakpoint
ALTER TABLE rank_scan ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE rank_scan FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY rank_scan_select ON rank_scan FOR SELECT
  USING (agency_id = app_agency_id() AND app_client_visible(client_id));
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @cs/db test`
Expected: PASS — the new file, plus the existing guards: forced-RLS on every public table (`tenant.test.ts`) and the app_user write-privilege allow-list (`evidence.test.ts`) both stay green because of `0018`.

- [ ] **Step 6: Migrate cs_dev and check the backfill**

Run: `pnpm db:migrate`
Then: `node -e "const p=require('postgres');const s=p(process.env.DATABASE_URL);s\`SELECT name, meta_page_id, meta_page_ids FROM competitor WHERE meta_page_id IS NOT NULL\`.then(r=>{console.log(r);return s.end()})"` from the repo root with the env loaded (`node --env-file=.env -e "…"`).
Expected: every row with a `meta_page_id` shows it inside `meta_page_ids` (Aire Serv: `["1825453601028298"]`).

- [ ] **Step 7: Commit**

```bash
git add packages/db
git commit -m "feat(db): meta page list, pinned google advertisers, ad end capture, review revisions, rank scans

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Engine schema for structured changes, tenant events and moves

**Files:**
- Modify: `packages/db/src/schema/engine.ts`, `packages/db/src/engine.test.ts`
- Generated: `packages/db/migrations/0019_engine_structured.sql`; custom: `packages/db/migrations/0020_engine_structured_rls.sql`

**Interfaces:**
- Consumes: `rankScan` (Task 2).
- Produces (`@cs/db`):
  - `interface ChangeItem { id: string; label: string }`
  - `interface ChangeDetails { changeType?: string; count?: number; items?: ChangeItem[]; field?: string; pageId?: string | null; windowDays?: number; baselineMean?: number; z?: number; avgRating?: number | null; ratingBefore?: number; ratingAfter?: number; votesBefore?: number | null; votesAfter?: number | null; keyword?: string; avgRankBefore?: number; avgRankAfter?: number; top3Before?: number; top3After?: number; points?: number; offer?: boolean }`
  - `detectedChange`: `afterCaptureId` now nullable; new `agencyId`, `clientId`, `rankScanId` (nullable), `details: ChangeDetails` (default `{}`). CHECKs `detected_change_subject_check` (exactly one of `after_capture_id` / `rank_scan_id`) and `detected_change_tenant_check` (`agency_id` and `client_id` both null or both set). Unique `detected_change_rank_unique (rank_scan_id, competitor_id, kind, block_key, stage_version)`.
  - `changeEvent`: new `agencyId`, `clientId` (nullable pair, CHECK `event_tenant_check`, composite FK to `client`), `channels: string[]` (default `[]`), `details: ChangeDetails` (default `{}`).
  - `type MoveStatus = 'emerging' | 'active' | 'fading'`; `interface MoveDetails { eventCount: number; channels: string[]; facts: Record<string, number | string> }`.
  - `move` → table `move (id, agency_id, client_id, competitor_id, move_type, status, confidence, summary, details, rule_version, first_detected_at, last_held_at, last_evidence_at, closed_at, updated_at)` with partial unique index `move_open_unique (client_id, competitor_id, move_type) WHERE closed_at IS NULL`.
  - `moveEvent` → table `move_event (move_id, event_id)` PK both.
  - RLS: `detected_change`/`event` readable when the competitor is visible **and** (`client_id IS NULL` or the row's tenant matches); `move` by tenant scope; `move_event` through its move. app_user writes none.

- [ ] **Step 1: Write the failing test**

Append to `packages/db/src/engine.test.ts` (add `move, moveEvent, rankScan` to the `./schema` import):

```ts
describe('engine tables (Phase 3b)', () => {
  it('tenant-private rank changes and events are visible to their own client only', async () => {
    const [scan] = await dbs.service.insert(rankScan).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, status: 'done' }).returning({ id: rankScan.id });
    const [chg] = await dbs.service
      .insert(detectedChange)
      .values({
        competitorId: IDS.competitorX, source: 'rank', kind: 'modified', rankScanId: scan!.id, agencyId: IDS.agencyA, clientId: IDS.clientA1,
        blockKey: 'rank:ac repair', details: { changeType: 'rank_change', keyword: 'ac repair', avgRankBefore: 9, avgRankAfter: 3 }, stageVersion: 1,
      })
      .returning({ id: detectedChange.id });
    const [ev] = await dbs.service
      .insert(changeEvent)
      .values({ competitorId: IDS.competitorX, agencyId: IDS.agencyA, clientId: IDS.clientA1, changeType: 'rank_change', channels: ['rank'], summary: 'r', confidence: 1, occurredAt: new Date(), details: { keyword: 'ac repair' } })
      .returning({ id: changeEvent.id });
    await dbs.service.insert(eventChange).values({ eventId: ev!.id, changeId: chg!.id });

    const view = (agencyId: string, clientScope: 'all' | string[]) =>
      withTenant(dbs.app, { agencyId, clientScope }, async (tx) => ({
        events: (await tx.select().from(changeEvent)).map((e) => e.id).sort(),
        changes: (await tx.select().from(detectedChange)).map((c) => c.id).sort(),
        links: (await tx.select().from(eventChange)).length,
      }));
    expect(await view(IDS.agencyA, [IDS.clientA1])).toEqual({ events: [EVT_X, ev!.id].sort(), changes: [CHG_X, chg!.id].sort(), links: 2 });
    // B1 tracks competitor X too, but never sees A1's rank change or event.
    expect(await view(IDS.agencyB, 'all')).toEqual({ events: [EVT_X], changes: [CHG_X], links: 1 });
  });

  it('a change needs exactly one subject; tenant columns come in pairs that match a real client', async () => {
    expect(await errorText(dbs.service.insert(detectedChange).values({ competitorId: IDS.competitorX, source: 'rank', kind: 'modified', blockKey: 'k', stageVersion: 1 }))).toMatch(/detected_change_subject_check/);
    expect(
      await errorText(dbs.service.insert(changeEvent).values({ competitorId: IDS.competitorX, clientId: IDS.clientA1, changeType: 'rank_change', summary: 's', confidence: 1, occurredAt: new Date() })),
    ).toMatch(/event_tenant_check/);
    expect(
      await errorText(dbs.service.insert(changeEvent).values({ competitorId: IDS.competitorX, agencyId: IDS.agencyB, clientId: IDS.clientA1, changeType: 'rank_change', summary: 's', confidence: 1, occurredAt: new Date() })),
    ).toMatch(/foreign key/i);
  });

  it('moves are private to the client tenant, with one open move per client, competitor and type', async () => {
    const values = {
      agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, moveType: 'price_war', status: 'emerging', confidence: 0.4, summary: 'm',
      ruleVersion: 1, lastHeldAt: new Date(), lastEvidenceAt: new Date(),
    };
    const [m] = await dbs.service.insert(move).values(values).returning({ id: move.id });
    await dbs.service.insert(moveEvent).values({ moveId: m!.id, eventId: EVT_X });
    expect(await errorText(dbs.service.insert(move).values(values))).toMatch(/move_open_unique/);
    await dbs.service.update(move).set({ closedAt: new Date() }).where(eq(move.id, m!.id));
    await dbs.service.insert(move).values(values); // a closed move frees the slot

    expect(await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: [IDS.clientA1] }, (tx) => tx.select().from(moveEvent))).toHaveLength(1);
    expect(await withTenant(dbs.app, { agencyId: IDS.agencyB, clientScope: 'all' }, (tx) => tx.select().from(move))).toEqual([]);
    expect(await withTenant(dbs.app, { agencyId: IDS.agencyB, clientScope: 'all' }, (tx) => tx.select().from(moveEvent))).toEqual([]);
    expect(await errorText(withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) => tx.insert(move).values(values)))).toMatch(/permission denied/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cs/db test -- engine`
Expected: FAIL — `move`, `moveEvent` not exported; `rankScanId`/`details`/`channels` unknown.

- [ ] **Step 3: Change the schema**

In `packages/db/src/schema/engine.ts`: add `check, uniqueIndex` to the `drizzle-orm/pg-core` import and `import { rankScan } from './client-intel';`. Add the types after `ScoreFactors`:

```ts
export interface ChangeItem {
  id: string;
  label: string;
}

/**
 * Structured facts of a detected change, copied onto its event. Set by the structured diffs (Phase 3b);
 * web changes leave it empty except `offer`. `changeType` fixes the event type (no model choice).
 */
export interface ChangeDetails {
  changeType?: string;
  /** Ads started/stopped, new job postings, reviews in the window. */
  count?: number;
  items?: ChangeItem[];
  /** GBP field that changed ('category', 'service', 'address', 'title', 'phone', 'domain', 'hours', 'status', 'rating'). */
  field?: string;
  /** Meta page the ads belong to. */
  pageId?: string | null;
  /** Review velocity: window length, baseline weekly mean and z-score; average rating of the window's reviews. */
  windowDays?: number;
  baselineMean?: number;
  z?: number;
  avgRating?: number | null;
  ratingBefore?: number;
  ratingAfter?: number;
  votesBefore?: number | null;
  votesAfter?: number | null;
  /** Rank delta (tenant-private): keyword, average grid position and share of grid points in the top 3. */
  keyword?: string;
  avgRankBefore?: number;
  avgRankAfter?: number;
  top3Before?: number;
  top3After?: number;
  points?: number;
  /** The change advertises a specific offer (ad copy with a deal, or a web promo / money change). */
  offer?: boolean;
}

export type MoveStatus = 'emerging' | 'active' | 'fading';

export interface MoveDetails {
  eventCount: number;
  channels: string[];
  /** Rule-specific numbers behind the move (e.g. cuts: 2, activeNow: 9, baseline: 3). */
  facts: Record<string, number | string>;
}
```

Replace the `detectedChange` table:

```ts
/** A candidate change found by a diff stage, before tagging. Global, derived — except rank changes, which are tenant-private. */
export const detectedChange = pgTable(
  'detected_change',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    competitorId: competitorRef(),
    trackedPageId: uuid('tracked_page_id').references(() => trackedPage.id, { onDelete: 'cascade' }),
    source: text('source').notNull(), // Channel: 'web' | vendor capture source | 'rank'
    kind: text('kind').notNull(), // added | removed | modified
    beforeCaptureId: uuid('before_capture_id').references(() => capture.id),
    /** Evidence of the change: a capture (web, vendor) … */
    afterCaptureId: uuid('after_capture_id').references(() => capture.id),
    /** … or a tenant-private rank scan (exactly one of the two). */
    rankScanId: uuid('rank_scan_id').references(() => rankScan.id, { onDelete: 'cascade' }),
    /** Set (both) only for tenant-private changes. */
    agencyId: uuid('agency_id').references(() => agency.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id'),
    blockKey: text('block_key'),
    beforeText: text('before_text'),
    afterText: text('after_text'),
    similarity: doublePrecision('similarity'),
    numericChanges: jsonb('numeric_changes').$type<NumericChange[]>().notNull().default(sql`'[]'::jsonb`),
    details: jsonb('details').$type<ChangeDetails>().notNull().default(sql`'{}'::jsonb`),
    flags: jsonb('flags').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    status: text('status').notNull().default('pending'), // pending | event | cosmetic
    stageVersion: integer('stage_version').notNull(),
    detectedAt: ts('detected_at').notNull().defaultNow(),
  },
  (t) => [
    unique('detected_change_unique').on(t.afterCaptureId, t.kind, t.blockKey, t.stageVersion),
    unique('detected_change_rank_unique').on(t.rankScanId, t.competitorId, t.kind, t.blockKey, t.stageVersion),
    index('detected_change_status_idx').on(t.status, t.detectedAt),
    index('detected_change_page_key_idx').on(t.trackedPageId, t.blockKey),
    foreignKey({ columns: [t.clientId, t.agencyId], foreignColumns: [client.id, client.agencyId] }).onDelete('cascade'),
    check('detected_change_subject_check', sql`(after_capture_id IS NOT NULL) <> (rank_scan_id IS NOT NULL)`),
    check('detected_change_tenant_check', sql`(client_id IS NULL) = (agency_id IS NULL)`),
  ],
);
```

Replace the `changeEvent` table:

```ts
/** A tagged, meaningful competitor event (spec §6.2). Global public fact — except rank events, which are tenant-private. Private scores live in event_score. */
export const changeEvent = pgTable(
  'event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    competitorId: competitorRef(),
    /** Set (both) only for tenant-private events. */
    agencyId: uuid('agency_id').references(() => agency.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id'),
    changeType: text('change_type').notNull(), // ChangeType
    /** Channels of every change merged into this event (spec §6.2 cross-channel merge). */
    channels: jsonb('channels').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** Service id per vertical pack id (null = no single service). */
    services: jsonb('services').$type<Record<string, string | null>>().notNull().default(sql`'{}'::jsonb`),
    summary: text('summary').notNull(),
    facts: jsonb('facts').$type<NumericChange[]>().notNull().default(sql`'[]'::jsonb`),
    details: jsonb('details').$type<ChangeDetails>().notNull().default(sql`'{}'::jsonb`),
    zips: jsonb('zips').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    embedding: embedding(),
    confidence: doublePrecision('confidence').notNull(),
    needsReview: boolean('needs_review').notNull().default(false),
    occurredAt: ts('occurred_at').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('event_competitor_time_idx').on(t.competitorId, t.occurredAt),
    index('event_created_idx').on(t.createdAt),
    index('event_client_idx').on(t.clientId),
    foreignKey({ columns: [t.clientId, t.agencyId], foreignColumns: [client.id, client.agencyId] }).onDelete('cascade'),
    check('event_tenant_check', sql`(client_id IS NULL) = (agency_id IS NULL)`),
  ],
);
```

Append the move tables at the end of the file:

```ts
/** A detected competitor move (spec §6.4) for one client. Tenant-private; written by the nightly moves stage. */
export const move = pgTable(
  'move',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    competitorId: competitorRef(),
    moveType: text('move_type').notNull(), // MoveType
    status: text('status').notNull(), // MoveStatus
    confidence: doublePrecision('confidence').notNull(),
    summary: text('summary').notNull(),
    details: jsonb('details').$type<MoveDetails>().notNull().default(sql`'{"eventCount":0,"channels":[],"facts":{}}'::jsonb`),
    ruleVersion: integer('rule_version').notNull(),
    firstDetectedAt: ts('first_detected_at').notNull().defaultNow(),
    /** Last nightly run at which the rule held. */
    lastHeldAt: ts('last_held_at').notNull(),
    /** Newest supporting event. */
    lastEvidenceAt: ts('last_evidence_at').notNull(),
    closedAt: ts('closed_at'),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.clientId, t.agencyId], foreignColumns: [client.id, client.agencyId] }).onDelete('cascade'),
    index('move_client_idx').on(t.clientId, t.status),
    uniqueIndex('move_open_unique').on(t.clientId, t.competitorId, t.moveType).where(sql`closed_at IS NULL`),
  ],
);

/** Evidence chain of a move: the events supporting it. */
export const moveEvent = pgTable(
  'move_event',
  {
    moveId: uuid('move_id').notNull().references(() => move.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id').notNull().references(() => changeEvent.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.moveId, t.eventId] }), index('move_event_event_idx').on(t.eventId)],
);
```

- [ ] **Step 4: Generate and write the migrations**

Run: `pnpm --filter @cs/db generate --name=engine_structured`
Expected `0019_engine_structured.sql`: `ALTER TABLE "detected_change" ALTER COLUMN "after_capture_id" DROP NOT NULL`, the new columns on `detected_change` and `event`, `CREATE TABLE "move"`/`"move_event"`, the FKs, `detected_change_rank_unique`, the three CHECK constraints and `CREATE UNIQUE INDEX "move_open_unique" … WHERE closed_at IS NULL`. Existing rows satisfy the checks (every 3a change has an `after_capture_id` and no tenant). If drizzle-kit renders a CHECK with table-qualified columns that Postgres rejects, rewrite it by hand to the bare-column form above.

Run: `pnpm --filter @cs/db generate --custom --name=engine_structured_rls` and fill `0020_engine_structured_rls.sql`:

```sql
REVOKE INSERT, UPDATE, DELETE ON move, move_event FROM app_user;
--> statement-breakpoint
DROP POLICY detected_change_visible ON detected_change;
--> statement-breakpoint
CREATE POLICY detected_change_visible ON detected_change FOR SELECT
  USING (app_competitor_visible(competitor_id) AND (client_id IS NULL OR (agency_id = app_agency_id() AND app_client_visible(client_id))));
--> statement-breakpoint
DROP POLICY event_visible ON event;
--> statement-breakpoint
CREATE POLICY event_visible ON event FOR SELECT
  USING (app_competitor_visible(competitor_id) AND (client_id IS NULL OR (agency_id = app_agency_id() AND app_client_visible(client_id))));
--> statement-breakpoint
ALTER TABLE move ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE move FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY move_select ON move FOR SELECT
  USING (agency_id = app_agency_id() AND app_client_visible(client_id));
--> statement-breakpoint
ALTER TABLE move_event ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE move_event FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY move_event_visible ON move_event FOR SELECT
  USING (EXISTS (SELECT 1 FROM move m WHERE m.id = move_event.move_id));
```

(`event_change_visible` already joins `event`, so it inherits the tenant filter.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @cs/db test && pnpm typecheck`
Expected: PASS. `typecheck` will flag `packages/engine/src/tag/tag-stage.ts` only if it relied on `afterCaptureId` being non-null — it uses it in an `innerJoin`, which still typechecks; leave behaviour changes to Task 10.

- [ ] **Step 6: Migrate cs_dev and commit**

Run: `pnpm db:migrate` — Expected: `0019`, `0020` applied.

```bash
git add packages/db
git commit -m "feat(db): structured change details, tenant-private rank changes/events, moves

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 4: Ads — several Meta pages, pinned Google advertisers, our own activity, ended capture

**Files:**
- Modify: `packages/collectors/src/ads/upsert.ts`, `packages/collectors/src/ads/google.ts`, `packages/collectors/src/ads/meta.ts`
- Modify tests: `packages/collectors/src/ads/upsert.test.ts`, `google.test.ts`, `meta.test.ts`
- Modify: `packages/db/src/schema/tenancy.ts` (drop `metaPageId`); generated `packages/db/migrations/0021_drop_meta_page_id.sql`
- Modify: `apps/worker/src/cli/collect-once.ts`

**Interfaces:**
- Consumes: `competitor.metaPageIds`, `competitor.googleAdvertiserIds`, `ad.endedCaptureId` (Task 2).
- Produces:
  - `upsertAds(db, competitorId, platform, captureId, ads, opts: { markMissingInactive: boolean; now?: Date; advertiserId?: string })` — `advertiserId` limits deactivation to that advertiser's ads (plus legacy rows with a null advertiser). Deactivation and an active → inactive upsert set `endedCaptureId = captureId`; an ad seen active again gets `endedCaptureId = null`. A brand-new row never gets an `endedCaptureId`.
  - `GOOGLE_UNSEEN_DAYS = 21`; `collectGoogleAds(deps, c: { id: string; domain: string | null; name: string; googleAdvertiserIds?: string[] })` → `{ status; ads?; dropped?; ended? }`. With pinned ids it posts `{ advertiser_ids, location_code, depth: 120 }` and keeps only those advertisers' creatives; otherwise the 2b domain query + name filter. After every ok collection, active Google ads unseen for `GOOGLE_UNSEEN_DAYS` are ended with `endedAt = lastSeenAt`.
  - `metaPageUrl(pageId: string): string` = `https://www.facebook.com/ads/library/?view_all_page_id=<id>`; `collectMetaAds(deps, c: { id: string; metaPageIds: string[] })` → `{ status: 'ok' | 'vendor_error' | 'skipped'; ads: number; deactivated: number; pages: MetaPageResult[] }` with `interface MetaPageResult { pageId: string; status: 'ok' | 'vendor_error'; ads?: number; deactivated?: number; vendor?: string }`. One capture per page (its `url` = `metaPageUrl(pageId)`); deactivation scoped to that page.
  - `competitor.metaPageId` removed (migration `0021`).
  - `collect-once` flags `--meta-page-id` and `--google-advertiser-id`, both repeatable.

- [ ] **Step 1: Write the failing tests**

Append to `packages/collectors/src/ads/upsert.test.ts` (inside `describe('upsertAds', …)`):

```ts
  it('records the capture that ended an ad, scoped to one advertiser when asked', async () => {
    await upsertAds(dbs.service, IDS.competitorX, 'meta', CAP1, [makeAd({ externalId: 'p1a', advertiserId: 'P1' }), makeAd({ externalId: 'p2a', advertiserId: 'P2' })], { markMissingInactive: false });
    const r = await upsertAds(dbs.service, IDS.competitorX, 'meta', CAP2, [], { markMissingInactive: true, advertiserId: 'P1' });
    expect(r.deactivated).toBe(1);
    const rows = await dbs.service.select().from(ad);
    expect(rows.find((a) => a.externalId === 'p1a')).toMatchObject({ isActive: false, endedCaptureId: CAP2 });
    expect(rows.find((a) => a.externalId === 'p2a')).toMatchObject({ isActive: true, endedCaptureId: null });
  });

  it('sets ended_capture_id when a seen ad turns inactive, and clears it when the ad comes back', async () => {
    await upsertAds(dbs.service, IDS.competitorX, 'google', CAP1, [makeAd()], { markMissingInactive: false });
    await upsertAds(dbs.service, IDS.competitorX, 'google', CAP2, [makeAd({ isActive: false, endedAt: new Date('2026-09-10T00:00:00Z') })], { markMissingInactive: false });
    expect((await dbs.service.select().from(ad))[0]).toMatchObject({ isActive: false, endedCaptureId: CAP2 });
    await upsertAds(dbs.service, IDS.competitorX, 'google', CAP1, [makeAd()], { markMissingInactive: false });
    expect((await dbs.service.select().from(ad))[0]).toMatchObject({ isActive: true, endedCaptureId: null });
  });

  it('never marks an ad that was first seen inactive as ended by that capture', async () => {
    await upsertAds(dbs.service, IDS.competitorX, 'google', CAP1, [makeAd({ isActive: false })], { markMissingInactive: false });
    expect((await dbs.service.select().from(ad))[0]).toMatchObject({ isActive: false, endedCaptureId: null });
  });
```

Append to `packages/collectors/src/ads/google.test.ts` (add `GOOGLE_UNSEEN_DAYS` to the `./google` import):

```ts
describe('google ads attribution and activity (Phase 3b)', () => {
  it('queries pinned advertiser ids instead of the domain and keeps only their creatives', async () => {
    const other = { ...item('c9', '2026-09-29 00:00:00 +00:00'), advertiser_id: 'AR9' };
    const dfs = fakeDfs(() => [dfsTask([{ items: [item('c1', '2026-09-29 00:00:00 +00:00'), other] }])]);
    const r = await collectGoogleAds({ db: dbs.service, store: createMemoryStore(), dfs }, { id: IDS.competitorX, domain: 'smithhvac.example', name: 'Smith HVAC', googleAdvertiserIds: ['AR1'] });
    expect(r).toMatchObject({ status: 'ok', ads: 1, dropped: 1 });
    expect(dfs.calls[0]?.body?.[0]).toEqual({ advertiser_ids: ['AR1'], location_code: 2840, depth: 120 });
  });

  it('collects pinned advertisers even when the competitor has no domain', async () => {
    const dfs = fakeDfs(() => [dfsTask([{ items: [] }])]);
    expect(await collectGoogleAds({ db: dbs.service, store: createMemoryStore(), dfs }, { id: IDS.competitorX, domain: null, name: 'Smith HVAC', googleAdvertiserIds: ['AR1'] })).toMatchObject({ status: 'ok' });
  });

  it('ends a creative we have not seen for GOOGLE_UNSEEN_DAYS and records the capture that ended it', async () => {
    const stale = new Date(Date.now() - (GOOGLE_UNSEEN_DAYS + 1) * 86_400_000);
    await dbs.service.insert(ad).values({ competitorId: IDS.competitorX, platform: 'google', externalId: 'gone', isActive: true, lastSeenAt: stale });
    const dfs = fakeDfs(() => [dfsTask([{ items: [item('c1', '2026-09-29 00:00:00 +00:00')] }])]);
    const r = await collectGoogleAds({ db: dbs.service, store: createMemoryStore(), dfs }, { id: IDS.competitorX, domain: 'smithhvac.example', name: 'Smith HVAC' });
    expect(r).toMatchObject({ status: 'ok', ended: 1 });
    const [gone] = await dbs.service.select().from(ad).where(eq(ad.externalId, 'gone'));
    const [cap] = await dbs.service.select().from(capture).where(eq(capture.source, 'google_ads'));
    expect(gone).toMatchObject({ isActive: false, endedCaptureId: cap!.id, endedAt: stale });
  });
});
```

In `packages/collectors/src/ads/meta.test.ts`, migrate the existing calls: replace every `{ id: IDS.competitorX, metaPageId: '99' }` with `{ id: IDS.competitorX, metaPageIds: ['99'] }`, and every result expectation of the form `toMatchObject({ status: 'ok', ads: N, deactivated: M, vendor: 'V' })` with `toMatchObject({ status: 'ok', ads: N, deactivated: M, pages: [expect.objectContaining({ vendor: 'V' })] })`. Then append (add `metaPageUrl` to the `./meta` import):

```ts
describe('collectMetaAds with several pages (franchise competitors)', () => {
  it('pulls every page and ends only the missing ads of the page that was pulled', async () => {
    await dbs.service.insert(ad).values([
      { competitorId: IDS.competitorX, platform: 'meta', externalId: 'OLD1', advertiserId: '99', isActive: true },
      { competitorId: IDS.competitorX, platform: 'meta', externalId: 'OLD2', advertiserId: '77', isActive: true },
    ]);
    const fetch = vi.fn(async (_u: string, init?: RequestInit) =>
      String(init?.body).includes('view_all_page_id=99') ? new Response(JSON.stringify([apifyItem]), { status: 201 }) : new Response('boom', { status: 500 }),
    );
    const r = await collectMetaAds({ db: dbs.service, store: createMemoryStore(), ledger, apify: { token: 't' }, fetch: fetch as unknown as typeof globalThis.fetch }, { id: IDS.competitorX, metaPageIds: ['99', '77'] });
    expect(r).toMatchObject({ status: 'ok', ads: 1, deactivated: 1 });
    expect(r.pages).toEqual([
      { pageId: '99', status: 'ok', ads: 1, deactivated: 1, vendor: 'apify' },
      { pageId: '77', status: 'vendor_error' },
    ]);
    const rows = await dbs.service.select().from(ad);
    expect(rows.find((a) => a.externalId === 'OLD1')).toMatchObject({ isActive: false });
    expect(rows.find((a) => a.externalId === 'OLD2')).toMatchObject({ isActive: true });
    const caps = await dbs.service.select().from(capture).where(eq(capture.competitorId, IDS.competitorX));
    expect(caps.map((c) => [c.url, c.status]).sort()).toEqual([
      [metaPageUrl('77'), 'vendor_error'],
      [metaPageUrl('99'), 'ok'],
    ]);
  });

  it('files an ad without a vendor page id under the page it was pulled for', async () => {
    const noPage = { ...apifyItem, adArchiveID: 'A2', pageID: undefined };
    const fetch = vi.fn(async () => new Response(JSON.stringify([noPage]), { status: 201 }));
    await collectMetaAds({ db: dbs.service, store: createMemoryStore(), ledger, apify: { token: 't' }, fetch: fetch as unknown as typeof globalThis.fetch }, { id: IDS.competitorX, metaPageIds: ['55'] });
    expect((await dbs.service.select().from(ad))[0]).toMatchObject({ externalId: 'A2', advertiserId: '55' });
  });

  it('skips a competitor without Meta pages', async () => {
    expect(await collectMetaAds({ db: dbs.service, store: createMemoryStore(), ledger }, { id: IDS.competitorX, metaPageIds: [] })).toEqual({ status: 'skipped', ads: 0, deactivated: 0, pages: [] });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @cs/collectors test -- ads`
Expected: FAIL — `endedCaptureId` stays null, `GOOGLE_UNSEEN_DAYS`/`metaPageUrl` not exported, `metaPageIds` not accepted.

- [ ] **Step 3: Implement `upsertAds`**

In `packages/collectors/src/ads/upsert.ts` change the imports to `import { and, eq, isNull, notInArray, or, sql } from 'drizzle-orm';`, the `opts` type to `{ markMissingInactive: boolean; now?: Date; advertiserId?: string }`, and the `set:` of the upsert to:

```ts
        set: {
          isActive: sql`excluded.is_active`, endedAt: sql`excluded.ended_at`, lastSeenAt: sql`excluded.last_seen_at`, lastCaptureId: sql`excluded.last_capture_id`,
          text: sql`coalesce(excluded.text, ${ad.text})`, mediaUrls: sql`excluded.media_urls`, publisherPlatforms: sql`excluded.publisher_platforms`,
          // Seen active again → no longer ended; seen inactive while it was active → this capture ended it; otherwise unchanged.
          endedCaptureId: sql`CASE WHEN excluded.is_active THEN NULL WHEN ${ad.isActive} THEN excluded.last_capture_id ELSE ${ad.endedCaptureId} END`,
        },
```

and the deactivation block to:

```ts
  if (opts.markMissingInactive) {
    const seen = rows.map((a) => a.externalId);
    const conds = [eq(ad.competitorId, competitorId), eq(ad.platform, platform), eq(ad.isActive, true)];
    if (seen.length > 0) conds.push(notInArray(ad.externalId, seen));
    // One Meta page's pull only speaks for that page's ads (legacy rows without an advertiser id count as its own).
    if (opts.advertiserId) conds.push(or(eq(ad.advertiserId, opts.advertiserId), isNull(ad.advertiserId))!);
    const result = await db
      .update(ad)
      .set({ isActive: false, endedAt: now, endedCaptureId: captureId })
      .where(and(...conds))
      .returning({ id: ad.id });
    deactivated = result.length;
  }
```

(New rows are inserted without `endedCaptureId`, so it defaults to null.)

- [ ] **Step 4: Implement Google pinning and own activity**

In `packages/collectors/src/ads/google.ts` change imports to add `ad` from `@cs/db` and `and, eq, lt, sql` from `drizzle-orm`, then replace `collectGoogleAds`:

```ts
/** 3b carry-over: a creative we have not seen for this long has ended — our own last_seen_at decides, not the vendor's last_shown lag. */
export const GOOGLE_UNSEEN_DAYS = 21;
const PINNED_DEPTH = 120;
const DAY_MS = 86_400_000;

export async function collectGoogleAds(
  deps: { db: Db; store: ObjectStore; dfs: DataForSeoClient },
  c: { id: string; domain: string | null; name: string; googleAdvertiserIds?: string[] },
): Promise<{ status: 'ok' | 'vendor_error' | 'skipped'; ads?: number; dropped?: number; ended?: number }> {
  const pinned = (c.googleAdvertiserIds ?? []).slice(0, 25); // ads_search accepts at most 25 advertiser ids
  if (pinned.length === 0 && !c.domain) return { status: 'skipped' };
  const base = { competitorId: c.id, source: 'google_ads', collectorVersion: DFS_COLLECTOR_VERSION };
  const request = pinned.length > 0
    ? { advertiser_ids: pinned, location_code: DFS_US.location_code, depth: PINNED_DEPTH }
    : { target: c.domain, location_code: DFS_US.location_code, depth: 40 };
  let raw: unknown[];
  try {
    const [task] = await deps.dfs.post('/serp/google/ads_search/live/advanced', [request], { agencyId: null, clientId: null });
    // DataForSEO can return HTTP 200 with an OK envelope while an individual task still failed, or
    // with no task at all — never record an empty 'ok' capture in either case.
    if (!task) {
      await recordVendorCapture(deps, { ...base, status: 'vendor_error', error: 'empty task' });
      return { status: 'vendor_error' };
    }
    if (!isDfsOk(task.statusCode)) {
      await recordVendorCapture(deps, { ...base, status: 'vendor_error', error: `${task.statusCode} ${task.statusMessage}` });
      return { status: 'vendor_error' };
    }
    raw = task.result ?? [];
  } catch (err) {
    if (!(err instanceof VendorError)) throw err;
    await recordVendorCapture(deps, { ...base, status: 'vendor_error', error: `${err.code ?? ''} ${err.message}`.trim() });
    return { status: 'vendor_error' };
  }
  const { captureId } = await recordVendorCapture(deps, { ...base, status: 'ok', payload: raw });
  const now = new Date();
  const items = (raw[0] as { items?: unknown[] } | undefined)?.items ?? [];
  // Live-verified 2026-10-01: `ads_search` by `target` domain returns creatives from EVERY advertiser
  // whose ads point at that domain. Pinned advertiser ids (Phase 3b) are exact; without them keep only
  // creatives whose advertiser name (`title`) matches the competitor name on whole-word runs (keeps
  // franchisees such as "4JR LLC DBA Aire Serv of Fort Worth"). Everything else is counted as dropped;
  // the raw capture above still holds all of them.
  const ads: NormalizedAd[] = [];
  let dropped = 0;
  for (const i of items) {
    const a = normalizeGoogleAd(i, now);
    if (!a) continue;
    const ours = pinned.length > 0 ? a.advertiserId !== null && pinned.includes(a.advertiserId) : employerMatches(a.title, c.name);
    if (ours) ads.push(a);
    else dropped++;
  }
  if (dropped > 0) console.log(`[ads] google competitor ${c.id}: dropped ${dropped} of ${ads.length + dropped} creatives from other advertisers`);
  await upsertAds(deps.db, c.id, 'google', captureId, ads, { markMissingInactive: false, now });
  const ended = await deps.db
    .update(ad)
    .set({ isActive: false, endedAt: sql`${ad.lastSeenAt}`, endedCaptureId: captureId })
    .where(and(eq(ad.competitorId, c.id), eq(ad.platform, 'google'), eq(ad.isActive, true), lt(ad.lastSeenAt, new Date(now.getTime() - GOOGLE_UNSEEN_DAYS * DAY_MS))))
    .returning({ id: ad.id });
  return { status: 'ok', ads: ads.length, dropped, ended: ended.length };
}
```

- [ ] **Step 5: Implement per-page Meta collection**

In `packages/collectors/src/ads/meta.ts` change the drizzle import to `import { and, eq, isNull, or } from 'drizzle-orm';` and replace `collectMetaAds`:

```ts
export const metaPageUrl = (pageId: string) => `https://www.facebook.com/ads/library/?view_all_page_id=${pageId}`;

export interface MetaPageResult {
  pageId: string;
  status: 'ok' | 'vendor_error';
  ads?: number;
  deactivated?: number;
  vendor?: string;
}

type MetaDeps = { db: Db; store: ObjectStore; ledger: LedgerSink; apify?: { token: string }; scrapeCreators?: { apiKey: string }; fetch?: typeof fetch };

/**
 * Collects every Meta page of a competitor (franchise brands advertise from franchisee pages, 2b carry-over).
 * Each page gets its own capture (url = metaPageUrl) and its own deactivation scope, so one page's pull
 * never ends another page's ads.
 */
export async function collectMetaAds(
  deps: MetaDeps,
  c: { id: string; metaPageIds: string[] },
): Promise<{ status: 'ok' | 'vendor_error' | 'skipped'; ads: number; deactivated: number; pages: MetaPageResult[] }> {
  const pages: MetaPageResult[] = [];
  for (const pageId of c.metaPageIds) pages.push(await collectMetaPage(deps, c.id, pageId));
  if (pages.length === 0) return { status: 'skipped', ads: 0, deactivated: 0, pages };
  const ok = pages.filter((p) => p.status === 'ok');
  return {
    status: ok.length > 0 ? 'ok' : 'vendor_error',
    ads: ok.reduce((n, p) => n + (p.ads ?? 0), 0),
    deactivated: ok.reduce((n, p) => n + (p.deactivated ?? 0), 0),
    pages,
  };
}

async function collectMetaPage(deps: MetaDeps, competitorId: string, pageId: string): Promise<MetaPageResult> {
  const base = { competitorId, source: 'meta_ads', collectorVersion: META_COLLECTOR_VERSION, url: metaPageUrl(pageId) };
  const attempts: [string, () => Promise<{ items: unknown[]; truncated: boolean }>][] = [];
  if (deps.apify) attempts.push(['apify', () => fetchMetaAdsApify({ token: deps.apify!.token, ledger: deps.ledger, fetch: deps.fetch }, pageId)]);
  if (deps.scrapeCreators) attempts.push(['scrapecreators', () => fetchMetaAdsScrapeCreators({ apiKey: deps.scrapeCreators!.apiKey, ledger: deps.ledger, fetch: deps.fetch }, pageId)]);
  const errors: string[] = [];
  for (const [vendor, run] of attempts) {
    let raw: unknown[];
    let truncated: boolean;
    try {
      ({ items: raw, truncated } = await run());
    } catch (err) {
      if (!(err instanceof VendorError)) throw err;
      errors.push(`${vendor}: ${err.code ?? ''} ${err.message}`.trim());
      continue;
    }
    const { captureId } = await recordVendorCapture(deps, { ...base, status: 'ok', payload: { vendor, items: raw, truncated } });
    // An ad without a vendor page id belongs to the page we asked for.
    const ads = raw.map(normalizeMetaAd).filter((a): a is NormalizedAd => a !== null).map((a) => ({ ...a, advertiserId: a.advertiserId ?? pageId }));
    // Only the active set was requested, so anything previously active and now missing has ended —
    // unless the vendor handed back nothing at all. A fully empty response from a real advertiser
    // with live ads is far more likely to be a vendor glitch than every ad ending at once, so an
    // empty response never deactivates when this page has active rows; it's recorded as evidence
    // and surfaced via a warning instead of silently wiping history.
    let markMissingInactive = true;
    if (raw.length === 0) {
      const existingActive = await deps.db
        .select({ id: ad.id })
        .from(ad)
        .where(and(eq(ad.competitorId, competitorId), eq(ad.platform, 'meta'), eq(ad.isActive, true), or(eq(ad.advertiserId, pageId), isNull(ad.advertiserId))))
        .limit(1);
      if (existingActive.length > 0) {
        markMissingInactive = false;
        console.warn(`[ads] meta competitor ${competitorId} page ${pageId}: vendor ${vendor} returned an empty response while active ads exist; skipping deactivation`);
      }
    }
    // A response cut off at the vendor's cap (Apify count / ScrapeCreators page limit) doesn't
    // list every active ad, so ads beyond the cap must not be marked ended.
    if (truncated) {
      markMissingInactive = false;
      console.warn(`[ads] meta competitor ${competitorId} page ${pageId}: vendor ${vendor} response was truncated at its cap (${raw.length} items); skipping deactivation`);
    }
    const r = await upsertAds(deps.db, competitorId, 'meta', captureId, ads, { markMissingInactive, advertiserId: pageId });
    return { pageId, status: 'ok', ads: r.upserted, deactivated: r.deactivated, vendor };
  }
  await recordVendorCapture(deps, { ...base, status: 'vendor_error', error: errors.join(' | ') || 'no Meta vendor configured' });
  return { pageId, status: 'vendor_error' };
}
```

- [ ] **Step 6: Drop `meta_page_id` and update the CLI**

Remove the `metaPageId` column (and its comment) from `competitor` in `packages/db/src/schema/tenancy.ts`, then run `pnpm --filter @cs/db generate --name=drop_meta_page_id`. Expected `0021_drop_meta_page_id.sql` with exactly `ALTER TABLE "competitor" DROP COLUMN "meta_page_id";` (no rename prompt: no column is added to `competitor` in the same diff).

In `apps/worker/src/cli/collect-once.ts`: declare the two options as repeatable

```ts
    'meta-page-id': { type: 'string', multiple: true },
    'google-advertiser-id': { type: 'string', multiple: true },
```

extend `USAGE` with `[--meta-page-id <id> …] [--google-advertiser-id <id> …]`, and replace the competitor upsert values/set with:

```ts
  const metaPageIds = values['meta-page-id'] ?? [];
  const googleAdvertiserIds = values['google-advertiser-id'] ?? [];
  const [row] = await db
    .insert(competitor)
    .values({ name: values.name ?? domain, domain, placeId: values['place-id'] ?? null, cid: values.cid ?? null, metaPageIds, googleAdvertiserIds })
    .onConflictDoUpdate({
      target: competitor.domain,
      set: {
        domain,
        ...(values['place-id'] ? { placeId: values['place-id'] } : {}),
        ...(values.cid ? { cid: values.cid } : {}),
        ...(metaPageIds.length > 0 ? { metaPageIds } : {}),
        ...(googleAdvertiserIds.length > 0 ? { googleAdvertiserIds } : {}),
      },
    })
    .returning();
```

`apps/worker/src/deps.ts` `runSource` passes the whole competitor row to the collectors, so it now hands over `metaPageIds`/`googleAdvertiserIds` without edits; confirm with `grep -rn "metaPageId\b" packages apps --include=*.ts` → no matches.

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter @cs/db test && pnpm --filter @cs/collectors test && pnpm --filter @cs/worker test && pnpm typecheck`
Expected: PASS. Then `pnpm db:migrate` (applies `0021` to cs_dev).

- [ ] **Step 8: Commit**

```bash
git add packages/collectors packages/db apps/worker/src/cli/collect-once.ts
git commit -m "feat(collectors): per-page Meta ads, pinned Google advertisers, own-activity ad end with ended capture

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Edited reviews, rank-scan grouping and the GBP address

**Files:**
- Modify: `packages/collectors/src/reviews/upsert.ts`, `packages/collectors/src/reviews/upsert.test.ts`
- Modify: `packages/collectors/src/rankings/scan.ts`, `packages/collectors/src/rankings/scan.test.ts`
- Modify: `packages/collectors/src/gbp/collect-gbp.ts`, `packages/collectors/src/gbp/collect-gbp.test.ts`
- Modify: `apps/worker/src/deps.ts` (rank-scan return type), `packages/collectors/src/reviews/collect.ts` (none — it ignores the new field)

**Interfaces:**
- Consumes: `reviewRevision`, `rankScan`, `rankSnapshot.scanId` (Task 2).
- Produces:
  - `upsertReviews(...)` → `{ upserted: number; skipped: number; edited: number }`. A review whose rating or text changed keeps its *old* version in `review_revision` (`replacedByCaptureId` = this capture) and the row takes the new values; a pull missing text or rating never erases it.
  - `scanRankings(...)` → `{ snapshots: number; failed: number; scanId: string | null }`; creates a `rank_scan` row (`running` → `done`, or `failed` if a non-vendor error escapes) and stamps each snapshot with `scanId`. `scanId` is null when the client has no service area or keywords.
  - `extractGbpProfile(item)` adds `address: string | null`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/collectors/src/reviews/upsert.test.ts` (add `reviewRevision` to the `@cs/db` import; the file already defines `CAP`, `salt` and `item(over)`):

```ts
describe('edited reviews (Phase 3b)', () => {
  const CAP2 = '00000000-0000-4000-8000-0000000000c2';
  beforeEach(async () => {
    await dbs.service.insert(capture).values({ id: CAP2, competitorId: IDS.competitorX, source: 'google_reviews', status: 'ok', collectorVersion: 'dfs/1' });
  });

  it('keeps the replaced version of an edited review as a revision and stores the new one', async () => {
    await upsertReviews(dbs.service, IDS.competitorX, CAP, [item({ rating: { value: 2 }, review_text: 'Late and rude' })], salt);
    const r = await upsertReviews(dbs.service, IDS.competitorX, CAP2, [item({ rating: { value: 4 }, review_text: 'Late, but they fixed it' })], salt);
    expect(r).toEqual({ upserted: 1, skipped: 0, edited: 1 });
    const [row] = await dbs.service.select().from(review);
    expect(row).toMatchObject({ rating: 4, text: 'Late, but they fixed it' });
    expect(await dbs.service.select({ rating: reviewRevision.rating, text: reviewRevision.text, by: reviewRevision.replacedByCaptureId }).from(reviewRevision)).toEqual([
      { rating: 2, text: 'Late and rude', by: CAP2 },
    ]);
  });

  it('treats an unchanged re-pull, or a pull without text, as no edit and never erases the text', async () => {
    await upsertReviews(dbs.service, IDS.competitorX, CAP, [item({ rating: { value: 5 }, review_text: 'Great' })], salt);
    expect((await upsertReviews(dbs.service, IDS.competitorX, CAP2, [item({ rating: { value: 5 }, review_text: 'Great' })], salt)).edited).toBe(0);
    expect((await upsertReviews(dbs.service, IDS.competitorX, CAP2, [item({ rating: { value: 5 }, review_text: null })], salt)).edited).toBe(0);
    expect((await dbs.service.select().from(review))[0]).toMatchObject({ rating: 5, text: 'Great' });
    expect(await dbs.service.select().from(reviewRevision)).toEqual([]);
  });
});
```

Update the existing assertion `toEqual({ upserted: 1, skipped: 1 })` in the same file to `toEqual({ upserted: 1, skipped: 1, edited: 0 })` (and any other `toEqual` on `upsertReviews`' result the same way).

In `packages/collectors/src/rankings/scan.test.ts` change the existing `toEqual({ snapshots: N, failed: M })` assertions to `toMatchObject({ snapshots: N, failed: M })`, add `rankScan` to the `@cs/db` import, and append:

```ts
  it('groups one run into a rank_scan and marks it done with its counts', async () => {
    const dfs = fakeDfs(() => [dfsTask([{ items: [] }])]);
    const r = await scanRankings({ db: dbs.service, dfs }, IDS.clientA1, { gridSize: 3 });
    const [scan] = await dbs.service.select().from(rankScan);
    expect(scan).toMatchObject({ id: r.scanId, agencyId: IDS.agencyA, clientId: IDS.clientA1, status: 'done', snapshots: 9, failed: 0 });
    expect(scan?.finishedAt).toBeInstanceOf(Date);
    expect(new Set((await dbs.service.select().from(rankSnapshot)).map((s) => s.scanId))).toEqual(new Set([r.scanId]));
  });

  it('marks the scan failed when a non-vendor error escapes', async () => {
    const dfs = fakeDfs(() => {
      throw new Error('db down');
    });
    await expect(scanRankings({ db: dbs.service, dfs }, IDS.clientA1, { gridSize: 3 })).rejects.toThrow('db down');
    expect((await dbs.service.select().from(rankScan))[0]).toMatchObject({ status: 'failed' });
  });

  it('creates no scan for a client without keywords', async () => {
    await dbs.service.update(client).set({ keywords: [] }).where(eq(client.id, IDS.clientA1));
    expect(await scanRankings({ db: dbs.service, dfs: fakeDfs(() => []) }, IDS.clientA1)).toEqual({ snapshots: 0, failed: 0, scanId: null });
    expect(await dbs.service.select().from(rankScan)).toEqual([]);
  });
```

Append to `packages/collectors/src/gbp/collect-gbp.test.ts` (add `extractGbpProfile` to its `./collect-gbp` import if missing):

```ts
it('keeps the business address in the GBP profile (new-location signal, Phase 3b)', () => {
  expect(extractGbpProfile({ title: 'Smith HVAC', address: '5387 Hwy 6 Ste 101, Woodway, TX 76712' })?.address).toBe('5387 Hwy 6 Ste 101, Woodway, TX 76712');
  expect(extractGbpProfile({ title: 'Smith HVAC' })?.address).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @cs/collectors test -- reviews rankings gbp`
Expected: FAIL — `edited` missing, no `rank_scan` rows, `address` undefined.

- [ ] **Step 3: Implement review revisions**

In `packages/collectors/src/reviews/upsert.ts` change imports to `import { type Db, review, reviewRevision } from '@cs/db';` and `import { and, eq, inArray, sql } from 'drizzle-orm';`, then replace the end of `upsertReviews` (from `const rows = …`):

```ts
  const rows = [...rowsByKey.values()];
  let edited = 0;
  if (rows.length > 0) {
    // Edited reviews (3b carry-over): the row keeps the latest version; the replaced one goes to
    // review_revision. A pull that lacks text or rating is not an edit and never erases them.
    // Reviews without a vendor review_id are keyed by a hash of their text, so editing one of those
    // shows up as a new review instead (documented limitation).
    const existing = await db
      .select({ id: review.id, dedupeKey: review.dedupeKey, rating: review.rating, text: review.text })
      .from(review)
      .where(and(eq(review.competitorId, competitorId), eq(review.source, 'google'), inArray(review.dedupeKey, rows.map((r) => r.dedupeKey))));
    const revisions = existing.flatMap((e) => {
      const next = rowsByKey.get(e.dedupeKey)!;
      const changed = (next.rating != null && next.rating !== e.rating) || (next.text != null && next.text !== e.text);
      return changed ? [{ reviewId: e.id, competitorId, rating: e.rating, text: e.text, replacedAt: now, replacedByCaptureId: captureId }] : [];
    });
    edited = revisions.length;
    await db.transaction(async (tx) => {
      if (revisions.length > 0) await tx.insert(reviewRevision).values(revisions);
      await tx.insert(review).values(rows).onConflictDoUpdate({
        target: [review.competitorId, review.source, review.dedupeKey],
        set: {
          lastSeenAt: sql`excluded.last_seen_at`,
          rating: sql`coalesce(excluded.rating, ${review.rating})`,
          text: sql`coalesce(excluded.text, ${review.text})`,
          ownerAnswer: sql`coalesce(excluded.owner_answer, ${review.ownerAnswer})`,
          ownerAnsweredAt: sql`coalesce(excluded.owner_answered_at, ${review.ownerAnsweredAt})`,
        },
      });
    });
  }
  return { upserted: rows.length, skipped, edited };
}
```

and change the function's declared return type to `Promise<{ upserted: number; skipped: number; edited: number }>`.

- [ ] **Step 4: Implement rank-scan grouping**

Replace `packages/collectors/src/rankings/scan.ts`'s imports and function body:

```ts
import { client, type Db, type RankResult, rankScan, rankSnapshot } from '@cs/db';
import { eq } from 'drizzle-orm';
import { gridPoints } from '../local/grid';
import { mapsSearch } from '../local/maps';
import { type DataForSeoClient, VendorError } from '../vendors/dataforseo';

/**
 * Scans a client's keywords across a grid of map points and stores one tenant-scoped rank_snapshot per
 * keyword x point, grouped under one rank_scan (Phase 3b: rank deltas compare scan to scan). Snapshots
 * store parsed results only (captureId stays null; the capture table requires a competitor) — no
 * evidence is recorded for this vendor call.
 *
 * Bounds paid live DataForSEO calls: gridSize=7 x maxKeywords=5 is already 245 live searches (~$0.49)
 * per client per run.
 *
 * A VendorError on one point is logged and counted in `failed`, and the scan moves on (no snapshot is
 * stored for that point) — the job runs once (no pg-boss retry), so aborting would lose the rest of an
 * already-paid scan. Any other error (DB, bug) marks the scan failed and still throws.
 */
export async function scanRankings(
  deps: { db: Db; dfs: DataForSeoClient },
  clientId: string,
  opts: { gridSize?: number; maxKeywords?: number; depth?: number } = {},
): Promise<{ snapshots: number; failed: number; scanId: string | null }> {
  const [c] = await deps.db.select().from(client).where(eq(client.id, clientId)).limit(1);
  if (!c?.serviceArea || c.keywords.length === 0) return { snapshots: 0, failed: 0, scanId: null };
  const gridSize = Math.min(opts.gridSize ?? 7, 7);
  const maxKeywords = Math.min(opts.maxKeywords ?? 5, 5);
  const depth = Math.min(opts.depth ?? 20, 20);
  const points = gridPoints(c.serviceArea.center, c.serviceArea.radiusKm, gridSize);
  const scope = { agencyId: c.agencyId, clientId: c.id };
  const [scan] = await deps.db.insert(rankScan).values({ agencyId: c.agencyId, clientId: c.id }).returning({ id: rankScan.id });
  const scanId = scan!.id;
  let snapshots = 0;
  let failed = 0;
  try {
    for (const keyword of c.keywords.slice(0, maxKeywords)) {
      for (const pt of points) {
        let places: Awaited<ReturnType<typeof mapsSearch>>['places'];
        try {
          ({ places } = await mapsSearch(deps.dfs, { keyword, lat: pt.lat, lng: pt.lng, depth }, scope));
        } catch (err) {
          if (!(err instanceof VendorError)) throw err;
          failed++;
          console.warn(`[rank-scan] ${clientId} "${keyword}" @ ${pt.lat},${pt.lng}: ${err.message} (code ${err.code ?? 'n/a'}) — point skipped`);
          continue;
        }
        const results: RankResult[] = places.map((p) => ({ rank: p.rank, placeId: p.placeId, cid: p.cid, domain: p.domain, title: p.title }));
        await deps.db.insert(rankSnapshot).values({ agencyId: c.agencyId, clientId: c.id, scanId, keyword, lat: pt.lat, lng: pt.lng, results });
        snapshots++;
      }
    }
  } catch (err) {
    await deps.db.update(rankScan).set({ status: 'failed', snapshots, failed, finishedAt: new Date() }).where(eq(rankScan.id, scanId));
    throw err;
  }
  await deps.db.update(rankScan).set({ status: 'done', snapshots, failed, finishedAt: new Date() }).where(eq(rankScan.id, scanId));
  return { snapshots, failed, scanId };
}
```

In `apps/worker/src/deps.ts` widen the interface line to `scanRankings(clientId: string): Promise<{ snapshots: number; failed: number; scanId: string | null }>;`.

- [ ] **Step 5: Keep the GBP address**

In `packages/collectors/src/gbp/collect-gbp.ts` add `address: z.string().nullish(),` to `gbpSchema` and `address: i.address ?? null,` to the object returned by `extractGbpProfile` (after `domain`).

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @cs/collectors test && pnpm --filter @cs/worker test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/collectors apps/worker/src/deps.ts
git commit -m "feat(collectors): review revisions for edited reviews, rank scans group snapshots, GBP address

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Vendor diff stage and the ads differ

**Files:**
- Create: `packages/engine/src/structured/vendor-diff.ts`, `packages/engine/src/structured/ads.ts`, `packages/engine/src/diff.ts`
- Create: `packages/engine/src/structured/ads.test.ts`
- Modify: `packages/engine/src/sweep.ts`, `packages/engine/src/sweep.test.ts`, `packages/engine/src/drain.ts`, `packages/engine/src/index.ts`, `packages/engine/test/seed.ts`
- Modify: `apps/worker/src/deps.ts` (`diffCapture` uses the dispatcher)

**Interfaces:**
- Consumes: `ad.endedCaptureId`, per-page Meta capture urls (Task 4); `ChangeDetails` (Task 3); `runStage`/`StageOutcome` (`../stage`).
- Produces:
  - `structured/vendor-diff.ts`: `VENDOR_DIFF_STAGE = 'vendor_diff'`, `VENDOR_DIFF_VERSION = 1`, `VENDOR_SETTLE_MINUTES = 10`, `interface StructuredChange { kind: 'added' | 'removed' | 'modified'; blockKey: string; beforeText: string | null; afterText: string | null; details: ChangeDetails }`, `type CaptureRow = typeof capture.$inferSelect`, `type SourceDiffer = (db: Db, cap: CaptureRow, prev: CaptureRow) => Promise<StructuredChange[]>`, `vendorDiffSources(): string[]`, `previousVendorCapture(db, cap): Promise<CaptureRow | null>`, `diffVendorCapture(deps: { db: Db }, captureId: string, opts?: { now?: Date }): Promise<StageOutcome<{ baseline: boolean; changeIds: string[] }>>`. Differs are registered in the `DIFFERS` map in this file (Task 6: ads; Task 7: GBP, jobs; Task 8: reviews).
  - `structured/ads.ts`: `AD_START_WINDOW_DAYS = 30`, `MAX_CHANGE_ITEMS = 25`, `adLabel(a): string`, `diffAds: SourceDiffer`.
  - `diff.ts`: `diffCapture(deps: EngineDeps, captureId: string): Promise<{ ran: boolean; changeIds: string[] }>` — web captures → `diffWebCapture`, everything else → `diffVendorCapture`.
  - `findEngineWork` now also returns ok vendor captures of registered sources older than `VENDOR_SETTLE_MINUTES` in `diff`.
  - `test/seed.ts`: `seedVendorCapture(db, input: { competitorId: string; source: string; capturedAt: Date; url?: string | null }): Promise<string>`.

- [ ] **Step 1: Write the failing tests**

Add to `packages/engine/test/seed.ts`:

```ts
/** Inserts an ok vendor capture row (no evidence object — structured differs read the rows collectors wrote). */
export async function seedVendorCapture(db: Db, input: { competitorId: string; source: string; capturedAt: Date; url?: string | null }): Promise<string> {
  const id = randomUUID();
  await db.insert(capture).values({ id, competitorId: input.competitorId, source: input.source, url: input.url ?? null, status: 'ok', collectorVersion: 'test/1', capturedAt: input.capturedAt });
  return id;
}
```

`packages/engine/src/structured/ads.test.ts`:

```ts
import { ad, detectedChange, stageRun } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { metaPageUrl } from '@cs/collectors';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { day, seedVendorCapture } from '../../test/seed';
import { diffVendorCapture } from './vendor-diff';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const now = day(30);
let cap0: string;
let cap1: string;

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  cap0 = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'meta_ads', url: metaPageUrl('99'), capturedAt: day(0) });
  cap1 = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'meta_ads', url: metaPageUrl('99'), capturedAt: day(7) });
});

const metaAd = (externalId: string, over: Partial<typeof ad.$inferInsert> = {}) =>
  dbs.service.insert(ad).values({ competitorId: IDS.competitorX, platform: 'meta', externalId, advertiserId: '99', text: `Ad ${externalId}: AC tune-up $79`, isActive: true, startedAt: day(5), ...over });

describe('diffVendorCapture — ads', () => {
  it('treats the first capture of a page as a silent baseline', async () => {
    await metaAd('A0', { firstCaptureId: cap0 });
    const r = await diffVendorCapture({ db: dbs.service }, cap0, { now });
    expect(r).toEqual({ ran: true, result: { baseline: true, changeIds: [] } });
    expect(await dbs.service.select().from(detectedChange)).toEqual([]);
  });

  it('groups ads started and stopped in a capture into one change each', async () => {
    await metaAd('NEW', { firstCaptureId: cap1, lastCaptureId: cap1 });
    await metaAd('OLDCREATIVE', { firstCaptureId: cap1, startedAt: day(-200) }); // old creative newly in view: not news
    await metaAd('BORN_DEAD', { firstCaptureId: cap1, isActive: false }); // first seen already inactive
    await metaAd('ENDED', { firstCaptureId: cap0, isActive: false, endedCaptureId: cap1 });
    const r = await diffVendorCapture({ db: dbs.service }, cap1, { now });
    expect(r.ran && r.result.changeIds).toHaveLength(2);
    const rows = (await dbs.service.select().from(detectedChange)).sort((a, b) => a.kind.localeCompare(b.kind));
    expect(rows.map((c) => [c.kind, c.blockKey, c.source, c.beforeCaptureId, c.afterCaptureId])).toEqual([
      ['added', 'ads:meta:started', 'meta_ads', cap0, cap1],
      ['removed', 'ads:meta:stopped', 'meta_ads', cap0, cap1],
    ]);
    expect(rows[0]?.details).toMatchObject({ changeType: 'ad_started', count: 1, pageId: '99', items: [{ id: 'NEW', label: 'Ad NEW: AC tune-up $79' }] });
    expect(rows[0]?.afterText).toBe('Ad NEW: AC tune-up $79');
    expect(rows[1]?.details).toMatchObject({ changeType: 'ad_stopped', count: 1, items: [{ id: 'ENDED' }] });
    expect(rows[1]?.beforeText).toBe('Ad ENDED: AC tune-up $79');
  });

  it('compares each Meta page with its own history (a new page starts as a baseline)', async () => {
    const page77 = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'meta_ads', url: metaPageUrl('77'), capturedAt: day(8) });
    await metaAd('P77', { advertiserId: '77', firstCaptureId: page77 });
    expect(await diffVendorCapture({ db: dbs.service }, page77, { now })).toEqual({ ran: true, result: { baseline: true, changeIds: [] } });
  });

  it('refuses to diff a capture younger than the settle delay, without claiming it', async () => {
    const r = await diffVendorCapture({ db: dbs.service }, cap1, { now: new Date(day(7).getTime() + 5 * 60_000) });
    expect(r).toEqual({ ran: false });
    expect(await dbs.service.select().from(stageRun)).toEqual([]);
  });

  it('is idempotent', async () => {
    await metaAd('NEW', { firstCaptureId: cap1 });
    await diffVendorCapture({ db: dbs.service }, cap1, { now });
    expect(await diffVendorCapture({ db: dbs.service }, cap1, { now })).toEqual({ ran: false });
    expect(await dbs.service.select().from(detectedChange)).toHaveLength(1);
  });
});
```

Append to `packages/engine/src/sweep.test.ts` (inside its top-level `describe`; it already has `dbs`, `seedTenancy` and imports `findEngineWork`; add `capture` to its `@cs/db` import if missing):

```ts
  it('offers settled vendor captures of sources that have a differ, and nothing else', async () => {
    const mk = async (source: string, minutesAgo: number) => {
      const [row] = await dbs.service
        .insert(capture)
        .values({ competitorId: IDS.competitorX, source, status: 'ok', collectorVersion: 'test/1', capturedAt: new Date(Date.now() - minutesAgo * 60_000) })
        .returning({ id: capture.id });
      return row!.id;
    };
    const settled = await mk('meta_ads', 15);
    const fresh = await mk('meta_ads', 2);
    const unknown = await mk('instagram', 15);
    const w = await findEngineWork(dbs.service, { limit: 50 });
    expect(w.diff).toContain(settled);
    expect(w.diff).not.toContain(fresh);
    expect(w.diff).not.toContain(unknown);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @cs/engine test -- ads sweep`
Expected: FAIL — `./vendor-diff` does not exist; the sweep does not return vendor captures.

- [ ] **Step 3: Implement the vendor diff stage**

`packages/engine/src/structured/vendor-diff.ts`:

```ts
import { capture, type ChangeDetails, type Db, detectedChange } from '@cs/db';
import { and, desc, eq, isNull, lt } from 'drizzle-orm';
import { runStage, type StageOutcome } from '../stage';
import { diffAds } from './ads';

export const VENDOR_DIFF_STAGE = 'vendor_diff';
export const VENDOR_DIFF_VERSION = 1;
/**
 * Collectors record the capture row first and write ads/reviews/jobs/GBP rows afterwards, so a vendor
 * capture is diffed only once it is this old — an immediate diff would see nothing and mark it done.
 */
export const VENDOR_SETTLE_MINUTES = 10;

export interface StructuredChange {
  kind: 'added' | 'removed' | 'modified';
  blockKey: string;
  beforeText: string | null;
  afterText: string | null;
  details: ChangeDetails;
}

export type CaptureRow = typeof capture.$inferSelect;
/** Compares a vendor capture with the previous ok capture of the same competitor, source and url. Never calls a model. */
export type SourceDiffer = (db: Db, cap: CaptureRow, prev: CaptureRow) => Promise<StructuredChange[]>;

/** Capture sources with a structured differ. Only these are swept, so a source without one is never marked done. */
const DIFFERS: Record<string, SourceDiffer> = {
  google_ads: diffAds,
  meta_ads: diffAds,
};

export const vendorDiffSources = (): string[] => Object.keys(DIFFERS);

/** The latest earlier ok capture of the same competitor, source and url (Meta captures are per page). */
export async function previousVendorCapture(db: Db, cap: CaptureRow): Promise<CaptureRow | null> {
  const [prev] = await db
    .select()
    .from(capture)
    .where(
      and(
        eq(capture.competitorId, cap.competitorId), eq(capture.source, cap.source), eq(capture.status, 'ok'),
        cap.url === null ? isNull(capture.url) : eq(capture.url, cap.url), lt(capture.capturedAt, cap.capturedAt),
      ),
    )
    .orderBy(desc(capture.capturedAt))
    .limit(1);
  return prev ?? null;
}

/** Spec §6.1 structured sources: set differences between two vendor captures → detected changes. The first capture is a silent baseline. */
export async function diffVendorCapture(
  deps: { db: Db },
  captureId: string,
  opts: { now?: Date } = {},
): Promise<StageOutcome<{ baseline: boolean; changeIds: string[] }>> {
  const [cap] = await deps.db.select().from(capture).where(eq(capture.id, captureId)).limit(1);
  const differ = cap ? DIFFERS[cap.source] : undefined;
  if (!cap || cap.status !== 'ok' || !differ) throw new Error(`capture ${captureId} is not an ok vendor capture with a structured differ`);
  const now = opts.now ?? new Date();
  if (now.getTime() - cap.capturedAt.getTime() < VENDOR_SETTLE_MINUTES * 60_000) return { ran: false };
  return runStage(
    deps.db,
    { stage: VENDOR_DIFF_STAGE, version: VENDOR_DIFF_VERSION, subjectId: captureId },
    async () => {
      const prev = await previousVendorCapture(deps.db, cap);
      return { prev, changes: prev ? await differ(deps.db, cap, prev) : [] };
    },
    async (tx, { prev, changes }) => {
      if (!prev || changes.length === 0) return { baseline: prev === null, changeIds: [] as string[] };
      const rows = await tx
        .insert(detectedChange)
        .values(
          changes.map((c) => ({
            competitorId: cap.competitorId, source: cap.source, kind: c.kind, beforeCaptureId: prev.id, afterCaptureId: cap.id,
            blockKey: c.blockKey, beforeText: c.beforeText, afterText: c.afterText, details: c.details, stageVersion: VENDOR_DIFF_VERSION,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: detectedChange.id });
      return { baseline: false, changeIds: rows.map((r) => r.id) };
    },
  );
}
```

`packages/engine/src/structured/ads.ts`:

```ts
import { ad } from '@cs/db';
import { and, eq, gte, isNotNull, isNull, or } from 'drizzle-orm';
import type { SourceDiffer, StructuredChange } from './vendor-diff';

/** A creative first seen in a capture is "started" only if the vendor says it began this recently — not an old ad newly in view. */
export const AD_START_WINDOW_DAYS = 30;
/** Items listed on one change (the count covers all of them). */
export const MAX_CHANGE_ITEMS = 25;
const DAY_MS = 86_400_000;

export const adLabel = (a: { externalId: string; title: string | null; text: string | null }): string =>
  (a.text ?? a.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 200) || `creative ${a.externalId}`;

function pageIdOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).searchParams.get('view_all_page_id');
  } catch {
    return null;
  }
}

/**
 * Ads started in this capture (first seen here, recently started, not first seen already inactive) and ads
 * ended by it (`ended_capture_id`), each grouped into one change whose count drives the size curve.
 * Meta captures are per page, so both sets are already scoped to the page.
 */
export const diffAds: SourceDiffer = async (db, cap) => {
  const platform = cap.source === 'meta_ads' ? 'meta' : 'google';
  const startedSince = new Date(cap.capturedAt.getTime() - AD_START_WINDOW_DAYS * DAY_MS);
  const mine = and(eq(ad.competitorId, cap.competitorId), eq(ad.platform, platform));
  const started = await db
    .select()
    .from(ad)
    .where(and(mine, eq(ad.firstCaptureId, cap.id), or(isNull(ad.startedAt), gte(ad.startedAt, startedSince)), or(eq(ad.isActive, true), isNotNull(ad.endedCaptureId))));
  const stopped = await db.select().from(ad).where(and(mine, eq(ad.endedCaptureId, cap.id)));
  const pageId = platform === 'meta' ? pageIdOf(cap.url) : null;
  const items = (rows: typeof started) => rows.slice(0, MAX_CHANGE_ITEMS).map((a) => ({ id: a.externalId, label: adLabel(a) }));
  const text = (rows: typeof started) => items(rows).map((i) => i.label).join('\n');
  const out: StructuredChange[] = [];
  if (started.length > 0) {
    out.push({ kind: 'added', blockKey: `ads:${platform}:started`, beforeText: null, afterText: text(started), details: { changeType: 'ad_started', count: started.length, items: items(started), pageId } });
  }
  if (stopped.length > 0) {
    out.push({ kind: 'removed', blockKey: `ads:${platform}:stopped`, beforeText: text(stopped), afterText: null, details: { changeType: 'ad_stopped', count: stopped.length, items: items(stopped), pageId } });
  }
  return out;
};
```

`packages/engine/src/diff.ts`:

```ts
import { capture } from '@cs/db';
import { eq } from 'drizzle-orm';
import { diffVendorCapture } from './structured/vendor-diff';
import { diffWebCapture, type EngineDeps } from './web/diff-stage';

/** The engine-diff job's entry point: web captures go through the web diff, every other source through its structured differ. */
export async function diffCapture(deps: EngineDeps, captureId: string): Promise<{ ran: boolean; changeIds: string[] }> {
  const [cap] = await deps.db.select({ source: capture.source }).from(capture).where(eq(capture.id, captureId)).limit(1);
  if (!cap) throw new Error(`capture ${captureId} not found`);
  const o = cap.source === 'web' ? await diffWebCapture(deps, captureId) : await diffVendorCapture(deps, captureId);
  return o.ran ? { ran: true, changeIds: o.result.changeIds } : { ran: false, changeIds: [] };
}
```

- [ ] **Step 4: Sweep, drain, exports and worker**

In `packages/engine/src/sweep.ts` import `{ VENDOR_DIFF_STAGE, VENDOR_DIFF_VERSION, VENDOR_SETTLE_MINUTES, vendorDiffSources } from './structured/vendor-diff'` and, after the web `diff` query, add:

```ts
  const vendorDiff = await db.execute(sql`
    SELECT c.id FROM capture c
    WHERE c.source IN (${sql.join(vendorDiffSources().map((s) => sql`${s}`), sql`, `)}) AND c.status = 'ok'
      AND c.captured_at < now() - make_interval(mins => ${VENDOR_SETTLE_MINUTES}::int) ${only('c.competitor_id')}
      AND NOT ${finished(VENDOR_DIFF_STAGE, VENDOR_DIFF_VERSION, 'c.id')}
    ORDER BY c.captured_at ASC LIMIT ${opts.limit}`);
```

and return `diff: [...ids(diff), ...ids(vendorDiff)]`.

In `packages/engine/src/drain.ts` replace the `diffWebCapture` import/call with `diffCapture` from `./diff`:

```ts
      await attempt(`diff ${id}`, async () => {
        const o = await diffCapture(deps, id);
        if (o.ran) {
          r.diffs++;
          r.changes += o.changeIds.length;
        }
      });
```

In `packages/engine/src/index.ts` add `export * from './diff';`, `export * from './structured/vendor-diff';`, `export * from './structured/ads';`.

In `apps/worker/src/deps.ts` import `diffCapture` from `@cs/engine` (drop `diffWebCapture`) and replace the method:

```ts
    async diffCapture(captureId) {
      return diffCapture({ db: getDb(), store: getStore(), ai: await getAi() }, captureId);
    },
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @cs/engine test && pnpm --filter @cs/worker test && pnpm typecheck`
Expected: PASS (existing drain/sweep web tests unchanged).

- [ ] **Step 6: Commit**

```bash
git add packages/engine apps/worker/src/deps.ts
git commit -m "feat(engine): vendor diff stage with settle delay; ads started/stopped as grouped changes

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 7: Jobs and Google Business Profile differs (hiring, services, location, hours, rating)

**Files:**
- Create: `packages/engine/src/structured/jobs.ts`, `packages/engine/src/structured/gbp.ts`
- Create: `packages/engine/src/structured/jobs.test.ts`, `packages/engine/src/structured/gbp.test.ts`
- Modify: `packages/engine/src/structured/vendor-diff.ts` (register differs), `packages/engine/src/index.ts`

**Interfaces:**
- Consumes: `SourceDiffer`, `StructuredChange`, `MAX_CHANGE_ITEMS` (Task 6); `observation` rows `job_posting` (data `{ title, employer, location, sourceUrl, salary, contractType, postedAt }`) and `gbp_profile` (data from `extractGbpProfile`, now with `address`, Task 5).
- Produces:
  - `jobs.ts`: `JOB_LOOKBACK_DAYS = 60`, `diffJobs: SourceDiffer` — one `added` change `jobs:new` (`changeType: 'hiring'`, `count`, `items`) for postings not listed by any job capture of the competitor in the previous 60 days. Removed postings are not changes.
  - `gbp.ts`: `RATING_CHANGE_MIN = 0.1`, `interface GbpProfile` (the stored observation shape), `diffGbpProfiles(before: GbpProfile, after: GbpProfile): StructuredChange[]`, `diffGbp: SourceDiffer`. Block keys: `gbp:category:<name>`, `gbp:service:<name>` (`new_service` / `service_removed`), `gbp:address` (`new_location`), `gbp:title`, `gbp:domain`, `gbp:hours`, `gbp:status` (`content`), `gbp:rating` (`rating_change` with `ratingBefore/After`, `votesBefore/After`).
  - `DIFFERS` gains `google_jobs: diffJobs`, `google_business_profile: diffGbp`.

- [ ] **Step 1: Write the failing tests**

`packages/engine/src/structured/jobs.test.ts`:

```ts
import { detectedChange, observation } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { day, seedVendorCapture } from '../../test/seed';
import { diffVendorCapture } from './vendor-diff';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const now = day(30);
let cap0: string;
let cap1: string;

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  cap0 = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'google_jobs', capturedAt: day(0) });
  cap1 = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'google_jobs', capturedAt: day(7) });
});

const jobs = (captureId: string, keys: string[]) =>
  dbs.service.insert(observation).values(
    keys.map((key) => ({ competitorId: IDS.competitorX, captureId, kind: 'job_posting', key, data: { title: `HVAC Technician ${key}`, employer: 'Smith HVAC', location: 'Plano, TX 75023' } })),
  );

describe('diffVendorCapture — jobs', () => {
  it('groups postings new since the previous pulls into one hiring change', async () => {
    await jobs(cap0, ['j1', 'j2']);
    await jobs(cap1, ['j1', 'j3', 'j4']);
    await diffVendorCapture({ db: dbs.service }, cap1, { now });
    const [c] = await dbs.service.select().from(detectedChange);
    expect(c).toMatchObject({ kind: 'added', blockKey: 'jobs:new', source: 'google_jobs' });
    expect(c?.details).toMatchObject({ changeType: 'hiring', count: 2, items: [{ id: 'j3', label: 'HVAC Technician j3 — Plano, TX 75023' }, { id: 'j4' }] });
  });

  it('does not count a posting any pull listed in the last 60 days (postings flicker between pulls)', async () => {
    const older = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'google_jobs', capturedAt: day(-20) });
    await jobs(older, ['j5']);
    await jobs(cap0, ['j1']);
    await jobs(cap1, ['j1', 'j5']);
    await diffVendorCapture({ db: dbs.service }, cap1, { now });
    expect(await dbs.service.select().from(detectedChange)).toEqual([]);
  });

  it('never reports removed postings', async () => {
    await jobs(cap0, ['j1', 'j2']);
    await jobs(cap1, ['j1']);
    await diffVendorCapture({ db: dbs.service }, cap1, { now });
    expect(await dbs.service.select().from(detectedChange)).toEqual([]);
  });
});
```

`packages/engine/src/structured/gbp.test.ts`:

```ts
import { detectedChange, observation } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { day, seedVendorCapture } from '../../test/seed';
import { diffGbpProfiles, type GbpProfile } from './gbp';
import { diffVendorCapture } from './vendor-diff';

const base: GbpProfile = {
  title: 'Smith HVAC', category: 'HVAC contractor', additionalCategories: ['Air conditioning repair service'], rating: 4.6, votes: 120,
  phone: '(214) 555-0100', url: 'https://smithhvac.example/', domain: 'smithhvac.example', currentStatus: 'open', address: '1 Main St, Plano, TX 75023',
  services: [{ title: 'Ducts' }],
  workHours: { work_hours: { timetable: { monday: [{ open: { hour: 8, minute: 0 }, close: { hour: 17, minute: 0 } }] }, current_status: 'open' } },
};
const keys = (cs: ReturnType<typeof diffGbpProfiles>) => cs.map((c) => [c.kind, c.blockKey, c.details.changeType]);

describe('diffGbpProfiles', () => {
  it('reports added/removed categories and services as new_service / service_removed', () => {
    const after = { ...base, additionalCategories: ['Plumber'], services: [{ title: 'Ducts' }, { title: 'Water heater installation' }] };
    expect(keys(diffGbpProfiles(base, after))).toEqual([
      ['added', 'gbp:category:plumber', 'new_service'],
      ['removed', 'gbp:category:air conditioning repair service', 'service_removed'],
      ['added', 'gbp:service:water heater installation', 'new_service'],
    ]);
  });

  it('turns a moved address into a new_location change', () => {
    const [c] = diffGbpProfiles(base, { ...base, address: '900 Oak Ave, Frisco, TX 75034' });
    expect(c).toMatchObject({ kind: 'modified', blockKey: 'gbp:address', beforeText: '1 Main St, Plano, TX 75023', afterText: '900 Oak Ave, Frisco, TX 75034', details: { changeType: 'new_location', field: 'address' } });
  });

  it('reports a rating move of 0.1 or more as rating_change; ignores smaller moves and the open/closed-now status', () => {
    expect(diffGbpProfiles(base, { ...base, rating: 4.4, votes: 131 })).toEqual([
      expect.objectContaining({ blockKey: 'gbp:rating', details: { changeType: 'rating_change', field: 'rating', ratingBefore: 4.6, ratingAfter: 4.4, votesBefore: 120, votesAfter: 131 } }),
    ]);
    expect(diffGbpProfiles(base, { ...base, rating: 4.65, currentStatus: 'close' })).toEqual([]);
  });

  it('reports hours, name and a permanent closure as content changes, but not the phone number', () => {
    const after: GbpProfile = {
      ...base, title: 'Smith Heating & Air', phone: '(214) 555-0199', currentStatus: 'closed_forever',
      workHours: { work_hours: { timetable: { monday: [{ open: { hour: 9, minute: 0 }, close: { hour: 17, minute: 0 } }] } } },
    };
    const cs = diffGbpProfiles(base, after);
    expect(keys(cs)).toEqual([['modified', 'gbp:title', 'content'], ['modified', 'gbp:hours', 'content'], ['modified', 'gbp:status', 'content']]);
    expect(cs[1]?.afterText).toBe('hours: monday 09:00–17:00');
  });

  it('ignores a profile without the field on either side', () => {
    expect(diffGbpProfiles({ ...base, address: null, rating: null }, { ...base, address: '9 Elm St', rating: 4.1 })).toEqual([]);
  });
});

describe('diffVendorCapture — google_business_profile', () => {
  const dbs = openTestDbs();
  afterAll(() => dbs.closeAll());
  beforeEach(async () => {
    await truncateAll(dbs.owner);
    await seedTenancy(dbs.owner);
  });

  it('diffs the gbp_profile observations of two captures', async () => {
    const cap0 = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'google_business_profile', capturedAt: day(0) });
    const cap1 = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'google_business_profile', capturedAt: day(7) });
    await dbs.service.insert(observation).values([
      { competitorId: IDS.competitorX, captureId: cap0, kind: 'gbp_profile', key: 'profile', data: { ...base } },
      { competitorId: IDS.competitorX, captureId: cap1, kind: 'gbp_profile', key: 'profile', data: { ...base, rating: 4.3 } },
    ]);
    await diffVendorCapture({ db: dbs.service }, cap1, { now: day(30) });
    expect((await dbs.service.select().from(detectedChange)).map((c) => [c.blockKey, c.source, c.beforeCaptureId])).toEqual([['gbp:rating', 'google_business_profile', cap0]]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @cs/engine test -- jobs gbp`
Expected: FAIL — modules `./gbp` missing; `diffVendorCapture` throws "not an ok vendor capture with a structured differ" for `google_jobs`.

- [ ] **Step 3: Implement the jobs differ**

`packages/engine/src/structured/jobs.ts`:

```ts
import { capture, observation } from '@cs/db';
import { and, eq, gte, inArray, lt } from 'drizzle-orm';
import { MAX_CHANGE_ITEMS } from './ads';
import type { SourceDiffer } from './vendor-diff';

/** A posting is new only if no job pull of this competitor listed it in this many days (postings flicker between pulls). */
export const JOB_LOOKBACK_DAYS = 60;
const DAY_MS = 86_400_000;

interface JobData {
  title?: string | null;
  location?: string | null;
}

const jobLabel = (key: string, d: JobData) => [d.title, d.location].filter((x): x is string => Boolean(x)).join(' — ') || `posting ${key}`;

/** New job postings in this capture → one `hiring` change (spec §6.1 "new/removed job"; removals are noise and are not reported). */
export const diffJobs: SourceDiffer = async (db, cap) => {
  const current = await db
    .select({ key: observation.key, data: observation.data })
    .from(observation)
    .where(and(eq(observation.captureId, cap.id), eq(observation.kind, 'job_posting')));
  if (current.length === 0) return [];
  const since = new Date(cap.capturedAt.getTime() - JOB_LOOKBACK_DAYS * DAY_MS);
  const seen = await db
    .selectDistinct({ key: observation.key })
    .from(observation)
    .innerJoin(capture, eq(capture.id, observation.captureId))
    .where(
      and(
        eq(observation.competitorId, cap.competitorId), eq(observation.kind, 'job_posting'), inArray(observation.key, current.map((c) => c.key)),
        lt(capture.capturedAt, cap.capturedAt), gte(capture.capturedAt, since),
      ),
    );
  const known = new Set(seen.map((s) => s.key));
  const fresh = current.filter((j) => !known.has(j.key)).sort((a, b) => a.key.localeCompare(b.key));
  if (fresh.length === 0) return [];
  const items = fresh.slice(0, MAX_CHANGE_ITEMS).map((j) => ({ id: j.key, label: jobLabel(j.key, j.data as JobData) }));
  return [{ kind: 'added', blockKey: 'jobs:new', beforeText: null, afterText: items.map((i) => i.label).join('\n'), details: { changeType: 'hiring', count: fresh.length, items } }];
};
```

- [ ] **Step 4: Implement the GBP differ**

`packages/engine/src/structured/gbp.ts`:

```ts
import { observation } from '@cs/db';
import { and, eq } from 'drizzle-orm';
import type { SourceDiffer, StructuredChange } from './vendor-diff';

/** GBP ratings move in tenths; smaller deltas are rounding noise between pulls. */
export const RATING_CHANGE_MIN = 0.1;
/** The "open now / closed now" status flips with the clock; only other values (e.g. closed_forever) are news. */
const TRANSIENT_STATUS = /^(open|close|closed|opening_soon|closing_soon)$/i;

type Hm = { hour?: number; minute?: number };
/** The `gbp_profile` observation written by `extractGbpProfile` (Phase 2b, address added in 3b). */
export interface GbpProfile {
  title?: string | null;
  category?: string | null;
  additionalCategories?: string[] | null;
  rating?: number | null;
  votes?: number | null;
  phone?: string | null;
  url?: string | null;
  domain?: string | null;
  currentStatus?: string | null;
  address?: string | null;
  services?: unknown;
  workHours?: unknown;
}

const categories = (p: GbpProfile) => [p.category, ...(p.additionalCategories ?? [])].filter((x): x is string => typeof x === 'string' && x.length > 0);
const services = (p: GbpProfile) =>
  Array.isArray(p.services)
    ? p.services.map((s) => (s && typeof s === 'object' ? (s as { title?: unknown }).title : null)).filter((t): t is string => typeof t === 'string' && t.length > 0)
    : [];
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

function hoursText(p: GbpProfile): string | null {
  const timetable = (p.workHours as { work_hours?: { timetable?: Record<string, { open?: Hm; close?: Hm }[] | null> } } | null | undefined)?.work_hours?.timetable;
  if (!timetable || typeof timetable !== 'object') return null;
  const hm = (x?: Hm) => (x ? `${String(x.hour ?? 0).padStart(2, '0')}:${String(x.minute ?? 0).padStart(2, '0')}` : '?');
  return `hours: ${Object.entries(timetable)
    .map(([day, spans]) => `${day} ${Array.isArray(spans) && spans.length > 0 ? spans.map((s) => `${hm(s.open)}–${hm(s.close)}`).join(', ') : 'closed'}`)
    .join('; ')}`;
}

/** Field-level differences between two GBP profiles. Each change type is fixed here (no model choice). */
export function diffGbpProfiles(before: GbpProfile, after: GbpProfile): StructuredChange[] {
  const out: StructuredChange[] = [];
  for (const [field, list] of [['category', categories], ['service', services]] as const) {
    const was = new Map(list(before).map((x) => [norm(x), x]));
    const now = new Map(list(after).map((x) => [norm(x), x]));
    for (const [k, x] of now) if (!was.has(k)) out.push({ kind: 'added', blockKey: `gbp:${field}:${k}`, beforeText: null, afterText: x, details: { changeType: 'new_service', field } });
    for (const [k, x] of was) if (!now.has(k)) out.push({ kind: 'removed', blockKey: `gbp:${field}:${k}`, beforeText: x, afterText: null, details: { changeType: 'service_removed', field } });
  }
  if (before.address && after.address && norm(before.address) !== norm(after.address)) {
    out.push({ kind: 'modified', blockKey: 'gbp:address', beforeText: before.address, afterText: after.address, details: { changeType: 'new_location', field: 'address' } });
  }
  for (const field of ['title', 'domain'] as const) {
    const a = before[field];
    const b = after[field];
    if (a && b && norm(a) !== norm(b)) out.push({ kind: 'modified', blockKey: `gbp:${field}`, beforeText: `${field}: ${a}`, afterText: `${field}: ${b}`, details: { changeType: 'content', field } });
  }
  const h0 = hoursText(before);
  const h1 = hoursText(after);
  if (h0 && h1 && h0 !== h1) out.push({ kind: 'modified', blockKey: 'gbp:hours', beforeText: h0, afterText: h1, details: { changeType: 'content', field: 'hours' } });
  const s0 = before.currentStatus;
  const s1 = after.currentStatus;
  if (s0 && s1 && s0 !== s1 && !(TRANSIENT_STATUS.test(s0) && TRANSIENT_STATUS.test(s1))) {
    out.push({ kind: 'modified', blockKey: 'gbp:status', beforeText: `status: ${s0}`, afterText: `status: ${s1}`, details: { changeType: 'content', field: 'status' } });
  }
  const r0 = before.rating;
  const r1 = after.rating;
  if (typeof r0 === 'number' && typeof r1 === 'number' && Math.abs(r1 - r0) >= RATING_CHANGE_MIN - 1e-9) {
    out.push({
      kind: 'modified', blockKey: 'gbp:rating',
      beforeText: `rating ${r0} (${before.votes ?? '?'} reviews)`, afterText: `rating ${r1} (${after.votes ?? '?'} reviews)`,
      details: { changeType: 'rating_change', field: 'rating', ratingBefore: r0, ratingAfter: r1, votesBefore: before.votes ?? null, votesAfter: after.votes ?? null },
    });
  }
  return out;
}

const loadProfile = async (db: Parameters<SourceDiffer>[0], captureId: string): Promise<GbpProfile | null> => {
  const [row] = await db.select({ data: observation.data }).from(observation).where(and(eq(observation.captureId, captureId), eq(observation.kind, 'gbp_profile'))).limit(1);
  return (row?.data as GbpProfile | undefined) ?? null;
};

export const diffGbp: SourceDiffer = async (db, cap, prev) => {
  const [before, after] = await Promise.all([loadProfile(db, prev.id), loadProfile(db, cap.id)]);
  return before && after ? diffGbpProfiles(before, after) : [];
};
```

Register both in `vendor-diff.ts` (`import { diffGbp } from './gbp'; import { diffJobs } from './jobs';`):

```ts
const DIFFERS: Record<string, SourceDiffer> = {
  google_ads: diffAds,
  meta_ads: diffAds,
  google_business_profile: diffGbp,
  google_jobs: diffJobs,
};
```

Export both modules from `packages/engine/src/index.ts`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @cs/engine test -- structured sweep && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): jobs and Google Business Profile structured differs

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Review velocity differ (review spike)

**Files:**
- Create: `packages/engine/src/structured/reviews.ts`, `packages/engine/src/structured/reviews.test.ts`
- Modify: `packages/engine/src/structured/vendor-diff.ts` (register), `packages/engine/src/index.ts`

**Interfaces:**
- Consumes: `review` rows (`posted_at`, `rating`) written by `upsertReviews`; `SourceDiffer` (Task 6).
- Produces: `REVIEW_SPIKE_Z = 2`, `REVIEW_SPIKE_MIN = 4`, `REVIEW_BASELINE_WEEKS = 12`; `reviewVelocity(windowCount: number, windowDays: number, weekly: number[]): { perWeek: number; mean: number; sd: number; z: number }`; `diffReviews: SourceDiffer` → at most one `modified` change `reviews:velocity` with `details { changeType: 'review_spike', count, windowDays, baselineMean, z, avgRating }` and texts built from counts only (never review text). `DIFFERS.google_reviews = diffReviews`.

- [ ] **Step 1: Write the failing tests**

`packages/engine/src/structured/reviews.test.ts`:

```ts
import { detectedChange, review } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { day, seedVendorCapture } from '../../test/seed';
import { reviewVelocity } from './reviews';
import { diffVendorCapture } from './vendor-diff';

describe('reviewVelocity', () => {
  it('scales the window to a weekly rate and floors the deviation at 1', () => {
    expect(reviewVelocity(8, 7, Array(12).fill(1))).toEqual({ perWeek: 8, mean: 1, sd: 0, z: 7 });
    expect(reviewVelocity(4, 14, [2, 2, 2, 2])).toMatchObject({ perWeek: 2, z: 0 });
    expect(reviewVelocity(10, 7, [0, 10, 0, 10]).z).toBeCloseTo(1, 5); // mean 5, sd 5
  });
});

describe('diffVendorCapture — google_reviews', () => {
  const dbs = openTestDbs();
  afterAll(() => dbs.closeAll());
  let cap0: string;
  let cap1: string;
  let n = 0;
  const reviews = (count: number, postedAt: (i: number) => Date, rating = 5) =>
    dbs.service.insert(review).values(Array.from({ length: count }, (_, i) => ({ competitorId: IDS.competitorX, dedupeKey: `id:r${n++}`, rating, text: `secret review text ${i}`, postedAt: postedAt(i) })));

  beforeEach(async () => {
    await truncateAll(dbs.owner);
    await seedTenancy(dbs.owner);
    cap0 = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'google_reviews', capturedAt: day(0) });
    cap1 = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'google_reviews', capturedAt: day(7) });
    await reviews(12, (i) => day(-7 * i - 3)); // one review a week for the 12 weeks before the previous pull
  });

  it('flags a spike of reviews since the previous pull, with counts only (no review text)', async () => {
    await reviews(8, (i) => day(1 + (i % 5)), 1);
    await diffVendorCapture({ db: dbs.service }, cap1, { now: day(30) });
    const [c] = await dbs.service.select().from(detectedChange);
    expect(c).toMatchObject({ kind: 'modified', blockKey: 'reviews:velocity', source: 'google_reviews', beforeCaptureId: cap0 });
    expect(c?.details).toMatchObject({ changeType: 'review_spike', count: 8, windowDays: 7, baselineMean: 1, z: 7, avgRating: 1 });
    expect(`${c?.beforeText} ${c?.afterText}`).not.toMatch(/secret/);
  });

  it('ignores fewer than REVIEW_SPIKE_MIN reviews, and a normal week', async () => {
    await reviews(3, (i) => day(1 + i));
    await diffVendorCapture({ db: dbs.service }, cap1, { now: day(30) });
    expect(await dbs.service.select().from(detectedChange)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @cs/engine test -- reviews`
Expected: FAIL — `./reviews` missing.

- [ ] **Step 3: Implement**

`packages/engine/src/structured/reviews.ts`:

```ts
import { review } from '@cs/db';
import { and, avg, count, eq, gt, lte, sql } from 'drizzle-orm';
import type { SourceDiffer } from './vendor-diff';

/** Spike: the window's weekly review rate is this many deviations above the competitor's own baseline … */
export const REVIEW_SPIKE_Z = 2;
/** … and at least this many reviews arrived (3 reviews against a quiet baseline are not news). */
export const REVIEW_SPIKE_MIN = 4;
export const REVIEW_BASELINE_WEEKS = 12;
const DAY_MS = 86_400_000;
const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

/** Weekly rate of the window vs the weekly baseline; the deviation is floored at 1 so a quiet competitor's baseline of zeros doesn't explode. */
export function reviewVelocity(windowCount: number, windowDays: number, weekly: number[]): { perWeek: number; mean: number; sd: number; z: number } {
  const perWeek = (windowCount * 7) / windowDays;
  const mean = weekly.length > 0 ? weekly.reduce((a, b) => a + b, 0) / weekly.length : 0;
  const sd = weekly.length > 0 ? Math.sqrt(weekly.reduce((a, b) => a + (b - mean) ** 2, 0) / weekly.length) : 0;
  return { perWeek: round(perWeek), mean: round(mean), sd: round(sd), z: round((perWeek - mean) / Math.max(sd, 1)) };
}

/**
 * Spec §6.1/§6.3 review spike: reviews posted since the previous pull, against the 12 weeks before it.
 * Rating and velocity only — review text never enters a change (spec §4.5).
 */
export const diffReviews: SourceDiffer = async (db, cap, prev) => {
  const start = prev.capturedAt;
  const end = cap.capturedAt;
  const windowDays = Math.max(1, (end.getTime() - start.getTime()) / DAY_MS);
  const [w] = await db
    .select({ n: count(), avgRating: avg(review.rating) })
    .from(review)
    .where(and(eq(review.competitorId, cap.competitorId), gt(review.postedAt, start), lte(review.postedAt, end)));
  const windowCount = Number(w?.n ?? 0);
  if (windowCount < REVIEW_SPIKE_MIN) return [];
  const weeks = (await db.execute(sql`
    SELECT w.i, count(r.id)::int AS n
    FROM generate_series(1, ${REVIEW_BASELINE_WEEKS}::int) AS w(i)
    LEFT JOIN review r ON r.competitor_id = ${cap.competitorId}::uuid
      AND r.posted_at >  ${start.toISOString()}::timestamptz - make_interval(days => 7 * w.i)
      AND r.posted_at <= ${start.toISOString()}::timestamptz - make_interval(days => 7 * (w.i - 1))
    GROUP BY w.i ORDER BY w.i`)) as unknown as { n: number }[];
  const v = reviewVelocity(windowCount, windowDays, weeks.map((r) => Number(r.n)));
  if (v.z < REVIEW_SPIKE_Z) return [];
  const avgRating = w?.avgRating === null || w?.avgRating === undefined ? null : round(Number(w.avgRating), 1);
  const days = round(windowDays, 1);
  return [
    {
      kind: 'modified', blockKey: 'reviews:velocity',
      beforeText: `${v.mean} reviews/week over the previous ${REVIEW_BASELINE_WEEKS} weeks`,
      afterText: `${windowCount} reviews in ${days} days (${v.perWeek}/week)${avgRating !== null ? `, average rating ${avgRating}` : ''}`,
      details: { changeType: 'review_spike', count: windowCount, windowDays: days, baselineMean: v.mean, z: v.z, avgRating },
    },
  ];
};
```

Register in `vendor-diff.ts` (`import { diffReviews } from './reviews';`, add `google_reviews: diffReviews` to `DIFFERS`) and export from `index.ts`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @cs/engine test -- structured && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): review-velocity differ flags review spikes from counts only

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Rank-scan differ (tenant-private rank deltas)

**Files:**
- Create: `packages/engine/src/structured/rank.ts`, `packages/engine/src/structured/rank.test.ts`
- Modify: `packages/engine/src/sweep.ts` (`rankDiff` work), `packages/engine/src/drain.ts`, `packages/engine/src/index.ts`, `apps/worker/src/jobs/engine.test.ts` (the `findEngineWork` stub gains `rankDiff: []`)

**Interfaces:**
- Consumes: `rankScan`, `rankSnapshot.scanId` (Tasks 2, 5); `detectedChange.rankScanId/agencyId/clientId` (Task 3); `RankResult` (`@cs/db`).
- Produces:
  - `RANK_DIFF_STAGE = 'rank_diff'`, `RANK_DIFF_VERSION = 1`, `NOT_FOUND_RANK = 21`, `RANK_DELTA_MIN = 3`, `TOP3_SHARE_DELTA_MIN = 0.25`.
  - `competitorMatcher(c: { placeId: string | null; cid: string | null; domain: string | null }): (r: RankResult) => boolean`
  - `rankMetrics(results: RankResult[][], match): { avgRank: number; top3Share: number; points: number }`
  - `diffRankScan(deps: { db: Db }, scanId: string): Promise<StageOutcome<{ baseline: boolean; changeIds: string[] }>>` — compares a `done` scan with the client's previous `done` scan on the keywords and grid points both share; one `modified` change per competitor × keyword (`source 'rank'`, `blockKey 'rank:<keyword>'`, tenant columns set, `details { changeType: 'rank_change', keyword, avgRankBefore, avgRankAfter, top3Before, top3After, points }`).
  - `EngineWork.rankDiff: string[]` (done scans without a finished `rank_diff`); `DrainResult.rankDiffs: number`.

- [ ] **Step 1: Write the failing test**

`packages/engine/src/structured/rank.test.ts`:

```ts
import { clientCompetitor, competitor, detectedChange, type RankResult, rankScan, rankSnapshot, withTenant } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { day } from '../../test/seed';
import { findEngineWork } from '../sweep';
import { competitorMatcher, diffRankScan, rankMetrics } from './rank';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const POINTS = [[33.1, -96.1], [33.1, -96.2], [33.2, -96.1], [33.2, -96.2]] as const;
const hit = (rank: number): RankResult[] => [{ rank, placeId: 'PX', cid: null, domain: null, title: 'Smith HVAC' }];

async function scan(at: number, ranks: Record<string, number | null>) {
  const [s] = await dbs.service.insert(rankScan).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, status: 'done', startedAt: day(at), finishedAt: day(at) }).returning({ id: rankScan.id });
  for (const [keyword, rank] of Object.entries(ranks)) {
    for (const [lat, lng] of POINTS) {
      await dbs.service.insert(rankSnapshot).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, scanId: s!.id, keyword, lat, lng, results: rank === null ? [] : hit(rank), capturedAt: day(at) });
    }
  }
  return s!.id;
}

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.update(competitor).set({ placeId: 'PX' }).where(eq(competitor.id, IDS.competitorX));
});

describe('rank metrics', () => {
  it('averages positions with not-found as 21, and measures the top-3 share', () => {
    const m = competitorMatcher({ placeId: 'PX', cid: null, domain: null });
    expect(rankMetrics([hit(2), hit(4), [], hit(1)], m)).toEqual({ avgRank: 7, top3Share: 0.5, points: 4 });
    expect(competitorMatcher({ placeId: null, cid: null, domain: 'smithhvac.example' })({ rank: 1, placeId: null, cid: null, domain: 'smithhvac.example', title: '' })).toBe(true);
  });
});

describe('diffRankScan', () => {
  it('treats the first scan as a baseline', async () => {
    const s0 = await scan(0, { 'ac repair': 10 });
    expect(await diffRankScan({ db: dbs.service }, s0)).toEqual({ ran: true, result: { baseline: true, changeIds: [] } });
  });

  it('records a tenant-private rank change when the average position or top-3 share moves enough', async () => {
    await scan(0, { 'ac repair': 10, 'furnace repair': 5 });
    const s1 = await scan(30, { 'ac repair': 2, 'furnace repair': 6 });
    await diffRankScan({ db: dbs.service }, s1);
    const rows = await dbs.service.select().from(detectedChange);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      competitorId: IDS.competitorX, source: 'rank', kind: 'modified', blockKey: 'rank:ac repair', rankScanId: s1, afterCaptureId: null, agencyId: IDS.agencyA, clientId: IDS.clientA1,
      details: { changeType: 'rank_change', keyword: 'ac repair', avgRankBefore: 10, avgRankAfter: 2, top3Before: 0, top3After: 1, points: 4 },
    });
    // B1 tracks competitor X too, but never sees A1's rank change.
    expect(await withTenant(dbs.app, { agencyId: IDS.agencyB, clientScope: 'all' }, (tx) => tx.select().from(detectedChange))).toEqual([]);
  });

  it('ignores competitors the client does not track and competitors absent from both scans', async () => {
    await dbs.owner.delete(clientCompetitor).where(eq(clientCompetitor.clientId, IDS.clientA1));
    await scan(0, { 'ac repair': 10 });
    const s1 = await scan(30, { 'ac repair': 2 });
    await diffRankScan({ db: dbs.service }, s1);
    expect(await dbs.service.select().from(detectedChange)).toEqual([]);
  });

  it('is offered by the sweep once the scan is done', async () => {
    await scan(0, { 'ac repair': 10 });
    const s1 = await scan(30, { 'ac repair': 2 });
    expect((await findEngineWork(dbs.service, { limit: 10 })).rankDiff).toContain(s1);
    await diffRankScan({ db: dbs.service }, s1);
    expect((await findEngineWork(dbs.service, { limit: 10 })).rankDiff).not.toContain(s1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cs/engine test -- rank`
Expected: FAIL — `./rank` missing.

- [ ] **Step 3: Implement**

`packages/engine/src/structured/rank.ts`:

```ts
import { clientCompetitor, competitor, type Db, detectedChange, type RankResult, rankScan, rankSnapshot } from '@cs/db';
import { and, desc, eq, lt } from 'drizzle-orm';
import { runStage, type StageOutcome } from '../stage';

export const RANK_DIFF_STAGE = 'rank_diff';
export const RANK_DIFF_VERSION = 1;
/** Scans go 20 deep; a competitor missing from a grid point counts as position 21. */
export const NOT_FOUND_RANK = 21;
/** A rank change: the average grid position moved by at least this many places … */
export const RANK_DELTA_MIN = 3;
/** … or the share of grid points where the competitor is in the top 3 moved by at least this much. */
export const TOP3_SHARE_DELTA_MIN = 0.25;
const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

export function competitorMatcher(c: { placeId: string | null; cid: string | null; domain: string | null }): (r: RankResult) => boolean {
  return (r) => Boolean((c.placeId && r.placeId === c.placeId) || (c.cid && r.cid === c.cid) || (c.domain && r.domain === c.domain));
}

export function rankMetrics(results: RankResult[][], match: (r: RankResult) => boolean): { avgRank: number; top3Share: number; points: number } {
  const ranks = results.map((rs) => rs.find(match)?.rank ?? NOT_FOUND_RANK);
  const points = ranks.length;
  if (points === 0) return { avgRank: NOT_FOUND_RANK, top3Share: 0, points: 0 };
  return { avgRank: round(ranks.reduce((a, b) => a + b, 0) / points), top3Share: round(ranks.filter((r) => r <= 3).length / points), points };
}

const pointKey = (s: { keyword: string; lat: number; lng: number }) => `${s.keyword}|${s.lat.toFixed(5)},${s.lng.toFixed(5)}`;
const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * Spec §6.1/§6.3 rank delta, tenant-private (a client's keywords are its own): a done scan vs the client's
 * previous done scan, on the keywords and grid points both cover, for every competitor the client tracks.
 */
export async function diffRankScan(deps: { db: Db }, scanId: string): Promise<StageOutcome<{ baseline: boolean; changeIds: string[] }>> {
  const [scan] = await deps.db.select().from(rankScan).where(eq(rankScan.id, scanId)).limit(1);
  if (!scan || scan.status !== 'done' || !scan.finishedAt) throw new Error(`rank scan ${scanId} is not a finished scan`);
  const finishedAt = scan.finishedAt;
  return runStage(
    deps.db,
    { stage: RANK_DIFF_STAGE, version: RANK_DIFF_VERSION, subjectId: scanId },
    async () => {
      const [prev] = await deps.db
        .select({ id: rankScan.id })
        .from(rankScan)
        .where(and(eq(rankScan.clientId, scan.clientId), eq(rankScan.status, 'done'), lt(rankScan.finishedAt, finishedAt)))
        .orderBy(desc(rankScan.finishedAt))
        .limit(1);
      if (!prev) return { baseline: true, rows: [] as (typeof detectedChange.$inferInsert)[] };
      const [before, after, tracked] = await Promise.all([
        deps.db.select().from(rankSnapshot).where(eq(rankSnapshot.scanId, prev.id)),
        deps.db.select().from(rankSnapshot).where(eq(rankSnapshot.scanId, scanId)),
        deps.db
          .select({ id: competitor.id, placeId: competitor.placeId, cid: competitor.cid, domain: competitor.domain })
          .from(clientCompetitor)
          .innerJoin(competitor, eq(competitor.id, clientCompetitor.competitorId))
          .where(eq(clientCompetitor.clientId, scan.clientId)),
      ]);
      const beforeByPoint = new Map(before.map((s) => [pointKey(s), s.results]));
      const pairs = new Map<string, { before: RankResult[][]; after: RankResult[][] }>(); // keyword → results on shared points
      for (const s of after) {
        const b = beforeByPoint.get(pointKey(s));
        if (!b) continue;
        const p = pairs.get(s.keyword) ?? { before: [], after: [] };
        p.before.push(b);
        p.after.push(s.results);
        pairs.set(s.keyword, p);
      }
      const rows: (typeof detectedChange.$inferInsert)[] = [];
      for (const c of tracked) {
        const match = competitorMatcher(c);
        for (const [keyword, p] of [...pairs].sort(([a], [b]) => a.localeCompare(b))) {
          const m0 = rankMetrics(p.before, match);
          const m1 = rankMetrics(p.after, match);
          if (m0.avgRank === NOT_FOUND_RANK && m1.avgRank === NOT_FOUND_RANK) continue;
          if (Math.abs(m1.avgRank - m0.avgRank) < RANK_DELTA_MIN && Math.abs(m1.top3Share - m0.top3Share) < TOP3_SHARE_DELTA_MIN) continue;
          rows.push({
            competitorId: c.id, source: 'rank', kind: 'modified', rankScanId: scanId, agencyId: scan.agencyId, clientId: scan.clientId, blockKey: `rank:${keyword}`,
            beforeText: `"${keyword}": average map position ${m0.avgRank}, top 3 in ${pct(m0.top3Share)} of ${m0.points} points`,
            afterText: `"${keyword}": average map position ${m1.avgRank}, top 3 in ${pct(m1.top3Share)} of ${m1.points} points`,
            details: { changeType: 'rank_change', keyword, avgRankBefore: m0.avgRank, avgRankAfter: m1.avgRank, top3Before: m0.top3Share, top3After: m1.top3Share, points: m1.points },
            stageVersion: RANK_DIFF_VERSION,
          });
        }
      }
      return { baseline: false, rows };
    },
    async (tx, { baseline, rows }) => {
      if (rows.length === 0) return { baseline, changeIds: [] as string[] };
      const inserted = await tx.insert(detectedChange).values(rows).onConflictDoNothing().returning({ id: detectedChange.id });
      return { baseline, changeIds: inserted.map((r) => r.id) };
    },
  );
}
```

In `packages/engine/src/sweep.ts`: import `{ RANK_DIFF_STAGE, RANK_DIFF_VERSION } from './structured/rank'`, add `rankDiff: string[]` to `EngineWork`, and:

```ts
  // Rank scans are per client; a competitor filter (engine-once --competitor) does not apply to them.
  const rankDiff = opts.competitorId
    ? []
    : await db.execute(sql`
        SELECT s.id FROM rank_scan s
        WHERE s.status = 'done' AND s.finished_at IS NOT NULL AND NOT ${finished(RANK_DIFF_STAGE, RANK_DIFF_VERSION, 's.id')}
        ORDER BY s.finished_at ASC LIMIT ${opts.limit}`);
```

returning `rankDiff: ids(rankDiff)` (and including `w.rankDiff.length` in `drain.ts`'s "no work left" check).

In `packages/engine/src/drain.ts` add `rankDiffs: number` to `DrainResult` (initialised to 0) and, after the diff loop:

```ts
    for (const id of work.rankDiff) {
      await attempt(`rank diff ${id}`, async () => {
        const o = await diffRankScan(deps, id);
        if (o.ran) {
          r.rankDiffs++;
          r.changes += o.result.changeIds.length;
        }
      });
    }
```

Export `./structured/rank` from `index.ts`. In `apps/worker/src/jobs/engine.test.ts` change the `findEngineWork` stub to return `{ diff: [U(1)], tag: [U(2)], score: [U(3)], rankDiff: [] }` (the worker wiring lands in Task 15).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @cs/engine test && pnpm --filter @cs/worker test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine apps/worker/src/jobs/engine.test.ts
git commit -m "feat(engine): tenant-private rank-scan differ (rank deltas per client)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Tagging structured changes into events

**Files:**
- Create: `packages/engine/src/tag/structured.ts`, `packages/engine/src/tag/structured.test.ts`
- Modify: `packages/engine/src/tag/tag-stage.ts` (dispatch; web events get `channels`/`details`), `packages/engine/test/fake-ai.ts`, `packages/engine/src/index.ts`

**Interfaces:**
- Consumes: `ChangeDetails` (Task 3); structured changes (Tasks 6–9); `TAG_STAGE`, `TAG_VERSION`, `PackLoader`, `competitorVerticals`, `extractZips`, `serviceQuestionKey` (3a); `diffFacts`, `extractNumericFacts`, `MONEY_KINDS` (3a).
- Produces:
  - `tag/structured.ts`: `SERVICE_MAPPED_TYPES: ReadonlySet<ChangeType>` (`ad_started`, `ad_stopped`, `hiring`, `new_service`, `service_removed`); `OFFER_QUESTION`; `buildStructuredQuestions(type: ChangeType, packs: VerticalPack[]): Record<string, DecisionQuestion>`; `buildStructuredSummary(change: { source: string; beforeText: string | null; afterText: string | null; details: ChangeDetails }): string` (redacted); `serviceForKeyword(keyword: string, pack: VerticalPack): string | null`; `tagStructuredChange(deps: { db: Db; ai: Ai; packs: PackLoader }, changeId: string): Promise<StageOutcome<TagOutcome>>`.
  - `tag-stage.ts`: `interface TagOutcome { eventId: string | null; merged: boolean }`; `tagChange` returns `StageOutcome<TagOutcome>` and sends non-web changes to `tagStructuredChange`. Web events now store `channels: ['web']` and `details: { offer }` (offer = type `promo` or a money fact).
  - `test/fake-ai.ts`: `structuredResult(input: { services?: Record<string, string>; offer?: boolean; confidence?: number; needsReview?: string[] }): DecideFn`.

- [ ] **Step 1: Write the failing test**

Add to `packages/engine/test/fake-ai.ts`:

```ts
/** Answers the structured tag questions: service_<vertical> choices and the ad `offer` Noul. */
export function structuredResult(input: { services?: Record<string, string>; offer?: boolean; confidence?: number; needsReview?: string[] }): DecideFn {
  return (_state, questions) => {
    const answers: Record<string, ResolvedAnswer> = {};
    for (const key of Object.keys(questions)) {
      answers[key] = key === 'offer' ? noul(input.offer ?? false, input.confidence) : choice(input.services?.[key.replace(/^service_/, '')] ?? 'none', input.confidence);
    }
    return { answers, needsReview: input.needsReview ?? [] };
  };
}
```

`packages/engine/src/tag/structured.test.ts`:

```ts
import { changeEvent, client, decisionReview, detectedChange, eventChange, rankScan } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { loadVerticalPack } from '@cs/verticals';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createFakeAi, structuredResult } from '../../test/fake-ai';
import { day, seedVendorCapture } from '../../test/seed';
import { serviceForKeyword } from './structured';
import { createPackLoader, tagChange } from './tag-stage';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const packs = createPackLoader();
let cap0: string;
let cap1: string;

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  cap0 = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'meta_ads', capturedAt: day(0) });
  cap1 = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'meta_ads', capturedAt: day(7) });
});

async function change(over: Partial<typeof detectedChange.$inferInsert>) {
  const [row] = await dbs.service
    .insert(detectedChange)
    .values({ competitorId: IDS.competitorX, source: 'meta_ads', kind: 'added', beforeCaptureId: cap0, afterCaptureId: cap1, blockKey: 'ads:meta:started', stageVersion: 1, ...over })
    .returning({ id: detectedChange.id });
  return row!.id;
}

describe('tagStructuredChange (via tagChange)', () => {
  it('turns started ads into an ad_started event with service mapping, offer and money facts', async () => {
    const id = await change({
      afterText: 'AC tune-up only $79 this week, call 972-555-0100\nSpring AC check',
      details: { changeType: 'ad_started', count: 2, pageId: '99', items: [{ id: 'A1', label: 'AC tune-up only $79 this week, call 972-555-0100' }, { id: 'A2', label: 'Spring AC check' }] },
    });
    const ai = createFakeAi({ decide: structuredResult({ services: { hvac_plumbing: 'ac_tune_up' }, offer: false }) });
    const r = await tagChange({ db: dbs.service, ai, packs }, id);
    expect(r).toMatchObject({ ran: true, result: { merged: false } });
    const [ev] = await dbs.owner.select().from(changeEvent);
    expect(ev).toMatchObject({ changeType: 'ad_started', channels: ['meta_ads'], services: { hvac_plumbing: 'ac_tune_up' }, occurredAt: day(7), agencyId: null, clientId: null });
    expect(ev?.details).toMatchObject({ count: 2, pageId: '99', offer: true }); // a money fact forces offer even though the model said no
    expect(ev?.facts.map((f) => f.after?.raw)).toEqual(['$79']);
    expect(ev?.summary).toMatch(/^2 new Meta ads: "AC tune-up only \$79 this week, call \[phone\]/);
    expect(ev?.embedding).toHaveLength(512);
    expect(Object.keys(ai.calls.decide[0]!.questions).sort()).toEqual(['offer', 'service_hvac_plumbing']);
    expect(JSON.stringify(ai.calls.decide[0]!.state)).not.toContain('972-555-0100');
    expect(await dbs.owner.select().from(eventChange)).toEqual([{ eventId: ev!.id, changeId: id }]);
    expect((await dbs.owner.select().from(detectedChange))[0]?.status).toBe('event');
  });

  it('builds a review spike event without any model decision', async () => {
    const id = await change({
      source: 'google_reviews', kind: 'modified', blockKey: 'reviews:velocity', afterText: '8 reviews in 7 days',
      details: { changeType: 'review_spike', count: 8, windowDays: 7, baselineMean: 1, z: 7, avgRating: 1.4 },
    });
    const ai = createFakeAi(); // decide() throws if called
    await tagChange({ db: dbs.service, ai, packs }, id);
    const [ev] = await dbs.owner.select().from(changeEvent);
    expect(ev).toMatchObject({ changeType: 'review_spike', channels: ['google_reviews'], confidence: 1, needsReview: false, services: { hvac_plumbing: null } });
    expect(ev?.summary).toBe('8 new Google reviews in 7 days (7σ above the usual 1/week), average rating 1.4');
    expect(ai.calls.decide).toHaveLength(0);
  });

  it('keeps a rank event private to its client and maps the keyword to a service from the pack', async () => {
    const [scan] = await dbs.service.insert(rankScan).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, status: 'done', finishedAt: day(9) }).returning({ id: rankScan.id });
    const id = await change({
      source: 'rank', kind: 'modified', afterCaptureId: null, beforeCaptureId: null, rankScanId: scan!.id, agencyId: IDS.agencyA, clientId: IDS.clientA1, blockKey: 'rank:air conditioning repair',
      details: { changeType: 'rank_change', keyword: 'air conditioning repair', avgRankBefore: 9, avgRankAfter: 3, top3Before: 0, top3After: 0.5, points: 4 },
    });
    await tagChange({ db: dbs.service, ai: createFakeAi(), packs }, id);
    const [ev] = await dbs.owner.select().from(changeEvent);
    expect(ev).toMatchObject({ changeType: 'rank_change', agencyId: IDS.agencyA, clientId: IDS.clientA1, channels: ['rank'], services: { hvac_plumbing: 'ac_repair' }, occurredAt: day(9) });
    expect(ev?.summary).toBe('"air conditioning repair": average map position 9 → 3, top-3 share 0% → 50%');
  });

  it('sends low-confidence service answers to the review queue and marks the event', async () => {
    const id = await change({ source: 'google_jobs', blockKey: 'jobs:new', afterText: 'HVAC Technician — Plano, TX 75023', details: { changeType: 'hiring', count: 1, items: [{ id: 'j1', label: 'HVAC Technician — Plano, TX 75023' }] } });
    await tagChange({ db: dbs.service, ai: createFakeAi({ decide: structuredResult({ confidence: 0.4, needsReview: ['service_hvac_plumbing'] }) }), packs }, id);
    const [ev] = await dbs.owner.select().from(changeEvent);
    expect(ev).toMatchObject({ changeType: 'hiring', needsReview: true, zips: ['75023'] });
    expect(ev?.summary).toBe('1 new job posting: HVAC Technician — Plano, TX 75023');
    expect(await dbs.owner.select().from(decisionReview)).toMatchObject([{ subjectId: id, keys: ['service_hvac_plumbing'] }]);
  });

  it('asks a global change the service question of every vertical tracking the competitor', async () => {
    await dbs.owner.update(client).set({ verticalId: 'dental' }).where(eq(client.id, IDS.clientB1)); // a second vertical tracks X
    const id = await change({ source: 'google_business_profile', kind: 'added', blockKey: 'gbp:service:emergency plumbing', afterText: 'Emergency plumbing', details: { changeType: 'new_service', field: 'service' } });
    const ai = createFakeAi({ decide: structuredResult({ services: { hvac_plumbing: 'emergency_service' } }) });
    await tagChange({ db: dbs.service, ai, packs }, id);
    expect(Object.keys(ai.calls.decide[0]!.questions).sort()).toEqual(['service_dental', 'service_hvac_plumbing']); // global change: every tracking vertical
    expect((await dbs.owner.select().from(changeEvent))[0]?.summary).toBe('Google Business Profile service added: "Emergency plumbing"');
  });
});

describe('serviceForKeyword', () => {
  it('matches service names and aliases as whole words, longest first', async () => {
    const hvac = await loadVerticalPack('hvac_plumbing');
    expect(serviceForKeyword('AC Repair near me', hvac)).toBe('ac_repair');
    expect(serviceForKeyword('tankless water heater install', hvac)).toBe('water_heater');
    expect(serviceForKeyword('best plumber', hvac)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @cs/engine test -- structured.test`
Expected: FAIL — `./structured` (tag) missing; `tagChange` on a `meta_ads` change throws (`capture` inner join works, but the web flow treats it as web).

- [ ] **Step 3: Implement `tag/structured.ts`**

```ts
import type { Ai, DecisionQuestion } from '@cs/ai';
import { redactContactInfo } from '@cs/collectors';
import { CHANGE_TYPES, type ChangeType } from '@cs/core';
import { capture, type ChangeDetails, client, competitor, type Db, decisionReview, detectedChange, eventChange, changeEvent, rankScan } from '@cs/db';
import type { VerticalPack } from '@cs/verticals';
import { eq } from 'drizzle-orm';
import { diffFacts, extractNumericFacts, MONEY_KINDS } from '../facts/numeric';
import { runStage, type StageOutcome } from '../stage';
import { serviceQuestionKey } from './questions';
import { competitorVerticals, extractZips, type PackLoader, TAG_STAGE, TAG_VERSION, type TagOutcome } from './tag-stage';

const PLATFORM = { agencyId: null, clientId: null } as const;
const MAX_STATE_TEXT = 1500;

/** Structured change types whose text names a service (ad copy, job titles, GBP categories/services): ask the service mapping. */
export const SERVICE_MAPPED_TYPES: ReadonlySet<ChangeType> = new Set<ChangeType>(['ad_started', 'ad_stopped', 'hiring', 'new_service', 'service_removed']);
export const OFFER_QUESTION =
  'Does this ad copy advertise a specific offer — a price, discount, coupon, financing deal, free add-on or limited-time promotion — rather than general branding?';

const CHANNEL_LABEL: Record<string, string> = { meta_ads: 'Meta', google_ads: 'Google' };
const trunc = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const pct = (x: number | undefined) => `${Math.round((x ?? 0) * 100)}%`;

export function buildStructuredQuestions(type: ChangeType, packs: VerticalPack[]): Record<string, DecisionQuestion> {
  const questions: Record<string, DecisionQuestion> = {};
  for (const pack of packs) {
    questions[serviceQuestionKey(pack.id)] = {
      type: 'choice',
      instructions: `Which ${pack.name} service does this concern? Answer "none" if it concerns no single service.`,
      options: { none: 'No single service, or general', ...Object.fromEntries(pack.services.map((s) => [s.id, s.aliases.length > 0 ? `${s.name} (${s.aliases.join(', ')})` : s.name])) },
    };
  }
  if (type === 'ad_started') questions.offer = { type: 'noul', instructions: OFFER_QUESTION };
  return questions;
}

/** Whole-word match of a service name or alias in a rank keyword, longest phrase first (no model call: keywords are short and tenant-private). */
export function serviceForKeyword(keyword: string, pack: VerticalPack): string | null {
  const k = ` ${keyword.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
  const phrases = pack.services
    .flatMap((s) => [s.name, ...s.aliases].map((p) => ({ id: s.id, p: ` ${p.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} ` })))
    .sort((a, b) => b.p.length - a.p.length);
  return phrases.find((x) => k.includes(x.p))?.id ?? null;
}

/** One-line, redacted event summary of a structured change (summaries are later sent to models, Phase 4). */
export function buildStructuredSummary(change: { source: string; beforeText: string | null; afterText: string | null; details: ChangeDetails }): string {
  const d = change.details;
  const first = d.items?.[0]?.label ?? '';
  const more = (d.count ?? 0) > 1 ? ` and ${(d.count ?? 0) - 1} more` : '';
  const before = change.beforeText ?? '';
  const after = change.afterText ?? '';
  const adWord = CHANNEL_LABEL[change.source] ? `${CHANNEL_LABEL[change.source]} ad` : 'ad';
  let s: string;
  switch (d.changeType) {
    case 'ad_started':
      s = `${plural(d.count ?? 1, `new ${adWord}`)}: "${trunc(first, 80)}"${more}`;
      break;
    case 'ad_stopped':
      s = `${plural(d.count ?? 1, adWord)} stopped: "${trunc(first, 80)}"${more}`;
      break;
    case 'hiring':
      s = `${plural(d.count ?? 1, 'new job posting')}: ${(d.items ?? []).slice(0, 3).map((i) => i.label).join('; ')}${(d.count ?? 0) > 3 ? ` and ${(d.count ?? 0) - 3} more` : ''}`;
      break;
    case 'new_service':
      s = `Google Business Profile ${d.field ?? 'service'} added: "${trunc(after, 80)}"`;
      break;
    case 'service_removed':
      s = `Google Business Profile ${d.field ?? 'service'} removed: "${trunc(before, 80)}"`;
      break;
    case 'new_location':
      s = `Google Business Profile address changed from "${trunc(before, 80)}" to "${trunc(after, 80)}"`;
      break;
    case 'rating_change':
      s = `Google rating ${d.ratingBefore} → ${d.ratingAfter}${d.votesAfter != null ? ` (${d.votesAfter} reviews)` : ''}`;
      break;
    case 'review_spike':
      s = `${d.count} new Google reviews in ${d.windowDays} days (${d.z}σ above the usual ${d.baselineMean}/week)${d.avgRating != null ? `, average rating ${d.avgRating}` : ''}`;
      break;
    case 'rank_change':
      s = `"${d.keyword}": average map position ${d.avgRankBefore} → ${d.avgRankAfter}, top-3 share ${pct(d.top3Before)} → ${pct(d.top3After)}`;
      break;
    default:
      s = `Google Business Profile ${d.field ?? 'profile'} changed: ${trunc(before, 60)} → ${trunc(after, 60)}`;
  }
  return redactContactInfo(s);
}

/**
 * Tag stage for structured changes (spec §6.2): the type is fixed by the diff (`details.changeType`);
 * the DecisionProvider only maps services (ads, jobs, GBP services) and says whether an ad is an offer.
 * Rank changes stay tenant-private and map their keyword to a service from the client's pack.
 */
export async function tagStructuredChange(deps: { db: Db; ai: Ai; packs: PackLoader }, changeId: string): Promise<StageOutcome<TagOutcome>> {
  return runStage(
    deps.db,
    { stage: TAG_STAGE, version: TAG_VERSION, subjectId: changeId },
    async () => {
      const [row] = await deps.db
        .select({ change: detectedChange, competitorName: competitor.name, capturedAt: capture.capturedAt, scannedAt: rankScan.finishedAt })
        .from(detectedChange)
        .innerJoin(competitor, eq(competitor.id, detectedChange.competitorId))
        .leftJoin(capture, eq(capture.id, detectedChange.afterCaptureId))
        .leftJoin(rankScan, eq(rankScan.id, detectedChange.rankScanId))
        .where(eq(detectedChange.id, changeId))
        .limit(1);
      if (!row) throw new Error(`detected_change ${changeId} not found`);
      if (row.change.status !== 'pending') return null;
      const c = row.change;
      const type = c.details.changeType as ChangeType | undefined;
      if (!type || !(CHANGE_TYPES as readonly string[]).includes(type)) throw new Error(`detected_change ${changeId} has no valid details.changeType`);
      const occurredAt = row.capturedAt ?? row.scannedAt;
      if (!occurredAt) throw new Error(`detected_change ${changeId} has no capture or finished rank scan`);

      const verticalIds = c.clientId
        ? (await deps.db.select({ v: client.verticalId }).from(client).where(eq(client.id, c.clientId))).map((r) => r.v)
        : await competitorVerticals(deps.db, c.competitorId);
      const packs = await Promise.all(verticalIds.map(deps.packs));
      const text = (c.afterText ?? c.beforeText ?? '').slice(0, MAX_STATE_TEXT);

      let services: Record<string, string | null> = Object.fromEntries(packs.map((p) => [p.id, null]));
      let confidence = 1;
      let needsReview: string[] = [];
      let answers: Record<string, unknown> = {};
      let modelOffer = false;
      if (type === 'rank_change') {
        services = Object.fromEntries(packs.map((p) => [p.id, serviceForKeyword(c.details.keyword ?? '', p)]));
      } else if (SERVICE_MAPPED_TYPES.has(type) && packs.length > 0) {
        const state = { competitor: row.competitorName, channel: c.source, change: type, text: redactContactInfo(text) };
        const result = await deps.ai.decide('decisions', state, buildStructuredQuestions(type, packs), PLATFORM);
        services = Object.fromEntries(
          packs.map((p) => {
            const v = result.answers[serviceQuestionKey(p.id)]?.value;
            return [p.id, typeof v === 'string' && p.services.some((s) => s.id === v) ? v : null];
          }),
        );
        const offer = result.answers.offer;
        modelOffer = offer?.type === 'noul' && offer.value === true;
        confidence = Math.min(...Object.values(result.answers).map((a) => a.confidence));
        needsReview = result.needsReview;
        answers = result.answers as Record<string, unknown>;
      }

      // Facts keep ~40 characters of context around each number: extract from redacted text so no phone/email lands in event.facts.
      const facts = type === 'ad_started' ? diffFacts([], extractNumericFacts(redactContactInfo(text))) : [];
      const money = facts.some((f) => MONEY_KINDS.has(f.kind));
      const details: ChangeDetails = type === 'ad_started' ? { ...c.details, offer: modelOffer || money } : c.details;
      const summary = buildStructuredSummary({ source: c.source, beforeText: c.beforeText, afterText: c.afterText, details: c.details });
      const zips = type === 'hiring' || type === 'new_location' || type === 'ad_started' ? extractZips(redactContactInfo(text)) : [];
      const { vectors } = await deps.ai.embed('embeddings', [summary], PLATFORM);
      return {
        needsReview, answers,
        values: {
          competitorId: c.competitorId, agencyId: c.agencyId, clientId: c.clientId, changeType: type, channels: [c.source], services, summary, facts, details, zips,
          embedding: vectors[0] ?? null, confidence, needsReview: needsReview.length > 0, occurredAt,
        } satisfies typeof changeEvent.$inferInsert,
      };
    },
    async (tx, computed) => {
      if (!computed) return { eventId: null, merged: false };
      if (computed.needsReview.length > 0) {
        await tx.insert(decisionReview).values({ subjectType: 'detected_change', subjectId: changeId, keys: computed.needsReview, answers: computed.answers });
      }
      const [ev] = await tx.insert(changeEvent).values(computed.values).returning({ id: changeEvent.id });
      await tx.insert(eventChange).values({ eventId: ev!.id, changeId });
      await tx.update(detectedChange).set({ status: 'event' }).where(eq(detectedChange.id, changeId));
      return { eventId: ev!.id, merged: false };
    },
  );
}
```

(The summary for one Meta ad reads `1 new Meta ad: "…"`; for two, `2 new Meta ads: "…" and 1 more`.)

- [ ] **Step 4: Dispatch from `tagChange` and enrich web events**

In `packages/engine/src/tag/tag-stage.ts`:

```ts
import { tagStructuredChange } from './structured';

export interface TagOutcome {
  eventId: string | null;
  /** True when the change was attached to an existing event (cross-channel merge, Task 11). */
  merged: boolean;
}
```

At the top of `tagChange` (change its return type to `Promise<StageOutcome<TagOutcome>>`):

```ts
  const [head] = await deps.db.select({ source: detectedChange.source }).from(detectedChange).where(eq(detectedChange.id, changeId)).limit(1);
  if (!head) throw new Error(`detected_change ${changeId} not found`);
  if (head.source !== 'web') return tagStructuredChange(deps, changeId);
```

In the web commit: every `return { eventId: null }` becomes `return { eventId: null, merged: false }`, the event insert gains

```ts
          channels: ['web'],
          details: { offer: resolution.type === 'promo' || row.change.numericChanges.some((n) => MONEY_KINDS.has(n.kind)) },
```

(import `MONEY_KINDS` from `../facts/numeric`), and the final return is `{ eventId: ev!.id, merged: false }`. The ESM cycle `tag-stage.ts` ⇄ `structured.ts` is safe: each only uses the other's exports inside function bodies.

Export `./tag/structured` from `packages/engine/src/index.ts`. In `apps/worker/src/deps.ts` nothing changes (`tagChange` still returns `result.eventId`).

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @cs/engine test && pnpm --filter @cs/worker test && pnpm typecheck`
Expected: PASS, including the 3a `tag-stage.test.ts` suite (web events unchanged apart from the new columns).

- [ ] **Step 6: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): tag structured changes into events (fixed type, service mapping, ad offers, tenant rank events)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 11: Cross-channel merge (same offer → one event, several evidence links)

**Files:**
- Create: `packages/engine/src/merge/merge.ts`, `packages/engine/src/merge/merge.test.ts`
- Modify: `packages/engine/src/tag/tag-stage.ts`, `packages/engine/src/tag/structured.ts`, `packages/engine/src/index.ts`

**Interfaces:**
- Consumes: `factsSignature` (`../score/score-stage`, 3a); `TagOutcome` (Task 10); `changeEvent.channels/clientId` (Task 3).
- Produces:
  - `MERGE_WINDOW_DAYS = 14`, `MERGE_MIN_CONFIDENCE = 0.8`, `MERGE_MAX_CANDIDATES = 3`, `MERGEABLE_TYPES` (`price_change`, `promo`, `ad_started`, `new_service`), `SAME_OFFER_QUESTION`.
  - `interface MergeSubject { competitorId: string; clientId: string | null; changeType: ChangeType; services: Record<string, string | null>; facts: NumericChange[]; embedding: number[] | null; occurredAt: Date; text: string }`
  - `interface MergeTarget { eventId: string; via: 'facts' | 'same_offer'; confidence: number }`
  - `sharesService(a, b): boolean`, `conflictingServices(a, b): boolean`
  - `findMergeTarget(deps: { db: Db; ai: Ai }, s: MergeSubject): Promise<MergeTarget | null>` — called in a stage's compute (outside the transaction).
  - `writeEvent(tx: Tx, changeId: string, values: typeof changeEvent.$inferInsert, target: MergeTarget | null): Promise<string>` — inserts the event, or attaches the change to `target` and unions its channels.
  - Both tag paths return `{ eventId, merged: target !== null }`.

- [ ] **Step 1: Write the failing test**

`packages/engine/src/merge/merge.test.ts`:

```ts
import { capture, changeEvent, detectedChange, eventChange, trackedPage } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { asc } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createFakeAi, type DecideFn, noul, structuredResult, tagResult } from '../../test/fake-ai';
import { day, seedVendorCapture } from '../../test/seed';
import { diffFacts, extractNumericFacts } from '../facts/numeric';
import { createPackLoader, tagChange } from '../tag/tag-stage';
import { conflictingServices, sharesService } from './merge';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const packs = createPackLoader();
const PAGE = '00000000-0000-4000-8000-0000000000e1';

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.service.insert(trackedPage).values({ id: PAGE, competitorId: IDS.competitorX, url: 'https://smithhvac.example/specials', pageType: 'promo', source: 'manual', cadence: 'daily' });
});

async function webCapture(at: number) {
  const [row] = await dbs.service
    .insert(capture)
    .values({ competitorId: IDS.competitorX, trackedPageId: PAGE, source: 'web', status: 'ok', collectorVersion: 'web/1', capturedAt: day(at) })
    .returning({ id: capture.id });
  return row!.id;
}

async function webChange(captureId: string, blockKey: string, before: string | null, after: string) {
  const [row] = await dbs.service
    .insert(detectedChange)
    .values({
      competitorId: IDS.competitorX, trackedPageId: PAGE, source: 'web', kind: before ? 'modified' : 'added', afterCaptureId: captureId, blockKey, beforeText: before, afterText: after,
      numericChanges: diffFacts(before ? extractNumericFacts(before) : [], extractNumericFacts(after)), flags: ['numeric'], stageVersion: 1,
    })
    .returning({ id: detectedChange.id });
  return row!.id;
}

async function adChange(at: number, text: string) {
  const prev = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'meta_ads', capturedAt: day(at - 7) });
  const cap = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'meta_ads', capturedAt: day(at) });
  const [row] = await dbs.service
    .insert(detectedChange)
    .values({
      competitorId: IDS.competitorX, source: 'meta_ads', kind: 'added', beforeCaptureId: prev, afterCaptureId: cap, blockKey: 'ads:meta:started', afterText: text,
      details: { changeType: 'ad_started', count: 1, items: [{ id: 'A1', label: text }] }, stageVersion: 1,
    })
    .returning({ id: detectedChange.id });
  return row!.id;
}

/** Tag questions → web tagResult; structured questions → structuredResult; same_<i> → the given Noul. */
const decide = (type: string, same: boolean, confidence = 0.95): DecideFn => (state, q) => {
  const keys = Object.keys(q);
  if (keys.every((k) => k.startsWith('same_'))) return { answers: Object.fromEntries(keys.map((k) => [k, noul(same, confidence)])), needsReview: [] };
  if ('meaningful' in q) return tagResult({ meaningful: true, type, services: { hvac_plumbing: 'ac_tune_up' } })(state, q);
  return structuredResult({ services: { hvac_plumbing: 'ac_tune_up' }, offer: true })(state, q);
};
const askedSame = (ai: ReturnType<typeof createFakeAi>) => ai.calls.decide.filter((c) => Object.keys(c.questions).some((k) => k.startsWith('same_'))).length;
const events = () => dbs.owner.select().from(changeEvent).orderBy(asc(changeEvent.occurredAt));

describe('cross-channel merge', () => {
  it('merges the same price shown in two blocks of one capture without asking a model', async () => {
    const cap = await webCapture(1);
    const a = await webChange(cap, 'div.hero#0', 'AC Tune-Up $89', 'AC Tune-Up $69');
    const b = await webChange(cap, 'li.price#2', 'Tune-up: $89', 'Tune-up: $69');
    const ai = createFakeAi({ decide: decide('price_change', false) });
    await tagChange({ db: dbs.service, ai, packs }, a);
    const r = await tagChange({ db: dbs.service, ai, packs }, b);
    expect(r).toMatchObject({ ran: true, result: { merged: true } });
    const evs = await events();
    expect(evs).toHaveLength(1);
    expect((await dbs.owner.select().from(eventChange)).map((l) => l.eventId)).toEqual([evs[0]!.id, evs[0]!.id]);
    expect(askedSame(ai)).toBe(0);
  });

  it('merges a web promo and a Meta ad for the same offer when the model says it is the same offer', async () => {
    const web = await webChange(await webCapture(1), 'div.promo#0', null, 'Spring special: AC tune-up with a free filter');
    const ad = await adChange(4, 'Spring special — AC tune-up + free filter');
    const ai = createFakeAi({ decide: decide('promo', true) });
    await tagChange({ db: dbs.service, ai, packs }, web);
    await tagChange({ db: dbs.service, ai, packs }, ad);
    const evs = await events();
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ changeType: 'promo', channels: ['meta_ads', 'web'] });
    expect(await dbs.owner.select().from(eventChange)).toHaveLength(2);
    expect(askedSame(ai)).toBe(1);
    expect(JSON.stringify(ai.calls.decide.at(-1)!.state)).toContain('existing_0');
  });

  it.each([
    ['the model says it is a different offer', false, 0.95],
    ['the model is not confident enough', true, 0.6],
  ])('keeps two events when %s', async (_label, same, confidence) => {
    await tagChange({ db: dbs.service, ai: createFakeAi({ decide: decide('promo', same, confidence) }), packs }, await webChange(await webCapture(1), 'div.promo#0', null, 'Spring special: AC tune-up with a free filter'));
    await tagChange({ db: dbs.service, ai: createFakeAi({ decide: decide('promo', same, confidence) }), packs }, await adChange(4, 'Free filter with every tune-up'));
    expect(await events()).toHaveLength(2);
  });

  it('never merges two price changes with different numbers (a second price cut is news)', async () => {
    const ai = createFakeAi({ decide: decide('price_change', true) });
    await tagChange({ db: dbs.service, ai, packs }, await webChange(await webCapture(1), 'div.hero#0', 'AC Tune-Up $100', 'AC Tune-Up $80'));
    await tagChange({ db: dbs.service, ai, packs }, await webChange(await webCapture(5), 'div.hero#0', 'AC Tune-Up $80', 'AC Tune-Up $60'));
    expect(await events()).toHaveLength(2);
    expect(askedSame(ai)).toBe(0);
  });

  it('only looks 14 days around the change', async () => {
    const ai = createFakeAi({ decide: decide('promo', true) });
    await tagChange({ db: dbs.service, ai, packs }, await webChange(await webCapture(1), 'div.promo#0', null, 'Spring special: AC tune-up with a free filter'));
    await tagChange({ db: dbs.service, ai, packs }, await adChange(20, 'Spring special — AC tune-up + free filter'));
    expect(await events()).toHaveLength(2);
    expect(askedSame(ai)).toBe(0);
  });
});

describe('service overlap helpers', () => {
  it('compare per vertical and ignore unmapped services', () => {
    expect(sharesService({ hvac_plumbing: 'ac_tune_up' }, { hvac_plumbing: 'ac_tune_up', dental: null })).toBe(true);
    expect(sharesService({ hvac_plumbing: null }, { hvac_plumbing: null })).toBe(false);
    expect(conflictingServices({ hvac_plumbing: 'ac_tune_up' }, { hvac_plumbing: 'drain_cleaning' })).toBe(true);
    expect(conflictingServices({ hvac_plumbing: 'ac_tune_up' }, { hvac_plumbing: null })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cs/engine test -- merge`
Expected: FAIL — `./merge` missing; the first test makes two events.

- [ ] **Step 3: Implement `merge/merge.ts`**

```ts
import type { Ai, DecisionQuestion } from '@cs/ai';
import { redactContactInfo } from '@cs/collectors';
import type { ChangeType } from '@cs/core';
import { changeEvent, type Db, eventChange, type NumericChange, type Tx } from '@cs/db';
import { and, cosineDistance, desc, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import { factsSignature } from '../score/score-stage';

export const MERGE_WINDOW_DAYS = 14;
export const MERGE_MIN_CONFIDENCE = 0.8;
export const MERGE_MAX_CANDIDATES = 3;
/** Offers and service launches — the event types spec §6.2 merges across channels. */
export const MERGEABLE_TYPES: ReadonlySet<ChangeType> = new Set<ChangeType>(['price_change', 'promo', 'ad_started', 'new_service']);
export const SAME_OFFER_QUESTION =
  'Do "new_change" and the existing change describe the same offer or the same service launch by this business (same service, same deal), seen in two places? Answer no if the price, discount or service differs.';
const PLATFORM = { agencyId: null, clientId: null } as const;
const DAY_MS = 86_400_000;

export interface MergeSubject {
  competitorId: string;
  clientId: string | null;
  changeType: ChangeType;
  services: Record<string, string | null>;
  facts: NumericChange[];
  embedding: number[] | null;
  occurredAt: Date;
  /** The change's own text (redacted before it reaches a model). */
  text: string;
}

export interface MergeTarget {
  eventId: string;
  via: 'facts' | 'same_offer';
  confidence: number;
}

/** True when some vertical maps both to the same (non-null) service. */
export const sharesService = (a: Record<string, string | null>, b: Record<string, string | null>) => Object.entries(a).some(([v, s]) => s !== null && b[v] === s);
/** True when some vertical maps them to two different services. */
export const conflictingServices = (a: Record<string, string | null>, b: Record<string, string | null>) =>
  Object.entries(a).some(([v, s]) => s !== null && b[v] != null && b[v] !== s);

/**
 * Spec §6.2 cross-channel merge: same competitor, same tenant scope, a mergeable type, within ±14 days.
 * Identical numeric facts merge deterministically (the same price on two blocks of one page); two price
 * changes with different numbers never merge; otherwise one Noul per candidate (≤ 3 sharing a service) in a
 * single decide call, merged into the most confident "yes" at or above MERGE_MIN_CONFIDENCE.
 */
export async function findMergeTarget(deps: { db: Db; ai: Ai }, s: MergeSubject): Promise<MergeTarget | null> {
  if (!MERGEABLE_TYPES.has(s.changeType)) return null;
  const from = new Date(s.occurredAt.getTime() - MERGE_WINDOW_DAYS * DAY_MS);
  const to = new Date(s.occurredAt.getTime() + MERGE_WINDOW_DAYS * DAY_MS);
  const rows = await deps.db
    .select({ id: changeEvent.id, changeType: changeEvent.changeType, services: changeEvent.services, facts: changeEvent.facts, summary: changeEvent.summary })
    .from(changeEvent)
    .where(
      and(
        eq(changeEvent.competitorId, s.competitorId), s.clientId ? eq(changeEvent.clientId, s.clientId) : isNull(changeEvent.clientId),
        inArray(changeEvent.changeType, [...MERGEABLE_TYPES]), gte(changeEvent.occurredAt, from), lte(changeEvent.occurredAt, to),
      ),
    )
    .orderBy(s.embedding ? cosineDistance(changeEvent.embedding, s.embedding) : desc(changeEvent.occurredAt))
    .limit(20);

  if (s.facts.length > 0) {
    const signature = factsSignature(s.facts);
    const same = rows.find((r) => r.facts.length > 0 && factsSignature(r.facts) === signature && !conflictingServices(s.services, r.services));
    if (same) return { eventId: same.id, via: 'facts', confidence: 1 };
  }

  const bothPriced = (r: (typeof rows)[number]) => s.changeType === 'price_change' && r.changeType === 'price_change' && s.facts.length > 0 && r.facts.length > 0;
  const candidates = rows.filter((r) => sharesService(s.services, r.services) && !bothPriced(r)).slice(0, MERGE_MAX_CANDIDATES);
  if (candidates.length === 0) return null;

  const questions: Record<string, DecisionQuestion> = Object.fromEntries(
    candidates.map((_, i) => [`same_${i}`, { type: 'noul', instructions: `${SAME_OFFER_QUESTION} The existing change is "existing_${i}".` }]),
  );
  const state = { new_change: redactContactInfo(s.text).slice(0, 1500), ...Object.fromEntries(candidates.map((c, i) => [`existing_${i}`, c.summary])) };
  const result = await deps.ai.decide('decisions', state, questions, PLATFORM);
  let best: MergeTarget | null = null;
  for (const [i, c] of candidates.entries()) {
    const a = result.answers[`same_${i}`];
    if (a?.type === 'noul' && a.value === true && a.confidence >= MERGE_MIN_CONFIDENCE && (!best || a.confidence > best.confidence)) {
      best = { eventId: c.id, via: 'same_offer', confidence: a.confidence };
    }
  }
  return best;
}

/** Inserts the event — or, with a merge target, links the change to that event and adds its channels. Returns the event id. */
export async function writeEvent(tx: Tx, changeId: string, values: typeof changeEvent.$inferInsert, target: MergeTarget | null): Promise<string> {
  if (!target) {
    const [ev] = await tx.insert(changeEvent).values(values).returning({ id: changeEvent.id });
    await tx.insert(eventChange).values({ eventId: ev!.id, changeId });
    return ev!.id;
  }
  const [t] = await tx.select({ channels: changeEvent.channels }).from(changeEvent).where(eq(changeEvent.id, target.eventId)).for('update');
  if (!t) throw new Error(`merge target event ${target.eventId} vanished`);
  await tx
    .update(changeEvent)
    .set({ channels: [...new Set([...t.channels, ...(values.channels ?? [])])].sort() })
    .where(eq(changeEvent.id, target.eventId));
  await tx.insert(eventChange).values({ eventId: target.eventId, changeId });
  return target.eventId;
}
```

- [ ] **Step 4: Use it in both tag paths**

`packages/engine/src/tag/tag-stage.ts` (web): in `compute`, fetch the block embedding *before* deciding the merge and build the summary there:

```ts
      const summary = buildSummary(row.change, row.pageUrl);
      const target = resolution.meaningful
        ? await findMergeTarget(deps, {
            competitorId: row.change.competitorId, clientId: null, changeType: resolution.type, services: resolution.services, facts: row.change.numericChanges,
            embedding, occurredAt: row.capturedAt, text: row.change.afterText ?? row.change.beforeText ?? '',
          })
        : null;
      return { row, resolution, answers: result.answers as Record<string, unknown>, embedding, summary, target };
```

(the existing block-embedding lookup moves above this; the non-pending early return becomes `{ row, resolution: null, answers: null, embedding: null, summary: '', target: null }`). In `commit`, replace the event insert + `eventChange` insert with:

```ts
      const eventId = await writeEvent(
        tx,
        changeId,
        {
          competitorId: row.change.competitorId, changeType: resolution.type, channels: ['web'], services: resolution.services, summary,
          facts: row.change.numericChanges, details: { offer: resolution.type === 'promo' || row.change.numericChanges.some((n) => MONEY_KINDS.has(n.kind)) },
          zips: extractZips(row.change.afterText ?? row.change.beforeText ?? ''), embedding, confidence: resolution.confidence,
          needsReview: resolution.needsReview.length > 0, occurredAt: row.capturedAt,
        },
        target,
      );
      await tx.update(detectedChange).set({ status: 'event' }).where(eq(detectedChange.id, changeId));
      return { eventId, merged: target !== null };
```

`packages/engine/src/tag/structured.ts`: at the end of `compute`, before returning, add

```ts
      const target = await findMergeTarget(deps, {
        competitorId: c.competitorId, clientId: c.clientId, changeType: type, services, facts, embedding: vectors[0] ?? null, occurredAt, text,
      });
```

return it alongside `values`, and in `commit` replace the event + link inserts with `const eventId = await writeEvent(tx, changeId, computed.values, computed.target);` then `return { eventId, merged: computed.target !== null };`.

Export `./merge/merge` from `index.ts`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @cs/engine test && pnpm typecheck`
Expected: PASS — the merge suite plus all 3a tag tests (a lone event never finds candidates, so no extra model calls).

- [ ] **Step 6: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): cross-channel merge — identical facts or a confident same-offer Noul join one event

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Scoring — structured size curves, tenant scoping, alert age cap

**Files:**
- Modify: `packages/db/src/schema/engine.ts` (`ScoreFactors.staleCap`), `packages/engine/src/score/score.ts`, `packages/engine/src/score/score-stage.ts`, `packages/engine/src/sweep.ts`
- Modify tests: `packages/engine/src/score/score.test.ts`, `packages/engine/src/score/score-stage.test.ts`, `packages/engine/src/sweep.test.ts`

**Interfaces:**
- Consumes: pack knobs (Task 1); `changeEvent.details/clientId` (Task 3).
- Produces:
  - `ScoreFactors.staleCap?: boolean` (optional: 3a rows lack it).
  - `ScoreInput` gains `details: ChangeDetails` and `ageDays: number`.
  - `sizeFactor` curves: `ad_started`/`ad_stopped` → `count / ads_for_full`; `hiring` → `count / jobs_for_full`; `review_spike` → `z / review_z_for_full`; `rating_change` → `|after − before| / rating_delta_for_full`; `rank_change` → `|avgRankBefore − avgRankAfter| / rank_delta_for_full`; each clamped to `[structured_min, 1]`; missing inputs → `size.default`.
  - `scoreForClient`: an `alert` for an event older than `alert_max_age_days` becomes `brief` with `staleCap: true`.
  - `scoreEvent(deps, eventId, opts?: { now?: Date })` scores a tenant event only for its own client; `noveltySimilarity` compares global events with global events only, and a tenant event with global events plus its own client's.
  - `findEngineWork().score` never offers a tenant event to another client.

- [ ] **Step 1: Write the failing tests**

In `packages/engine/src/score/score.test.ts` (it loads the HVAC pack into `pack` and defines `cut(from, to)` and an `input(over)` helper): add `details: {}, ageDays: 0` to the defaults of the existing `input` helper, add `sizeFactor` to the `./score` import, and append:

```ts
describe('structured size curves and the alert age cap (Phase 3b)', () => {
  const structured = (over: Partial<ScoreInput>) => input({ changeType: 'ad_started', facts: [], serviceId: null, ...over });

  it('sizes structured events from their details', () => {
    expect(sizeFactor(structured({ changeType: 'ad_started', details: { count: 2 } }), pack)).toBeCloseTo(0.4);
    expect(sizeFactor(structured({ changeType: 'ad_stopped', details: { count: 1 } }), pack)).toBeCloseTo(0.3); // floor
    expect(sizeFactor(structured({ changeType: 'hiring', details: { count: 12 } }), pack)).toBe(1); // cap
    expect(sizeFactor(structured({ changeType: 'review_spike', details: { z: 2 } }), pack)).toBeCloseTo(0.5);
    expect(sizeFactor(structured({ changeType: 'rating_change', details: { ratingBefore: 4.6, ratingAfter: 4.45 } }), pack)).toBeCloseTo(0.5);
    expect(sizeFactor(structured({ changeType: 'rank_change', details: { avgRankBefore: 9, avgRankAfter: 3 } }), pack)).toBe(1);
    expect(sizeFactor(structured({ changeType: 'review_spike', details: {} }), pack)).toBe(pack.scoring.size.default);
  });

  it('never alerts on an event older than alert_max_age_days; caps it to brief and says so', () => {
    const profile = { services: ['ac_tune_up'], zips: [], thresholds: null };
    const fresh = scoreForClient(input({ ageDays: 2 }), profile, pack); // the default input is a 20% cut on ac_tune_up
    const stale = scoreForClient(input({ ageDays: 10 }), profile, pack);
    expect([fresh.route, fresh.factors.staleCap]).toEqual(['alert', false]);
    expect([stale.route, stale.factors.staleCap, stale.score]).toEqual(['brief', true, fresh.score]);
  });
});
```

Append to `packages/engine/src/score/score-stage.test.ts` (its `event(over)` helper inserts a price-cut event for competitor X; tenant events only need `agencyId`/`clientId` set):

```ts
describe('tenant-private events and event age (Phase 3b)', () => {
  it('scores a tenant event only for its own client, never for another agency tracking the competitor', async () => {
    const id = await event({ changeType: 'rank_change', agencyId: IDS.agencyA, clientId: IDS.clientA1, facts: [], details: { avgRankBefore: 9, avgRankAfter: 3 } });
    expect(await scoreEvent({ db: dbs.service, packs }, id)).toMatchObject({ scored: 1 });
    expect((await dbs.owner.select().from(eventScore)).map((s) => s.clientId)).toEqual([IDS.clientA1]);
  });

  it('keeps novelty within the tenant scope: a global event ignores a tenant event with the same embedding', async () => {
    await event({ changeType: 'promo', agencyId: IDS.agencyA, clientId: IDS.clientA1, facts: [], occurredAt: day(1) });
    const id = await event({ changeType: 'promo', facts: [], occurredAt: day(5) });
    await scoreEvent({ db: dbs.service, packs }, id);
    const [b1] = await dbs.owner.select().from(eventScore).where(eq(eventScore.clientId, IDS.clientB1));
    expect(b1?.factors.maxSimilarity).toBeNull();
  });

  it('caps a backlog event to brief when it is scored long after it happened', async () => {
    const id = await event({ occurredAt: day(1) });
    await scoreEvent({ db: dbs.service, packs }, id, { now: day(20) });
    const [a1] = await dbs.owner.select().from(eventScore).where(eq(eventScore.clientId, IDS.clientA1));
    expect(a1).toMatchObject({ route: 'brief', factors: { staleCap: true } });
  });
});
```

Append to `packages/engine/src/sweep.test.ts`:

```ts
  it('offers a tenant event for scoring only while its own client lacks a score', async () => {
    const [ev] = await dbs.service
      .insert(changeEvent)
      .values({ competitorId: IDS.competitorX, agencyId: IDS.agencyA, clientId: IDS.clientA1, changeType: 'rank_change', summary: 'r', confidence: 1, occurredAt: new Date() })
      .returning({ id: changeEvent.id });
    expect((await findEngineWork(dbs.service, { limit: 50 })).score).toContain(ev!.id);
    await scoreEvent({ db: dbs.service, packs: createPackLoader() }, ev!.id);
    expect((await findEngineWork(dbs.service, { limit: 50 })).score).not.toContain(ev!.id); // B1 tracks X but is not owed this score
  });
```

(add `changeEvent` to the `@cs/db` import, `scoreEvent` from `./score/score-stage` and `createPackLoader` from `./tag/tag-stage`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @cs/engine test -- score sweep`
Expected: FAIL — `ScoreInput` has no `details`/`ageDays`; tenant event scored for B1; `staleCap` undefined.

- [ ] **Step 3: Implement**

`packages/db/src/schema/engine.ts` — in `ScoreFactors` add after `needsReviewCap`:

```ts
  /** True when an alert was capped to brief because the event was older than the pack's alert_max_age_days (Phase 3b). */
  staleCap?: boolean;
```

`packages/engine/src/score/score.ts`:

```ts
import type { ChangeDetails, NumericChange, ScoreFactors, ScoreThresholds } from '@cs/db';

export interface ScoreInput {
  changeType: ChangeType;
  facts: NumericChange[];
  serviceId: string | null;
  zips: string[];
  needsReview: boolean;
  maxSimilarity: number | null;
  details: ChangeDetails;
  /** Days between the event and the scoring run. */
  ageDays: number;
}

export function sizeFactor(input: ScoreInput, pack: VerticalPack): number {
  const s = pack.scoring.size;
  const d = input.details;
  const curve = (x: number | undefined | null, full: number) => (x === undefined || x === null || Number.isNaN(x) ? s.default : clamp(Math.abs(x) / full, s.structured_min, 1));
  switch (input.changeType) {
    case 'price_change': {
      const pcts = input.facts.filter((f) => f.kind === 'price' && f.pct !== null).map((f) => Math.abs(f.pct!));
      return pcts.length > 0 ? clamp(Math.max(...pcts) / s.price_pct_for_full, s.price_min, 1) : s.default;
    }
    case 'ad_started':
    case 'ad_stopped':
      return curve(d.count, s.ads_for_full);
    case 'hiring':
      return curve(d.count, s.jobs_for_full);
    case 'review_spike':
      return curve(d.z, s.review_z_for_full);
    case 'rating_change':
      return curve(d.ratingBefore !== undefined && d.ratingAfter !== undefined ? d.ratingAfter - d.ratingBefore : undefined, s.rating_delta_for_full);
    case 'rank_change':
      return curve(d.avgRankBefore !== undefined && d.avgRankAfter !== undefined ? d.avgRankBefore - d.avgRankAfter : undefined, s.rank_delta_for_full);
    default:
      return s.default;
  }
}
```

and in `scoreForClient`, after the needs-review cap:

```ts
  const staleCap = route === 'alert' && input.ageDays > pack.scoring.alert_max_age_days;
  if (staleCap) route = 'brief';
```

adding `staleCap` to the returned `factors` (after `needsReviewCap`).

`packages/engine/src/score/score-stage.ts` — `noveltySimilarity` takes the event's `clientId` and filters the tenant scope:

```ts
export async function noveltySimilarity(
  db: Db,
  ev: { id: string; competitorId: string; clientId: string | null; embedding: number[] | null; occurredAt: Date; facts: NumericChange[] },
  windowDays: number,
): Promise<number | null> {
  if (!ev.embedding) return null;
  const since = new Date(ev.occurredAt.getTime() - windowDays * 86_400_000);
  // Global events compare with global events; a tenant event also with its own client's events — never another tenant's.
  const scope = ev.clientId ? or(isNull(changeEvent.clientId), eq(changeEvent.clientId, ev.clientId)) : isNull(changeEvent.clientId);
  const where = and(
    eq(changeEvent.competitorId, ev.competitorId), ne(changeEvent.id, ev.id), isNotNull(changeEvent.embedding),
    lt(changeEvent.occurredAt, ev.occurredAt), gte(changeEvent.occurredAt, since), scope,
  );
  // …rest unchanged
```

(add `isNull, or` to the drizzle import). `scoreEvent` gains `opts: { now?: Date } = {}`, restricts clients for tenant events, and passes the new inputs:

```ts
export async function scoreEvent(deps: { db: Db; packs: PackLoader }, eventId: string, opts: { now?: Date } = {}): Promise<ScoreRunResult> {
  const [ev] = await deps.db.select().from(changeEvent).where(eq(changeEvent.id, eventId)).limit(1);
  if (!ev) throw new Error(`event ${eventId} not found`);
  const now = opts.now ?? new Date();
  const ageDays = Math.max(0, (now.getTime() - ev.occurredAt.getTime()) / 86_400_000);
  const clients = await deps.db
    .select({ c: client })
    .from(clientCompetitor)
    .innerJoin(client, eq(client.id, clientCompetitor.clientId))
    .where(
      and(
        eq(clientCompetitor.competitorId, ev.competitorId),
        ev.clientId ? eq(client.id, ev.clientId) : undefined, // tenant-private events belong to one client
        sql`NOT EXISTS (SELECT 1 FROM event_score s WHERE s.event_id = ${ev.id} AND s.client_id = ${client.id})`,
      ),
    );
```

and in the loop's `scoreForClient` input add `details: ev.details, ageDays`.

`packages/engine/src/sweep.ts` — the score query's link condition becomes:

```sql
      AND EXISTS (SELECT 1 FROM client_competitor cc WHERE cc.competitor_id = e.competitor_id
                  AND (e.client_id IS NULL OR cc.client_id = e.client_id)
                  AND NOT EXISTS (SELECT 1 FROM event_score s WHERE s.event_id = e.id AND s.client_id = cc.client_id))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @cs/db test && pnpm --filter @cs/engine test && pnpm typecheck`
Expected: PASS (3a score-stage tests keep their routes: their `occurredAt` is `day(5)`, i.e. not older than 7 days at test time).

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/engine.ts packages/engine
git commit -m "feat(engine): size curves for structured events, tenant-scoped scoring and novelty, alert age cap

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Move rules (pure)

**Files:**
- Create: `packages/engine/src/moves/rules.ts`, `packages/engine/src/moves/rules.test.ts`
- Modify: `packages/engine/src/index.ts`

**Interfaces:**
- Consumes: `MoveType`, `ChangeType` (`@cs/core`); `ChangeDetails`, `NumericChange` (`@cs/db`); `VerticalPack['move_thresholds']`.
- Produces:
  - `MOVE_WINDOW_DAYS = 90`
  - `interface MoveEvent { id: string; changeType: ChangeType; channels: string[]; occurredAt: Date; services: Record<string, string | null>; facts: NumericChange[]; zips: string[]; summary: string; details: ChangeDetails }`
  - `interface AdActivity { activeNow: number; baseline: number }`
  - `interface MoveContext { now: Date; verticalId: string; clientServices: string[]; clientZips: string[]; clientTowns: string[]; thresholds: VerticalPack['move_thresholds']; ads: AdActivity }`
  - `interface MoveFinding { type: MoveType; eventIds: string[]; channels: string[]; confidence: number; summary: string; lastEvidenceAt: Date; facts: Record<string, number | string> }`
  - `moveConfidence(eventCount: number, channelCount: number, minEvents: number): number` = `min(1, 0.4 + 0.15·(events − min) + 0.15·(channels − 1))`, two decimals.
  - `touchesTerritory(e: MoveEvent, ctx): boolean`; `isPromo(e: MoveEvent): boolean`
  - `detectMoves(events: MoveEvent[], ctx: MoveContext): MoveFinding[]` — at most one finding per move type; events outside `[now − 90d, now]` are ignored.

Rules (spec §6.4, thresholds from the pack):

| Move | Fires when | Min events |
|---|---|---|
| `territory_expansion` | ≥ 2 distinct signals among *web area* (`service_area_change`/`new_location` from `web`), *GBP area* (`new_location` from `google_business_profile`), *ads* (`ad_started`), *jobs* (`hiring`) — each event must touch the client's ZIPs or towns | 2 |
| `price_war` | ≥ `price_war_cuts_90d` price cuts (`price_change` with a negative price `pct`) on the client's services (any service if the client lists none), **or** a promo plus ≥ `ad_burst_starts_30d` ads started in the last 30 days | 2 |
| `new_service_line` | a web `new_service` for service S plus a GBP `new_service` or an `ad_started` for the same S | 2 |
| `hiring_push` | ≥ `hiring_push_postings_30d` postings (sum of `details.count`) in `hiring` events of the last 30 days | 1 |
| `promo_blitz` | promos (`isPromo`) in ≥ 2 channels within the last `promo_blitz_window_days` | 2 |
| `reputation_slump` | the `rating_change` deltas in the window sum to ≤ −`rating_drop_90d` (complaint-theme spike: Phase 3c) | 1 |
| `ad_surge` | `ads.activeNow ≥ ad_surge_multiplier × max(ads.baseline, 1)` and at least one `ad_started` event in the window | 1 |

- [ ] **Step 1: Write the failing test**

`packages/engine/src/moves/rules.test.ts`:

```ts
import { loadVerticalPack, type VerticalPack } from '@cs/verticals';
import { beforeAll, describe, expect, it } from 'vitest';
import { day } from '../../test/seed';
import { diffFacts, extractNumericFacts } from '../facts/numeric';
import { detectMoves, type MoveContext, moveConfidence, type MoveEvent } from './rules';

let hvac: VerticalPack;
beforeAll(async () => {
  hvac = await loadVerticalPack('hvac_plumbing');
});
const now = day(100);
let n = 0;
const ev = (over: Partial<MoveEvent>): MoveEvent => ({
  id: `e${++n}`, changeType: 'content', channels: ['web'], occurredAt: day(95), services: { hvac_plumbing: null }, facts: [], zips: [], summary: '', details: {}, ...over,
});
const ctx = (over: Partial<MoveContext> = {}): MoveContext => ({
  now, verticalId: 'hvac_plumbing', clientServices: ['ac_tune_up'], clientZips: ['75023'], clientTowns: ['Frisco'], thresholds: hvac.move_thresholds, ads: { activeNow: 2, baseline: 2 }, ...over,
});
const cut = (from: string, to: string) => diffFacts(extractNumericFacts(from), extractNumericFacts(to));
const types = (events: MoveEvent[], c = ctx()) => detectMoves(events, c).map((f) => f.type);

describe('moveConfidence', () => {
  it('grows with extra events and channels, capped at 1', () => {
    expect(moveConfidence(2, 1, 2)).toBe(0.4);
    expect(moveConfidence(3, 2, 2)).toBe(0.7);
    expect(moveConfidence(9, 4, 1)).toBe(1);
  });
});

describe('detectMoves', () => {
  it('price war: two cuts on the client services inside 90 days', () => {
    const cuts = [ev({ changeType: 'price_change', services: { hvac_plumbing: 'ac_tune_up' }, facts: cut('$100', '$80') }), ev({ changeType: 'price_change', services: { hvac_plumbing: 'ac_tune_up' }, facts: cut('$80', '$70'), occurredAt: day(60) })];
    const [f] = detectMoves(cuts, ctx());
    expect(f).toMatchObject({ type: 'price_war', eventIds: cuts.map((e) => e.id), confidence: 0.4, lastEvidenceAt: day(95), facts: { cuts: 2 } });
    expect(types([cuts[0]!, ev({ ...cuts[1]!, services: { hvac_plumbing: 'drain_cleaning' } })])).toEqual([]); // not the client's service
    expect(types([cuts[0]!, ev({ ...cuts[1]!, occurredAt: day(5) })])).toEqual([]); // outside the 90-day window
    expect(types([cuts[0]!, ev({ ...cuts[1]!, facts: cut('$70', '$90') })])).toEqual([]); // a price rise is not a cut
  });

  it('price war: a promo plus an ad burst', () => {
    const events = [ev({ changeType: 'promo' }), ev({ changeType: 'ad_started', channels: ['meta_ads'], details: { count: 3 }, occurredAt: day(90) })];
    expect(types(events)).toContain('price_war');
    expect(types([events[0]!, ev({ ...events[1]!, details: { count: 2 } })])).not.toContain('price_war');
  });

  it('territory expansion: two kinds of signal touching the client ZIPs or towns', () => {
    const area = ev({ changeType: 'service_area_change', zips: ['75023'] });
    const jobs = ev({ changeType: 'hiring', channels: ['google_jobs'], summary: '2 new job postings: Technician — Frisco, TX', details: { count: 2 } });
    expect(types([area, jobs])).toContain('territory_expansion');
    expect(types([area, ev({ ...area, id: 'e-dup' })])).not.toContain('territory_expansion'); // one kind of signal twice
    expect(types([area, ev({ ...jobs, summary: '2 new job postings: Technician — Austin, TX' })])).not.toContain('territory_expansion');
    expect(types([area, jobs], ctx({ clientZips: [], clientTowns: [] }))).not.toContain('territory_expansion'); // no territory to compare
  });

  it('new service line: a web launch confirmed by GBP or ads for the same service', () => {
    const web = ev({ changeType: 'new_service', services: { hvac_plumbing: 'water_heater' } });
    expect(types([web, ev({ changeType: 'ad_started', channels: ['google_ads'], services: { hvac_plumbing: 'water_heater' } })])).toContain('new_service_line');
    expect(types([web, ev({ changeType: 'ad_started', channels: ['google_ads'], services: { hvac_plumbing: 'ac_repair' } })])).not.toContain('new_service_line');
  });

  it('hiring push: enough postings in 30 days', () => {
    expect(types([ev({ changeType: 'hiring', channels: ['google_jobs'], details: { count: 3 } })])).toContain('hiring_push');
    expect(types([ev({ changeType: 'hiring', channels: ['google_jobs'], details: { count: 3 }, occurredAt: day(60) })])).not.toContain('hiring_push');
  });

  it('promo blitz: promos in two channels within the window', () => {
    const web = ev({ changeType: 'promo' });
    const ad = ev({ changeType: 'ad_started', channels: ['meta_ads'], details: { offer: true } });
    expect(types([web, ad])).toContain('promo_blitz');
    expect(types([web, ev({ ...ad, details: { offer: false } })])).not.toContain('promo_blitz');
    expect(types([web, ev({ ...ad, occurredAt: day(70) })])).not.toContain('promo_blitz');
  });

  it('reputation slump: rating drops adding up to the threshold', () => {
    const drop = (a: number, b: number) => ev({ changeType: 'rating_change', channels: ['google_business_profile'], details: { ratingBefore: a, ratingAfter: b } });
    expect(types([drop(4.6, 4.5), drop(4.5, 4.4)])).toContain('reputation_slump');
    expect(types([drop(4.6, 4.5)])).not.toContain('reputation_slump');
  });

  it('ad surge: active ads at least the multiplier times the baseline, with a started-ad event as evidence', () => {
    const started = ev({ changeType: 'ad_started', channels: ['meta_ads'], details: { count: 1 } });
    expect(types([started], ctx({ ads: { activeNow: 8, baseline: 3 } }))).toContain('ad_surge');
    expect(types([started], ctx({ ads: { activeNow: 5, baseline: 3 } }))).not.toContain('ad_surge');
    expect(types([], ctx({ ads: { activeNow: 8, baseline: 3 } }))).not.toContain('ad_surge'); // no evidence, no claim
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cs/engine test -- rules`
Expected: FAIL — `./rules` missing.

- [ ] **Step 3: Implement `moves/rules.ts`**

```ts
import type { ChangeType, MoveType } from '@cs/core';
import type { ChangeDetails, NumericChange } from '@cs/db';
import type { VerticalPack } from '@cs/verticals';

/** Spec §6.4: moves look at a competitor's last 90 days of events, per client. */
export const MOVE_WINDOW_DAYS = 90;
const DAY_MS = 86_400_000;

export interface MoveEvent {
  id: string;
  changeType: ChangeType;
  channels: string[];
  occurredAt: Date;
  services: Record<string, string | null>;
  facts: NumericChange[];
  zips: string[];
  summary: string;
  details: ChangeDetails;
}

export interface AdActivity {
  /** Ads active now. */
  activeNow: number;
  /** Average number of active ads over the past 90 days. */
  baseline: number;
}

export interface MoveContext {
  now: Date;
  verticalId: string;
  clientServices: string[];
  clientZips: string[];
  clientTowns: string[];
  thresholds: VerticalPack['move_thresholds'];
  ads: AdActivity;
}

export interface MoveFinding {
  type: MoveType;
  eventIds: string[];
  channels: string[];
  confidence: number;
  summary: string;
  lastEvidenceAt: Date;
  facts: Record<string, number | string>;
}

/** Spec §6.4 confidence from the count and channel diversity of supporting events. */
export function moveConfidence(eventCount: number, channelCount: number, minEvents: number): number {
  const c = 0.4 + 0.15 * Math.max(0, eventCount - minEvents) + 0.15 * Math.max(0, channelCount - 1);
  return Math.round(Math.min(1, c) * 100) / 100;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The event names one of the client's ZIPs, or one of its towns as a whole word. */
export function touchesTerritory(e: MoveEvent, ctx: Pick<MoveContext, 'clientZips' | 'clientTowns'>): boolean {
  if (e.zips.some((z) => ctx.clientZips.includes(z))) return true;
  return ctx.clientTowns.some((t) => t.trim().length > 0 && new RegExp(`\\b${escapeRe(t.trim())}\\b`, 'i').test(e.summary));
}

/** A promotion in any channel: a web promo, or an ad / change flagged as an offer. */
export const isPromo = (e: MoveEvent) => e.changeType === 'promo' || e.details.offer === true;
const isCut = (e: MoveEvent) => e.changeType === 'price_change' && e.facts.some((f) => f.kind === 'price' && f.pct !== null && f.pct < 0);
const count = (e: MoveEvent) => e.details.count ?? 1;
const within = (e: MoveEvent, now: Date, days: number) => e.occurredAt.getTime() >= now.getTime() - days * DAY_MS;

function finding(type: MoveType, support: MoveEvent[], minEvents: number, summary: string, facts: Record<string, number | string>): MoveFinding {
  const unique = [...new Map(support.map((e) => [e.id, e])).values()];
  const channels = [...new Set(unique.flatMap((e) => e.channels))].sort();
  return {
    type,
    eventIds: unique.map((e) => e.id),
    channels,
    confidence: moveConfidence(unique.length, channels.length, minEvents),
    summary,
    lastEvidenceAt: new Date(Math.max(...unique.map((e) => e.occurredAt.getTime()))),
    facts,
  };
}

/** Evaluates the seven spec §6.4 move rules over one competitor's events for one client. */
export function detectMoves(all: MoveEvent[], ctx: MoveContext): MoveFinding[] {
  const now = ctx.now;
  const t = ctx.thresholds;
  const events = all.filter((e) => e.occurredAt <= now && within(e, now, MOVE_WINDOW_DAYS));
  const service = (e: MoveEvent) => e.services[ctx.verticalId] ?? null;
  const out: MoveFinding[] = [];

  // Territory expansion — ≥ 2 kinds of signal referencing the client's ZIPs or towns.
  if (ctx.clientZips.length > 0 || ctx.clientTowns.length > 0) {
    const signals = new Map<string, MoveEvent[]>();
    const add = (kind: string, e: MoveEvent) => signals.set(kind, [...(signals.get(kind) ?? []), e]);
    for (const e of events.filter((x) => touchesTerritory(x, ctx))) {
      if ((e.changeType === 'service_area_change' || e.changeType === 'new_location') && e.channels.includes('web')) add('web_area', e);
      if (e.changeType === 'new_location' && e.channels.includes('google_business_profile')) add('gbp_area', e);
      if (e.changeType === 'ad_started') add('ads', e);
      if (e.changeType === 'hiring') add('jobs', e);
    }
    if (signals.size >= 2) {
      out.push(finding('territory_expansion', [...signals.values()].flat(), 2, `Expanding into your area (${[...signals.keys()].sort().join(', ')})`, { signals: signals.size }));
    }
  }

  // Price war — repeated cuts on overlapping services, or a promo plus an ad burst.
  const overlapping = (e: MoveEvent) => ctx.clientServices.length === 0 || (service(e) !== null && ctx.clientServices.includes(service(e)!));
  const cuts = events.filter((e) => isCut(e) && overlapping(e));
  const recentStarts = events.filter((e) => e.changeType === 'ad_started' && within(e, now, 30));
  const startedAds = recentStarts.reduce((n, e) => n + count(e), 0);
  const promos = events.filter((e) => e.changeType === 'promo');
  if (cuts.length >= t.price_war_cuts_90d) {
    out.push(finding('price_war', cuts, 2, `${cuts.length} price cuts on services you offer`, { cuts: cuts.length }));
  } else if (promos.length > 0 && startedAds >= t.ad_burst_starts_30d) {
    out.push(finding('price_war', [...promos, ...recentStarts], 2, `Promotion backed by ${startedAds} new ads`, { promos: promos.length, adsStarted: startedAds }));
  }

  // New service line — a web launch confirmed by GBP or ads for the same service.
  for (const web of events.filter((e) => e.changeType === 'new_service' && e.channels.includes('web') && service(e) !== null)) {
    const s = service(web)!;
    const confirm = events.filter(
      (e) => e !== web && service(e) === s && ((e.changeType === 'new_service' && e.channels.includes('google_business_profile')) || e.changeType === 'ad_started'),
    );
    if (confirm.length > 0) {
      out.push(finding('new_service_line', [web, ...confirm], 2, `Launched a new service line: ${s}`, { service: s }));
      break;
    }
  }

  // Hiring push — enough postings in 30 days.
  const hiring = events.filter((e) => e.changeType === 'hiring' && within(e, now, 30));
  const postings = hiring.reduce((n, e) => n + count(e), 0);
  if (postings >= t.hiring_push_postings_30d) out.push(finding('hiring_push', hiring, 1, `${postings} new job postings in 30 days`, { postings }));

  // Promo blitz — promotions in ≥ 2 channels at once.
  const blitz = events.filter((e) => isPromo(e) && within(e, now, t.promo_blitz_window_days));
  const blitzChannels = new Set(blitz.flatMap((e) => e.channels));
  if (blitzChannels.size >= 2) out.push(finding('promo_blitz', blitz, 2, `Promotions running in ${blitzChannels.size} channels`, { channels: blitzChannels.size }));

  // Reputation slump — rating drops add up (complaint-theme spike joins in Phase 3c).
  const ratings = events.filter((e) => e.changeType === 'rating_change' && e.details.ratingBefore !== undefined && e.details.ratingAfter !== undefined);
  const delta = Math.round(ratings.reduce((n, e) => n + (e.details.ratingAfter! - e.details.ratingBefore!), 0) * 100) / 100;
  if (ratings.length > 0 && delta <= -t.rating_drop_90d) out.push(finding('reputation_slump', ratings, 1, `Google rating down ${Math.abs(delta)} in 90 days`, { ratingDelta: delta }));

  // Ad surge — active ads far above the 90-day baseline, backed by started-ad events.
  const started = events.filter((e) => e.changeType === 'ad_started');
  if (started.length > 0 && ctx.ads.activeNow >= t.ad_surge_multiplier * Math.max(ctx.ads.baseline, 1)) {
    out.push(finding('ad_surge', started, 1, `${ctx.ads.activeNow} active ads vs ${ctx.ads.baseline} usually`, { activeNow: ctx.ads.activeNow, baseline: ctx.ads.baseline }));
  }
  return out;
}
```

Export `./moves/rules` from `index.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cs/engine test -- rules && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): the seven spec move rules as pure functions with confidence

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 14: Moves stage — nightly persistence and lifecycle

**Files:**
- Create: `packages/engine/src/moves/moves-stage.ts`, `packages/engine/src/moves/moves-stage.test.ts`
- Modify: `packages/engine/src/index.ts`

**Interfaces:**
- Consumes: `detectMoves`, `MOVE_WINDOW_DAYS`, `MoveEvent`, `MoveFinding`, `AdActivity` (Task 13); `move`, `moveEvent`, `MoveDetails`, `MoveStatus` (Task 3); `PackLoader` (3a).
- Produces:
  - `MOVES_RULE_VERSION = 1`, `ACTIVE_AFTER_DAYS = 7`, `ACTIVE_CONFIDENCE = 0.7`, `FADING_AFTER_DAYS = 30`, `CLOSE_AFTER_DAYS = 30`
  - `nextStatus(firstDetectedAt: Date, f: { confidence: number; lastEvidenceAt: Date }, now: Date): MoveStatus`
  - `adActivity(db: Db, competitorId: string, now: Date): Promise<AdActivity>` — active ads now; baseline = mean active count at 12 weekly points over the past 84 days.
  - `interface MovesRunResult { opened: number; updated: number; fading: number; closed: number }`
  - `updateMovesForClient(deps: { db: Db; packs: PackLoader }, clientId: string, opts?: { now?: Date }): Promise<MovesRunResult>` — idempotent per run; only events this client has an `event_score` for count (so tenant isolation and "linked within the score window" follow scoring).
  - `listMoveClients(db: Db): Promise<string[]>` — clients with at least one competitor link.

- [ ] **Step 1: Write the failing test**

`packages/engine/src/moves/moves-stage.test.ts`:

```ts
import { ad, changeEvent, client, eventScore, move, moveEvent, withTenant } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { day } from '../../test/seed';
import { diffFacts, extractNumericFacts } from '../facts/numeric';
import { createPackLoader } from '../tag/tag-stage';
import { adActivity, listMoveClients, nextStatus, updateMovesForClient } from './moves-stage';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const packs = createPackLoader();
const factors = { typeWeight: 1, size: 1, serviceOverlap: 1, territoryOverlap: 1, relevance: 1, novelty: 1, maxSimilarity: null, needsReviewCap: false, thresholds: { alert: 70, brief: 40 }, scoringVersion: 2 };
let cuts: string[];

async function cut(at: number, from: string, to: string) {
  const [e] = await dbs.service
    .insert(changeEvent)
    .values({
      competitorId: IDS.competitorX, changeType: 'price_change', channels: ['web'], services: { hvac_plumbing: 'ac_tune_up' }, summary: `cut ${from}→${to}`,
      facts: diffFacts(extractNumericFacts(from), extractNumericFacts(to)), confidence: 0.95, occurredAt: day(at),
    })
    .returning({ id: changeEvent.id });
  await dbs.service.insert(eventScore).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, eventId: e!.id, score: 80, route: 'alert', factors, packVersion: 1 });
  return e!.id;
}

const moves = () => dbs.owner.select().from(move);
const run = (at: number, clientId: string = IDS.clientA1) => updateMovesForClient({ db: dbs.service, packs }, clientId, { now: day(at) });

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.update(client).set({ services: ['ac_tune_up'] }).where(eq(client.id, IDS.clientA1));
  cuts = [await cut(90, '$100', '$80'), await cut(95, '$80', '$70')];
});

describe('updateMovesForClient', () => {
  it('opens an emerging move with its evidence chain', async () => {
    expect(await run(100)).toEqual({ opened: 1, updated: 0, fading: 0, closed: 0 });
    const [m] = await moves();
    expect(m).toMatchObject({ moveType: 'price_war', status: 'emerging', confidence: 0.4, agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, lastEvidenceAt: day(95), closedAt: null });
    expect(m?.details).toEqual({ eventCount: 2, channels: ['web'], facts: { cuts: 2 } });
    expect((await dbs.owner.select().from(moveEvent)).map((l) => l.eventId).sort()).toEqual([...cuts].sort());
  });

  it('becomes active once it has held for a week, and is idempotent per run', async () => {
    await run(100);
    expect(await run(108)).toEqual({ opened: 0, updated: 1, fading: 0, closed: 0 });
    await run(108);
    expect((await moves()).map((m) => m.status)).toEqual(['active']);
    expect(await dbs.owner.select().from(moveEvent)).toHaveLength(2);
  });

  it('fades when its newest evidence is over 30 days old', async () => {
    await run(100);
    await run(130);
    expect((await moves())[0]?.status).toBe('fading');
  });

  it('fades when the rule stops holding, and closes 30 days later', async () => {
    await run(100);
    await dbs.owner.delete(eventScore).where(eq(eventScore.eventId, cuts[1]!));
    expect(await run(101)).toMatchObject({ fading: 1, closed: 0 });
    expect((await moves())[0]).toMatchObject({ status: 'fading', closedAt: null });
    expect(await run(131)).toMatchObject({ closed: 1 });
    expect((await moves())[0]?.closedAt).toEqual(day(131));
  });

  it('only uses events the client was scored for, and keeps moves private to the tenant', async () => {
    expect(await run(100, IDS.clientB1)).toEqual({ opened: 0, updated: 0, fading: 0, closed: 0 }); // B1 tracks X but has no scores
    await run(100);
    expect(await withTenant(dbs.app, { agencyId: IDS.agencyB, clientScope: 'all' }, (tx) => tx.select().from(move))).toEqual([]);
    expect(await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: [IDS.clientA1] }, (tx) => tx.select().from(move))).toHaveLength(1);
  });
});

describe('nextStatus', () => {
  it('is emerging at first, active after a week or at high confidence, fading on stale evidence', () => {
    expect(nextStatus(day(100), { confidence: 0.4, lastEvidenceAt: day(99) }, day(100))).toBe('emerging');
    expect(nextStatus(day(100), { confidence: 0.7, lastEvidenceAt: day(99) }, day(100))).toBe('active');
    expect(nextStatus(day(100), { confidence: 0.4, lastEvidenceAt: day(99) }, day(107))).toBe('active');
    expect(nextStatus(day(100), { confidence: 0.9, lastEvidenceAt: day(60) }, day(100))).toBe('fading');
  });
});

describe('adActivity and listMoveClients', () => {
  it('compares active ads now with the 90-day baseline', async () => {
    const base = { competitorId: IDS.competitorX, platform: 'meta', isActive: true };
    await dbs.service.insert(ad).values([
      ...[1, 2, 3].map((i) => ({ ...base, externalId: `old${i}`, firstSeenAt: day(0) })),
      ...[1, 2, 3, 4, 5, 6].map((i) => ({ ...base, externalId: `new${i}`, firstSeenAt: day(98) })),
      { ...base, externalId: 'ended', isActive: false, firstSeenAt: day(0), endedAt: day(10), lastSeenAt: day(10) },
    ]);
    expect(await adActivity(dbs.service, IDS.competitorX, day(100))).toEqual({ activeNow: 9, baseline: 3 });
  });

  it('lists every client that tracks a competitor', async () => {
    expect((await listMoveClients(dbs.service)).sort()).toEqual([IDS.clientA1, IDS.clientA2, IDS.clientB1].sort());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cs/engine test -- moves-stage`
Expected: FAIL — `./moves-stage` missing.

- [ ] **Step 3: Implement `moves/moves-stage.ts`**

```ts
import type { ChangeType } from '@cs/core';
import { changeEvent, client, clientCompetitor, type Db, eventScore, move, type MoveDetails, moveEvent, type MoveStatus } from '@cs/db';
import { and, eq, gte, isNull, lte, ne, sql } from 'drizzle-orm';
import type { PackLoader } from '../tag/tag-stage';
import { type AdActivity, detectMoves, MOVE_WINDOW_DAYS, type MoveEvent, type MoveFinding } from './rules';

export const MOVES_RULE_VERSION = 1;
/** A move is 'active' once it has held this long … */
export const ACTIVE_AFTER_DAYS = 7;
/** … or straight away at this confidence. */
export const ACTIVE_CONFIDENCE = 0.7;
/** Still holding, but the newest supporting event is older than this → 'fading'. */
export const FADING_AFTER_DAYS = 30;
/** A move whose rule has not held for this long is closed. */
export const CLOSE_AFTER_DAYS = 30;
const DAY_MS = 86_400_000;

export function nextStatus(firstDetectedAt: Date, f: Pick<MoveFinding, 'confidence' | 'lastEvidenceAt'>, now: Date): MoveStatus {
  if (now.getTime() - f.lastEvidenceAt.getTime() > FADING_AFTER_DAYS * DAY_MS) return 'fading';
  return now.getTime() - firstDetectedAt.getTime() >= ACTIVE_AFTER_DAYS * DAY_MS || f.confidence >= ACTIVE_CONFIDENCE ? 'active' : 'emerging';
}

/** Active ads now vs the mean active count at 12 weekly points over the past 84 days (spec §6.4 ad surge). */
export async function adActivity(db: Db, competitorId: string, now: Date): Promise<AdActivity> {
  const at = now.toISOString();
  const [row] = (await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM ad WHERE competitor_id = ${competitorId}::uuid AND is_active) AS active_now,
      (SELECT coalesce(avg(n), 0)::float8 FROM (
         SELECT count(a.id) AS n
         FROM generate_series(1, 12) AS w(i)
         LEFT JOIN ad a ON a.competitor_id = ${competitorId}::uuid
           AND a.first_seen_at <= ${at}::timestamptz - make_interval(days => 7 * w.i)
           AND (a.is_active OR coalesce(a.ended_at, a.last_seen_at) > ${at}::timestamptz - make_interval(days => 7 * w.i))
         GROUP BY w.i) s) AS baseline`)) as unknown as { active_now: number; baseline: number }[];
  return { activeNow: Number(row?.active_now ?? 0), baseline: Math.round(Number(row?.baseline ?? 0) * 10) / 10 };
}

export async function listMoveClients(db: Db): Promise<string[]> {
  const rows = await db.selectDistinct({ id: clientCompetitor.clientId }).from(clientCompetitor);
  return rows.map((r) => r.id);
}

export interface MovesRunResult {
  opened: number;
  updated: number;
  fading: number;
  closed: number;
}

/**
 * Nightly moves (spec §6.4) for one client: per tracked competitor, run the rules over the last 90 days of
 * events this client was scored for, then open / update / fade / close its `move` rows and extend each
 * move's evidence chain. Re-running on the same day changes nothing but `updated_at`.
 */
export async function updateMovesForClient(deps: { db: Db; packs: PackLoader }, clientId: string, opts: { now?: Date } = {}): Promise<MovesRunResult> {
  const now = opts.now ?? new Date();
  const [c] = await deps.db.select().from(client).where(eq(client.id, clientId)).limit(1);
  if (!c) throw new Error(`client ${clientId} not found`);
  const pack = await deps.packs(c.verticalId);
  const since = new Date(now.getTime() - MOVE_WINDOW_DAYS * DAY_MS);
  const links = await deps.db.select({ competitorId: clientCompetitor.competitorId }).from(clientCompetitor).where(eq(clientCompetitor.clientId, clientId));
  const r: MovesRunResult = { opened: 0, updated: 0, fading: 0, closed: 0 };

  for (const { competitorId } of links) {
    const rows = await deps.db
      .select({ e: changeEvent })
      .from(changeEvent)
      .innerJoin(eventScore, and(eq(eventScore.eventId, changeEvent.id), eq(eventScore.clientId, clientId)))
      .where(and(eq(changeEvent.competitorId, competitorId), gte(changeEvent.occurredAt, since), lte(changeEvent.occurredAt, now), ne(changeEvent.changeType, 'cosmetic')));
    const events: MoveEvent[] = rows.map(({ e }) => ({
      id: e.id, changeType: e.changeType as ChangeType, channels: e.channels, occurredAt: e.occurredAt, services: e.services, facts: e.facts, zips: e.zips, summary: e.summary, details: e.details,
    }));
    const findings = detectMoves(events, {
      now, verticalId: c.verticalId, clientServices: c.services, clientZips: c.serviceArea?.zips ?? [], clientTowns: c.serviceArea?.towns ?? [],
      thresholds: pack.move_thresholds, ads: await adActivity(deps.db, competitorId, now),
    });
    const open = await deps.db.select().from(move).where(and(eq(move.clientId, clientId), eq(move.competitorId, competitorId), isNull(move.closedAt)));

    await deps.db.transaction(async (tx) => {
      for (const f of findings) {
        const details: MoveDetails = { eventCount: f.eventIds.length, channels: f.channels, facts: f.facts };
        const existing = open.find((m) => m.moveType === f.type);
        let moveId: string;
        if (existing) {
          await tx
            .update(move)
            .set({ status: nextStatus(existing.firstDetectedAt, f, now), confidence: f.confidence, summary: f.summary, details, ruleVersion: MOVES_RULE_VERSION, lastHeldAt: now, lastEvidenceAt: f.lastEvidenceAt, updatedAt: now })
            .where(eq(move.id, existing.id));
          moveId = existing.id;
          r.updated++;
        } else {
          const [m] = await tx
            .insert(move)
            .values({
              agencyId: c.agencyId, clientId, competitorId, moveType: f.type, status: nextStatus(now, f, now), confidence: f.confidence, summary: f.summary, details,
              ruleVersion: MOVES_RULE_VERSION, firstDetectedAt: now, lastHeldAt: now, lastEvidenceAt: f.lastEvidenceAt, updatedAt: now,
            })
            .returning({ id: move.id });
          moveId = m!.id;
          r.opened++;
        }
        await tx.insert(moveEvent).values(f.eventIds.map((eventId) => ({ moveId, eventId }))).onConflictDoNothing();
      }
      for (const m of open.filter((x) => !findings.some((f) => f.type === x.moveType))) {
        const close = now.getTime() - m.lastHeldAt.getTime() >= CLOSE_AFTER_DAYS * DAY_MS;
        await tx.update(move).set({ status: 'fading', updatedAt: now, ...(close ? { closedAt: now } : {}) }).where(eq(move.id, m.id));
        if (close) r.closed++;
        else r.fading++;
      }
    });
  }
  return r;
}
```

Export `./moves/moves-stage` from `index.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cs/engine test -- moves && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): nightly moves stage with emerging/active/fading/closed lifecycle and evidence chain

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Worker wiring — rank diffs, nightly moves, enqueue dedupe, `engine-once`

**Files:**
- Modify: `apps/worker/src/jobs.ts`, `apps/worker/src/boss.ts`, `apps/worker/src/boss.test.ts`
- Modify: `apps/worker/src/jobs/engine.ts`, `apps/worker/src/jobs/engine.test.ts`
- Create: `apps/worker/src/jobs/moves.ts`, `apps/worker/src/jobs/moves.test.ts`
- Modify: `apps/worker/src/deps.ts`, `apps/worker/src/main.ts`
- Create: `apps/worker/src/cli/engine-args.ts`, `apps/worker/src/cli/engine-args.test.ts`; modify `apps/worker/src/cli/engine-once.ts`

**Interfaces:**
- Consumes: `diffRankScan`, `updateMovesForClient`, `listMoveClients`, `EngineWork.rankDiff` (Tasks 9, 14).
- Produces:
  - `JobQueueOptions` includes `policy`; `enqueue(boss, job, data, opts?: { singletonKey?: string })`.
  - `ENGINE_STAGE_QUEUE = { retryLimit: 0, policy: 'short' }` — pg-boss 10's `short` policy allows one *queued* job per `singletonKey` (unique index `job_i1` on `(name, singleton_key) WHERE state = 'created' AND policy = 'short'`); `main.ts` enqueues every engine job with `singletonKey` = its subject id, so a sweep never stacks duplicates (3a carry-over).
  - Engine jobs gain `rankDiff` (`engine-rank-diff`, `{ scanId }`); the queue adapter gains `enqueueRankDiff(scanId)`.
  - `createMovesJobs(deps, queue: { enqueueMovesClient(clientId: string): Promise<void> })` → `{ nightly, client }`: `moves-nightly` (cron `30 4 * * *`) and `moves-client` (`{ clientId }`, `{ policy: 'short' }`).
  - `WorkerDeps` gains `diffRankScan(scanId): Promise<{ ran: boolean; changeIds: string[] }>`, `updateMoves(clientId): Promise<MovesRunResult>`, `listMoveClients(): Promise<string[]>`.
  - `parseEngineArgs(argv: string[]): { competitor?: string; rounds: number; moves: boolean } | { error: string }`; `engine-once --moves` runs moves for every client (or those tracking `--competitor`) after draining; exit code 1 when the drain reported errors.

- [ ] **Step 1: Write the failing tests**

Append to `apps/worker/src/jobs/engine.test.ts` (update `queue()` to also return `enqueueRankDiff: vi.fn(async (_id: string) => {})`, and the first test's stub to `rankDiff: [U(4)]` expecting `q.enqueueRankDiff.mock.calls` to equal `[[U(4)]]`):

```ts
  it('chains rank diff → tag', async () => {
    const deps = { diffRankScan: vi.fn(async () => ({ ran: true, changeIds: [U(5)] })) } as unknown as WorkerDeps;
    const q = queue();
    const jobs = createEngineJobs(deps, q);
    await jobs.rankDiff.handler({ scanId: U(4) });
    expect(deps.diffRankScan).toHaveBeenCalledWith(U(4));
    expect(q.enqueueTag.mock.calls).toEqual([[U(5)]]);
  });

  it('uses the short policy so one subject is queued at most once', () => {
    const jobs = createEngineJobs({} as WorkerDeps, queue());
    for (const job of [jobs.diff, jobs.tag, jobs.score, jobs.rankDiff]) expect(job.queue).toMatchObject({ retryLimit: 0, policy: 'short' });
  });
```

`apps/worker/src/jobs/moves.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { WorkerDeps } from '../deps';
import { createMovesJobs } from './moves';

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('moves jobs', () => {
  it('runs nightly and enqueues every client that tracks a competitor', async () => {
    const deps = { listMoveClients: vi.fn(async () => [U(1), U(2)]) } as unknown as WorkerDeps;
    const enqueueMovesClient = vi.fn(async (_id: string) => {});
    const jobs = createMovesJobs(deps, { enqueueMovesClient });
    expect(jobs.nightly.cron).toBe('30 4 * * *');
    await jobs.nightly.handler({});
    expect(enqueueMovesClient.mock.calls).toEqual([[U(1)], [U(2)]]);
  });

  it('updates one client per job', async () => {
    const deps = { updateMoves: vi.fn(async () => ({ opened: 1, updated: 0, fading: 0, closed: 0 })) } as unknown as WorkerDeps;
    const jobs = createMovesJobs(deps, { enqueueMovesClient: vi.fn() });
    await jobs.client.handler({ clientId: U(3) });
    expect(deps.updateMoves).toHaveBeenCalledWith(U(3));
    expect(() => jobs.client.schema.parse({ clientId: 'x' })).toThrow();
  });
});
```

Append to `apps/worker/src/boss.test.ts` (add `vi` to the vitest import; register `shortJob` in the `beforeAll` list next to the others):

```ts
const shortJob = defineJob({ name: 'test-short', schema: z.object({ id: z.string() }), handler: async () => {}, queue: { retryLimit: 0, policy: 'short' } });

describe('queue dedupe (Phase 3b)', () => {
  it('keeps one queued job per singleton key on a short-policy queue', async () => {
    expect((await boss.getQueue(shortJob.name))?.policy).toBe('short');
    const a = await boss.send(shortJob.name, { id: 'x' }, { singletonKey: 'k', startAfter: 3600 });
    const b = await boss.send(shortJob.name, { id: 'x' }, { singletonKey: 'k', startAfter: 3600 });
    expect(a).toBeTruthy();
    expect(b).toBeNull();
    await boss.deleteJob(shortJob.name, a as string);
  });

  it('forwards the singleton key when enqueueing', async () => {
    const send = vi.spyOn(boss, 'send').mockResolvedValueOnce('id');
    await enqueue(boss, echoJob, { message: 'k' }, { singletonKey: 'abc' });
    expect(send).toHaveBeenCalledWith('test-echo', { message: 'k' }, { singletonKey: 'abc' });
    send.mockRestore();
  });
});
```

`apps/worker/src/cli/engine-args.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseEngineArgs } from './engine-args';

describe('parseEngineArgs', () => {
  it('accepts a competitor uuid, a round count and --moves', () => {
    expect(parseEngineArgs(['--competitor', '00000000-0000-4000-8000-0000000000f1', '--rounds', '3', '--moves'])).toEqual({ competitor: '00000000-0000-4000-8000-0000000000f1', rounds: 3, moves: true });
    expect(parseEngineArgs([])).toEqual({ rounds: 10, moves: false });
  });

  it('rejects a malformed competitor id or round count with a clear message', () => {
    expect(parseEngineArgs(['--competitor', 'aireserv.com'])).toEqual({ error: expect.stringContaining('--competitor must be a uuid') });
    expect(parseEngineArgs(['--rounds', 'ten'])).toEqual({ error: expect.stringContaining('--rounds must be an integer from 1 to 1000') });
    expect(parseEngineArgs(['--rounds', '0'])).toMatchObject({ error: expect.any(String) });
    expect(parseEngineArgs(['--bogus'])).toMatchObject({ error: expect.any(String) });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @cs/worker test`
Expected: FAIL — `rankDiff`, `./moves`, `./engine-args`, the 4-argument `enqueue` and the `policy` option do not exist.

- [ ] **Step 3: Queue options and enqueue**

`apps/worker/src/jobs.ts`: `export type JobQueueOptions = Pick<PgBoss.Queue, 'retryLimit' | 'retryDelay' | 'retryBackoff' | 'expireInSeconds' | 'retentionMinutes' | 'policy'>;` and extend the doc comment: "`policy: 'short'` keeps at most one *queued* job per `singletonKey` — pg-boss 10 applies a policy change to existing queues through `updateQueue`, so redeploys pick it up."

`apps/worker/src/boss.ts`:

```ts
export async function enqueue<T>(boss: PgBoss, job: JobDefinition<T>, data: T, opts: { singletonKey?: string } = {}): Promise<string | null> {
  const payload = job.schema.parse(data);
  return boss.send(job.name, payload as object, opts);
}
```

- [ ] **Step 4: Engine and moves jobs**

`apps/worker/src/jobs/engine.ts`:

```ts
/**
 * Engine stage jobs must never retry themselves: runStage marks a run 'failed' and rethrows, so a
 * pg-boss retry re-claims and re-fails the same stage_run attempts budget back to back. The
 * engine-sweep cron is the only retry path (packages/engine/src/sweep.ts backs off exponentially
 * per stage_run.attempts). The 'short' policy plus a per-subject singletonKey (main.ts) keeps a
 * subject from being queued twice when a sweep runs while its job is still waiting (3a carry-over).
 */
export const ENGINE_STAGE_QUEUE = { retryLimit: 0, policy: 'short' } as const;

export function createEngineJobs(
  deps: WorkerDeps,
  queue: {
    enqueueDiff(captureId: string): Promise<void>;
    enqueueRankDiff(scanId: string): Promise<void>;
    enqueueTag(changeId: string): Promise<void>;
    enqueueScore(eventId: string): Promise<void>;
  },
) {
```

In the sweep handler add `for (const id of w.rankDiff) await queue.enqueueRankDiff(id);` and include `rank ${w.rankDiff.length}` in the log line (and in the "anything found" sum). Add the job:

```ts
  const rankDiff = defineJob({
    name: 'engine-rank-diff', schema: z.object({ scanId: z.uuid() }), queue: ENGINE_STAGE_QUEUE,
    handler: async ({ scanId }) => {
      const r = await deps.diffRankScan(scanId);
      for (const id of r.changeIds) await queue.enqueueTag(id);
      if (r.ran) console.log(`[engine-rank-diff] ${scanId} → ${r.changeIds.length} change(s)`);
    },
  });
  return { sweep, diff, rankDiff, tag, score };
```

`apps/worker/src/jobs/moves.ts`:

```ts
import { z } from 'zod';
import type { WorkerDeps } from '../deps';
import { defineJob } from '../jobs';

/** Spec §6.4: moves are evaluated nightly, one job per client so one failure never blocks the rest. */
export function createMovesJobs(deps: WorkerDeps, queue: { enqueueMovesClient(clientId: string): Promise<void> }) {
  const nightly = defineJob({
    name: 'moves-nightly', schema: z.looseObject({}), cron: '30 4 * * *',
    handler: async () => {
      const ids = await deps.listMoveClients();
      for (const id of ids) await queue.enqueueMovesClient(id);
      console.log(`[moves-nightly] enqueued ${ids.length} client(s)`);
    },
  });
  const client = defineJob({
    name: 'moves-client', schema: z.object({ clientId: z.uuid() }), queue: { policy: 'short' },
    handler: async ({ clientId }) => {
      console.log(`[moves-client] ${clientId} → ${JSON.stringify(await deps.updateMoves(clientId))}`);
    },
  });
  return { nightly, client };
}
```

- [ ] **Step 5: Deps and main**

`apps/worker/src/deps.ts` — import `diffRankScan, listMoveClients, type MovesRunResult, updateMovesForClient` from `@cs/engine`; add to `WorkerDeps`:

```ts
  diffRankScan(scanId: string): Promise<{ ran: boolean; changeIds: string[] }>;
  updateMoves(clientId: string): Promise<MovesRunResult>;
  listMoveClients(): Promise<string[]>;
```

and to the returned object:

```ts
    async diffRankScan(scanId) {
      const r = await diffRankScan({ db: getDb() }, scanId);
      return r.ran ? { ran: true, changeIds: r.result.changeIds } : { ran: false, changeIds: [] };
    },
    updateMoves: (clientId) => updateMovesForClient({ db: getDb(), packs }, clientId),
    listMoveClients: () => listMoveClients(getDb()),
```

`apps/worker/src/main.ts` — every engine enqueue passes its subject as the singleton key, and the new jobs are wired and registered:

```ts
const engine = createEngineJobs(deps, {
  enqueueDiff: async (captureId) => {
    await enqueue(boss, engine.diff, { captureId }, { singletonKey: captureId });
  },
  enqueueRankDiff: async (scanId) => {
    await enqueue(boss, engine.rankDiff, { scanId }, { singletonKey: scanId });
  },
  enqueueTag: async (changeId) => {
    await enqueue(boss, engine.tag, { changeId }, { singletonKey: changeId });
  },
  enqueueScore: async (eventId) => {
    await enqueue(boss, engine.score, { eventId }, { singletonKey: eventId });
  },
});
const moves = createMovesJobs(deps, {
  enqueueMovesClient: async (clientId) => {
    await enqueue(boss, moves.client, { clientId }, { singletonKey: clientId });
  },
});
```

(the web job's `enqueueDiff` also passes `{ singletonKey: captureId }`), and the `registerJobs` list gains `engine.rankDiff, moves.nightly, moves.client`.

- [ ] **Step 6: `engine-once` arguments, moves and exit code**

`apps/worker/src/cli/engine-args.ts`:

```ts
import { parseArgs } from 'node:util';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ENGINE_ONCE_USAGE = 'Usage: pnpm --filter @cs/worker engine-once [--competitor <uuid>] [--rounds <1-1000>] [--moves]';

/** Validates engine-once's flags up front (3a carry-over: bad input used to fail deep inside the engine). */
export function parseEngineArgs(argv: string[]): { competitor?: string; rounds: number; moves: boolean } | { error: string } {
  let values: { competitor?: string; rounds?: string; moves?: boolean };
  try {
    ({ values } = parseArgs({ args: argv, options: { competitor: { type: 'string' }, rounds: { type: 'string', default: '10' }, moves: { type: 'boolean', default: false } } }));
  } catch (err) {
    return { error: `${err instanceof Error ? err.message : String(err)}\n${ENGINE_ONCE_USAGE}` };
  }
  if (values.competitor !== undefined && !UUID.test(values.competitor)) return { error: `--competitor must be a uuid (got "${values.competitor}")\n${ENGINE_ONCE_USAGE}` };
  const rounds = Number(values.rounds);
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 1000) return { error: `--rounds must be an integer from 1 to 1000 (got "${values.rounds}")\n${ENGINE_ONCE_USAGE}` };
  return { ...(values.competitor ? { competitor: values.competitor } : {}), rounds, moves: values.moves ?? false };
}
```

In `apps/worker/src/cli/engine-once.ts` replace the `parseArgs` call with:

```ts
const { parseEngineArgs } = await import('./engine-args');
const args = parseEngineArgs(process.argv.slice(2));
if ('error' in args) {
  console.error(args.error);
  process.exit(1);
}
```

use `args.competitor` / `args.rounds` in place of `values.*`, import `clientCompetitor, move` from `@cs/db` and `listMoveClients, updateMovesForClient` from `@cs/engine`, and after printing the events add:

```ts
  if (args.moves) {
    const clientIds = args.competitor
      ? (await db.select({ id: clientCompetitor.clientId }).from(clientCompetitor).where(eq(clientCompetitor.competitorId, args.competitor))).map((r) => r.id)
      : await listMoveClients(db);
    for (const id of clientIds) console.log(`[moves] ${id.slice(0, 8)} → ${JSON.stringify(await updateMovesForClient({ db, packs }, id))}`);
    const open = await db.select().from(move).where(args.competitor ? eq(move.competitorId, args.competitor) : undefined).orderBy(desc(move.updatedAt)).limit(20);
    for (const m of open) console.log(`${m.status.padEnd(8)} ${m.moveType.padEnd(19)} ${m.confidence.toFixed(2)} ${m.summary}${m.closedAt ? ' (closed)' : ''}`);
  }
  if (result.errors > 0) process.exitCode = 1;
```

(hoist `const packs = createPackLoader();` above `drainEngine` and pass it there too).

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter @cs/worker test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/worker
git commit -m "feat(worker): rank-diff and nightly moves jobs, per-subject enqueue dedupe, validated engine-once with --moves

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: Live verification and documentation

**Files:**
- Modify: `docs/research/2026-09-30-phase-2-vendor-apis.md`, `docs/superpowers/plans/2026-09-29-roadmap.md`, `docs/superpowers/specs/2026-09-29-core-platform-design.md`, `docs/HANDOVER.md`

**Interfaces:**
- Consumes: everything above. Produces documentation only (plus cs_dev data from the live run).

- [ ] **Step 1: Full suite**

Run (foreground): `pnpm typecheck && pnpm test`
Expected: all packages green. Record the per-package test counts for the handover.

- [ ] **Step 2: Live structured pass against Aire Serv (vendors only — no crawling)**

1. Find the Google advertiser ids already attributed to Aire Serv: `node --env-file=.env -e "const p=require('postgres');const s=p(process.env.DATABASE_URL);s\`SELECT advertiser_id, count(*) FROM ad a JOIN competitor c ON c.id=a.competitor_id WHERE c.domain='aireserv.com' AND a.platform='google' GROUP BY 1 ORDER BY 2 DESC\`.then(r=>{console.log(r);return s.end()})"`.
2. Re-collect with the advertiser ids pinned (≤ 3 ids, each passed with its own `--google-advertiser-id`) and the known Meta page: `pnpm --filter @cs/worker collect-once --domain aireserv.com --place-id ChIJ6VlKPHqPT4YR479jLd01gZY --meta-page-id 1825453601028298 --google-advertiser-id <id1> --vendors`. Expected: `ads_google` ok with an `advertiser_ids` request (record the cost from the ledger and whether `depth: 120` was accepted), `ads_meta` ok with one per-page capture whose `url` is the page URL.
3. After ~45 minutes: `pnpm --filter @cs/worker collect-once --poll` (reviews + jobs).
4. At least 10 minutes after the captures: `pnpm --filter @cs/worker engine-once --competitor <aire serv competitor id> --moves`. Expected: vendor diffs run (the 2026-10-01 captures are the baselines, so expect a handful of real changes — new/stopped ads, new postings, GBP field moves — or none); every event carries `channels`; exit code 0. Note the spend (≈ $0.01 for the vendor calls plus embeddings/decisions).
5. Rank scans are not run live (≈ $0.49 per full scan); the rank differ is covered by tests. Record that.

- [ ] **Step 3: Update the documents**

- `docs/research/2026-09-30-phase-2-vendor-apis.md`: add a "Verified <date of the live run> — Phase 3b" subsection: `ads_search` with `advertiser_ids` (request shape, depth accepted, cost, items returned vs the domain query), per-page Meta captures, and the observed structured-diff output.
- `docs/superpowers/specs/2026-09-29-core-platform-design.md`: §6.2 type list gains `rank_change` (tenant-private, Phase 3b decision); §6.1 structured-sources bullet notes "grouped per capture; 10-minute settle"; §6.4 records the status lifecycle and confidence formula from this plan's decisions; §4.4 capture-status enum gains `error` (2a carry-over).
- `docs/superpowers/plans/2026-09-29-roadmap.md`: mark 3b done with a link to this plan (16 tasks); mark the closed carry-over items (Google advertiser pinning/own activity, several Meta pages, edited reviews, same price in two blocks, routing ignores event age, sweep enqueue dedupe, engine-once validation/exit code) with ✅; add a "Phase 3b carry-over" section with the deferred items listed in this plan's decision 11 plus anything the final review defers.
- `docs/HANDOVER.md`: Phase 3b paragraph (what landed, migrations `0017`–`0021`, new jobs `engine-rank-diff`/`moves-nightly`/`moves-client`, `engine-once --moves`), test counts, the next step (write the 3c plan), and new gotchas: vendor captures diff only after 10 minutes; rank changes/events are tenant-private (`client_id` set); engine queues use the `short` policy with per-subject `singletonKey`; `competitor.meta_page_id` is gone (use `meta_page_ids`).

- [ ] **Step 4: Commit**

```bash
git add docs
git commit -m "docs: Phase 3b live verification, spec/roadmap/handover updates

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Self-review (done while writing)

**Spec coverage.** §6.1 structured sources → Tasks 6–9 (ads, GBP, jobs, reviews, ranks; set differences and thresholds, no models). §6.2 tagging for structured changes → Task 10; cross-channel merge (Noul "same offer?", 14 days, several evidence items) → Task 11. §6.3 size curves (count of new ads, rating/velocity z-score, rank delta) → Tasks 1 + 12; routing thresholds unchanged; factor breakdown gains `staleCap`. §6.4 moves (7 rules, status, confidence, evidence chain, nightly, 90-day window, per competitor × client) → Tasks 13–15. §4.3 tenant tables (`move`) and §4.5 privacy (no review text in changes; redaction before every model call) → Tasks 3, 8, 10, 11. §4.4 immutability is untouched (no capture/evidence writes). Gaps, by decision: complaint-theme spike (3c themes), rank scans not live-verified (cost).

**Carry-over coverage.** Google activity from our `last_seen_at` + advertiser pinning → Task 4. Several Meta pages → Tasks 2 + 4. Edited reviews → Tasks 2 + 5. Same price in two blocks → Task 11. Routing ignores event age → Task 12. Sweep enqueue dedupe → Task 15. `engine-once` validation + exit code → Task 15. Deferred (decision 11): volatile learning on alignment, churn-guard gaps, consent tokens, ZIP accuracy, score-sweep backoff, stage-version retraction.

**Type consistency.** `ChangeDetails` (Task 3) is the only details type used by differs (6–9), tagging (10), scoring (12) and rules (13). `StructuredChange`/`SourceDiffer` (Task 6) are used by every differ. `TagOutcome` (Task 10) is returned by both tag paths and extended with real `merged` values in Task 11. `EngineWork.rankDiff` (Task 9) is consumed by drain (9) and the worker sweep (15). `MoveFinding`/`MoveEvent` (13) feed `updateMovesForClient` (14). `scoreEvent(deps, id, opts)` keeps its 2-argument call sites valid.

**Review Focus pinning.** (1) baseline → Task 6 tests "first capture of a page" and "a new page starts as a baseline"; (2) settle → Task 6 "refuses … without claiming" + sweep test; (3) tenant rank isolation → Task 3 RLS test, Task 9 diff test, Task 11 merge query scope, Task 12 scoring/novelty/sweep tests; (4) two Meta pages → Task 4 test; (5) merge vs second price cut → Task 11 tests.
