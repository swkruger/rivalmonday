# Phase 18a-1 — Brief what GBP and Meta already give us (design)

**Date:** 2026-11-08 · **Branch:** `phase-18a` (18a-1; the web half is 18a-2, own branch later) · **Brief:** `docs/work/phase-18a.md`
**Core spec:** §1.5, §4.3, §4.4, §4.5, §6.1–6.3, §6.6, §9.1 (cited, not restated).

## Intent

Phase 18 "Wider sources" widens what reaches a client's brief. 18a-1 is the free part: facts we **already collect**
from Google Business Profile and the Meta Ad Library but never brief. No new vendor, no new vendor call, no crawling —
it can go live with the next deploy, independent of the web-monitoring switch.

**Goals.** (1) A rival closing or reopening reaches the client (closure as an alert). (2) Rival profile edits (name,
website, hours, description) reach the weekly brief. (3) A sharp rise in a rival's Facebook Page likes reaches the
brief, and a likes trend appears once real history exists. (4) Prices in Meta ad copy join the price tracker.
(5) An ad promoting an event names the event.

**Non-goals.** Website crawling, sitemap diffs, site-tool detection, JSON-LD, own-site prices (all 18a-2). Event
lifecycle (announced/cancelled/sold out — 18d). Google ad prices (no copy; needs image analysis — out of Phase 18).
Follower counts outside Meta ads (18e). Retro-typing old `content` events.

**Anti-goals.** A false closure alert (one vendor glitch telling a client "your rival closed"). A likes line from a
vendor blip. Any new vendor spend. A stat card trace drawn from fewer than four real readings.

## Decisions (owner-approved 2026-11-08)

- **O1** 18a splits: 18a-1 GBP + Meta (this spec), 18a-2 web readiness (after or alongside the prod deploy).
- **O2** Two new change types: `status_change` (closed / reopened; alert-capable) and `profile_change` (title,
  domain, hours, description; brief-only, never an alert on its own).
- **O3** Page likes: a brief line on a sharp rise; a trend chart only with ≥ 4 weekly readings.
- **O4** Meta ad-copy prices go into the existing `price_point` tracker, marked as from an ad.
- **O5** Event ads: event name and date stored on the ad and named in the new-ad line; no own change type until 18d.

## Design decisions (my calls — builder may refine numbers, not the shape)

### D1 Change types and scoring

`CHANGE_TYPES` gains `status_change`, `profile_change`, `audience_growth` (O3's brief line needs an event; the name
is reused by 18e social). All three are **whole-business** (`WHOLE_BUSINESS_TYPES`). Channel: GBP types =
`google_business_profile`; `audience_growth` = `meta_ads`.

| Type | `type_weights` (all three shipped packs) | Size factor | Typical score → route |
|---|---|---|---|
| `status_change` closed (`temporarily_closed`, `closed_forever`) | 1.0 | `details.direction = 'closed'` → 1 | 100 → **alert** |
| `status_change` reopened | 1.0 | `'reopened'` → `size.default` (0.6) | 60 → brief |
| `profile_change` | 0.8 | `size.default` | 48 → brief |
| `audience_growth` | 0.7 | new `size.audience_pct_for_full: 20` over `details.pct` | +15 % ≈ 52 → brief |

- A closed `status_change` scores novelty 1 (skip the embedding-similarity factor, like `tier_change` is deterministic):
  an earlier similar GBP event must not push a real closure below the alert bar. Reopened keeps normal novelty.
- `profile_change` must never route `alert`: `scoreForClient` caps its route at `brief` (like `needsReviewCap`), so a
  client threshold edit can't make it alert. Record `profileCap` in factors.
- `scoring.version` → 5. Pack YAMLs + a data migration for `generic`/`hvac_plumbing`/`dental` (pattern: 0099,
  idempotent, `backfill:start` marker). `typeWeights` is a strict object over `CHANGE_TYPES`, so the schema and every
  stored config must carry the new keys; DB-created verticals inherit via `assemblePack`'s deep merge — verify.
- Labels: `CHANGE_LABELS` (`status_change: 'opening status change'`, `profile_change: 'profile change'`,
  `audience_growth: 'audience growth'`); `brief-report`'s `topicOf`/`GROUP_PHRASE` (see Dependencies); help glossary
  and guides where change types are listed; `lib/labels.ts` where statuses render. Copy goes through sign-off.
- The existing `content` mapping for GBP title/domain/hours/status is **replaced**, not duplicated. Old `content`
  events stay as they are (cs_dev only; no backfill).

### D2 GBP differ (`engine/src/structured/gbp.ts`)

- `GbpProfile` gains `description` (already written by `extractGbpProfile`; verify the observation carries it).
- `currentStatus`: `TRANSIENT_STATUS` flips stay ignored. Closed set = `temporarily_closed | closed_forever`
  (case-insensitive). Transient → closed = `status_change` `{ direction: 'closed', statusBefore, statusAfter }`;
  closed → transient = `{ direction: 'reopened' }`; `temporarily_closed ↔ closed_forever` = `direction: 'closed'`.
- **Two-pull confirmation** for `status`, `hours`, `description`, using the same idea as `guardedGbpDiff`'s held
  fields (emit once the new value is seen on two consecutive profile captures; before-capture = last confirmed value;
  a value that flaps back is never emitted) — but the hold must compare **derived values**, not raw fields:
  status → a status class (`open` for every `TRANSIENT_STATUS` value, else the closed value itself), hours →
  `hoursText`, description → normalised text. `heldValue` is generalised to take a value function. Missing = no compare.
- **Verify the closed value first (Task 0, my call).** No repo capture or fixture carries a closed status; the only
  source is the vendor research doc, and live pulls put status under `work_time.work_hours.current_status`. Task 0
  makes one `my_business_info` call (cents; owner approves the spend at execution) for a known permanently closed
  listing and records where the value lands (or whether `work_time` is absent / no result). If GBP can't carry it, the
  fallback is the rank scans' existing `closed` flag (`collectors/src/local/maps.ts`, `closed_forever`) as a second
  source of the same `status_change` — the plan then covers that path instead.
- `title`, `domain`, `hours`, `description` emit `profile_change` with `details.field`; before/after text keeps the
  `field: value` form; description text is truncated to 300 chars in before/after (full value stays in the observation).
- Category/service/address behaviour unchanged (`new_service`/`service_removed`/`new_location`).
- `EVIDENCE_WORDING`/brief prompt: status evidence reads e.g. `status: closed_forever` — the writer must say
  "listed as permanently closed on Google" (never "went out of business"). Add a human status phrase map
  (`closed_forever` → "permanently closed", `temporarily_closed` → "temporarily closed") used in the evidence head.

### D3 Meta Page likes

- **Store:** each `meta_ads` capture whose raw items carry `snapshot.page_like_count` writes one `observation`
  `{ kind: 'meta_page', key: <pageId>, data: { pageId, pageName, likes } }` (likes from the first item with a number
  for that page id). No new table. ScrapeCreators captures: same if its payload carries a like count (verify), else none.
- **Weekly reading** = the newest `meta_page` observation per page per ISO week (UTC).
- **Brief line — new `SourceDiffer` step for `meta_ads`:** compare this capture's likes with the reading 21–35 days
  older (the closest to 28 d). Emit `audience_growth` when `pct ≥ 15` **and** `likesAfter − likesBefore ≥ 50`, and no
  `audience_growth` change for that page in the last 28 days. `details: { pageId, likesBefore, likesAfter, pct, days }`,
  `beforeCaptureId` = the older capture. Drops are never emitted (glitch-prone, not news).
- **Trend:** new read tool `get_audience_trend({ competitorId })` → `{ pages: [{ pageId, pageName, points: [{ week, likes }] }] }`
  (client-scoped like other competitor reads; `ISOLATION_FIXTURES` entry; out-of-scope → `not_found`). **Channels:
  `web` only in 18a-1** (my call: Ask/MCP would need citable evidence ids and an eval re-record; revisit in 18e). The
  competitor page (`apps/web/src/app/(app)/c/[clientId]/competitors/[competitorId]/page.tsx`) shows one "Facebook Page
  likes" stat with a trace for the competitor's **largest** page (by latest likes, page name shown) **only when that
  page has ≥ 4 weekly points**; otherwise nothing (no empty state, no "collecting" card). Likes are never summed across
  pages. Follow the existing stat/trace pattern on that page; DS v1 rules apply.
- **Backfill (my call):** a one-off CLI writes `meta_page` observations from stored raw `meta_ads` captures (R2 reads,
  no vendor spend), so the trend reflects real past readings at their real dates. It never creates `audience_growth`
  events (the differ runs on new captures only).
- **Known limit:** a page with no live ads that week has no reading, so the line and trend work for steady
  advertisers only. Accepted (matches the anti-goals); 18e social fills it.

### D4 Event ads

- `ad` gains `event jsonb` nullable: `{ name: string, startsAt: string | null }` from `snapshot.event` in
  `normalizeMetaAd` (exact raw shape unverified — Task 0 reads real Apify captures in `cs_dev` and fixes the mapping;
  if the field is absent or never populated, store null and keep the code path).
- `diffAds` items gain `event?: { name, startsAt }`; the evidence text for an ad item with an event appends
  `— promotes event "<name>" (<date>)`. No new change type; brief/alert writers need no prompt change beyond that text.
- Event name is third-party text: `redactForModel` applies as for ad copy.

### D5 Meta ad-copy prices → `price_point`

- **Schema (migration):** `price_point.tracked_page_id` nullable; new `ad_id uuid` → `ad.id` `ON DELETE CASCADE`;
  `CHECK ((tracked_page_id IS NULL) <> (ad_id IS NULL))`; partial unique index
  `price_point_ad_open_unique (ad_id, vertical_id, service_id, unit, qualifier, amount) WHERE ended_at IS NULL AND ad_id IS NOT NULL`;
  the existing open-unique index becomes `… WHERE ended_at IS NULL AND tracked_page_id IS NOT NULL`.
- **New stage `ad_price_extract`** (`engine/src/prices/`, `runStage`, subject = the Meta capture): for Meta ads listed
  in this capture that have non-null `text` and **no open span** (covers new ads and ads that came back after ending), run `pricesInBlock(text)` (rules only; a discount never
  becomes a price — 3c), map the block to a service with the **same** question and `price_block_map` cache as web
  prices (`buildPriceQuestions`, keyed by text sha), and insert spans (`first/last_seen` = capture time,
  `first/last_capture_id` = this capture, `promo` as the observer says). For ads whose `ended_capture_id` is this
  capture, end their open spans. Ads still active: `last_seen_at`/`last_capture_id` advance on later captures that still
  list them. Google ads are skipped. Same `PRICE_MAX_BLOCKS`-style cap per capture.
- **Scheduling:** the web price stage is found by a sweep over web captures (`engine/src/sweep.ts`) and
  `extractPrices` refuses non-web captures, so `ad_price_extract` gets its own sweep entry, worker job
  (`apps/worker/src/jobs/engine.ts`) and drain entry (`engine/src/drain.ts`). The sweep only takes `meta_ads` captures
  newer than the deploy cutoff (no backfill: no past-dated spans, no surprise model spend). Only for competitors some
  client tracks (`competitorVerticals`).
- **Readers:** `prices/tracker.ts` left-joins `tracked_page` and `ad`; each point carries `source: 'web' | 'meta_ad'`
  and an evidence link (page URL, else the ad's Meta Ad Library page URL `metaPageUrl`). Pricing page shows a small
  "From an ad" tag on ad-sourced rows. `tools/catalog/merge.ts` vertical/area merges must handle `ad_id` rows (dedupe
  by `ad_id` like by `tracked_page_id`). `isolation-world.ts` + `table-classes.ts` unchanged class (`global_public`);
  add one ad-sourced world row.
- **O6 (owner, 2026-11-08): ad prices are shown, not counted.** They appear in the price matrix with the "From an ad"
  tag, but are excluded from a rival's lowest price, the "change against 90 days ago" (`lowestUsdAt`,
  `tools/src/tools/pricing.ts`) and `priceHistory` (`engine/src/prices/tracker.ts`) — an ad price is usually a special.
  Filter by `tracked_page_id IS NOT NULL` there; tests cover each reader.
- Ad prices do **not** create `price_change` events (price-war detection stays web price cuts + promos backed by ads).

### D6 Re-score and rollout

- After deploy: `pnpm --filter @cs/worker rescore --dry-run` then for real (never alerts). New types apply to new pulls only.
- No new env var, no new job schedule (all work rides the existing weekly GBP/Meta pulls and engine stages).
- Cost: zero vendor spend; model spend only for the service-mapping question on new priced ad texts (cached by sha).

## Dependencies on in-flight work

- **`brief-report`** (planned, unmerged): its tests require `topicOf` and `GROUP_PHRASE` to cover every
  `CHANGE_LABELS` key, and it edits `briefs/{generate,summary,review,deliver}.ts` and `email/src/labels.ts`. If it
  merges first, 18a-1 adds the three types there (`status_change`/`profile_change` → its GBP/profile topic,
  `audience_growth` → its ads/marketing topic). If 18a-1 merges first, `brief-report`'s pre-flight adds them.
- **Migration number:** next free at execution (main ends 0099; `brief-report` likely takes 0100).

## Left to the builder

Exact thresholds within the stated shape (15 % / +50 / 21–35 d / 20 % full-size), copy wording (through sign-off),
where `ad_price_extract` is enqueued, the stat's visual detail, test names, and whether the description truncation is
300 or similar.
