# phase-18b — Wider sources: more Google via DataForSEO

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/phase-18b   **Base:** main @ 843cfbac
**Plan/spec:** [spec 18b-1](../superpowers/specs/2026-11-10-phase-18b1-gbp-posts-design.md) · [plan 18b-1](../superpowers/plans/2026-11-10-phase-18b1-gbp-posts.md) (no roadmap row; add one at merge)

## Status (overwrite)
18b-1 spec + lean plan written 2026-11-10; awaiting owner approval. 18b-2 (organic/AI Overview/LSA) not started.

## Next (overwrite)
Owner approves the 18b-1 plan → Task 0 (pre-flight + vendor probe, stop point) → subagent-driven development.

## Interfaces this branch adds or changes
None yet. Next free migration: **0105** (last on main: `0104_ad_images.sql`).

## Assumes from other branches
None (`git branch --no-merged main` lists only `phase-18b`).

## Decisions (owner-approved)
2026-11-10: owner chose the brief's recommendations (§6 Q1–Q7 option A/rec). Spec D1–D8; D3 (rivals only, no self posts) is the controller's narrowing.

## New backlog (target → item)
None yet.

## Owner verification steps
None yet.

## Brief

### 1. Scope (derived; no roadmap row)
Source: the 18a kickoff brief (`git show 2910b3ea:docs/work/phase-18a.md`, item 1, brainstorm 2026-11-08) says
"18b more Google via DataForSEO (GBP posts/offers, Google Guaranteed/LSA, organic + AI Overview, news/awards,
Tripadvisor/Trustpilot)". Root CLAUDE.md: 18b = more Google (DataForSEO). Core spec §4.2 already lists **GBP posts**
(weekly, DataForSEO Business Data) and it was never built. §4.4 (typed observations + evidence), §6.1 (structured set
diffs, 10-min settle), §6.2/§6.3 (types, scoring), §1.5 (rules 1–2) apply. (The act-on-recommendations proposal's "18b" is a different, deferred v2.0 numbering.)

In use today: `maps/live/advanced`, `my_business_info/live`, `reviews/task_post|tasks_ready|task_get`,
`ads_advertisers` + `ads_search/live/advanced`, `jobs/task_post|task_get/advanced`. Candidates (costs: research doc
§1 where given, otherwise **unverified**: Task 0 = sandbox call + ≤ $0.05 price probe):

| # | Surface | Endpoint (verify) | Produces | Cost |
|---|---|---|---|---|
| A | **GBP leftovers in our capture** (`total_photos`, `questions_and_answers_count`, `attributes`, `book_online_url`, `place_topics`) | none (already paid) | `profile_change` (photo push, booking link, attributes) | $0 |
| B | **GBP posts / offers** (§4.2) | `business_data/google/my_business_updates` (task) | new post/offer → `promo`/`content`; prices → `price_point` | unverified, ~≤ $0.005/business |
| C | **Google Q&A** | `business_data/google/questions_and_answers` | new Q&A → `content`/`new_service` | unverified |
| D | **Organic SERP + AI Overview** | `serp/google/organic` (standard $0.0006/page, priority $0.0012, live $0.002, research §1d) | rival in/out of top 10 or AI Overview; tenant-private | ~$0.003–0.01/client/wk |
| E | **LSA / Google Guaranteed** | organic element or own endpoint (unverified) | LSA start/stop, badge | likely in D |
| F | **News / awards** | `serp/google/news` (≈ organic rate) | press/award → `content` (Jev) | ~$0.004/client/wk |
| G | **Tripadvisor / Trustpilot reviews** | `business_data/{tripadvisor,trustpilot}/…` | reviews outside Google | unverified; thin coverage |
| H | Google Trends (not in the 18a brief) | `keywords_data/google_trends` | demand, not rivals | cheap; weak fit |

Baseline/client/week: rank scan ≈ $0.49 (7×7×5 × $0.002) + about $0.01/rival (GBP $0.0054, ads $0.002, jobs $0.0012, reviews). Pilot ≤ $15/client/month (PILOT.md); staging limit $10.

### 2. Already built: reuse, don't rebuild
- DataForSEO client `packages/collectors/src/vendors/dataforseo.ts` (ledger, tag = competitor id), `dfs-time.ts`, `dataforseo-advertisers.ts`, fixtures `vendors/fixture-fetch.ts` (rehearsal, $0). Vendor limiter `createVendorLimiter`/`timedFetch` (`@cs/core/server`).
- Source scheduling: `SOURCE_KINDS` `collectors/src/sources/kinds.ts` (`gbp, reviews, ads_google, ads_meta, jobs`), `sources/due.ts` (`claimDueSources`, weekly `next_due_at`, `clientWorkAllowed`), `ensure.ts`; worker `apps/worker/src/jobs/vendor.ts`.
- GBP: `collectors/src/gbp/collect-gbp.ts` (`extractGbpProfile`), differ `engine/src/structured/gbp.ts` (categories/services, `status_change`/`profile_change`, `guardedGbpDiff`). Reviews `collectors/src/reviews/*` (HMAC pseudonyms). Ads `collectors/src/ads/google.ts`. Rankings 13b `collectors/src/rankings/*` (`estimateRankScanUsd`, `rank-schedule` Sun 06:00).
- Engine: `CHANGE_TYPES`/`CHANNELS` `packages/core/src/domain.ts`; `SourceDiffer`; prices `price_point` + `PriceNow.source` (`web | meta_ad | ad_image`); `mapPricedTexts`; packs `packages/verticals/packs/*.yaml` (pack **v6**; new types need a pack bump + migration, as in 0100/0101).
- Cost guards 7b1: `clientWorkAllowed`, `spendByClient`/`splitByCompetitor`, credits, `AiGuard`. Evidence store `@cs/storage` + `evidence` rows (vendor JSON).

### 3. Binding decisions (do not re-open)
No new paid vendors in Phase 18 (DataForSEO only). Client text names the category, never the vendor. Out of scope: public
records, newsletters, FB Events/Nextdoor, video, bought citations, Yelp, and (feasibility study) health review platforms. Citations = 18c,
events = 18d, social = 18e. Nothing usage-billed; paid schedulers use `clientWorkAllowed`; vendor calls go through the limiter;
100 % notice / 130 % pause. Rank-type data is **tenant-private** (§6.2). `redactForModel`; reviewers hashed (§4.5).
New tool ⇒ `ISOLATION_FIXTURES`; new table ⇒ `TABLE_CLASS` + world rows; event readers filter `retracted_at IS NULL`;
schedulers `client.status = 'active'`. Weekly scans Sun 06:00 count against the client cap. 18a-1 anti-goals carry over: no false
alert from one vendor glitch (two-capture confirm), no trace from < 4 real readings. Brief grading Major/Notable/Minor.

### 4. Backlog to fold in
None tagged 18b. Not 18b (one-liners): 18a-3 ad-price cell; 18e `ad.event`; Web ×4 (sitemap refusals, `site_feature` double add, registry hosts, home-only `new_page`); Later ×8 (website-tools section, audience cooldown, Meta ad images, `mapPricedTexts` scope, `read_at`, atomic read cap, cross-host robots, `adImages:false` test). Also watch: confirm GBP closure values (Waiting on real data).

### 5. In-flight workstreams
Confirmed: no other unmerged branches. Migration 0105 is next (0104 is the last file in `packages/db/migrations`).

### 6. Open questions for the owner
1. **Split and v1 surfaces?** (A) 18b-1 = A (free GBP leftovers) + B (GBP posts/offers, §4.2) + Task 0 price probe; 18b-2 = D + E (organic/AI Overview/LSA, tenant-private); F/C/G later. (B) one phase with A–F. (C) only A + B; drop the rest. **Rec: A**: B is promised in §4.2, A costs nothing, and D/E need a new tenant-private shape.
2. **GBP post cadence and cost?** (A) weekly with the GBP pull for every tracked rival plus self (≈ 6 tasks/client/week, roughly < $0.03); (B) every 2 weeks; (C) weekly for Top-rival tier, monthly for others. **Rec: A** if the probe confirms ≤ $0.005/task, else C.
3. **Where do GBP-post prices and offers go?** (A) `price_point` with `source gbp_post`, tagged "From a Google post" (same as ad copy); (B) promo events only, no prices; (C) both, offers as `promo` and prices in the tracker. **Rec: C**: rules-only extraction, reusing `mapPricedTexts`.
4. **Organic / AI Overview keywords (if in v1)?** (A) reuse `client.rank_keywords` (≤ 5) at the client centre, one standard-queue page each, run with the Sunday rank scan (≈ $0.003/client/week); (B) a separate keyword list; (C) the vertical's top services. **Rec: A**: tenant-private, counts against the client cap, and needs no new settings UI.
5. **LSA / Google Guaranteed: event or badge?** (A) whole-business event "started/stopped Local Services ads" (alert-capable on start); (B) a badge on the competitor page plus a brief line only; (C) defer until the probe shows a reliable source. **Rec: C, then B**: an unverified source must not cause a false alert.
6. **GBP leftovers: which become brief lines?** (A) booking link added/removed + attributes (e.g. "online estimates", "veteran-owned") + photo push (≥ 20 new photos in 4 weeks); (B) A + Q&A count; (C) attributes only. **Rec: A**, all `profile_change`, brief-only, using the two-capture guard.
7. **Tripadvisor/Trustpilot and News?** (A) out of 18b (HVAC/dental coverage is thin, and news is noisy); (B) News only, Jev-gated; (C) both. **Rec: A**: add a backlog line, revisit with 18d (events vertical, where Tripadvisor fits).
