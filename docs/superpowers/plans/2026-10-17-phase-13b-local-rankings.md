# Phase 13b — Local rankings upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development

Steps use checkbox (`- [ ]`) syntax for tracking. **Lean plan format** (root `CLAUDE.md`): interfaces are binding; full code only for SQL/RLS, the access check, the projection/bbox math and decided copy.

**Goal:** Local rankings gets a map background, weekly history, a Trend and a Compare tab, per-client rank settings and a capped "Scan now"; rank movement becomes a **Map climb** move and **`tier_change`** events.

**Architecture:** Settings live on `client` and are snapshotted on every `rank_scan` (series identity). Cost estimate + month-to-date budget check run before any vendor call (`@cs/collectors`, spend helpers moved to `@cs/db`). A weekly `rank-schedule` fans out `rank-scan` jobs; a `rank-map-refresh` job stores one MapTiler static image per client in the evidence store, served by `/files/rank-map/[clientId]`. `@cs/tools` gains `get_rank_settings`, `update_client_rank_settings`, `request_rank_scan`, `get_rank_trend`; the engine gains a settings-aware rank diff, the `map_climb` rule and `tier_change` from `signals-weekly`.

**Tech stack:** TypeScript, Drizzle + Postgres (RLS), pg-boss, `@cs/tools`, Next.js App Router, Tailwind/shadcn, hand-written inline SVG, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-17-phase-13b-local-rankings-design.md` (binding). Brief: `docs/work/phase-13.md`.

## Global constraints
- Read `docs/gotchas-cross-cutting.md` and the `CLAUDE.md` of every package touched (db, collectors, engine, tools, core, verticals, email, worker, web, demo) before coding.
- Schedulers/lists filter `clientServiceable` + `agencyServiceable` (`@cs/db` `filters.ts`). Event readers filter `retracted_at IS NULL`. Rank and tier events are tenant-private (agency + client set), never cross-channel merged.
- Web reads are registered tools; web writes go through `runTool`; every refusal on a page or file route → 404. New write controls need `WriteGuard`/`useReadOnly()`.
- New tools: `access` mark + `access-marks.test.ts` snapshot + `docs/superpowers/specs/2026-10-12-phase-8b-tool-access.md`; MCP/Ask tools in `tools/channels.test.ts`.
- `rank_scan`, `rank_map_image` are written by the service role only; tenant reads only via `withTenant`.
- Charts: inline SVG, no library; colour scales validated with the dataviz skill. Brand tokens only.
- Migrations: **next free number at execution time** (main ends 0066; phase-11 holds 0067–0071). Never edit applied migrations. Every new table ENABLE + FORCE RLS.
- No real competitor website fetched; vendor calls ledgered with `{ agencyId, clientId }`.
- Copy (decided, verbatim from spec): weekly limit "Next manual scan available {date}."; agency daily "Your agency has used today's 10 manual scans."; cap "This scan would exceed {client}'s monthly cost cap (${cap}). Raise the cap in Usage or wait until next month."; Compare mismatch "Settings changed between these scans."; button state "Next scan available {date}".
- Proposed copy (becomes decided on plan approval): see each task's **Copy** line.
- Commits end with the Co-Authored-By line from root `CLAUDE.md`; LF only; never stage `apps/web/next-env.d.ts`.

## Decisions
**Spec D1–D9** (order, weekly full scans, Sunday 06:00 UTC, cap-counted, Scan now limits, ≤5 keywords/5×5|7×7/2–40 km, MapTiler static, Trend+Compare, Map climb + tier_change) — by reference, never re-open.

**Plan-local:**
- **P1 Spend helpers move to `@cs/db`.** `monthStart` and `spendByClient` move verbatim to `packages/db/src/spend.ts` (exported from the db index); `packages/tools/src/usage.ts` re-exports them so existing importers are unchanged. Reason: collectors can't import `@cs/tools` (tools → collectors).
- **P2 Unit price.** The ledger stores the vendor-reported cost per call; the only DataForSEO Maps rate in code is `DISCOVERY_CALL_COST_USD.maps` (`collectors/src/rivals/cost.ts`). `estimateRankScanUsd` reuses that constant (no new number).
- **P3 Effective keywords.** `rankKeywordsFor(c) = c.rankKeywords ∩ c.keywords` (order of `rankKeywords`), falling back to the first 5 of `c.keywords` when the intersection is empty. Radius is `clamp(serviceArea.radiusKm, 2, 40)` at scan time.
- **P4 Manual scan row at request time.** `request_rank_scan` inserts the `rank_scan` row (`status 'running'`, `trigger 'manual'`) inside the limit-check transaction (agency row `FOR UPDATE`, like `startCompetitorSearch`), then enqueues `rank-scan { clientId, scanId }`; enqueue failure deletes the row. The worker adopts the row. A partial unique index allows one `running` scan per client; a `running` row older than `RANK_SCAN_STALE_HOURS = 3` is failed by the next `rank-schedule` tick and by `request_rank_scan` before it checks.
- **P5 Prospect snapshot keeps its shape.** `scanRankings` keeps an optional `prospect: { gridSize; maxKeywords }` override (used only by `prospect/snapshot.ts`); prospect scans are `trigger 'scheduled'`, skip the budget check and never send the skip notice.
- **P6 Skip notice wiring.** Collectors can't import the engine's `notify`; `scanRankings` takes an optional `deps.onSkipped(info)` the worker wires to a new engine `notifyRankScanSkipped`. Link target `notifications` (inbox); `subjectType 'rank_scan'`, `subjectId` = the skipped scan id; dedupe `rank_scan_skipped:{clientId}:{ISO Monday of the UTC week}`.
- **P7 Settings key.** `rankSettingsKey({ gridSize, radiusKm, keywords })` = `${gridSize}|${radiusKm.toFixed(2)}|${[...keywords].sort().join('\u001f')}` hashed to the first 16 hex chars of sha256; any null field → `'legacy'`. The migration backfills existing `done` scans (keywords from their snapshots, grid size from the point count, radius = client's clamped radius), so the first weekly scan diffs against the last monthly one where settings match.
- **P8 `RANK_DIFF_VERSION` stays 1.** Bumping it re-diffs every historical scan (sweep). New thresholds apply to new scans only. `rank_change` details also gain `scanId` (for `map_climb` consecutiveness).
- **P9 Rank-scope supersede excludes tier rows.** `supersedePriorChanges`' rank scope adds `block_key LIKE 'rank:%'`; tier rows use `block_key = 'tier:{YYYY-MM-DD}'` (signals run date) and `stage_version 1`.
- **P10 Tier scoring is deterministic.** `scoreForClient` for `tier_change`: promotion to `top` → score = routing `alert`; other promotion → routing `brief`; demotion → 0. Caps (needs-review, stale) still apply. Packs gain `type_weights.tier_change: 0.6` (required by the strict schema; unused by the override) and bump `scoring.version`. Demotions add no new scorecard copy: the scorecard's tier column already shows the new tier.
- **P11 New read tool `get_rank_settings`** (agency roles, web only): settings + Scan-now state for the sheet and button (the spec defines no read for these).
- **P12 Map composition.** `rank_map_image` gets a composite FK `(client_id, agency_id) → client(id, agency_id)` like `rank_scan`. `get_geogrid.map` is non-null only when every point of the selected scan lies inside the stored bounds; `GeoGridView` also gains `lats` (north → south) and `lngs` (west → east). Image URL `/files/rank-map/{clientId}?v={settingsHash first 12}`.
- **P13 Projection math lives in `@cs/core`** (`packages/core/src/geo.ts`) — both the worker (bbox) and web (cells) need it; web has no `@cs/collectors` dependency.
- **P14 Radius write limit.** A new `ServiceAreaWrite` (radius 2–40) is used by `create_client`/`update_client_profile` inputs and `update_client_rank_settings`; `ClientProfile` output keeps `ServiceAreaInput` so legacy rows still read. `clientInputProblems`' 1–80 check stays (legacy merge tolerance).
- **P15 `foldSeries` pin fix.** Pinned series are name-sorted together with the kept ones (backlog). `sovSeries`' explicit "You first" (5c-2 decision 10) is untouched — see report conflict C4.

## File structure
- `packages/db/migrations/<N>_rank_upgrade.sql` (generated + hand-edited), `<N+1>_rank_upgrade_rls.sql` (custom); `src/schema/client-intel.ts` (`rankScan` cols, new `rankMapImage`), `src/schema/tenancy.ts` (`client.rankKeywords`, `rankGridSize`), `src/schema/delivery.ts` (`AGENCY_KINDS`), `src/schema/engine.ts` (`ChangeDetails`), new `src/spend.ts`; tests `rank-upgrade.test.ts`, `evidence.test.ts`.
- `packages/core/src/domain.ts` (`CHANGE_TYPES`, `MOVE_TYPES`, `TIER_LABELS`), new `src/geo.ts` (+ test).
- `packages/collectors/src/rankings/{scan.ts, settings.ts (new), budget.ts (new), maptiler.ts (new), map-refresh.ts (new)}` + tests; `src/index.ts`.
- `packages/engine/src/structured/rank.ts`, `moves/{rules.ts, moves-stage.ts}`, `tag/structured.ts`, `score/{score.ts, score-stage.ts}`, `events/retract.ts`, new `delivery/rank-notices.ts`; `src/index.ts`.
- `packages/collectors/src/signals/tracked.ts` (tier_change write).
- `packages/verticals/packs/{hvac_plumbing,dental}.yaml`; `packages/email/src/{types.ts, labels.ts}`.
- `packages/tools/src/{usage.ts, limits.ts, deps.ts, rank-scan.ts (new), pressure.ts}`, `src/tools/{rankings.ts, schemas.ts, onboarding.ts, all.ts, access-marks.test.ts, channels.test.ts}`.
- `apps/worker/src/{deps.ts, main.ts}`, `jobs/vendor.ts`, `jobs/rivals.ts` (unchanged API), new `jobs/rank-map.ts`.
- `apps/web/src/app/files/rank-map/[clientId]/route.ts` (new), `src/server/files.ts`, `src/server/inbox.ts`; `src/components/charts/{geo-grid.tsx, line-chart.tsx, change-grid.tsx (new), rank-trend.tsx (new)}`; `src/app/(app)/c/[clientId]/rankings/{page.tsx, tabs.tsx, scan-slider.tsx, rank-settings-sheet.tsx, scan-now-button.tsx, actions.ts}` (new files except `page.tsx`); `e2e/rankings.spec.ts` (new), `e2e/seed.ts`, `scripts/e2e-affected-rules.ts`.
- `packages/demo/src/{rankings.ts, changes.ts, coverage.ts}` + tests.
- `turbo.json` (`MAPTILER_API_KEY`), `docs/work/phase-13.md`.

## Dependencies on in-flight work
- **phase-10:** merged into `main` (migrations 0065–0066). Re-check nothing else of it is pending: `git branch -a` shows no `phase-10`.
- **phase-11 (unmerged, 11b executing):** overlaps to re-check at Task 0 and again before each task touching these files:
  - Migrations 0067–0071 → 13b's numbers start after whatever `main` holds then (renumbering recipe in `packages/db/CLAUDE.md` if phase-11 lands mid-way).
  - `packages/db/src/schema/delivery.ts` `AGENCY_KINDS` (+3 setup kinds) → append `rank_scan_skipped`, keep theirs.
  - `packages/engine/src/delivery/outbox.ts` `NotifyInput.subjectType` (+`'setup'`) → add `'rank_scan'` alongside.
  - `packages/core/src/links.ts` `LINK_TARGETS` (+`'setup'`) → 13b adds none.
  - `packages/tools/src/tools/onboarding.ts`: `update_client_profile` body moves to `packages/tools/src/setup/profile-change.ts` `applyClientProfileChange` → the `rank-map-refresh` enqueue on service-area change goes wherever the service-area write lives after the merge.
  - `packages/tools/src/deps.ts` `QueueJob` (+`'setup-suggestions'`) → append `'rank-scan' | 'rank-map-refresh'`.
  - `packages/tools/src/tools/{all.ts, access-marks.test.ts, channels.test.ts, schemas.ts}` → additive merges.
  - `apps/worker/src/{main.ts, deps.ts}` job registry → additive.
  - `turbo.json` (+`SETUP_FAKE_LOOKUP`) → additive.
  - `packages/demo/src/{coverage.ts, seed.ts, ids.ts, tenancy.ts}`, `apps/web/scripts/e2e-affected-rules.ts` (+`@setup`) → additive.
  - `apps/web/src/server/inbox.ts` `NOTIFICATION_KIND_LABELS` (phase-11 may add setup labels) → additive.
- **phase-7-planning** (docs only): no overlap.

## Review focus
1. **Budget race / double charge:** two "Scan now" clicks (or click + Sunday schedule) must never produce two running scans or exceed the agency's 10/day — pinned in Task 6 (`concurrent requests insert one running row`) and Task 0 index.
2. **Series identity:** a settings change must make the next scan a baseline — no `rank_change`, no `map_climb` across it, a Trend marker, and Compare refusal — pinned in Task 9 (`settings change → baseline`) and Task 13 (`refuses mismatched scans`).
3. **Map route leaks:** `/files/rank-map/<id>` for another agency's client, an out-of-scope AM, a client role without `dashboard`, a malformed id or a missing image must all be the same 404 — pinned in Task 8.
4. **Projection drift:** cells must land on the right map spot at high latitude and for a 40 km radius (Mercator, not equirectangular) — pinned in Task 2 (`round-trip within 0.5 px`, `bbox aspect equals image aspect`).
5. **Skipped scans pollute history:** a `skipped` scan must never appear in `get_geogrid`, `get_share_of_voice`, `get_rank_trend`, rank diff, scorecard or tier_change scan lookup, and the cap notice fires once per client per week — pinned in Task 4 (`skip writes no snapshot, one notice per week`) and Task 9 (`skipped scans ignored`).

---

### Task 0: Pre-flight
- [ ] On `main` (owner: no worktree): `git status` clean apart from `apps/web/next-env.d.ts`; `git log` — has phase-11 merged? Re-check every item in "Dependencies on in-flight work"; record drift in `docs/work/phase-13.md` (Status).
- [ ] Conflict-scan: open every file in "File structure" and confirm cited symbols still exist (`scanRankings` signature, `listRankClients`, `doneScans`, `diffRankScan`, `detectMoves`, `computeTrackedSignals`, `scoreForClient`, `GeoGrid`, `foldSeries`, `serveEvidence`, `notify`). Note differences in the work file before Task 1.
- [ ] Claim the next two free migration numbers; write them into this plan's Task 1 header.
- [ ] Local test DB: `bash scripts/local-test-db.sh start` (or `setup`), `bash scripts/local-test-db.sh env` → use a DB name ending `_test` not used by another session; run `pnpm --filter @cs/worker exec vitest run src/boss.test.ts` once (pgboss schema).
- [ ] `cs_dev` checks (read-only): `SELECT status, count(*) FROM rank_scan GROUP BY 1` (expect only running/done/failed); `SELECT count(*) FROM client WHERE (service_area->>'radiusKm')::float8 NOT BETWEEN 2 AND 40`.
- [ ] **Ask the owner:** (a) confirm MapTiler Static Maps price per request and that commercial SaaS use with images cached in our store and served from our host is allowed under their terms; the required attribution text; whether `attribution=false` on the image is allowed when we print attribution beside it; the map style id (default `dataviz` light) — record the answers in the work file; (b) add `MAPTILER_API_KEY` to `.env` (never print it); (c) approve the proposed copy lines in Tasks 4, 10, 11, 13, 14.
- [ ] With the owner's OK (one request): fetch one static image for the `cs_dev` fixture client's bbox with `padding=0` (or the documented equivalent) to confirm the URL format `https://api.maptiler.com/maps/{style}/static/{west},{south},{east},{north}/{w}x{h}@2x.png?key=…` and that the returned image spans exactly the requested bbox; save it as `packages/collectors/test/fixtures/vendors/maptiler-static.png` and note the confirmed URL shape in the work file.
- **Done when:** work file updated; `pnpm test:affected` green on `main`.

### Task 1: Migration + schema
**Goal:** spec data model plus P4 index, P7 backfill, P12 FK. Migrations `<N>` (generated, hand-edited) and `<N+1>` (custom).
**Files:** `packages/db/src/schema/tenancy.ts`, `client-intel.ts`, `delivery.ts`; migrations; new `packages/db/src/rank-upgrade.test.ts`; modify `packages/db/src/evidence.test.ts` (client column grant list).
**Interfaces:**
- `client`: `rankKeywords: jsonb('rank_keywords').$type<string[]>().notNull().default(sql\`'[]'::jsonb\`)`, `rankGridSize: smallint('rank_grid_size').notNull().default(7)`; checks `client_rank_grid_size_check`, `client_rank_keywords_check` (spec SQL).
- `rankScan`: `trigger: text().$type<RankScanTrigger>().notNull().default('scheduled')`, `requestedBy: uuid`, `gridSize: smallint`, `radiusKm: doublePrecision`, `keywords: jsonb.$type<string[]>()`, `estimatedUsd: doublePrecision`; checks `rank_scan_trigger_check`, `rank_scan_status_check`; `uniqueIndex('rank_scan_running_unique').on(t.clientId).where(sql\`status = 'running'\`)`. Export `type RankScanTrigger = 'scheduled' | 'manual'`, `type RankScanStatus = 'running' | 'done' | 'failed' | 'skipped'`.
- `rankMapImage` (`rank_map_image`) exactly per spec columns; export `RankMapImageRow`, `type RankMapBounds = { west: number; south: number; east: number; north: number }`.
- `AGENCY_KINDS` gains `'rank_scan_skipped'` (append before `'trend_report'` ordering is irrelevant; keep phase-11's kinds if merged).
**Generated migration `<N>`** — run `pnpm --filter @cs/db generate`, then hand-insert at the very top (before the CHECK and the unique index):
```sql
UPDATE rank_scan SET status = 'failed', finished_at = COALESCE(finished_at, now()) WHERE status = 'running' AND started_at < now() - interval '3 hours';
--> statement-breakpoint
```
Expected generated body (verify it matches; reorder by hand if drizzle puts the FK first):
```sql
CREATE TABLE "rank_map_image" (
  "client_id" uuid PRIMARY KEY NOT NULL,
  "agency_id" uuid NOT NULL,
  "settings_hash" text NOT NULL,
  "object_key" text NOT NULL,
  "bounds" jsonb NOT NULL,
  "width" integer NOT NULL,
  "height" integer NOT NULL,
  "fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "client" ADD COLUMN "rank_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "client" ADD COLUMN "rank_grid_size" smallint DEFAULT 7 NOT NULL;
ALTER TABLE "rank_scan" ADD COLUMN "trigger" text DEFAULT 'scheduled' NOT NULL;
ALTER TABLE "rank_scan" ADD COLUMN "requested_by" uuid;
ALTER TABLE "rank_scan" ADD COLUMN "grid_size" smallint;
ALTER TABLE "rank_scan" ADD COLUMN "radius_km" double precision;
ALTER TABLE "rank_scan" ADD COLUMN "keywords" jsonb;
ALTER TABLE "rank_scan" ADD COLUMN "estimated_usd" double precision;
ALTER TABLE "rank_map_image" ADD CONSTRAINT "rank_map_image_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "rank_map_image" ADD CONSTRAINT "rank_map_image_client_id_agency_id_client_id_agency_id_fk" FOREIGN KEY ("client_id","agency_id") REFERENCES "public"."client"("id","agency_id") ON DELETE cascade ON UPDATE no action;
CREATE UNIQUE INDEX "rank_scan_running_unique" ON "rank_scan" USING btree ("client_id") WHERE status = 'running';
ALTER TABLE "client" ADD CONSTRAINT "client_rank_grid_size_check" CHECK (rank_grid_size IN (5, 7));
ALTER TABLE "client" ADD CONSTRAINT "client_rank_keywords_check" CHECK (jsonb_typeof(rank_keywords) = 'array' AND jsonb_array_length(rank_keywords) <= 5);
ALTER TABLE "rank_scan" ADD CONSTRAINT "rank_scan_trigger_check" CHECK ("trigger" IN ('scheduled', 'manual'));
ALTER TABLE "rank_scan" ADD CONSTRAINT "rank_scan_status_check" CHECK (status IN ('running', 'done', 'failed', 'skipped'));
```
**Custom migration `<N+1>` (full):** `pnpm --filter @cs/db generate --custom --name=rank_upgrade_rls`
```sql
REVOKE INSERT, UPDATE, DELETE ON rank_map_image FROM app_user;
--> statement-breakpoint
ALTER TABLE rank_map_image ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE rank_map_image FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY rank_map_image_select ON rank_map_image FOR SELECT
  USING (agency_id = app_agency_id() AND app_client_visible(client_id));
--> statement-breakpoint
GRANT UPDATE (rank_keywords, rank_grid_size) ON client TO app_user;
--> statement-breakpoint
UPDATE rank_scan rs SET
  keywords = k.kw,
  grid_size = k.size,
  radius_km = LEAST(GREATEST((c.service_area->>'radiusKm')::float8, 2), 40)
FROM client c,
  LATERAL (
    SELECT jsonb_agg(DISTINCT s.keyword ORDER BY s.keyword) AS kw,
           round(sqrt(count(DISTINCT (s.lat, s.lng))))::smallint AS size
    FROM rank_snapshot s WHERE s.scan_id = rs.id
  ) k
WHERE c.id = rs.client_id AND rs.status = 'done' AND rs.grid_size IS NULL
  AND c.service_area IS NOT NULL AND k.kw IS NOT NULL;
```
**Tests (TDD)** `rank-upgrade.test.ts`: `client rank columns default to [] and 7`; `rank_grid_size 6 is rejected`; `six rank keywords are rejected`; `rank_scan status 'queued' is rejected, 'skipped' accepted`; `a second running scan for one client violates rank_scan_running_unique`; `agency B cannot select agency A's rank_map_image`; `a client-scoped member sees only their client's image`; `app_user cannot insert rank_map_image`; `app_user can update rank_keywords/rank_grid_size through withTenant`. `evidence.test.ts:148` list gains `rank_grid_size`, `rank_keywords`. `tenant.test.ts` passes unchanged (forced RLS).
**Done when:** `pnpm --filter @cs/db generate` says "No schema changes"; `pnpm --filter @cs/db exec vitest run rank-upgrade evidence tenant vendor-history` green; `pnpm typecheck`.

### Task 2: Geo math in `@cs/core`
**Goal:** grid bbox with half-cell padding, image-aspect fitting and Web Mercator projection, shared by worker and web (P13).
**Files:** new `packages/core/src/geo.ts`, `geo.test.ts`; `src/index.ts` export.
**Interfaces + full code:**
```ts
export interface LatLng { lat: number; lng: number }
export interface GeoBounds { west: number; south: number; east: number; north: number }
export const KM_PER_DEG_LAT = 111.32; // same constant as collectors/local/grid.ts
export const RANK_MAP_WIDTH = 640;
const RAD = Math.PI / 180;
const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2));
const invMercY = (y: number) => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / RAD;

/** The scan grid's extent (gridPoints spans ±radiusKm) padded by half a cell on every side. */
export function rankGridBounds(center: LatLng, radiusKm: number, gridSize: number): GeoBounds {
  const step = gridSize > 1 ? (2 * radiusKm) / (gridSize - 1) : 2 * radiusKm;
  const r = radiusKm + step / 2;
  const dLat = r / KM_PER_DEG_LAT;
  const dLng = r / (KM_PER_DEG_LAT * Math.cos(center.lat * RAD));
  return { west: center.lng - dLng, south: center.lat - dLat, east: center.lng + dLng, north: center.lat + dLat };
}

/**
 * Picks an integer image size for `bounds` (fixed width) and stretches the bbox north/south in Mercator space so
 * its aspect equals the image's exactly: the provider then renders precisely these bounds (no fit padding).
 */
export function fitBoundsToImage(b: GeoBounds, width = RANK_MAP_WIDTH): { bounds: GeoBounds; width: number; height: number } {
  const xSpan = (b.east - b.west) * RAD;
  const ySpan = mercY(b.north) - mercY(b.south);
  const height = Math.min(1280, Math.max(320, Math.round((width * ySpan) / xSpan)));
  const cy = (mercY(b.north) + mercY(b.south)) / 2;
  const half = (xSpan * height) / width / 2;
  return { bounds: { west: b.west, east: b.east, north: invMercY(cy + half), south: invMercY(cy - half) }, width, height };
}

/** Pixel position of a point inside an image that spans `b` (Web Mercator, origin top-left). */
export function projectToImage(p: LatLng, b: GeoBounds, width: number, height: number): { x: number; y: number } {
  const x = ((p.lng - b.west) / (b.east - b.west)) * width;
  const y = ((mercY(b.north) - mercY(p.lat)) / (mercY(b.north) - mercY(b.south))) * height;
  return { x, y };
}

export const insideBounds = (p: LatLng, b: GeoBounds): boolean => p.lng >= b.west && p.lng <= b.east && p.lat >= b.south && p.lat <= b.north;
```
**Tests (TDD):** `bounds pad the grid by half a cell` (7×7, 15 km → r = 17.5 km); `bbox aspect equals image aspect after fitting` (Mercator ratio == width/height within 1e-9); `height is clamped to 320–1280`; `projects bounds corners to image corners`; `centre lands at the image centre horizontally and on the Mercator midline`; `round-trip within 0.5 px at lat 47.6 with a 40 km radius` (project grid points from collectors' formula reimplemented in-test; neighbouring columns equally spaced within 0.5 px); `insideBounds is inclusive`.
**Done when:** `pnpm --filter @cs/core exec vitest run geo` green; `pnpm typecheck`.

### Task 3: Spend helpers, settings, estimate, budget
**Goal:** P1 move, P3 effective keywords, spec `estimateRankScanUsd` / `checkRankScanBudget`.
**Files:** new `packages/db/src/spend.ts` (+ index export); modify `packages/tools/src/usage.ts` (re-export); new `packages/collectors/src/rankings/settings.ts`, `budget.ts` + tests; `collectors/src/index.ts`.
**Interfaces:**
```ts
// @cs/db
export function monthStart(now: Date): Date;
export async function spendByClient(db: Db | Tx, clientIds: string[], since: Date): Promise<Map<string, number>>;
// collectors/rankings/settings.ts
export const RANK_MAX_KEYWORDS = 5;
export const RANK_RADIUS_KM = { min: 2, max: 40 } as const;
export type RankClient = Pick<ClientRow, 'keywords' | 'rankKeywords' | 'rankGridSize' | 'serviceArea'>;
export function rankKeywordsFor(c: Pick<RankClient, 'keywords' | 'rankKeywords'>): string[];
export function rankRadiusKm(radiusKm: number): number; // clamp 2–40
export function rankMapSettingsHash(s: { center: LatLng; radiusKm: number; gridSize: number }): string; // sha256 hex of canonical JSON
// collectors/rankings/budget.ts
export function estimateRankScanUsd(c: RankClient): { calls: number; usd: number }; // calls = keywords × gridSize²; usd = calls × DISCOVERY_CALL_COST_USD.maps
export async function checkRankScanBudget(db: Db | Tx, clientId: string, estimateUsd: number, now?: Date):
  Promise<{ ok: true } | { ok: false; reason: 'cap'; spentUsd: number; capUsd: number }>;
```
**Behaviour:** `checkRankScanBudget` reads `client.monthly_cap_usd`, `spendByClient(db, [id], monthStart(now))`; ok iff `spent + estimate ≤ cap`. `ClientRow` = `typeof client.$inferSelect` (export it from db if missing). No hard-coded price (P2). **Follow pattern:** `collectors/src/rivals/cost.ts`.
**Tests (TDD):** `usage.ts re-exports the same functions` (identity); `rankKeywordsFor falls back to the first 5 keywords`; `drops rank keywords no longer in client.keywords`; `empty intersection falls back`; `radius clamps 1→2 and 60→40`; `settings hash ignores key order`; `estimate 7×7×5 = 245 calls × maps rate`; `budget ok at exactly the cap`; `budget refuses one cent over with spent and cap`; `counts llm and vendor rows of this month only`.
**Done when:** `pnpm --filter @cs/collectors exec vitest run settings budget` and `pnpm --filter @cs/tools exec vitest run usage` green; `pnpm typecheck`.

### Task 4: `scanRankings` settings, trigger, skip + notice kind
**Goal:** spec `scanRankings(deps, clientId, opts)`; skipped scans; `rank_scan_skipped` notice (P5, P6).
**Files:** `packages/collectors/src/rankings/scan.ts`, `scan.test.ts`, `prospect/snapshot.ts`; new `packages/engine/src/delivery/rank-notices.ts` (+ test), engine index; `packages/engine/src/delivery/outbox.ts` (`subjectType` + `'rank_scan'`); `packages/email/src/types.ts` (`AgencyNoticeProps.notice` + `'rank_scan_skipped'`); `apps/web/src/server/inbox.ts` label.
**Interfaces:**
```ts
export interface RankScanSkipped { scanId: string; agencyId: string; clientId: string; clientName: string; spentUsd: number; capUsd: number; estimatedUsd: number }
export async function scanRankings(
  deps: { db: Db; store: ObjectStore; dfs: DataForSeoClient; onSkipped?: (s: RankScanSkipped) => Promise<void> },
  clientId: string,
  opts: { trigger: RankScanTrigger; requestedBy?: string; scanId?: string; prospect?: { gridSize: number; maxKeywords: number } },
): Promise<{ snapshots: number; failed: number; scanId: string | null; skipped?: 'cap' }>;
// engine
export async function notifyRankScanSkipped(deps: { db: Db; delivery: DeliveryConfig }, s: RankScanSkipped, now?: Date): Promise<number>;
```
**Behaviour:**
- Keywords `rankKeywordsFor(c)`, grid `c.rankGridSize`, radius `rankRadiusKm(...)` (prospect override keeps today's grid/keyword caps). Snapshot `gridSize`, `radiusKm`, `keywords`, `estimatedUsd`, `trigger`, `requestedBy` on the row.
- `opts.scanId` (manual, P4): adopt that `running` row (must belong to the client); otherwise insert. A unique violation on insert (`rank_scan_running_unique`) → log and return `{ snapshots: 0, failed: 0, scanId: null }` (another scan is running).
- Non-prospect: budget check **before** inserting/adopting; on `cap` → insert (or update the adopted row to) `status 'skipped'`, `finished_at now()`, no snapshots, then `deps.onSkipped?.(...)`; return `{ …, skipped: 'cap' }`. No vendor call.
- `notifyRankScanSkipped`: audience agency, kind `rank_scan_skipped`, link `{ t: 'notifications', id: s.scanId }`, dedupe per P6; email template `agency_notice`, `actionLabel: 'Open inbox'`.
- **Copy (proposed):** title `Rank scan skipped: {client}`; lines `["This scan would exceed {client}'s monthly cost cap (${cap}). Raise the cap in Usage or wait until next month."]` (spec cap copy); inbox label `Rank scan skipped`. `${cap}` formats as `$15` / `$12.50`.
- **Follow pattern:** `engine/src/briefs/deliver.ts` `notifyOverdue`.
**Tests (TDD):** `scan stores the settings snapshot (7, clamped radius, effective keywords)`; `uses rank_grid_size 5`; `adopts a manual running row by id`; `a second scheduled scan while one runs returns null without vendor calls`; `cap → skipped row, no snapshot, no dfs call, onSkipped once`; `prospect override skips the budget check`; `notifyRankScanSkipped writes one in-app row per agency contact and dedupes within the week, again next week`.
**Done when:** `pnpm --filter @cs/collectors exec vitest run scan snapshot` and `pnpm --filter @cs/engine exec vitest run rank-notices outbox` green; `pnpm typecheck`.

### Task 5: Weekly schedule, stale sweep, worker wiring
**Goal:** spec cadence; P4 stale handling; `onSkipped` wired.
**Files:** `apps/worker/src/jobs/vendor.ts`, `vendor.test.ts`, `deps.ts`, `main.ts`; `packages/collectors/src/rankings/scan.ts` (`listRankClients`, new `failStaleRankScans`); `turbo.json`.
**Interfaces:** `rank-schedule` cron `'0 6 * * 0'`; `rank-scan` schema `z.object({ clientId: z.uuid(), trigger: z.enum(['scheduled','manual']).default('scheduled'), scanId: z.uuid().optional(), requestedBy: z.string().optional() })`; `WorkerDeps.scanRankings(clientId, opts)`; `export async function failStaleRankScans(db: Db, now?: Date): Promise<number>`; `export const RANK_SCAN_STALE_HOURS = 3`; queue interface `enqueueRankScan(clientId: string, data?: { trigger; scanId?; requestedBy? })`, `enqueueRankMap(clientId: string)`.
**Behaviour:**
- `listRankClients` already filters `clientServiceable` (= active and `paused_at IS NULL`) + `agencyServiceable` — the spec's paused filter is satisfied; add a test that pins it, don't duplicate the clause.
- `rank-schedule`: `failStaleRankScans` first, then enqueue a scan per client; for clients with no `rank_map_image` row enqueue `rank-map-refresh` once (the job no-ops without a key).
- Worker wires `onSkipped` → `notifyRankScanSkipped` when `deliveryConfigFromEnv` is non-null (else log). `MAPTILER_API_KEY` added to `turbo.json` `globalPassThroughEnv`.
- **Follow pattern:** existing `rankSchedule`/`rankScan` in `jobs/vendor.ts`.
**Tests (TDD):** `rank-schedule runs on Sundays at 06:00 UTC`; `listRankClients excludes paused, prospect, read-only-agency clients`; `stale running scans older than 3 h are failed, fresh ones kept`; `rank-scan passes trigger and scanId through`; `schedule enqueues a map refresh only for clients without an image`.
**Done when:** `pnpm --filter @cs/worker exec vitest run vendor` and `pnpm --filter @cs/collectors exec vitest run scan` green; `pnpm typecheck`.

### Task 6: Rank settings + Scan now tools
**Goal:** `get_rank_settings` (P11), `update_client_rank_settings`, `request_rank_scan`; `ServiceAreaWrite` (P14).
**Files:** new `packages/tools/src/rank-scan.ts` (+ test); `packages/tools/src/tools/rankings.ts`, `rankings.test.ts`, `schemas.ts`, `onboarding.ts`, `all.ts`, `access-marks.test.ts`; `packages/tools/src/limits.ts`, `deps.ts`; `docs/superpowers/specs/2026-10-12-phase-8b-tool-access.md`.
**Interfaces:**
```ts
export const RANK_MANUAL_PER_CLIENT_DAYS = 7; export const RANK_MANUAL_PER_AGENCY_DAY = 10; // limits.ts
export const ServiceAreaWrite = ServiceAreaInput.extend({ radiusKm: z.number().min(2).max(40) });
export type RankScanState = 'available' | 'weekly_limit' | 'agency_daily_limit' | 'cap' | 'running' | 'not_ready';
export async function rankScanAvailability(db: Db | Tx, c: { id: string; agencyId: string }, now: Date):
  Promise<{ state: RankScanState; nextAvailableAt?: string; capUsd?: number }>;
// get_rank_settings — read, permission 'agency', web only
input  { clientId: uuid }
output { keywords: string[]; allKeywords: string[]; gridSize: 5 | 7; radiusKm: number | null; scan: { state: RankScanState; nextAvailableAt: string | null; label: string | null } }
// update_client_rank_settings — write, permission 'agency', web only
input  { clientId: uuid; keywords: z.array(z.string().trim().min(1).max(120)).min(1).max(5); gridSize: z.union([z.literal(5), z.literal(7)]); radiusKm: z.number().min(2).max(40) }
output { ok: true }
// request_rank_scan — write, permission 'agency', web only
input  { clientId: uuid }
output { queued: true; scanEtaMinutes: number } | { queued: false; reason: 'weekly_limit' | 'agency_daily_limit' | 'cap' | 'not_ready'; nextAvailableAt?: string }
```
`QueueJob` += `'rank-scan' | 'rank-map-refresh'`.
**Behaviour:**
- Availability order: `not_ready` (not `clientServiceable`/agency not serviceable, no keywords or service area) → `running` (non-stale running row; reported to `request_rank_scan` as `not_ready`) → `weekly_limit` (a manual row, status ≠ skipped, `started_at > now − 7 d`; next = that + 7 d) → `agency_daily_limit` (≥ 10 manual rows of the agency since UTC midnight; next = next UTC midnight) → `cap` (`checkRankScanBudget` on the estimate) → `available`.
- `request_rank_scan` (P4): `failStaleRankScans` for the client, then one service transaction: agency row `FOR UPDATE`, availability, insert running manual row (`requestedBy = ctx.userId`, settings snapshot); unique violation → `not_ready`. Enqueue `rank-scan { clientId, trigger:'manual', scanId, requestedBy }`, singleton `rank-scan:{clientId}`; enqueue failure deletes the row and throws the registry's `internal`. `scanEtaMinutes = ceil(calls × 2 / 60) + 1`. Refusals with the decided copy go out as `ToolError('invalid_input', msg, { userFacing: true })` from the web action, not from the tool (the tool returns the union).
- `update_client_rank_settings`: `canAccessClient` else `not_found`; every keyword ∈ `client.keywords` else `invalid_input` "Pick keywords from the client's keyword list."; `withTenant(app)` `FOR UPDATE` read, then update `rank_keywords`, `rank_grid_size`, `service_area.radiusKm` (requires a service area, else `invalid_input` "Set a service area on the Profile page first."); after commit enqueue `rank-map-refresh` (singleton `rank-map:{clientId}`; failure logged, not thrown).
- `create_client`/`update_client_profile` inputs use `ServiceAreaWrite`; `update_client_profile` enqueues `rank-map-refresh` when the merged service area's centre or radius changed (after phase-11: inside `applyClientProfileChange`'s caller).
- Label `{date}` via `searchDayLabelAt(iso, client.timezone)`.
- **Follow pattern:** `packages/tools/src/rival-search.ts` `startCompetitorSearch`; `tools/client-pause.ts`.
**Tests (TDD):** `settings default to the first 5 keywords and grid 7`; `client roles cannot see get_rank_settings (not_found)`; `update rejects a keyword outside client.keywords`; `update rejects radius 41 and grid 6`; `update writes the three fields and enqueues one map refresh`; `request queues a manual scan with ETA`; `second request within 7 days → weekly_limit with nextAvailableAt`; `11th agency request today → agency_daily_limit`; `cap → cap, no row`; `running scheduled scan → not_ready`; `paused client → not_ready`; `concurrent requests insert one running row`; `enqueue failure leaves no row`; `create_client refuses radius 1`; access-marks snapshot updated.
**Done when:** `pnpm --filter @cs/tools exec vitest run rank-scan rankings onboarding access-marks` green; `pnpm test:affected`; `pnpm typecheck`.

### Task 7: MapTiler client + `rank-map-refresh` job
**Goal:** spec job: fetch, store, upsert; no-op without a key.
**Files:** new `packages/collectors/src/rankings/maptiler.ts`, `map-refresh.ts` (+ tests); new `apps/worker/src/jobs/rank-map.ts` (+ test); `apps/worker/src/{deps.ts, main.ts}`.
**Interfaces:**
```ts
export interface StaticMapClient { fetchStatic(q: { bounds: GeoBounds; width: number; height: number }, scope: CallScope): Promise<Uint8Array> }
export function createMapTilerClient(opts: { apiKey: string; style?: string; fetch?: typeof fetch; ledger: LedgerSink }): StaticMapClient;
export const MAPTILER_ATTRIBUTION = '© MapTiler © OpenStreetMap contributors'; // replace with Task 0's confirmed text
export async function refreshRankMap(deps: { db: Db; store: ObjectStore; maps: StaticMapClient | null }, clientId: string): Promise<'unchanged' | 'stored' | 'skipped'>;
// job: name 'rank-map-refresh', schema z.object({ clientId: z.uuid() }), queue { policy: 'short', retryLimit: 2 }
```
**Behaviour:**
- `maps === null` (no `MAPTILER_API_KEY`) → `'skipped'`. No service area or client not serviceable → `'skipped'`.
- Hash = `rankMapSettingsHash({ center, radiusKm: rankRadiusKm(r), gridSize })`; same hash as the row → `'unchanged'`.
- `fitBoundsToImage(rankGridBounds(...))`; URL shape from Task 0 with `@2x` and `padding=0`; 10 s timeout; non-200 or non-`image/png` throws (pg-boss retries). Key never logged; error text strips the query string.
- Store at `rank-map/{clientId}/{hash}.png`, upsert `rank_map_image` (service db) with fitted bounds, logical `width`/`height`.
- Ledger one `vendor_call` (`vendor: 'maptiler'`, `operation: 'static'`, `costUsd` = Task 0 price) with the client scope via `safeRecordVendorCall`.
- **Follow pattern:** `collectors/src/vendors/meta-search.ts` (fetch + ledger), `apps/worker/src/jobs/ask.ts` (short single job).
**Tests (TDD):** `no key → skipped, no fetch`; `same settings → unchanged, no fetch`; `changed radius → fetch with fitted bbox, store, upsert`; `URL carries bbox, size@2x and padding, never logs the key`; `non-png response throws`; `ledgers one maptiler call with client scope`; worker `job calls refreshRankMap with the client id`.
**Done when:** `pnpm --filter @cs/collectors exec vitest run maptiler map-refresh` and `pnpm --filter @cs/worker exec vitest run rank-map` green; `pnpm typecheck`.

### Task 8: `/files/rank-map/[clientId]` route
**Goal:** stream the stored image after the `get_geogrid` scope check; every refusal 404.
**Files:** new `apps/web/src/app/files/rank-map/[clientId]/route.ts`; `apps/web/src/server/files.ts` (`serveRankMap`), `files.test.ts`.
**Full code (`server/files.ts`):**
```ts
export async function serveRankMap(input: { clientId: string; ctx: AccessContext; registry: ToolRegistry<ToolDeps>; service: Db; store: ObjectStore }): Promise<Response> {
  if (!isUuid(input.clientId)) return notFound();
  let view: GeoGridView;
  try {
    // Same scope + `dashboard` feature check as the Local rankings page (spec: "same scope check as get_geogrid").
    view = (await input.registry.invoke(input.ctx, 'get_geogrid', { clientId: input.clientId })) as GeoGridView;
  } catch (e) {
    if (e instanceof ToolError && (e.code === 'not_found' || e.code === 'permission_denied' || e.code === 'invalid_input')) return notFound();
    throw e;
  }
  if (!view.map) return notFound();
  const [row] = await input.service.select({ key: rankMapImage.objectKey }).from(rankMapImage)
    .where(and(eq(rankMapImage.clientId, input.clientId), eq(rankMapImage.agencyId, input.ctx.agencyId)));
  const bytes = row ? await input.store.get(row.key) : null;
  if (!bytes) return notFound();
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { 'content-type': 'image/png', 'x-content-type-options': 'nosniff', 'cache-control': 'private, max-age=86400', 'content-disposition': 'inline' },
  });
}
```
**Route:** mirror `files/evidence/[clientId]/[evidenceId]/route.ts` exactly (one `activeEnvName()`, `getViewer()`, member-less/suspended → 404). `/files/rank-map/` stays behind the session in `proxy.ts` (not in `PUBLIC`).
**Tests (TDD):** `serves the png to an agency admin`; `404 for another agency's client`; `404 for an AM outside clientScope`; `404 for a client role without dashboard`; `404 for a malformed id`; `404 when no image row or the object is missing`; `cache-control is private, max-age=86400`.
**Done when:** `pnpm --filter @cs/web exec vitest run files` green; `pnpm --filter @cs/web e2e:affected`; `pnpm typecheck`.

### Task 9: `get_rank_trend` + `get_geogrid` additions + settings-aware diff
**Goal:** spec trend tool; geogrid fixes and `map`; P7 series identity; P8 details.
**Files:** `packages/tools/src/tools/rankings.ts`, `rankings.test.ts`, `schemas.ts`, `channels.test.ts`, `access-marks.test.ts`; `packages/engine/src/structured/rank.ts`, `rank.test.ts`; `packages/db/src/schema/engine.ts` (`ChangeDetails`); 8b doc.
**Interfaces:**
```ts
export const TOP3_POINTS_GAIN_MIN = 5;                     // engine
export function rankSettingsKey(s: { gridSize: number | null; radiusKm: number | null; keywords: string[] | null }): string; // P7
// ChangeDetails += top3PointsBefore?, top3PointsAfter?, scanId?, from?: Tier, to?: Tier
// get_rank_trend — read, permission 'read', feature 'dashboard', channels ['web','mcp','ask']
input  { clientId: uuid; keyword: z.string().trim().min(1).max(100); limit: z.number().int().min(1).max(26).default(12); before: uuid.optional() }
output { scans: { scanId; finishedAt; settingsKey; settingsChanged: boolean; self: { avgRank; top3Share; points } | null;
         competitors: { competitorId; name; tier: Tier | null; avgRank; top3Share }[] }[]; nextCursor: string | null }
// GeoGridView += lats: number[]; lngs: number[]; map: { url; bounds: RankMapBounds; width; height; attribution } | null
```
**Behaviour:**
- Trend: `done` scans only, newest first, `limit + 1` fetched for the cursor; `before` must be one of the client's done scans else `not_found`. `settingsChanged` = key differs from the next older scan (older scan beyond the page fetched with it). Metrics via `rankMetrics` on that keyword's snapshots; `self` null without a self business; competitors = tracked, tier from `competitor_signal` (null if unrated), name-sorted. All tenant reads in one `withTenant`.
- `get_geogrid`: a selected scan older than the newest 12 is merged into `scans` (sorted by `finishedAt` desc); `map` per P12 (bounds from `rank_map_image` via `withTenant`, attribution `MAPTILER_ATTRIBUTION` imported from `@cs/collectors`).
- `diffRankScan`: previous done scan's `rankSettingsKey` ≠ this scan's → `{ baseline: true }`. Threshold adds `top3After − top3Before` points ≥ `TOP3_POINTS_GAIN_MIN` (`rankMetrics` points × share, rounded); details gain `top3PointsBefore`, `top3PointsAfter`, `scanId`. Version stays 1 (P8).
- **Follow pattern:** existing `getShareOfVoice`.
**Tests (TDD):** `trend returns 12 newest done scans with self and competitor metrics`; `skipped and failed scans ignored`; `cursor pages back and ends with null`; `settingsChanged marks the scan after a settings change`; `limit 27 rejected`; `never reads another client's scans`; `tier null when unrated`; geogrid `selected scan older than 12 appears in scans`; `map null without an image or when a point is outside bounds`; `lats north→south and lngs west→east`; rank diff `settings change → baseline`; `top-3 point gain of 5 alone records a change with point details`; `gain of 4 with small share delta records nothing`; `legacy key equals legacy key`.
**Done when:** `pnpm --filter @cs/tools exec vitest run rankings channels access-marks` and `pnpm --filter @cs/engine exec vitest run rank` green; `pnpm test:affected`; `pnpm typecheck`.

### Task 10: `map_climb` move
**Goal:** spec 8th rule + territory signal.
**Files:** `packages/core/src/domain.ts` (`MOVE_TYPES` += `'map_climb'`); `packages/engine/src/moves/rules.ts`, `rules.test.ts`, `moves-stage.ts`, `moves-stage.test.ts`; `packages/tools/src/pressure.ts` (`MOVE_LABELS`); `packages/verticals/packs/{hvac_plumbing,dental}.yaml` (playbook).
**Interfaces:** `MoveEvent` unchanged (details carry `scanId`, `top3Points*`); `MoveContext.rankScans: string[]` (client's done scan ids, oldest → newest, finished within `MOVE_WINDOW_DAYS`); `export const MAP_CLIMB_POINTS_MIN = 5`.
**Behaviour:**
- Per keyword, the competitor's `rank_change` events with `top3PointsBefore/After` and a `scanId` present in `rankScans`; gain = after − before. Fires when one event has gain ≥ 5, or two events on **adjacent** indices of `rankScans` sum ≥ 5 (both gains > 0). A gap scan breaks adjacency. Support = those events; `finding('map_climb', support, 1, summary, { keyword, pointsGained })`; first qualifying keyword by name wins.
- Evaluate `map_climb` before territory; each `map_climb` finding adds its events as territory signal kind `'map'` (no `touchesTerritory` check: the grid is the client's area); territory still needs `web_area` or `gbp_area`.
- `updateMovesForClient` loads `rankScans` once per client (service db, `status 'done'`). Untracked competitors never reach the rules (existing loop).
- **Copy (proposed):** summary `Climbed into the map top 3 at {n} more points for "{keyword}"`; label `Map climb`; playbook `map_climb_defend`, title `Defend your map visibility`, template `{{competitor}} is climbing into the Google Maps top 3 across your area. Refresh your Google Business Profile (photos, services, posts), ask recent customers for reviews, and check that your service-area pages cover the places where they gained.`
**Tests (TDD):** `single event with exactly 5 points fires`; `4 points does not`; `3 + 2 on adjacent scans fires`; `3 + 2 with a scan between does not`; `negative gain never counts`; `events outside the window ignored`; `map_climb counts as a territory signal with a gbp_area event`; `map signal alone never opens territory_expansion`; moves-stage `an untracked competitor's rank events open no move`; `packs.test` sees the new playbook.
**Done when:** `pnpm --filter @cs/engine exec vitest run rules moves-stage` and `pnpm --filter @cs/verticals test` and `pnpm --filter @cs/core test` green; `pnpm typecheck`.

### Task 11: `tier_change` events + scoring
**Goal:** spec `tier_change` from `signals-weekly`, P9, P10.
**Files:** `packages/core/src/domain.ts` (`CHANGE_TYPES` += `'tier_change'`, `TIER_LABELS`); `packages/collectors/src/signals/tracked.ts`, `tracked.test.ts`; `packages/engine/src/tag/structured.ts`, `score/score.ts`, `score/score-stage.ts` (`detailsSignature`), `events/retract.ts` + tests; packs (`type_weights.tier_change: 0.6`, `scoring.version` bump); `packages/email/src/labels.ts`.
**Interfaces:** `export const TIER_LABELS = { top: 'Top rival', watch: 'Worth watching', minor: 'Minor' } as const` (`@cs/core`); detected_change row `{ source: 'rank', kind: 'modified', rankScanId: latestDone, agencyId, clientId, competitorId, blockKey: 'tier:{YYYY-MM-DD}', beforeText: TIER_LABELS[from], afterText: TIER_LABELS[to], details: { changeType: 'tier_change', from, to }, stageVersion: 1 }`.
**Behaviour:**
- In `computeTrackedSignals`' transaction: read existing tiers first; after each upsert, if a previous row existed and `tier` changed, and the client has a latest `done` scan (skipped/failed ignored), insert the row (`onConflictDoNothing`). No previous row → nothing. No scan → nothing. Self business excluded (already filtered).
- Tag: `tier_change` maps no services, never calls the model, summary via `buildStructuredSummary`; merge stays client-scoped.
- Score (P10): promotion = rank `minor < watch < top` rises; `to === 'top'` → `thresholds.alert`, other promotion → `thresholds.brief`, demotion → 0; `detailsSignature` `tier|{from}|{to}`.
- Retract: rank scope gains `like(detectedChange.blockKey, 'rank:%')`.
- **Copy (proposed):** event summary `Now rated "{To}" (was "{From}")`; email label `competitor tier change`.
**Tests (TDD):** `watch → top writes one tier_change on the latest done scan`; `first rating (no previous row) writes nothing`; `no done scan writes nothing`; `skipped latest scan is not used`; `same tier writes nothing`; `re-run the same day writes nothing new`; score `promotion to top routes alert`, `watch promotion routes brief`, `demotion archives`, `needs-review cap still applies`; tag `summary uses tier labels, no model call`; retract `rank re-diff never supersedes tier rows`; packs parse with `tier_change`.
**Done when:** `pnpm --filter @cs/collectors exec vitest run tracked`, `pnpm --filter @cs/engine exec vitest run structured score retract`, `pnpm --filter @cs/verticals test` green; `pnpm test:affected`; `pnpm typecheck`.

### Task 12: GeoGrid map prop + fixes
**Goal:** spec `map` prop and the four fixes.
**Files:** `apps/web/src/components/charts/geo-grid.tsx`, `geo-grid.test.tsx`, `line-chart.tsx` (`foldSeries`, P15), `line-chart.test.tsx`.
**Interfaces:** `GeoGrid` props += `map?: GeoGridView['map']`, `lats?: number[]`, `lngs?: number[]`.
**Behaviour:**
- Hatch pattern ids from `useId()` (sanitised to `[A-Za-z0-9_-]`); the legend renders one hidden `<svg><defs>` once and its swatches reference it.
- Ragged rows: iterate `cols` for every row, missing cells render as null (no data).
- With `map` + coordinates: `<image href={map.url} width height preserveAspectRatio="none">` fills a `viewBox` of `map.width × map.height`; each cell centred at `projectToImage({lat: lats[r], lng: lngs[c]}, map.bounds, …)` with size `0.86 ×` the smaller neighbour spacing (min 18 px); compass letters hidden; attribution line `<figcaption>` under the grid (`text-xs text-muted-foreground`). Without `map`, today's plain grid.
- `foldSeries`: pinned series sorted by name together with the kept ones; `other` stays last.
**Tests (TDD):** `two grids on one page use distinct hatch ids`; `legend emits one defs`; `a short row renders no-data cells`; `with a map the image and attribution render and cells sit at projected positions`; `without a map the plain grid renders`; `foldSeries name-sorts a pinned series`.
**Done when:** `pnpm --filter @cs/web exec vitest run geo-grid line-chart` green; `pnpm --filter @cs/web e2e:affected`; `pnpm typecheck`.

### Task 13: Trend and Compare tabs
**Goal:** spec D8 UI (Trend default; Compare with change grid).
**Files:** `apps/web/src/app/(app)/c/[clientId]/rankings/page.tsx`, `page.test.tsx`, new `tabs.tsx`, `scan-slider.tsx`; new `apps/web/src/components/charts/rank-trend.tsx`, `change-grid.tsx` (+ tests); `apps/web/scripts/e2e-affected-rules.ts` (rules for the two charts → `@rankings`).
**Interfaces:** URL params `tab=trend|compare` (default trend), `scan`, `a`, `b` (scan ids); `RankTrend({ scans, keyword })` (props = `get_rank_trend` output, oldest → newest); `ChangeGrid({ before: (number|null)[][], after: (number|null)[][], lats, lngs, map? })`; `export function changeFill(delta: number | null): { fill: string; text: string; label: string }`.
**Behaviour:**
- Trend: average-rank line for You + tracked competitors (≤ 5 series, `foldSeries`), y inverted (1 at top, 21 = "20+"); dashed vertical marker at scans with `settingsChanged`; slider (`<input type="range">`, labelled "Scan") over the trend's scans drives `?scan=` (`router.replace`, `scroll: false`) and the GeoGrid below it.
- Compare: two scan selects (A older, B newer, default newest two); B before A → swapped; different `settingsKey` → "Settings changed between these scans." and no grid. Change per point = rank A − rank B (positive = moved up); null on either side → no data.
- `changeFill`: diverging blue (up) / orange (down) with neutral "same", 3 steps per side (1–2, 3–5, 6+); run the dataviz skill's validator in light theme on the ramp and record the hex values + result in the component docstring; labels print `+n` / `−n` / `=`.
- Page copy: "monthly rank scan" → "weekly rank scan" in both existing sentences.
- **Copy (proposed):** tabs `Trend` / `Compare`; marker `Settings changed`; legend `Moved up`, `Same`, `Moved down`, `No data`; Compare labels `From scan`, `To scan`.
- **Follow pattern:** `rankings/page.tsx` form selects; `charts/line-chart.tsx`.
**Tests (TDD):** `changeFill maps +4 to mid blue, −7 to dark orange, 0 to neutral, null to hatch`; `ChangeGrid prints signed labels`; `RankTrend draws a marker at a settings change`; `page defaults to Trend`; `Compare refuses mismatched scans with the decided copy`; `Compare swaps reversed scans`.
**Done when:** `pnpm --filter @cs/web exec vitest run rankings rank-trend change-grid` and the e2e-affected rules test (`--config scripts/vitest.scripts.config.ts`) green; `pnpm --filter @cs/web e2e:affected`; `pnpm typecheck`.

### Task 14: Rank settings sheet + Scan now + E2E
**Goal:** agency-only controls and their E2E.
**Files:** new `rankings/rank-settings-sheet.tsx`, `scan-now-button.tsx`, `actions.ts` (+ tests); `page.tsx`; new `apps/web/e2e/rankings.spec.ts`; `apps/web/e2e/seed.ts`.
**Interfaces:** server actions `saveRankSettings(clientId, input)` → `runTool(ctx, 'update_client_rank_settings', …)`; `requestRankScan(clientId)` → `runTool(ctx, 'request_rank_scan', …)` mapping refusals to the decided copy. Page calls `get_rank_settings` only for agency roles (`isAgencyRole`) and only when the client is serviceable.
**Behaviour:**
- Sheet (`@cs/ui` `Sheet`): keyword checkboxes from `allKeywords` (max 5, extra boxes disabled at 5), grid radio 5×5/7×7, radius number input 2–40 km; controlled fields + `onReset` prevent (web gotcha); result message hoisted to an always-mounted region; `WriteGuard`.
- Button states: available → `Scan now`; `weekly_limit` → disabled "Next scan available {date}"; `agency_daily_limit` → disabled + decided agency copy; `cap` → disabled + decided cap copy; `running` / just queued → disabled `Scan running…`; `not_ready` or paused/inactive client → hidden. After queueing, message `Scan queued — results in about {n} minutes.`
- **Copy (proposed):** sheet title `Rank settings`; save `Save settings`; saved `Saved. The next scan uses these settings.`; `Scan running…`; `Scan queued — results in about {n} minutes.`
- E2E seed: the E2E HVAC client gets 3 weekly done scans (one with different settings), one manual scan 2 days ago (→ weekly limit), and a `rank_map_image` row + stored png.
- **Follow pattern:** `competitors/competitor-controls.tsx` + `actions.ts`; `components/billing/client-billing-controls.tsx` (WriteGuard).
**Tests (TDD):** unit `sheet caps keywords at 5`, `button renders each state's copy`, `actions map refusals to decided copy`. E2E (`@rankings`; guest test also `@guest`): `Trend is the default tab and the slider changes the grid's scan`; `Compare shows the change grid and refuses mismatched settings`; `Scan now shows "Next scan available …" after a recent manual scan`; `Rank settings opens for an agency admin and saves`; `a client viewer sees neither Rank settings nor Scan now`; `the map image loads under the grid with attribution`.
**Done when:** `pnpm --filter @cs/web exec vitest run rankings read-only-guard` green; `pnpm --filter @cs/web e2e:affected`; `pnpm typecheck`.

### Task 15: Demo data
**Goal:** spec edge "12 weekly scans per demo client with plausible movement and one Map climb".
**Files:** `packages/demo/src/rankings.ts`, `rankings.test.ts`, `changes.ts`, `coverage.ts`, `README.md` (`coverage:readme`).
**Behaviour:** 12 weekly done scans per active demo client with settings snapshot columns filled (grid 7, demo radius, keywords); one Lone Star competitor gains ≥ 5 top-3 points over the last two scans on one keyword, with matching `rank_change` changes/events (details incl. `top3Points*`, `scanId`) and an open `map_climb` move (`status 'emerging'`) in `changes.ts`; one `tier_change` event (watch → top) on the latest scan; keep the existing failed scan/point. Coverage: `get_rank_trend` entry on `/c/[clientId]/rankings` (path `scans`). No map image in demo (enqueue is off in DEMO; grids render plain).
**Tests (TDD):** update `writes 12 weekly scans per active client; Lone Star has one failed scan`; `one competitor climbs ≥ 5 top-3 points across the last two scans`; `seeds one open map_climb move`; coverage test lists `get_rank_trend`.
**Done when:** `pnpm --filter @cs/demo exec vitest run rankings changes coverage` green; `pnpm typecheck`.

### Task 16: Docs + backlog closure
**Goal:** branch work file only (shared docs change at merge).
**Files:** `docs/work/phase-13.md`.
**Behaviour:** Status/Next overwritten; "Interfaces this branch adds" lists migrations, tools, job, route, env; "New backlog" lists deferrals found during build; "Owner verification steps": set `MAPTILER_API_KEY`, run the worker, save rank settings on the `cs_dev` client → map image appears; Scan now on a client near its cap → cap copy; `signals-weekly` once → a tier change event. Mark for closure at merge: BACKLOG lines for GeoGrid defs/hatch/ragged rows, `get_geogrid` selected scan, `tier_change`, `rank_scan.status` CHECK (that part only), map tiles under the geo-grid (that part only), Legend pinned "You" (that part only).
**Done when:** work file ≤ 8 KB; `git ls-files --eol | grep crlf` prints nothing.

### Final review (whole branch, most capable model)
Run `pnpm test:affected --base main` and `pnpm --filter @cs/web e2e:affected --base main`; check every Review focus item against its pinned test; one fix wave.
