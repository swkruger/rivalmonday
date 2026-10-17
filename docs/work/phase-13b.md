# phase-13b — Local rankings upgrade (weekly scans, map, Trend/Compare, Map climb, tier_change)

**Kind:** implementation   **Worktree:** ../CompetitorSpy-wt/phase-13b   **Base:** main @ 98e4481
**Plan/spec:** [spec](../superpowers/specs/2026-10-17-phase-13b-local-rankings-design.md) · [plan](../superpowers/plans/2026-10-17-phase-13b-local-rankings.md) · phase brief + 13a: [phase-13.md](phase-13.md)

## Status (overwrite)
2026-10-17: **Built.** Tasks 0–16 done and task-reviewed; final whole-branch review (Opus) + one fix wave (eefcdbb) clean. `test:affected --base main` 16/16 packages green; `e2e:affected --base main` 82/82. Nothing uncommitted. Stadia probe pending (no `STADIA_API_KEY` yet).

## Next (overwrite)
Owner: add `STADIA_API_KEY` → one-image probe (confirm `STATIC_MAP_WORLD_PX`, @2x size, alignment) before enabling the key in prod; sign off undecided copy (step 5). Then `/rm-merge phase-13b` with the owner's go-ahead (if phase-11 merged first: renumber to 0074–0076, move the map-refresh enqueue into `applyClientProfileChange`).

## Interfaces this branch adds or changes
- **Migrations:** 0067 rank_upgrade, 0068 rank_upgrade_rls, 0069 rank_scan_requested_by_text. Phase-11 now holds 0067–0073: if 13b merges second it renumbers to 0074–0076.
- **Tables/columns:** `client.rank_keywords`, `client.rank_grid_size`; `rank_scan.trigger`, `requested_by` (text), `grid_size`, `radius_km`, `keywords`, `estimated_usd`, status `'skipped'`, unique index on one running scan per client; new `rank_map_image`. `ClientRow` now exported from `@cs/db`.
- **Tools:** `get_rank_settings`, `update_client_rank_settings`, `request_rank_scan`, `get_rank_trend`; `get_geogrid` adds lats/lngs/map and a selected-scan param. `ServiceAreaWrite` (radius 2-40) on `create_client` / `update_client_profile` (MCP schema change).
- **Jobs:** `rank-schedule` (Sun 06:00 UTC), `rank-scan` (`trigger`/`scanId`), `rank-map-refresh`. Route `/files/rank-map/[clientId]`. Env `STADIA_API_KEY` (in `.env.example`; owner adds to `.env`).
- **Enums/versions:** `AGENCY_KINDS` + `rank_scan_skipped`; `CHANGE_TYPES` + `tier_change`; `MOVE_TYPES` + `map_climb`; packs `scoring.version` 3; `MOVES_RULE_VERSION` 3.
- **Phase-11 rebase:** move the `rank-map-refresh` enqueue inside `applyClientProfileChange` after commit (covers both callers); apply `ServiceAreaWrite` to the setup tool input too (setup.ts:214).

## Assumes from other branches
- Phase-11 runs in parallel; overlaps are additive (`AGENCY_KINDS`, `NotifyInput.subjectType`, `QueueJob`, tools registries/tests, worker `main.ts`/`deps.ts`, `turbo.json`, demo seed, `e2e-affected-rules.ts`, inbox labels) except the profile-write hook above.

## Decisions (owner-approved)
1. Develop 13b in parallel with phase-11 in its own worktree (owner 2026-10-17); not on `main`.
2. Spec D1-D9 and plan P1-P15 as approved; proposed copy in the plan is approved with it.
3. **D7 amended:** map provider = Stadia Maps cacheable static (`alidade_smooth`, Starter $20/mo, ~$0.06/image), not MapTiler (terms forbid server cache/proxy). Centre + integer zoom framing (`fitStaticMap`).
Execution rulings:
- `requested_by` is text (Better Auth ids are strings) via 0069; 0067 never edited.
- 0068 backfill is a grouped derived table (LATERAL-on-UPDATE-target is invalid SQL).
- `tier_change` bumps packs `scoring.version` 2 to 3 only (pack version stays 3); `MOVES_RULE_VERSION` 2 to 3 with `map_climb`.
- A queued manual scan row is re-claimed by the worker if `running`, or `failed` + manual + no snapshots; unique violation returns null; adopt never overwrites `trigger`/`requested_by`.
- `map_climb` keeps the spec's 2-adjacent-scan sum; tests build events directly.
- Demo `rank_change`/`tier_change`/`map_climb` rows are seeded from `rankings.ts` after scans exist.
- `tier_change` "no model call" means no `decide` call (embed still runs).
- `ServiceAreaWrite` 2-40 applies even though legacy 41-80 radii fail resubmission (cs_dev has none).
- Reviews trend legend is now name-sorted (P15).
- Task 9 ran before Task 8 (serveRankMap needs get_geogrid.map).
- scanRankings keeps its `depth` option inside the prospect override.
- Trend/Compare delta ramp uses derived blue/amber families (brand #F5A524 failed light-end contrast 1.99:1).
- Compare also refuses when the two scans' grid points differ (centre moved; settings key has no centre).

## New backlog (target → item)
- **Soon:** SINGLE_SHOT 3h expiry on a long Sunday fan-out (pre-existing); Compare limited to newest 12 scans; orphaned `rank-map/{id}/{oldHash}.png` on hash change; Stadia probe (confirm `STATIC_MAP_WORLD_PX=512`, @2x size, max size, add fixture); failed map fetches ledgered at full $0.06; `request_rank_scan` stale sweep covers all tenants; `request_rank_scan` has no DataForSEO-configured signal in `ToolDeps`, so an unconfigured worker leaves a manual row `running` until the 3 h stale sweep.
- **Polish (data/logic):** `get_geogrid` map non-null for a zero-snapshot scan; trend cursor lacks id tiebreak; tier_change factors report unused weights; `block_key` dates like 02-30 roll over; demo `rank_change` ignores `diffRankScan` thresholds; `get_rank_settings` returns raw legacy radius; watch client components importing `@cs/engine` (node:crypto in barrel).
- **Polish (UI):** Task 14 cap fallback copy lacks client name/amount; weekly fallback date uses UTC; `queued` sticks "Scan running..." until navigation; cap/daily notes not `aria-describedby`; slider debounce compares stale value; brief thumb snap-back mid-drag; slider vs grid mismatch when `?scan=` is older than 12; ChangeGrid duplicates GeoGrid hatch defs.
- **Polish (tests):** backfill 0068 untested; fitStaticMap centre/y-placement and zoom clamp tests; agency 10/day FOR UPDATE concurrency test; "never logs the key" and failure-ledger tests; trend legend order asserted only via `toContain('You')`; tier_change `failed` status case.
- **Unscheduled:** network-error map fetches ledgered at 0; key redaction on all error paths.

## Owner verification steps
1. Subscribe Stadia Starter, add `STADIA_API_KEY` to `.env`, run the one-image probe (Task 7), confirm map alignment.
2. Run the worker; save rank settings on the cs_dev client; map image appears under the grid with attribution.
3. Scan now on a client near its cap: cap copy shows.
4. Run `signals-weekly` once: a tier change event appears.
5. Sign off undecided copy. Task 13: "Compare needs at least two scans."; "Average map rank · “{kw}”" + subtitle; "Change from the scan of {A} to the scan of {B}."; ChangeGrid aria summary; empty states "No rank history yet." / "No rank data in these scans."; tooltips. Task 14: sheet labels ("Keywords to scan (up to 5)", "Grid", 5×5/7×7, "Radius (km)"); "The scan could not be started. Try again in a few minutes."; cap fallback "This scan would exceed this client's monthly cost cap. …"; "next week" fallback. Fix wave: profile form "Radius must be between 2 and 40 km."
6. Note the reviews trend legend is now name-sorted ("You" no longer first).

## Mark for closure at merge (BACKLOG)
GeoGrid defs/hatch/ragged rows; `get_geogrid` selected scan; `tier_change`; `rank_scan.status` CHECK (that part only); map tiles under the geo-grid (that part only); Legend pinned "You" (that part only).
