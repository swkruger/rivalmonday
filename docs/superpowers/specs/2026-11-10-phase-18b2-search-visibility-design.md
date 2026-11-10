# Phase 18b-2 — Google search & AI answers visibility (design)

**Date:** 2026-11-10 · **Branch:** `phase-18b` (after 18b-1) · **Brief:** `docs/work/phase-18b.md` §1 rows D/E, §6 Q4/Q5
**Research:** controller notes (DataForSEO docs: organic task_post / task_get advanced, `ai_overview`, `local_services` items; pricing page).
Core spec §6.1 (structured diffs), §6.2 (rank data is tenant-private), §6.3 (scoring). New decisions and interfaces only.

## Intent
Local owners now ask two questions the map grid can't answer: **"Who shows up on page one of Google for my keywords?"** and **"Does
Google's AI answer mention us, or a rival?"** 18b-2 answers both for the client's own rank keywords, once a week, at the service-area
centre, and shows which businesses Google lists in **Local Services ads** for the same searches.

**Anti-goals:** no event from one volatile scan (two-scan confirm); no cross-client data (tenant-private, like 13b); no fuzzy name
matching that could pin a wrong rival; client text says "Google search" / "AI answer" / "Local Services ads", never the vendor.

## Task 0 result (2026-11-10, live, $0.018)
10 live calls (5 dental keywords SW Austin, 5 HVAC keywords Granbury TX; one failed, no charge): **AI answer on 0 of 9**, **Local Services block on 0 of 9**, organic 8–9 results per page, **$0.002 per call** (AI-answer surcharge refunded when absent). Rulings: E3 applied — **E6 and E8 dropped**, the `load_async_ai_overview` flag is not sent, `serp_snapshot.ai_overview` is dropped; E9 kept as free storage, shown only when present. Backlog: re-probe AI answers quarterly.

## Decisions (owner chose "as recommended" for 18b; controller applied the research recommendations)
| # | Decision |
|---|---|
| E1 | **Keywords & place:** `rankKeywordsFor(client)` (≤ 5) at `client.serviceArea.center`, `location_coordinate "lat,lng,<radius m>"` (radius = `rankRadiusKm` × 1000, clamped 199–199999), desktop, depth **10** (page one only). |
| E2 | **Runs inside the weekly rank scan** (Sun 06:00 UTC `rank-scan` job and "Scan now"), after the map grid, via the **live** organic advanced endpoint (`/serp/google/organic/live/advanced`) — no new queue, no vendor_task schema change. One call per keyword (no AI-answer flag, Task 0). A failed keyword is skipped and counted; it never fails the map scan. Same cap/budget path: `estimateRankScanUsd` adds the search cost. |
| E3 | **Task 0 probe (≤ $0.05):** sandbox shape, then live for the 5 keywords of 1–2 cs_dev clients. Record AI-answer presence rate, live price per call, and the Local Services block title. **If AI answers appear on < 30 % of keyword runs, AI-answer events (E6) and the scorecard column (E8) are dropped** (ruling, no stop); organic and Local Services still ship. |
| E4 | **Storage:** new tenant-private table `serp_snapshot` (one row per scan × keyword) linked to `rank_scan`; raw JSON → evidence via `recordVendorCapture` (`source 'google_search'`, filed under the client's self competitor as 13b does). |
| E5 | **Organic events:** reuse `rank_change` with `details.surface 'organic'`, `blockKey 'serp:<keyword>'`, one change per rival (domain match only — `competitorMatcher` domain branch). Emitted when a rival **enters** or **leaves** page one, confirmed by the two newest scans agreeing and differing from the scan before them. Moves within page one are not events. |
| E6 | **AI-answer events:** reuse `rank_change` with `details.surface 'ai_overview'`, `blockKey 'serp_ai:<keyword>'`: a rival **newly cited** / **no longer cited**, same two-scan confirm, and only when both confirming scans loaded an AI answer (`present`), or both showed none. No new change type, no pack bump. |
| E7 | **Scoring:** for `rank_change` with `surface` organic/ai_overview, size = **1** for entered/cited and the pack default (0.6) for left/dropped. With hvac weights (0.5) a confirmed entry/citation scores ≈ 50 (brief), a drop ≈ 30 (archive). Never alert. Map rank changes unchanged. |
| E8 | **Scorecard row metric `aiCited`:** number of the client's rank keywords whose latest AI answer cites that business (you and each rival; matched by domain). `null` when the business has no domain or no scan with an AI answer loaded yet. Label **"Cited in AI answers"**. Rows only. |
| E9 | **Local Services ads: read-side only.** Store the block (`title`, provider names, rating, votes); show per keyword "Local Services ads shown: <names as Google shows them>" on the Rankings page. No matching to competitors, no events, no badge (no reliable id; matching would guess). |
| E10 | **One web read tool** `get_search_visibility` (tenant-private, `ISOLATION_FIXTURES` entry, `not_found` for an out-of-scope client) feeding a new **"Google search"** section on the client Rankings page and Friday/MCP. |

## Interfaces (binding)
**Task 0 override:** omit every AI-answer field, event, flag, copy string and scorecard column below (`aiOverview`, `aiAnswer`, `surface 'ai_overview'`, `cited`/`dropped`, "Cited in AI answers"). Organic and Local Services parts stand.


### Migration `serp_snapshot` (next free number)
```sql
CREATE TABLE serp_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL, client_id uuid NOT NULL,
  scan_id uuid NOT NULL REFERENCES rank_scan(id) ON DELETE CASCADE,
  keyword text NOT NULL,
  capture_id uuid REFERENCES capture(id),
  captured_at timestamptz NOT NULL,
  organic jsonb NOT NULL,          -- [{ rank, domain, url, title }] top 10
  local_services jsonb,            -- { title, providers: [{ name, rating, votes }] } | null
  CONSTRAINT serp_snapshot_scan_keyword_unique UNIQUE (scan_id, keyword),
  FOREIGN KEY (client_id, agency_id) REFERENCES client(id, agency_id) ON DELETE CASCADE
);
CREATE INDEX serp_snapshot_client_keyword_idx ON serp_snapshot (client_id, keyword, captured_at DESC);
-- RLS/grants: identical to rank_snapshot (tenant_client).
```
`TABLE_CLASS serp_snapshot: 'tenant_client'` + isolation-world rows (one per world client). Copy the composite FK form from `rank_scan`.

### Collector (`packages/collectors/src/rankings/serp.ts`, new)
- `serpSearch(dfs: DataForSeoClient, q: { keyword: string; lat: number; lng: number; radiusM: number }, scope: CallScope): Promise<SerpResult>`
- `parseSerp(raw: unknown): SerpResult` (pure):
  ```ts
  export interface SerpResult { organic: { rank: number; domain: string | null; url: string | null; title: string | null }[];
    aiOverview: { present: boolean; references: { domain: string | null; url: string | null; title: string | null }[] } | null;
    localServices: { title: string | null; providers: { name: string; rating: number | null; votes: number | null }[] } | null }
  ```
  `organic` = `type 'organic'` items, rank = `rank_group`, ≤ 10. `aiOverview`: the `ai_overview` item → present true with top-level `references`; no item while `load_async_ai_overview` was sent → `{ present: false, references: [] }`. `localServices`: the `local_services` item (`items[].title` → name).
- `SERP_CALL_USD` = Task 0 measured live price (with the AI-answer flag); `estimateRankScanUsd` adds `keywords × SERP_CALL_USD`.
- `scanRankings` (`rankings/scan.ts`): after the grid loop, one `serpSearch` per keyword → `recordVendorCapture` + `serp_snapshot` insert. A failed keyword is logged and has no snapshot row (no new column); `rank_scan.failed` stays map-only and the scan's status depends on the map grid only.

### Differ (`packages/engine/src/structured/serp.ts`, new)
- `diffSerp(tx, scanId): StructuredChange[]` called from `diffRankScan` (same stage `rank_diff`, bump `RANK_DIFF_VERSION` only if needed for re-runs — prefer not).
- Series = the client's last 3 done scans with the same `rankSettingsKey` that have a `serp_snapshot` for the keyword; < 3 → nothing.
- Organic per rival (domain): `inTop10(scan)`; event when `s0 == s1 != s2`. AI answer per rival: `cited(scan)` only over scans with `ai_overview.present` known; same rule; skip when either confirming scan has `ai_overview` null.
- Details: `{ changeType: 'rank_change', surface: 'organic' | 'ai_overview', keyword, direction: 'entered' | 'left' | 'cited' | 'dropped', position?: number }`, `competitorId` on the change; `rankScanId` set; supersede via `supersedePriorChanges` as 13b.

### Scoring (`score/score.ts`)
`sizeFactor`: `rank_change` with `details.surface` in (organic, ai_overview) → 1 for entered/cited, `s.default` otherwise.

### Tool `get_search_visibility` (`packages/tools/src/tools/rankings.ts`)
Input `{ clientId }`. Output per keyword: `{ keyword, scannedAt, organic: [{ rank, name, domain, self, competitorId | null }], aiAnswer: { shown: boolean | null, cited: [{ name, domain, self, competitorId | null }] }, localServicesAds: { names: string[] } | null }`; names from tracked competitors / the client when the domain matches, else the result title. Channels web/mcp/ask; feature `dashboard`; `ISOLATION_FIXTURES` entry.

### Copy (decided; to `pnpm copy:review`)
- Summaries: `Now on page one of Google for "<keyword>" (position <n>)` · `Dropped off page one of Google for "<keyword>"` · `Cited in Google's AI answer for "<keyword>"` · `No longer cited in Google's AI answer for "<keyword>"`.
- Rankings section title **"Google search"**; sub-line "Page one for your keywords at your service-area centre, checked every Sunday." Column/labels: "Position", "Cited in AI answer", "Local Services ads shown". Empty: "No search results yet. They appear after the next weekly scan." AI answer not shown: "Google showed no AI answer for this search."
- Scorecard column **"Cited in AI answers"** (email short header "AI").
- Help: one section in the Rankings guide (`docs/help/pages/client.rankings*.md`) explaining the three blocks; no vendor.

## Cost
5 × $0.002 = **$0.01 per client per week** (measured). Scan now (≤ 1/client/7 d) adds the same.

## Left to the builder
Exact parse of live item fields (Task 0), web layout inside the existing design system (section, table, `NumberMarker` not used), test fixtures.

## Out / backlog
Organic grid (multiple points), depth 20, LSA matching/events/badge, news, Q&A, Tripadvisor/Trustpilot.
