# Phase 13b — Local rankings upgrade (design)

**Date:** 2026-10-17 · **Status:** owner-approved design, spec awaiting review · **Brief:** `docs/work/phase-13.md`
**Builds on:** core spec §4.2 (rank scans), §5.2 item 7 (Local rankings), §6.1/§6.3 (rank delta, tenant-private), §6.4 (moves), §11 (caps); Phase 12 tiers (12a D2, D9). This spec records **new decisions and interfaces only**.

## Goal
Make the Local rankings view match competitors' table stakes (map background, weekly history, trends, on-demand scan) and go beyond them by turning rank movement into moves and tier changes.

## Decisions (owner-approved 2026-10-17 — do not re-open)
1. **Order:** 13b is specified and built first; 13a (white-label parity) is specified separately and built after phase-10/11 merge.
2. **Cadence:** every active, non-paused client with keywords and a service area gets a **full weekly scan** (its configured grid × up to 5 keywords; 7×7 × 5 ≈ $0.49). Replaces the monthly scan. One scan shape per client — no separate cheap weekly series.
3. **Schedule:** `rank-schedule` cron `0 6 * * 0` (Sunday 06:00 UTC), so rank diff, `moves-nightly` (Mon 04:30) and Monday briefs see fresh data.
4. **Who pays:** included in the seat price; every scan counts toward `client.monthly_cap_usd`. A scan whose estimate would exceed the cap is skipped and the agency gets an in-app notice.
5. **"Scan now":** agency roles only; ≤ 1 manual scan per client per rolling 7 days (scheduled scans don't count), ≤ 10 per agency per UTC day, refused on cap.
6. **Agency settings per client:** ≤ 5 rank keywords (subset of `client.keywords`), grid 5×5 or 7×7, radius 2–40 km.
7. **Map background:** one **Stadia Maps cacheable static** image (amended 2026-10-17 by the owner at plan Task 0: MapTiler's terms forbid server-side caching) per client area, cached in the evidence store, served from our host; required attribution shown. No live tiles, no map library. (Verify price + commercial terms at plan time.)
8. **Trend UI:** two tabs on Local rankings — **Trend** (default: average-rank line + scan slider driving the grid) and **Compare** (two scans + per-point change grid). No small multiples.
9. **Rank → intelligence:** both a new **Map climb** move and **`tier_change`** events.

## Data model (migration: next free number at execution time)
```sql
ALTER TABLE client
  ADD COLUMN rank_keywords jsonb NOT NULL DEFAULT '[]'::jsonb,   -- ≤ 5; empty = first 5 of client.keywords
  ADD COLUMN rank_grid_size smallint NOT NULL DEFAULT 7,
  ADD CONSTRAINT client_rank_grid_size_check CHECK (rank_grid_size IN (5, 7)),
  ADD CONSTRAINT client_rank_keywords_check CHECK (jsonb_typeof(rank_keywords) = 'array' AND jsonb_array_length(rank_keywords) <= 5);

ALTER TABLE rank_scan
  ADD COLUMN trigger text NOT NULL DEFAULT 'scheduled',          -- 'scheduled' | 'manual'
  ADD COLUMN requested_by uuid,                                   -- auth user id for manual scans
  ADD COLUMN grid_size smallint,                                  -- settings snapshot (series identity)
  ADD COLUMN radius_km double precision,
  ADD COLUMN keywords jsonb,
  ADD COLUMN estimated_usd double precision,
  ADD CONSTRAINT rank_scan_trigger_check CHECK (trigger IN ('scheduled', 'manual')),
  ADD CONSTRAINT rank_scan_status_check CHECK (status IN ('running', 'done', 'failed', 'skipped'));  -- folds in backlog 3b item (existing values: running|done|failed)

CREATE TABLE rank_map_image (
  client_id uuid PRIMARY KEY REFERENCES client(id) ON DELETE CASCADE,
  agency_id uuid NOT NULL,
  settings_hash text NOT NULL,          -- sha256 of {center, radiusKm, gridSize}
  object_key text NOT NULL,             -- evidence store key
  bounds jsonb NOT NULL,                -- {west, south, east, north}
  width int NOT NULL, height int NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
-- RLS on rank_map_image: same tenant policy as rank_scan (agency + client scope).
```
- Radius limit: `ServiceAreaInput.radiusKm` becomes `min(2).max(40)` for **new writes**; existing rows outside the range are clamped at scan time, not migrated.
- `skipped` scans (cap) store no snapshots and are ignored by rank diff and trends.

## Interfaces

**Collectors / worker**
- `estimateRankScanUsd(client): { calls: number; usd: number }` — calls = keywords × gridSize²; unit price read from the DataForSEO rate the `vendor_call` ledger already uses (no hard-coded price).
- `checkRankScanBudget(db, clientId, estimateUsd): { ok: true } | { ok: false; reason: 'cap'; spentUsd: number; capUsd: number }` — month-to-date client spend (`spendByClient` + `monthStart`, `packages/tools/src/usage.ts`, reused not duplicated) + estimate ≤ `monthly_cap_usd`.
- `scanRankings(deps, clientId, opts: { trigger: 'scheduled' | 'manual'; requestedBy?: string })` — reads `rank_keywords` (fallback first 5 of `keywords`) and `rank_grid_size`; writes the settings snapshot; on budget failure inserts a `skipped` scan and an agency notice (new kind `rank_scan_skipped` appended to `AGENCY_KINDS`, `db/src/schema/delivery.ts`) and returns without vendor calls.
- `rank-schedule`: cron `0 6 * * 0`; `listRankClients` unchanged filters + `client.paused_at IS NULL`.
- New job `rank-map-refresh { clientId }` (single-shot): if no `rank_map_image` row or `settings_hash` differs, fetch the static image for the grid bbox + half-cell padding, store, upsert row. Enqueued by `update_client_rank_settings`, `update_client_profile` (service-area change) and once by the weekly schedule for clients without an image. No-op when `STADIA_API_KEY` is unset.

**Tools (`@cs/tools`)**
- `update_client_rank_settings` (write, agency roles, audited): input `{ clientId, keywords: string[] (≤5, each ∈ client.keywords), gridSize: 5|7, radiusKm: number (2–40) }`; updates `client.rank_keywords`, `rank_grid_size`, `service_area.radiusKm`; enqueues `rank-map-refresh`.
- `request_rank_scan` (write, agency roles, audited): input `{ clientId }`; output `{ queued: true; scanEtaMinutes: number } | { queued: false; reason: 'weekly_limit' | 'agency_daily_limit' | 'cap' | 'not_ready'; nextAvailableAt?: string }`. Limits counted from `rank_scan` rows with `trigger = 'manual'` (status ≠ `skipped`).
- `get_rank_trend` (read, client + agency roles): input `{ clientId, keyword, limit?: number (default 12, max 26), before?: string (scan id cursor) }`; output `{ scans: { scanId, finishedAt, settingsKey, settingsChanged: boolean, self: { avgRank, top3Share, points } | null, competitors: { competitorId, name, tier, avgRank, top3Share }[] }[]; nextCursor: string | null }`. Uses `rankMetrics`; `done` scans only. Exposed to MCP/Ask like other registered tools.
- `get_geogrid`: scans list always includes the selected scan (backlog fix); output gains `map: { url, bounds, width, height, attribution } | null`.
- Copy for refusals (decided): weekly limit → "Next manual scan available {date}."; agency daily → "Your agency has used today's 10 manual scans."; cap → "This scan would exceed {client}'s monthly cost cap (${cap}). Raise the cap in Usage or wait until next month."

**Web**
- Route `GET /files/rank-map/[clientId]` — streams the stored image; access via the same scope check as `get_geogrid`; refusal → 404; `Cache-Control: private, max-age=86400`.
- Local rankings page: tabs **Trend | Compare**; agency-only **Rank settings** sheet and **Scan now** button (states: available / "Next scan available {date}" / cap reached / scan running).
- `GeoGrid`: optional `map` prop renders the image under the cells; cells positioned by Web Mercator projection of each point into the image bounds; attribution line under the grid. Fixes: per-instance hatch ids (`useId`), legend `<defs>` once, ragged-row guard, pinned "You" follows name sort.
- Change-grid colour scale: diverging blue (up) / orange (down) with neutral "same"; validate with the dataviz skill before shipping.

**Engine**
- `rank_diff`: add threshold `TOP3_POINTS_GAIN_MIN = 5` (a competitor's top-3 grid-point count rose by ≥ 5 on a keyword) alongside `RANK_DELTA_MIN` and `TOP3_SHARE_DELTA_MIN`; `details` gains `top3PointsBefore`, `top3PointsAfter`. Series identity: scans with different `settingsKey` (grid size, radius, keywords) are never diffed — the newer one is a baseline.
- Move rule **`map_climb`** (8th rule, `moves/rules.ts`): fires for a tracked competitor when its `rank_change` events on one keyword show a cumulative top-3 point gain ≥ 5 across ≤ 2 consecutive done scans within `MOVE_WINDOW_DAYS`. Each `map_climb` signal also counts as a territory signal for the existing territory-expansion rule. Same lifecycle as other moves.
- **`tier_change`** event: written by `signals-weekly` when a tracked competitor's new `competitor_signal.tier` differs from its previous week's tier; `detected_change.rank_scan_id` = the client's latest `done` scan (no scan → no event); `details { changeType: 'tier_change', from, to }`. Scoring: promotion to `top` → alert-eligible; other promotions → brief; demotions → archive (mentioned only in quiet-week "Where you stand"). Tenant-private like `rank_change`; readers filter `retracted_at IS NULL`.

## Env
- `STADIA_API_KEY` (worker) — owner adds to `.env` (ask first); add to `turbo.json` `globalPassThroughEnv`. Unset ⇒ grids render without a map.

## Edge cases
- Settings changed mid-history → trend shows a marker; Compare refuses mismatched scans with "Settings changed between these scans."
- A client paused or inactive → no weekly scan, Scan now hidden.
- Manual scan while a scheduled scan runs → refused as `not_ready` (one running scan per client).
- Cap skip notices are de-duplicated per client per week.
- Demo data: 12 weekly scans per demo client with plausible movement and one Map climb.

## Testing
Unit: estimate + budget check; weekly schedule filters; `request_rank_scan` limits and refusals; settings-change baseline; map bbox/projection; `get_rank_trend` shape + tenant isolation; `map_climb` edges (exactly 5, gap between scans, untracked competitor); `tier_change` (no previous week, no scan, demotion); GeoGrid fixes. E2E: Trend/Compare tabs and slider; Scan now states; Rank settings visible to agency roles, absent for client roles.

## Out of scope
Live/pannable maps; bigger grids or more keywords as paid add-ons; dark chart theme; ad images; 13a items.
