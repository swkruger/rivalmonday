# Phase 5c-2 — Client Workspace Data Views (Pricing, Ads, Reviews & Reputation, Local Rankings, Responsive Shell) Implementation Plan

> **Status: done 2026-10-09 on branch `phase-5c2-data-views` (HEAD `d39f972`) — merged only with the owner's go-ahead.** The final review and its fix wave are recorded in `docs/HANDOVER.md` §3, and the leftover minors in the roadmap's "Phase 5c-2 carry-over".

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the client workspace of spec §5.2. This plan adds:
- module 4, the **Pricing tracker** (competitor cards plus a price-history chart);
- module 5, the **Ads archive** (creative cards plus the active-ads trend);
- module 6, **Reviews & reputation** (KPIs, a theme heatmap of you vs competitors, rating mix, rating trend, review search);
- module 7, **Local rankings** (a geo-grid heatmap per keyword and business, plus share of voice over time);
- each module's section on the competitor profile, and the eight §8.2 read tools behind them;
- a **responsive app shell** (a drawer below 1024 px), so the app works on phones.

**Architecture:** Same shape as 5c-1. Every read is a registered tool in `@cs/tools`, with `permission: 'read'` and `feature: 'dashboard'`. New screens are server components under `apps/web/src/app/(app)/c/[clientId]/`. Charts are hand-written inline SVG: the existing `LineChart`, plus two new components (`ThemeHeatmap`, `GeoGrid`). The engine already holds most of the logic (`priceMatrix`, `priceHistory`, `dailySeries`, `reviewBenchmark`, `themesForVertical`, `competitorMatcher`, `NOT_FOUND_RANK`), so the tools are access-checked wrappers. **No migration** and **no new library** (the drawer is a new shadcn-style `Sheet` in `@cs/ui`, built on the `radix-ui` package `@cs/ui` already depends on).

**Tech Stack:** Next.js 16.3 App Router (server components), React 19.3, Tailwind CSS 4 + shadcn/ui (`@cs/ui`), Drizzle 0.44 / postgres.js, Zod 4, Vitest 3 + Testing Library + jsdom, Playwright Test 1.63.

**Spec:** [docs/superpowers/specs/2026-09-29-core-platform-design.md](../specs/2026-09-29-core-platform-design.md). Sections used:
- §3 per-client flags (`dashboard`);
- §4.3 global vs tenant data (`rank_snapshot` is tenant-scoped: keywords reveal client strategy);
- §4.5 privacy (reviewer identities never shown);
- §5.2 modules 2 and 4–7;
- §6.5 review themes and benchmark;
- §6.6 price normalisation;
- §8.2 tools `get_price_matrix`, `get_price_history`, `list_ads`, `get_theme_benchmark`, `search_reviews`, `get_rating_trend`, `get_geogrid`, `get_share_of_voice`;
- §11 (no cross-tenant existence leaks).

Obligations and previous plans:
- Owner scope: the [5c-1 plan](2026-10-08-phase-5c1-client-workspace-core.md)'s "Phase 5 position" table (5c-2 row).
- Carry-over: the [roadmap](2026-09-29-roadmap.md)'s "Phase 5c-1 carry-over": the responsive/collapsible app shell (owner: in), and the minors in files this plan touches (`LineChart`, competitor profile).
- Patterns: the 5c-1 plan, which this plan follows step for step. Its Global Constraints are repeated below.
- Design: [docs/brand/mockups/03-reviews-reputation.html](../../brand/mockups/03-reviews-reputation.html) for module 6. Modules 4, 5 and 7 have no mockup; their layouts are the ones the owner approved in the 2026-10-08 brainstorm (decisions 2–9 below).

---

## Phase 5 position

| Sub-phase | Delivers |
|---|---|
| 5a ✅ | App foundation, auth, delivery routes |
| 5b-1 ✅ | Agency workflow core |
| 5b-2 ✅ | Agency operations |
| 5c-1 ✅ | Workspace read tools; Overview; Changes + evidence viewer; Moves; Competitor profile & timeline; settings |
| **5c-2 (this plan)** | Pricing tracker, Ads archive, Reviews & reputation, Local rankings (modules 4–7) and their 8 tools; their competitor-profile sections; their nav items; the responsive app shell |

After 5c-2 merges, Phase 5 is complete. The combined end-of-Phase-5 owner verification runs next (HANDOVER §5 item 2).

## Global Constraints

- Node 24 locally, pnpm 10, Turborepo 2.11.5. Before changing `turbo.json`, read `node_modules/turbo/docs/README.md` (repo `AGENTS.md` rule). This plan does not change `turbo.json`.
- Before writing Next.js code, read the bundled docs in `apps/web/node_modules/next/dist/docs/` for the API you touch (`apps/web/AGENTS.md`). Next 16: `params` and `searchParams` are **async**.
- Every new read is a **registered tool** in `@cs/tools`: `defineTool`, with its array added to `src/tools/all.ts`. Pages read with `callTool` (or `tryCallTool` when a stale id in the URL should degrade instead of 404). Never call an engine function from `apps/web`.
- Tool output dates are ISO strings. Tool names match `/^[a-z][a-z0-9_]{1,63}$/`. Id inputs are `z.string().uuid()`. The "business" input is `'self'` or a competitor uuid (`BusinessKey`, Task 1).
- Error codes:
  - a row that exists but is not the caller's → `ToolError('not_found')`;
  - the caller's own role or flag is wrong → `permission_denied` (the registry does this from `permission`/`feature`);
  - bad input the user can fix → `invalid_input` with a human sentence.
  - Pages turn all three into **404** (spec §11).
- **Global tables** (`price_point`, `ad`, `review`, `review_analysis`, `observation`, `competitor`, `capture`) may be read with the **service** Db, but **only after** an RLS-backed check proved the client may see that competitor:
  - `workspaceClient` (the client row through RLS; its `selfCompetitorId` admits the self business);
  - then `requireTracked` or `workspaceBusinesses` (Task 1).
  - Engine functions that take a `Db` (`priceMatrix`, `priceHistory`, `reviewBenchmark`, `themesForVertical`) get `deps.service`, and only after `workspaceClient`.
- **Tenant tables** `rank_scan` and `rank_snapshot` are read **only** through `withTenant(deps.app, ctx, …)` — never with the service Db (Review Focus 1). Both have RLS select policies (migrations `0010`, `0018`).
- **"No data" is never zero** (Review Focus 3):
  - a price series is `null` before the first sighting;
  - a geo-grid point that failed in the scan is `null` ("no data"), and 21 (`NOT_FOUND_RANK`) means "not in the top 20";
  - a theme share is `null` when the theme was never asked;
  - a month with no reviews has `avgRating: null`.
- Reviewer identity (`reviewer_hash`) never leaves the tools. Review text is shown **as published** (owner decision 6). `upsell_tag` is untouched by this plan.
- **No crawling and no paid calls.** Nothing in this plan enqueues a job or calls a vendor.
- Brand: Inter; primary `#47A8E7`, secondary `#2A6BAC`, accent `#F5A524`, ink `#0B2540`, canvas `#F6F9FC`, muted surface `#EEF2F6`.
  - Cards: `rounded-[14px] bg-surface p-6 shadow-card`, or `@cs/ui` `Card`.
  - Page titles: `text-[26px] font-extrabold tracking-tight`.
  - Links: `font-semibold text-primary-soft-text`.
  - KPI numbers: `text-[34px] font-extrabold text-secondary` (use `StatCard`).
  - Status pills: alert `bg-[#FEE2E2] text-[#B91C1C]`; brief `bg-[#FFF3DC] text-[#B45309]`; up `bg-[#DCFCE7] text-[#15803D]`; info `bg-primary-soft text-primary-soft-text`.
- **Chart colours.** Line series keep 5c-1's slots (`SERIES_COLORS`, `OTHER_COLOR` in `line-chart.tsx`). The two new scales were validated with the dataviz skill's `validate_palette.js` on 2026-10-08 (light surface `#ffffff`); see decision 12. Cells always print their value, so colour is never the only signal. Every chart has a legend, an `aria-label` summary and a "Show as table" view.
- New nav items go in `apps/web/src/components/shell/nav-items.ts` (`clientModules`, at the `// 5c-2` marker), in the `ICONS` map in `sidebar-nav.tsx`, **and** in the exact href lists of `apps/web/src/server/nav.test.ts` (three lists: agency at ~line 19, owner at ~line 28, groups at ~line 35). Each page's task adds its own item, in this order: Pricing, Ads, Reviews, Local rankings, between Changes and Moves. All four need `flags.dashboard`.
- Filters on read pages are plain `GET` forms and links (no client JS). Native `<select>`.
- Never import `@cs/email` (root) or `@cs/tools` (runtime values) from a `'use client'` file. `import type` from `@cs/tools` is fine.
- LF line endings only. Commit trailer: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` (subagents may name their own model). Never stage `.env`, `.claude/`, `App/`, `.superpowers/`.
- Test runs:
  - Focused: `pnpm --filter <pkg> exec vitest run <pattern>`, in the foreground with `timeout: 600000`.
  - Never start two test runs at once (they share `cs_test`).
  - Never hand back while a test run you started is still running.
  - Before E2E, check free commit memory (HANDOVER §6, `Get-CimInstance Win32_OperatingSystem` → `FreeVirtualMemory` ≥ ~8 GB).
- Implementer hygiene (5c-1 lessons): keep file writes moderate and commit as soon as the task's tests pass. After an API timeout, check `git status` before redoing anything. After editing a file, grep for the edit (a CRLF working copy can make a replace miss silently).

## Review Focus

1. **Rank data of another client or agency.** `get_geogrid` and `get_share_of_voice` must read `rank_scan`/`rank_snapshot` only through `withTenant`. A `scanId` of another client of the same agency, or of another agency, gives `not_found`. Client A2's scans never show up in A1's scan list. Tests: Tasks 13, 14.
2. **An untracked or removed competitor.** These give `not_found` and the competitor is absent from every list: `competitorId` (or `business`) in `get_price_matrix`, `get_price_history`, `list_ads`, `search_reviews` and `get_geogrid`. The removed competitor's prices, ads and reviews disappear from the module pages. `business: 'self'` without a self business gives `not_found` with "Your business is not set up yet". Tests: Tasks 1, 2, 3, 6, 10, 13.
3. **"No data" drawn as zero.**
   - A price series before its first sighting must be `null`, and the chart leaves a gap.
   - A failed grid point must be `null` (hatched cell, "no data") — not 21 and not 0.
   - A theme never asked has share `null` and a "—" cell.
   - A month with no reviews has `avgRating: null`.
   - Share of voice for a scan with no top-3 results must be `null` for every series, not 0 %.

   Tests: Tasks 3, 9, 11, 13, 14, 15.
4. **A client user without `dashboard`.** All eight tools give `permission_denied`, and all four pages 404. Agency roles always pass. Tests: every tool task; E2E Task 19 checks the nav for an owner with the flag.
5. **Phone width.** At 390 px no page (Overview, Pricing, Ads, Reviews, Local rankings, competitor profile) may scroll horizontally. The drawer opens from the menu button, lists the same items as the sidebar, closes on a link tap and on Escape, and traps focus while open. Tests: Tasks 18, 19.

---

## Decisions

1. **Scope** (owner, 2026-10-08): modules 4–7, their competitor-profile sections and nav items, plus the responsive shell. The volatile-mask unmask UI stays in carry-over (owner). Client users need `dashboard` for every new tool and page; agency roles always pass.
2. **Pricing tracker layout** (owner): **one card per tracked competitor** (name-sorted), not a matrix.
   - Each card lists the services that competitor shows a price for, in pack order. A row shows:
     - the prices (`$89`, `from $79`, `up to $1,200`, `$95/hour`);
     - a `PROMO` pill when the block is an offer;
     - a ▲/▼ change pill against 90 days ago;
     - a "your service" tag when the client offers it.
   - Each row is a link `?service=<id>&competitor=<id>`. The selected service's **history chart** (all tracked competitors with a price for it, `LineChart`, period 90/180/365 days via `?days=`) opens directly under that competitor's card.
   - A competitor with no current price gets a one-line card "No prices seen on its website yet."
   - With no prices at all, the page says: "Prices come from competitor websites. Website monitoring isn't switched on yet, so there's nothing to show." The second sentence is shown only while `webEnv().webMonitoring` is false.
   - There is **no "you" column**: prices from the client's own site are deferred (spec §6.6).
3. **`get_price_matrix`** keeps the matrix shape for MCP/Ask (Phase 6), and the page groups it per competitor.
   - `services`: pack services with at least one current price among the listed competitors, in pack order, each with `offered` (in `client.services`).
   - `rows[].cells`: only services with a price for that competitor. Each price comes from `priceMatrix` (open spans, lowest first). `change` is `{ before, after }` when the lowest **USD** price open 90 days ago and the lowest USD price now both exist and differ, otherwise `null`. Units other than `USD` are shown but never compared.
4. **`get_price_history`**: for one service (`serviceId` must be a pack service, else `invalid_input` "Unknown service"), weekly points ending today for 90/180/365 days (default 90).
   - Each point is the day's lowest USD price (`dailySeries(...).min`), sampled every 7th day counting back from today; `null` while no USD price was shown.
   - Series: tracked competitors (name-sorted) with at least one non-null point; optional `competitorId` limits it to one (`requireTracked`).
   - Labels are `YYYY-MM-DD`.
5. **Ads archive** (owner): **text cards plus a library link — no images** (vendor media URLs expire and would leak viewer requests to Meta/Google).
   - `list_ads` filters: `competitorId`, `platform` (`meta | google`), `status` (`active` default | `ended` | `all`), `offset`, `limit` (1–100, default 50). Ordered active first, then `last_seen_at DESC, id DESC`. `hasMore` paging.
   - `libraryUrl`:
     - Meta → `https://www.facebook.com/ads/library/?id=<externalId>`;
     - Google → `https://adstransparency.google.com/advertiser/<advertiserId>/creative/<externalId>` when `advertiserId` is set, else `null`.
   - Every card says "Targeting not disclosed (US)".
   - The page's trend chart reuses `get_ad_activity` (12 weeks). There is no "you" (the self business has no ads collected).
6. **Review text** (owner): **as published** (it is public), with the reviewer **never** shown — the card says "Google reviewer".
   - `search_reviews` filters:
     - `business` (`'self'` or a tracked competitor);
     - `themeId` (a theme of the client's vertical, from `themesForVertical`, else `invalid_input`);
     - `stars` 1–5;
     - `text` (`ILIKE`, escaped with `escapeLike`);
     - `days` 30/90/365 (default 90, on `posted_at`);
     - `offset`, page size 20.
   - Ordered `posted_at DESC NULLS LAST, id DESC`. Matched themes come from the `review_analysis` row of the client's vertical.
7. **Reviews & reputation page** (mockup 03):
   - KPI cards for the self business: your rating (newest GBP rating), new reviews in 90 days, reviews per month (180-day count ÷ 6, one decimal), and reply rate (share of 90-day reviews with an owner answer).
   - The **theme heatmap**:
     - rows are themes (the vertical's themes in pack order, then approved ones);
     - columns are businesses (you first, then competitors by name);
     - the cell **colour is mention sentiment**, the printed number is the **mention share** (`34%`), plus a small ▲/▼ when `|shareDelta| ≥ 0.05`;
     - a theme with share `null` prints "—" on a white cell.
   - Your rating mix: five horizontal bars (5★ → 1★), counts over all stored reviews of the self business.
   - A rating trend `LineChart`: monthly average stars per business, the last 12 months, `yMax` 5.
   - Then review search (decision 6), 20 per page with "More".
   - Without a self business, the KPIs are replaced by one card: "Add your Google place id on the Profile page to compare your own reviews." The agency sees a link to Profile; client users see the text only.
8. **`get_rating_trend`**: `months` 6 or 12 (default 12), UTC calendar months ending with the current one, labels `YYYY-MM`. Per business (self first, when it has a self row; then tracked by name):
   - `gbpRating` (newest `gbp_profile` observation via `gbpSummary`);
   - `reviews90d`;
   - `perMonth` (reviews posted in the last 180 days ÷ 6, rounded to 1 decimal);
   - `replyRate` (share of the 90-day reviews with `owner_answer`; `null` when there are none);
   - `mix` (counts of 1★…5★ over all stored reviews, index 0 = 1★);
   - `monthly` (`reviews`, `avgRating` per month; `avgRating` is `null` for a month without rated reviews).
   - `get_theme_benchmark` wraps `reviewBenchmark` (90 days vs the previous 90) and lists `themes` once at the top level.
9. **Geo-grid** (owner): a **plain grid, no map**: an N×N square of cells, rows north → south and columns west → east, as `gridPoints` lays them out.
   - Grid shape comes from the scan's own snapshots: the distinct latitudes (desc) and longitudes (asc) across **all** keywords of the scan; `size` = the larger of the two counts. A point with no snapshot for the chosen keyword is `null` (no data).
   - A cell's rank is the chosen business's `rank` in that snapshot's results (`competitorMatcher`), or 21 when absent.
   - Inputs:
     - `keyword`: an unknown keyword falls back to the scan's first keyword (alphabetical), and the output names the keyword used;
     - `business`: `'self'` or a tracked competitor; default self when available, else the first tracked competitor;
     - `scanId`: a done scan of this client, else `not_found`.
   - The self business is matched with the self row's place id/CID/domain, falling back to `client.place_id`; without either there is no `self` option.
   - Summary: `top3` = cells with rank ≤ 3; `points` = cells with data; `avgRank` = mean over cells with data (21 for absent), 1 decimal.
   - `keywordSummaries`: the same three numbers for every keyword of the scan (the profile's rankings section).
   - `scans`: the client's last 12 done scans, newest first.
   - `setup`: `no_keywords` when the client has no keywords or no service area; else `no_scan` when there is no done scan; else `ready`.
10. **Share of voice** (owner): the **share of top-3 local-pack slots**.
    - For one done scan (and optionally one keyword), take every snapshot's results with `rank ≤ 3`. Each slot goes to the first matching business (self first, then tracked by name); unmatched slots are "Other businesses".
    - `share = slots / all top-3 slots`, so all series add up to 100 %. A scan with no top-3 results gives `null` for every series.
    - `get_share_of_voice` returns the last `scans` (1–12, default 6) done scans, oldest → newest. An unknown `keyword` means all keywords (`keyword: null` in the output). Series are keyed `self`, a competitor id, or `other_businesses` (not `other` — that key is `foldSeries`'s), with shares 0–1.
    - The page plots percentages (0–100) with `LineChart`. It shows you plus the four largest (fold rest into "Other"), plus a table of the latest scan.
11. **Local rankings page**:
    - a GET form with a keyword select, a business select and a scan select;
    - the geo-grid with "Top 3 at 22 of 49 points · average rank 6.4", the scan date and "Grid N×N · R km radius" (from `client.service_area.radiusKm`, `null` → omitted);
    - the share-of-voice chart for the same keyword filter ("All keywords" default).
    - Empty states: `no_keywords` → "Rank tracking starts once keywords and a service area are set on the Profile page." `no_scan` → "The first monthly rank scan hasn't run yet."
12. **Colour scales** (validated 2026-10-08; light surface `#ffffff`, ink `#0B2540`):
    - **Heatmap (diverging, sentiment −1…+1)**: blue ↔ red with a grey midpoint. The dataviz method rejects red ↔ green, since that pair fails deuteranopia.
      - `≤ −0.5` `#d03b3b` with white text (4.80:1);
      - `−0.5 < s < −0.15` `#f19c99` with ink (7.36:1);
      - `−0.15 ≤ s ≤ 0.15` `#f0efec` with ink (13.5:1) and a `#E2E8F0` 1 px stroke (the grey is 1.15:1 on white);
      - `0.15 < s < 0.5` `#86b6ef` with ink (7.36:1);
      - `≥ 0.5` `#256abf` with white (5.39:1);
      - share present but sentiment `null` → `#f0efec`;
      - share `null` → white with stroke, text "—".
      - Each arm passed `--ordinal` (monotone L, ≥ 2:1 light end).
    - **Geo-grid (ordinal, darker = better)**: single-hue blue. Green/amber/red failed the validator (red ↔ green ΔE 4.1 deutan).
      - rank 1–3 `#0d366b` with white text;
      - 4–10 `#256abf` with white text (5.39:1);
      - 11–20 `#86b6ef` with ink (7.36:1);
      - not in top 20 (21) `#f0efec` with ink and the text "20+";
      - no data: white with a 45° hatch (`#CBD5E1` lines) and the text "–", `<title>` "No data for this point".
      - The ramp `#86b6ef,#256abf,#0d366b` passed `--ordinal`.
    - Cells have a 2 px white gap. A cell hover `<title>` gives the full sentence ("Smith HVAC: rank 4 for ac repair at 32.10, −97.20").
13. **Competitor profile sections** (replacing the 5c-1 placeholder comment), in a `grid gap-4 lg:grid-cols-2`:
    - **Prices**: up to 5 of its current prices (decision 2 formatting), with "See pricing" linking to `pricing?competitor=<id>`.
    - **Ads**: the active count per platform (already in the KPI row) plus its newest 3 active ads (`list_ads` `limit: 3`), with "See ads" linking to `ads?competitor=<id>`.
    - **Reviews**: its rating and 90-day count, and its 3 themes with the highest share, each next to your share for the same theme (from `get_theme_benchmark`), with "See reviews".
    - **Local rankings**: one line per keyword from `get_geogrid({ business: competitorId }).keywordSummaries` ("ac repair — top 3 at 12 of 49 · avg 7.2"), each linking to `rankings?keyword=…&business=<id>`. With `setup !== 'ready'` the section shows that state's sentence.
14. **Responsive shell** (owner: drawer below 1024 px).
    - At `lg` (≥ 1024 px) nothing changes.
    - Below it: the `<aside>` is `hidden lg:flex`, and the top bar gets a menu button (`lg:hidden`, `aria-label="Open menu"`). The button opens a left `Sheet` (new `@cs/ui` component on `radix-ui` Dialog) holding the logo/wordmark and the same `SidebarNav`.
    - It closes on a pathname change (link tap), Escape or a backdrop tap. Radix traps focus and restores it to the button.
    - Main and top-bar padding become `px-4 lg:px-7`. Wide tables sit in `overflow-x-auto` wrappers. The 390 px E2E `test.fixme` is enabled and extended to the new pages.
15. **`LineChart` additions** (Task 4), backwards compatible:
    - `formatValue?: (v: number) => string` for ticks, tooltips and the table (default: today's output);
    - `yMax?: number` (fixed axis top, e.g. 5 stars);
    - `period?: 'week' | 'month' | 'scan'` (default `'week'`), which sets the label format (`YYYY-MM` → "Oct 2026" for `month`) and the words "Week of" / "Month" / "Scan of".
    - Plus the carried minors: table `<caption>` and `scope`, `localeCompare(…, 'en')`, points beyond `labels.length` ignored, and `foldSeries` tie/all-null/null-Other tests.
16. **Not in 5c-2:**
    - the volatile-mask unmask UI;
    - ad images;
    - prices from the client's own website;
    - map tiles under the geo-grid;
    - a dark chart theme;
    - Ask/`search`/`fetch` (Phase 6);
    - the other roadmap carry-over items not listed in Task 4/17.

## File structure

**`packages/tools/src/`**
- `workspace/scope.ts` — modify: `WorkspaceClient` gains `placeId`, `keywords`, `radiusKm` (Task 1).
- `workspace/business.ts` + `business.test.ts` — create: `Business`, `workspaceBusinesses`, `pickBusiness` (Task 1).
- `tools/workspace-fixtures.ts` — modify: `seedSelf`, `seedPrice`, `seedReview`, `seedRankScan`, `gridSnapshots` (Task 1).
- `tools/schemas.ts` — modify: the 5c-2 views (each tool task adds its own).
- `tools/pricing.ts` + `pricing.test.ts` — create: `get_price_matrix`, `get_price_history` (Tasks 2, 3).
- `tools/ads.ts` + `ads.test.ts` — create: `list_ads` (Task 6).
- `tools/reputation.ts` + `reputation.test.ts` — create: `get_theme_benchmark`, `get_rating_trend`, `search_reviews` (Tasks 8–10).
- `tools/rankings.ts` + `rankings.test.ts` — create: `get_geogrid`, `get_share_of_voice` (Tasks 13, 14).
- `tools/all.ts` — modify: append `pricingTools`, `adTools`, `reputationTools`, `rankingTools`.

**`apps/web/src/`**
- `components/charts/line-chart.tsx` + test — modify (Task 4).
- `components/charts/theme-heatmap.tsx` + test — create (Task 11).
- `components/charts/geo-grid.tsx` + test — create (Task 15).
- `components/shell/mobile-nav.tsx` + test — create; `sidebar.tsx`, `top-bar.tsx`, `app/(app)/layout.tsx` — modify (Task 18).
- `components/shell/nav-items.ts`, `sidebar-nav.tsx`, `server/nav.test.ts` — modify (Tasks 5, 7, 12, 16).
- `app/(app)/c/[clientId]/pricing/` — `page.tsx`, `format.ts` + test, `price-card.tsx` + test (Task 5).
- `app/(app)/c/[clientId]/ads/` — `page.tsx`, `ad-card.tsx` + test (Task 7).
- `app/(app)/c/[clientId]/reviews/` — `page.tsx`, `review-item.tsx` + test, `rating-mix.tsx` + test (Task 12).
- `app/(app)/c/[clientId]/rankings/` — `page.tsx` (Task 16).
- `app/(app)/c/[clientId]/competitors/[competitorId]/` — `sections.tsx` + test, `page.tsx` modify (Task 17).

**`packages/ui/src/`** — `components/sheet.tsx` create, `index.ts` modify (Task 18).

**`apps/web/e2e/`** — `seed.ts` modify, `data-views.spec.ts` create, `workspace.spec.ts` modify (Task 19).

**Task order and dependencies.**
- Task 1 comes first.
- Tool tasks precede their page.
- Task 4 (`LineChart`) precedes Tasks 5, 7, 12 and 16.
- Task 17 needs Tasks 2, 6, 8 and 13.
- Task 18 is independent of 2–17 but runs after them, so the 390 px checks cover the new pages.
- Task 19 is last.

---

### Task 1: Business list, workspace fields and fixture seeders

**Files:**
- Modify: `packages/tools/src/workspace/scope.ts` (`WorkspaceClient`, `workspaceClient`)
- Create: `packages/tools/src/workspace/business.ts`, `packages/tools/src/workspace/business.test.ts`
- Modify: `packages/tools/src/tools/workspace-fixtures.ts`
- Modify: `packages/tools/src/tools/schemas.ts` (add `BusinessKey`)

**Interfaces:**
- Consumes: `workspaceClient`, `withTenant`, `competitor`/`clientCompetitor` tables, `ToolError`.
- Produces:
  - `WorkspaceClient` gains `placeId: string | null`, `keywords: string[]`, `radiusKm: number | null`.
  - `interface Business { key: string; competitorId: string | null; name: string; self: boolean; placeId: string | null; cid: string | null; domain: string | null }` — `key` is `'self'` or the competitor id.
  - `workspaceBusinesses(deps: ToolDeps, ctx: AccessContext, c: WorkspaceClient): Promise<Business[]>` — the self business first (when the client has a self row or a place id), then tracked competitors by name.
  - `pickBusiness(list: Business[], key: string): Business` — throws `not_found`.
  - `BusinessKey` zod schema in `schemas.ts`: `z.union([z.literal('self'), z.string().uuid()])`.
  - Fixtures: `seedSelf`, `setPlace`, `seedPrice`, `seedReview`, `gridSnapshots`, `rr`, `seedRankScan` (signatures below).

- [ ] **Step 1: Write the failing test** — `packages/tools/src/workspace/business.test.ts`:

```ts
import { client } from '@cs/db';
import { IDS } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ToolDeps } from '../deps';
import { ctx, dbs, resetWorkspace, seedSelf, setPlace } from '../tools/workspace-fixtures';
import { pickBusiness, workspaceBusinesses } from './business';
import { workspaceClient } from './scope';

const deps: ToolDeps = { app: dbs.app, service: dbs.service };
const am = ctx('account_manager', 'all');

beforeEach(resetWorkspace);

describe('workspaceBusinesses', () => {
  it('puts the self business first, then tracked competitors, with their match keys', async () => {
    const selfId = await seedSelf({ placeId: 'self-place' });
    await setPlace(IDS.competitorX, 'px');
    const c = await workspaceClient(deps, am, IDS.clientA1);
    const list = await workspaceBusinesses(deps, am, c);
    expect(list.map((b) => [b.key, b.competitorId, b.name, b.self, b.placeId])).toEqual([
      ['self', selfId, 'A1 HVAC', true, 'self-place'],
      [IDS.competitorX, IDS.competitorX, 'Smith HVAC', false, 'px'],
    ]);
  });

  it('builds a self entry from client.place_id when there is no self row, and none without either', async () => {
    await dbs.owner.update(client).set({ placeId: 'client-place' }).where(eq(client.id, IDS.clientA1));
    let c = await workspaceClient(deps, am, IDS.clientA1);
    expect((await workspaceBusinesses(deps, am, c))[0]).toMatchObject({ key: 'self', competitorId: null, placeId: 'client-place', self: true });
    await dbs.owner.update(client).set({ placeId: null }).where(eq(client.id, IDS.clientA1));
    c = await workspaceClient(deps, am, IDS.clientA1);
    expect((await workspaceBusinesses(deps, am, c)).map((b) => b.key)).toEqual([IDS.competitorX]);
  });

  it('exposes keywords and the service-area radius on the workspace client', async () => {
    await dbs.owner.update(client).set({ keywords: ['ac repair'], serviceArea: { center: { lat: 32, lng: -97 }, radiusKm: 25, zips: ['76048'] } }).where(eq(client.id, IDS.clientA1));
    const c = await workspaceClient(deps, am, IDS.clientA1);
    expect([c.keywords, c.radiusKm, c.zips]).toEqual([['ac repair'], 25, 1]);
  });
});

describe('pickBusiness', () => {
  it('refuses an untracked competitor and a missing self business with not_found', async () => {
    const c = await workspaceClient(deps, am, IDS.clientA1);
    const list = await workspaceBusinesses(deps, am, c);
    expect(pickBusiness(list, IDS.competitorX).name).toBe('Smith HVAC');
    expect(() => pickBusiness(list, IDS.competitorY)).toThrow(expect.objectContaining({ code: 'not_found' }));
    expect(() => pickBusiness(list, 'self')).toThrow(expect.objectContaining({ code: 'not_found', message: 'Your business is not set up yet' }));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @cs/tools exec vitest run src/workspace/business.test.ts` (timeout 600000)
Expected: FAIL — `./business` and the fixtures `seedSelf`/`setPlace` don't exist.

- [ ] **Step 3: Extend `workspaceClient`** in `packages/tools/src/workspace/scope.ts`:
  - Add the three fields to the interface:

```ts
export interface WorkspaceClient {
  id: string;
  name: string;
  verticalId: string;
  services: string[];
  zips: number;
  selfCompetitorId: string | null;
  /** 5c-2: the client's own Google place id (the self business falls back to it for rank matching). */
  placeId: string | null;
  /** 5c-2: rank-scan keywords. */
  keywords: string[];
  /** 5c-2: service-area radius; null when no service area is set. */
  radiusKm: number | null;
}
```

  - Add `placeId: client.placeId, keywords: client.keywords` to the `select`, and return `placeId: c.placeId, keywords: c.keywords ?? [], radiusKm: c.serviceArea?.radiusKm ?? null` alongside the existing fields.

- [ ] **Step 4: Create `packages/tools/src/workspace/business.ts`:**

```ts
import { type AccessContext, ToolError } from '@cs/core';
import { clientCompetitor, competitor, withTenant } from '@cs/db';
import { asc, eq } from 'drizzle-orm';
import type { ToolDeps } from '../deps';
import type { WorkspaceClient } from './scope';

/** A business a 5c-2 module compares: the client's own (`key: 'self'`) or a tracked competitor (`key` = its id). */
export interface Business {
  key: string;
  /** null only for a self business known by `client.place_id` alone (no self row yet — no reviews or GBP data). */
  competitorId: string | null;
  name: string;
  self: boolean;
  placeId: string | null;
  cid: string | null;
  domain: string | null;
}

/**
 * The client's own business first (its self row, or just `client.place_id`), then tracked competitors by name.
 * Tracked rows come through RLS; the self row is a global row admitted by `client.self_competitor_id`, which
 * `workspaceClient` already read through RLS.
 */
export async function workspaceBusinesses(deps: ToolDeps, ctx: AccessContext, c: WorkspaceClient): Promise<Business[]> {
  const cols = { id: competitor.id, name: competitor.name, placeId: competitor.placeId, cid: competitor.cid, domain: competitor.domain };
  const tracked = await withTenant(deps.app, ctx, (tx) =>
    tx.select(cols).from(clientCompetitor).innerJoin(competitor, eq(competitor.id, clientCompetitor.competitorId))
      .where(eq(clientCompetitor.clientId, c.id)).orderBy(asc(competitor.name)));
  let self: Business | null = null;
  if (c.selfCompetitorId) {
    const [s] = await deps.service.select(cols).from(competitor).where(eq(competitor.id, c.selfCompetitorId));
    if (s) self = { key: 'self', competitorId: s.id, name: c.name, self: true, placeId: s.placeId ?? c.placeId, cid: s.cid, domain: s.domain };
  }
  if (!self && c.placeId) self = { key: 'self', competitorId: null, name: c.name, self: true, placeId: c.placeId, cid: null, domain: null };
  const others = tracked.filter((t) => t.id !== c.selfCompetitorId)
    .map((t) => ({ key: t.id, competitorId: t.id, name: t.name, self: false, placeId: t.placeId, cid: t.cid, domain: t.domain }));
  return self ? [self, ...others] : others;
}

/** A `business` input (`'self'` or a competitor id) → its entry; anything else is `not_found` (Review Focus 2). */
export function pickBusiness(list: Business[], key: string): Business {
  const b = list.find((x) => x.key === key);
  if (!b) throw new ToolError('not_found', key === 'self' ? 'Your business is not set up yet' : 'Competitor not found');
  return b;
}
```

  (`competitor.cid` exists — `packages/db/src/schema/tenancy.ts`.)

- [ ] **Step 5: Add `BusinessKey`** at the end of `packages/tools/src/tools/schemas.ts`:

```ts
// 5c-2 data views. A business is the client's own ('self') or a tracked competitor id.
export const BusinessKey = z.union([z.literal('self'), uuid]);
```

- [ ] **Step 6: Add the seeders** to `packages/tools/src/tools/workspace-fixtures.ts`:
  - extend the `@cs/db` import with `client`, `pricePoint`, `type PriceQualifier`, `rankScan`, `rankSnapshot`, `type RankResult`, `review`, `reviewAnalysis`;
  - add `import { randomUUID } from 'node:crypto';`;
  - append:

```ts
/** The client's own business as a global competitor row linked by `client.self_competitor_id` (spec §6.5). Returns its id. */
export async function seedSelf(o: { clientId?: string; name?: string; placeId?: string | null; domain?: string | null } = {}): Promise<string> {
  const [s] = await dbs.owner.insert(competitor).values({ name: o.name ?? 'A1 HVAC', placeId: o.placeId === undefined ? 'self-place' : o.placeId, domain: o.domain ?? null }).returning();
  await dbs.owner.update(client).set({ selfCompetitorId: s!.id }).where(eq(client.id, o.clientId ?? IDS.clientA1));
  return s!.id;
}

/** Sets a competitor's Google place id (rank results match on it). */
export async function setPlace(competitorId: string, placeId: string): Promise<void> {
  await dbs.owner.update(competitor).set({ placeId }).where(eq(competitor.id, competitorId));
}

export interface SeedPriceOptions {
  serviceId: string;
  amount: number;
  /** `first_seen_at`. */
  from: Date;
  /** `ended_at`; omit or null for a price still shown. */
  to?: Date | null;
  /** Default competitor X. */
  competitorId?: string;
  /** Default 'USD'. */
  unit?: string;
  /** Default 'exact'. */
  qualifier?: PriceQualifier;
  promo?: boolean;
  /** Default 'hvac_plumbing'. */
  verticalId?: string;
}

/**
 * A `price_point` span on the competitor's first tracked page, with a capture at `from` (and one at `to` when ended).
 * `price_point_open_unique` forbids two OPEN rows with the same (page, vertical, service, unit, qualifier, amount).
 */
export async function seedPrice(o: SeedPriceOptions): Promise<string> {
  const competitorId = o.competitorId ?? IDS.competitorX;
  const trackedPageId = await pageOf(competitorId);
  const first = await seedCapture({ competitorId, pageId: trackedPageId, at: o.from, kinds: [] });
  const ended = o.to ? await seedCapture({ competitorId, pageId: trackedPageId, at: o.to, kinds: [] }) : null;
  const [p] = await dbs.owner.insert(pricePoint).values({
    competitorId, trackedPageId, verticalId: o.verticalId ?? 'hvac_plumbing', serviceId: o.serviceId, amount: o.amount, unit: o.unit ?? 'USD',
    qualifier: o.qualifier ?? 'exact', promo: o.promo ?? false, raw: `$${o.amount}`, context: `${o.serviceId} $${o.amount}`,
    firstSeenAt: o.from, lastSeenAt: o.to ?? new Date(), firstCaptureId: first.captureId, lastCaptureId: first.captureId,
    endedAt: o.to ?? null, endedCaptureId: ended?.captureId ?? null,
  }).returning();
  return p!.id;
}

export interface SeedReviewOptions {
  /** Default competitor X. */
  competitorId?: string;
  /** Default 5; null for a rating-less review. */
  rating?: number | null;
  /** Default 'Great service'. */
  text?: string | null;
  /** Default now; null for an undated review. */
  postedAt?: Date | null;
  ownerAnswer?: string | null;
  /** Default 'hash-secret' — tests assert it never appears in tool output. */
  reviewerHash?: string;
  /** A `review_analysis` row for `verticalId` (default 'hvac_plumbing'); omit for an unanalysed review. */
  analysis?: { asked: string[]; themes: string[]; sentiment: number | null };
  verticalId?: string;
}

export async function seedReview(o: SeedReviewOptions = {}): Promise<string> {
  const competitorId = o.competitorId ?? IDS.competitorX;
  const [r] = await dbs.owner.insert(review).values({
    competitorId, dedupeKey: randomUUID(), rating: o.rating === undefined ? 5 : o.rating, text: o.text === undefined ? 'Great service' : o.text,
    reviewerHash: o.reviewerHash ?? 'hash-secret', postedAt: o.postedAt === undefined ? new Date() : o.postedAt,
    ownerAnswer: o.ownerAnswer ?? null, ownerAnsweredAt: o.ownerAnswer ? new Date() : null,
  }).returning();
  if (o.analysis) {
    await dbs.owner.insert(reviewAnalysis).values({
      reviewId: r!.id, verticalId: o.verticalId ?? 'hvac_plumbing', competitorId, textSha: 'sha', asked: o.analysis.asked, themes: o.analysis.themes,
      sentiment: o.analysis.sentiment, confidence: 0.9, analysisVersion: 1,
    });
  }
  return r!.id;
}

/** A local-pack result matched by place id. */
export const rr = (rank: number, placeId: string, title: string = placeId): RankResult => ({ rank, placeId, cid: null, domain: null, title });

export interface GridSnapshot {
  keyword: string;
  lat: number;
  lng: number;
  results: RankResult[];
}

/**
 * Snapshots of a size×size grid for one keyword, laid out like `gridPoints`: row r (north → south) is lat 32 − 0.01·r,
 * column c (west → east) is lng −97 + 0.01·c. `results(r, c)` gives that point's local pack, or null for a failed point.
 */
export function gridSnapshots(keyword: string, size: number, results: (row: number, col: number) => RankResult[] | null): GridSnapshot[] {
  const round = (n: number) => Math.round(n * 1e6) / 1e6;
  const out: GridSnapshot[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const res = results(r, c);
      if (res) out.push({ keyword, lat: round(32 - 0.01 * r), lng: round(-97 + 0.01 * c), results: res });
    }
  }
  return out;
}

export interface SeedRankScanOptions {
  finishedAt: Date;
  snapshots: GridSnapshot[];
  /** Default 'done'. */
  status?: 'done' | 'failed' | 'running';
  /** Default agency A / client A1. */
  agencyId?: string;
  clientId?: string;
}

/** A rank scan with its snapshots (tenant rows). Returns the scan id. */
export async function seedRankScan(o: SeedRankScanOptions): Promise<string> {
  const agencyId = o.agencyId ?? IDS.agencyA;
  const clientId = o.clientId ?? IDS.clientA1;
  const status = o.status ?? 'done';
  const [s] = await dbs.owner.insert(rankScan).values({
    agencyId, clientId, status, snapshots: o.snapshots.length, startedAt: o.finishedAt, finishedAt: status === 'running' ? null : o.finishedAt,
  }).returning();
  if (o.snapshots.length) {
    await dbs.owner.insert(rankSnapshot).values(o.snapshots.map((x) => ({ agencyId, clientId, scanId: s!.id, keyword: x.keyword, lat: x.lat, lng: x.lng, results: x.results, capturedAt: o.finishedAt })));
  }
  return s!.id;
}
```

- [ ] **Step 7: Run the test and the existing workspace tests**

Run: `pnpm --filter @cs/tools exec vitest run src/workspace/business.test.ts src/tools/overview.test.ts src/tools/competitor-profile.test.ts` (timeout 600000)
Expected: PASS. Then `pnpm --filter @cs/tools typecheck`: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/tools/src/workspace/scope.ts packages/tools/src/workspace/business.ts packages/tools/src/workspace/business.test.ts packages/tools/src/tools/workspace-fixtures.ts packages/tools/src/tools/schemas.ts
git commit -m "feat(tools): workspace business list and 5c-2 fixture seeders"
```

---

### Task 2: `get_price_matrix`

**Files:**
- Create: `packages/tools/src/tools/pricing.ts`, `packages/tools/src/tools/pricing.test.ts`
- Modify: `packages/tools/src/tools/schemas.ts`, `packages/tools/src/tools/all.ts`

**Interfaces:**
- Consumes: `workspaceClient`, `requireTracked` (`./pages`), `packsOf`, engine `priceMatrix`, `pricePoint`; fixtures `seedPrice`.
- Produces:
  - tool `get_price_matrix` with input `{ clientId, competitorId? }` and output `PriceMatrixView`;
  - exported zod `PriceNowView`, `PriceMatrixView` (+ types);
  - `pricingTools` array (Task 3 appends `getPriceHistory`).

- [ ] **Step 1: Write the failing test** — `packages/tools/src/tools/pricing.test.ts`:

```ts
import { client, clientCompetitor, competitor } from '@cs/db';
import { IDS } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PriceHistoryView, PriceMatrixView } from './schemas';
import { ctx, day, dbs, registry, resetWorkspace, seedPrice } from './workspace-fixtures';

const am = ctx('account_manager', 'all');
const owner = ctx('client_owner', [IDS.clientA1], ['dashboard']);
const ownerNoDash = ctx('client_owner', [IDS.clientA1]);
const otherAgency = ctx('agency_admin', 'all', [], IDS.agencyB);
const ago = (d: number) => new Date(Date.now() - d * day);

beforeEach(resetWorkspace);

describe('get_price_matrix', () => {
  it('lists current prices per tracked competitor with the change against 90 days ago (decision 3)', async () => {
    await dbs.owner.update(client).set({ services: ['ac_tune_up'] }).where(eq(client.id, IDS.clientA1));
    await seedPrice({ serviceId: 'ac_tune_up', amount: 99, from: ago(120), to: ago(30) });
    await seedPrice({ serviceId: 'ac_tune_up', amount: 79, from: ago(30), promo: true });
    await seedPrice({ serviceId: 'furnace_repair', amount: 129, from: ago(10) });
    await seedPrice({ serviceId: 'ac_tune_up', amount: 59, from: ago(5), competitorId: IDS.competitorY }); // A2's competitor
    const r = (await registry.invoke(owner, 'get_price_matrix', { clientId: IDS.clientA1 })) as PriceMatrixView;
    expect(r.services).toEqual([
      { id: 'ac_tune_up', name: 'AC tune-up', offered: true },
      { id: 'furnace_repair', name: 'Furnace repair', offered: false },
    ]);
    expect(r.rows.map((row) => row.name)).toEqual(['Smith HVAC']);
    expect(r.rows[0]!.cells.map((c) => [c.serviceId, c.prices.map((p) => p.amount), c.change])).toEqual([
      ['ac_tune_up', [79], { before: 99, after: 79 }],
      ['furnace_repair', [129], null],
    ]);
    expect(r.rows[0]!.cells[0]!.prices[0]).toMatchObject({ unit: 'USD', qualifier: 'exact', promo: true });
  });

  it('shows non-USD units but never compares them', async () => {
    await seedPrice({ serviceId: 'drain_cleaning', amount: 95, unit: 'USD/hour', qualifier: 'from', from: ago(100) });
    const r = (await registry.invoke(am, 'get_price_matrix', { clientId: IDS.clientA1 })) as PriceMatrixView;
    expect(r.rows[0]!.cells).toEqual([{ serviceId: 'drain_cleaning', prices: [expect.objectContaining({ amount: 95, unit: 'USD/hour', qualifier: 'from' })], change: null }]);
  });

  it('gives a tracked competitor with no prices an empty cell list, and no services at all', async () => {
    const r = (await registry.invoke(am, 'get_price_matrix', { clientId: IDS.clientA1 })) as PriceMatrixView;
    expect(r).toEqual({ services: [], rows: [{ competitorId: IDS.competitorX, name: 'Smith HVAC', cells: [] }] });
  });

  it('filters to one tracked competitor and refuses an untracked one (Review Focus 2)', async () => {
    await seedPrice({ serviceId: 'ac_tune_up', amount: 79, from: ago(3) });
    const r = (await registry.invoke(am, 'get_price_matrix', { clientId: IDS.clientA1, competitorId: IDS.competitorX })) as PriceMatrixView;
    expect(r.rows).toHaveLength(1);
    await expect(registry.invoke(am, 'get_price_matrix', { clientId: IDS.clientA1, competitorId: IDS.competitorY })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('is not found for another agency and needs dashboard for clients (Review Focus 4)', async () => {
    await expect(registry.invoke(otherAgency, 'get_price_matrix', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(ownerNoDash, 'get_price_matrix', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'permission_denied' });
  });
});
```

  (`clientCompetitor`, `competitor` and `PriceHistoryView` are used by Task 3's tests in the same file. If the linter flags them as unused in this task, add them in Task 3 instead.)

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @cs/tools exec vitest run src/tools/pricing.test.ts` (timeout 600000)
Expected: FAIL — `get_price_matrix` is not registered.

- [ ] **Step 3: Add the schemas** to `schemas.ts` (below `BusinessKey`):

```ts
export const PriceNowView = z.object({ amount: z.number(), unit: z.string(), qualifier: z.enum(['exact', 'from', 'up_to']), promo: z.boolean(), since: iso });
export type PriceNowView = z.infer<typeof PriceNowView>;
export const PriceMatrixView = z.object({
  services: z.array(z.object({ id: z.string(), name: z.string(), offered: z.boolean() })),
  rows: z.array(z.object({
    competitorId: uuid, name: z.string(),
    cells: z.array(z.object({ serviceId: z.string(), prices: z.array(PriceNowView), change: z.object({ before: z.number(), after: z.number() }).nullable() })),
  })),
});
export type PriceMatrixView = z.infer<typeof PriceMatrixView>;
```

- [ ] **Step 4: Create `packages/tools/src/tools/pricing.ts`:**

```ts
import { toolkit } from '@cs/core';
import { type Db, pricePoint } from '@cs/db';
import { priceMatrix } from '@cs/engine';
import { and, eq, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { packsOf, type ToolDeps } from '../deps';
import { workspaceClient } from '../workspace/scope';
import { requireTracked } from './pages';
import { PriceMatrixView } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();
const DAY = 86_400_000;
const cellKey = (competitorId: string, serviceId: string) => `${competitorId}|${serviceId}`;

const lowestUsd = (prices: { amount: number; unit: string }[]): number | null => {
  const usd = prices.filter((p) => p.unit === 'USD').map((p) => p.amount);
  return usd.length ? Math.min(...usd) : null;
};

/** Lowest USD price shown at `at` per (competitor, service) — decision 3's "90 days ago" side. */
async function lowestUsdAt(db: Db, competitorIds: string[], verticalId: string, at: Date): Promise<Map<string, number>> {
  if (competitorIds.length === 0) return new Map();
  const rows = await db.select({ competitorId: pricePoint.competitorId, serviceId: pricePoint.serviceId, amount: sql<number>`min(${pricePoint.amount})` })
    .from(pricePoint)
    .where(and(
      inArray(pricePoint.competitorId, competitorIds), eq(pricePoint.verticalId, verticalId), eq(pricePoint.unit, 'USD'),
      lte(pricePoint.firstSeenAt, at), or(isNull(pricePoint.endedAt), gt(pricePoint.endedAt, at)),
    ))
    .groupBy(pricePoint.competitorId, pricePoint.serviceId);
  return new Map(rows.map((r) => [cellKey(r.competitorId, r.serviceId), Number(r.amount)]));
}

export const getPriceMatrix = defineTool({
  name: 'get_price_matrix',
  description: 'Current prices per service for each tracked competitor, with the change against 90 days ago.',
  input: z.object({ clientId: uuid, competitorId: uuid.optional() }),
  output: PriceMatrixView,
  permission: 'read',
  feature: 'dashboard',
  async handler(ctx, input, deps) {
    const c = await workspaceClient(deps, ctx, input.clientId);
    if (input.competitorId) await requireTracked(deps.app, ctx, c.id, input.competitorId);
    // priceMatrix reads client_competitor and the global price_point with the service Db — the client was proved through RLS above.
    const m = await priceMatrix({ db: deps.service, packs: packsOf(deps) }, c.id);
    const rows = input.competitorId ? m.rows.filter((r) => r.competitorId === input.competitorId) : m.rows;
    const then = await lowestUsdAt(deps.service, rows.map((r) => r.competitorId), c.verticalId, new Date(Date.now() - 90 * DAY));
    const shown = new Set(rows.flatMap((r) => Object.keys(r.cells)));
    const services = m.services.filter((s) => shown.has(s.id));
    return {
      services: services.map((s) => ({ ...s, offered: c.services.includes(s.id) })),
      rows: rows.map((r) => ({
        competitorId: r.competitorId,
        name: r.name,
        cells: services.filter((s) => r.cells[s.id]?.length).map((s) => {
          const prices = r.cells[s.id]!;
          const now = lowestUsd(prices);
          const before = then.get(cellKey(r.competitorId, s.id)) ?? null;
          return {
            serviceId: s.id,
            prices: prices.map((p) => ({ amount: p.amount, unit: p.unit, qualifier: p.qualifier, promo: p.promo, since: p.since.toISOString() })),
            change: now !== null && before !== null && now !== before ? { before, after: now } : null,
          };
        }),
      })),
    };
  },
});

export const pricingTools = [getPriceMatrix];
```

  Then append `...pricingTools` to `allTools` in `all.ts` (import `{ pricingTools } from './pricing'`).

- [ ] **Step 5: Run the test**

Run: `pnpm --filter @cs/tools exec vitest run src/tools/pricing.test.ts` (timeout 600000)
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/tools/src/tools/pricing.ts packages/tools/src/tools/pricing.test.ts packages/tools/src/tools/schemas.ts packages/tools/src/tools/all.ts
git commit -m "feat(tools): get_price_matrix"
```

---

### Task 3: `get_price_history`

**Files:**
- Modify: `packages/tools/src/tools/pricing.ts`, `packages/tools/src/tools/pricing.test.ts`, `packages/tools/src/tools/schemas.ts`

**Interfaces:**
- Consumes: Task 1 `workspaceBusinesses`; engine `priceHistory`, `dailySeries`.
- Produces: tool `get_price_history`, with input `{ clientId, serviceId, competitorId?, days: 90 | 180 | 365 = 90 }` and output `PriceHistoryView` = `{ serviceId, serviceName, labels: string[] /* YYYY-MM-DD, oldest → today */, series: { competitorId, name, points: (number | null)[] }[] }`.

- [ ] **Step 1: Write the failing tests** — append to `pricing.test.ts`:

```ts
describe('get_price_history', () => {
  it('samples the day’s lowest USD price weekly up to today, null before the first sighting (decision 4, Review Focus 3)', async () => {
    await seedPrice({ serviceId: 'ac_tune_up', amount: 99, from: ago(60), to: ago(20) });
    await seedPrice({ serviceId: 'ac_tune_up', amount: 79, from: ago(20) });
    const r = (await registry.invoke(owner, 'get_price_history', { clientId: IDS.clientA1, serviceId: 'ac_tune_up' })) as PriceHistoryView;
    expect(r.serviceName).toBe('AC tune-up');
    expect(r.labels).toHaveLength(13); // 91 days, every 7th counting back from today
    expect(r.labels.at(-1)).toBe(new Date().toISOString().slice(0, 10));
    expect(r.series).toHaveLength(1);
    const pts = r.series[0]!.points;
    expect(pts).toHaveLength(13);
    expect(pts[0]).toBeNull();
    expect(pts).toContain(99);
    expect(pts.at(-1)).toBe(79);
  });

  it('sizes the labels by period and leaves out tracked competitors without a price', async () => {
    const [z] = await dbs.owner.insert(competitor).values({ name: 'Zed Air', domain: 'zed.example' }).returning();
    await dbs.owner.insert(clientCompetitor).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: z!.id });
    await seedPrice({ serviceId: 'ac_tune_up', amount: 79, from: ago(2) });
    const r = (await registry.invoke(am, 'get_price_history', { clientId: IDS.clientA1, serviceId: 'ac_tune_up', days: 180 })) as PriceHistoryView;
    expect(r.labels).toHaveLength(26);
    expect(r.series.map((s) => s.name)).toEqual(['Smith HVAC']);
  });

  it('refuses an unknown service and an untracked competitor', async () => {
    await expect(registry.invoke(am, 'get_price_history', { clientId: IDS.clientA1, serviceId: 'nope' })).rejects.toMatchObject({ code: 'invalid_input', message: 'Unknown service' });
    await expect(registry.invoke(am, 'get_price_history', { clientId: IDS.clientA1, serviceId: 'ac_tune_up', competitorId: IDS.competitorY })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(ownerNoDash, 'get_price_history', { clientId: IDS.clientA1, serviceId: 'ac_tune_up' })).rejects.toMatchObject({ code: 'permission_denied' });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @cs/tools exec vitest run src/tools/pricing.test.ts` (timeout 600000)
Expected: FAIL — `get_price_history` is not registered.

- [ ] **Step 3: Add the schema** to `schemas.ts`:

```ts
export const PriceHistoryView = z.object({
  serviceId: z.string(), serviceName: z.string(), labels: z.array(z.string()),
  series: z.array(z.object({ competitorId: uuid, name: z.string(), points: z.array(z.number().nullable()) })),
});
export type PriceHistoryView = z.infer<typeof PriceHistoryView>;
```

- [ ] **Step 4: Implement** in `pricing.ts`:
  - add `ToolError` to the `@cs/core` import;
  - add `dailySeries, priceHistory` to the `@cs/engine` import;
  - import `workspaceBusinesses` from `'../workspace/business'` and `PriceHistoryView` from `./schemas`;
  - add the code below, and change the array to `[getPriceMatrix, getPriceHistory]`:

```ts
/** Every 7th index counting back from the last (today), oldest first. */
const weeklyIndexes = (n: number): number[] => {
  const out: number[] = [];
  for (let i = n - 1; i >= 0; i -= 7) out.unshift(i);
  return out;
};

export const getPriceHistory = defineTool({
  name: 'get_price_history',
  description: 'Weekly lowest price of one service for each tracked competitor; empty (null) before a price was seen.',
  input: z.object({
    clientId: uuid,
    serviceId: z.string().regex(/^[a-z0-9_]{1,64}$/),
    competitorId: uuid.optional(),
    days: z.union([z.literal(90), z.literal(180), z.literal(365)]).default(90),
  }),
  output: PriceHistoryView,
  permission: 'read',
  feature: 'dashboard',
  async handler(ctx, input, deps) {
    const c = await workspaceClient(deps, ctx, input.clientId);
    const pack = await packsOf(deps)(c.verticalId);
    const service = pack.services.find((s) => s.id === input.serviceId);
    if (!service) throw new ToolError('invalid_input', 'Unknown service');
    if (input.competitorId) await requireTracked(deps.app, ctx, c.id, input.competitorId);
    const tracked = (await workspaceBusinesses(deps, ctx, c)).filter((b) => !b.self && (!input.competitorId || b.key === input.competitorId));
    const now = new Date();
    const since = new Date(now.getTime() - input.days * DAY);
    const days = dailySeries([], since, now);
    const idx = weeklyIndexes(days.length);
    const series: PriceHistoryView['series'] = [];
    for (const b of tracked) {
      // Global price_point rows — visibility proved by workspaceBusinesses (RLS).
      const spans = await priceHistory(deps.service, { competitorId: b.competitorId!, verticalId: c.verticalId, serviceId: service.id, since });
      const daily = dailySeries(spans, since, now);
      const points = idx.map((i) => daily[i]!.min);
      if (points.some((p) => p !== null)) series.push({ competitorId: b.competitorId!, name: b.name, points });
    }
    return { serviceId: service.id, serviceName: service.name, labels: idx.map((i) => days[i]!.date), series };
  },
});
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @cs/tools exec vitest run src/tools/pricing.test.ts` (timeout 600000)
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/tools/src/tools/pricing.ts packages/tools/src/tools/pricing.test.ts packages/tools/src/tools/schemas.ts
git commit -m "feat(tools): get_price_history"
```

---

### Task 4: `LineChart` options and carried minors

**Files:**
- Modify: `apps/web/src/components/charts/line-chart.tsx`, `apps/web/src/components/charts/line-chart.test.tsx`

**Interfaces:**
- Produces (decision 15) new optional `LineChart` props, all backwards compatible:
  - `formatValue?: (v: number) => string`;
  - `yMax?: number`;
  - `period?: 'week' | 'month' | 'scan'`.
  - `foldSeries` is unchanged apart from the locale.
  - `LineChart` stays a server-renderable component (no `'use client'`), so function props are fine.

- [ ] **Step 1: Write the failing tests** — append inside the existing top-level `describe` of `line-chart.test.tsx` (it already imports `render`, `screen`, `foldSeries`, `LineChart`; add any that are missing):

```tsx
  it('folds ties alphabetically, ranks an all-null series last, and gives a null Other when the folded rest is empty', () => {
    const s = (name: string, points: (number | null)[]) => ({ key: name, name, points });
    const folded = foldSeries([s('E', [1]), s('D', [1]), s('C', [5]), s('B', [null]), s('A', [5]), s('F', [null])]);
    expect(folded.map((x) => x.name)).toEqual(['A', 'C', 'D', 'E', 'Other']);
    expect(folded.at(-1)!.points).toEqual([null]);
  });

  it('formats values, fixes the axis top and labels months (decision 15)', () => {
    render(
      <LineChart
        title="Rating trend"
        labels={['2026-09', '2026-10']}
        series={[{ key: 'a', name: 'You', points: [4.5, 4.75] }]}
        valueLabel="stars"
        yMax={5}
        period="month"
        formatValue={(v) => v.toFixed(1)}
      />,
    );
    expect(screen.getByText('5.0')).toBeTruthy(); // the axis top
    expect(screen.getByText('2.5')).toBeTruthy(); // the mid gridline, not rounded to 3
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Rating trend. Latest: You 4.8.');
    expect(screen.getAllByText('Oct 2026').length).toBeGreaterThan(0);
    expect(screen.getByRole('columnheader', { name: 'Month' })).toBeTruthy();
    expect(document.querySelector('title')!.textContent).toBe('You: 4.5 stars (Sep 2026)');
  });

  it('gives the table a caption and header scopes, and ignores points beyond the labels', () => {
    render(<LineChart title="Ads" labels={['2026-10-01']} series={[{ key: 'a', name: 'A', points: [3, 9] }]} valueLabel="ads" period="scan" />);
    const table = screen.getByRole('table');
    expect(table.querySelector('caption')!.textContent).toBe('Ads');
    expect(table.querySelector('th[scope="col"]')!.textContent).toBe('Scan of');
    expect(table.querySelectorAll('th[scope="row"]')).toHaveLength(1);
    expect(screen.queryByText('9')).toBeNull();
  });
```

  `4.75.toFixed(1)` is `"4.8"` in V8 (4.75 is exact in binary and rounds half-up here). If the assertion trips on a runtime difference, use 4.8 as the input value instead.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @cs/web exec vitest run src/components/charts/line-chart.test.tsx` (timeout 600000)
Expected: the fold test may already pass. The other two FAIL: the props are ignored, there's no caption, and `'2026-09'` renders "Invalid Date".

- [ ] **Step 3: Implement** in `line-chart.tsx`:
  1. In `foldSeries`, call `localeCompare(…, 'en')` in both places.
  2. Add below `shortDate`:

```ts
const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
type Period = 'week' | 'month' | 'scan';
const HEAD: Record<Period, string> = { week: 'Week of', month: 'Month', scan: 'Scan of' };
```

  3. Rename the destructured `series` prop to `series: input` and add the new props (`formatValue?: (v: number) => string; yMax?: number; period?: Period`, with `period = 'week'` and `yMax: yMaxProp`). At the top of the body:

```ts
  const series = input.map((s) => ({ ...s, points: s.points.slice(0, labels.length) }));
  const labelOf = (l: string) => (period === 'month' ? monthLabel(l) : shortDate(l));
  const fmt = formatValue ?? ((v: number) => String(v));
  const tick = formatValue ?? ((v: number) => String(Math.round(v)));
  const when = (l: string) => (period === 'month' ? labelOf(l) : `${period === 'scan' ? 'scan of' : 'week of'} ${labelOf(l)}`);
```

  4. `const yMax = yMaxProp ?? niceMax(Math.max(...all));`
  5. `latest` returns `fmt(last(s.points))` for known values.
  6. Tick text `{tick(yMax * f)}`; axis date labels `{labelOf(labels[i]!)}`.
  7. Tooltip: ``<title>{`${s.name}: ${fmt(v)} ${valueLabel} (${when(labels[i]!)})`}</title>``. For `week` this is exactly today's text.
  8. Table:
     - `<caption className="sr-only">{title}</caption>` as the first child of `<table>`;
     - header cells `<th scope="col">`, the first being `{HEAD[period]}`;
     - the first body cell becomes `<th scope="row" className="font-normal">{labelOf(l)}</th>`;
     - value cells `{s.points[i] == null ? '—' : fmt(s.points[i]!)}`.

- [ ] **Step 4: Run the chart tests and the overview tests that use it**

Run: `pnpm --filter @cs/web exec vitest run src/components/charts "src/app/(app)/c"` (timeout 600000)
Expected: PASS — the old tests keep passing (week output unchanged).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/charts/line-chart.tsx apps/web/src/components/charts/line-chart.test.tsx
git commit -m "feat(web): LineChart value format, fixed axis and period labels; table caption and scopes"
```

---

### Task 5: Pricing page and its nav item

**Files:**
- Create in `apps/web/src/app/(app)/c/[clientId]/pricing/`: `format.ts`, `format.test.ts`, `price-card.tsx`, `price-card.test.tsx`, `page.tsx`
- Modify: `apps/web/src/components/shell/nav-items.ts`, `sidebar-nav.tsx`, `sidebar-nav.test.tsx`, `apps/web/src/server/nav.test.ts`

**Interfaces:**
- Consumes: tools `get_price_matrix`, `get_price_history` (types `PriceMatrixView`, `PriceHistoryView`, `PriceNowView` from `@cs/tools`); `LineChart`, `foldSeries`; `webEnv().webMonitoring`.
- Produces:
  - `formatPrice(p)`, `formatChange(c)`, `pricingHref(clientId, q)`;
  - `PriceCard`;
  - route `/c/[clientId]/pricing`;
  - nav icon key `'pricing'`.

- [ ] **Step 1: Write the failing tests.**

`pricing/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatChange, formatPrice, pricingHref } from './format';

describe('pricing format', () => {
  it('formats prices with their qualifier and unit (decision 2)', () => {
    expect(formatPrice({ amount: 89, unit: 'USD', qualifier: 'exact' })).toBe('$89');
    expect(formatPrice({ amount: 79, unit: 'USD', qualifier: 'from' })).toBe('from $79');
    expect(formatPrice({ amount: 1200, unit: 'USD', qualifier: 'up_to' })).toBe('up to $1,200');
    expect(formatPrice({ amount: 95.5, unit: 'USD/hour', qualifier: 'exact' })).toBe('$95.5/hour');
  });

  it('marks a cut down and a rise up, and nothing without a change', () => {
    expect(formatChange({ before: 99, after: 79 })).toEqual({ text: '▼ $20', tone: 'down' });
    expect(formatChange({ before: 79, after: 99 })).toEqual({ text: '▲ $20', tone: 'up' });
    expect(formatChange(null)).toBeNull();
  });

  it('builds the selection href, leaving out the default period', () => {
    expect(pricingHref('c1', { competitor: 'x', service: 'ac_tune_up', days: 180 })).toBe('/c/c1/pricing?competitor=x&service=ac_tune_up&days=180');
    expect(pricingHref('c1', { competitor: 'x', service: 'ac_tune_up', days: 90 })).toBe('/c/c1/pricing?competitor=x&service=ac_tune_up');
    expect(pricingHref('c1', {})).toBe('/c/c1/pricing');
  });
});
```

`pricing/price-card.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PriceCard } from './price-card';

const services = [
  { id: 'ac_tune_up', name: 'AC tune-up', offered: true },
  { id: 'furnace_repair', name: 'Furnace repair', offered: false },
];
const row = {
  competitorId: 'x', name: 'Smith HVAC',
  cells: [
    { serviceId: 'ac_tune_up', prices: [{ amount: 79, unit: 'USD', qualifier: 'exact' as const, promo: true, since: '2026-10-01T00:00:00.000Z' }], change: { before: 99, after: 79 } },
    { serviceId: 'furnace_repair', prices: [{ amount: 129, unit: 'USD', qualifier: 'from' as const, promo: false, since: '2026-10-01T00:00:00.000Z' }], change: null },
  ],
};

describe('PriceCard', () => {
  it('lists each service as a link with its price, promo, change and "your service" tag', () => {
    render(<PriceCard row={row} services={services} selectedServiceId="ac_tune_up" hrefFor={(s) => `/p?service=${s}`} />);
    expect(screen.getByRole('heading', { name: 'Smith HVAC' })).toBeTruthy();
    const tune = screen.getByRole('link', { name: /AC tune-up/ });
    expect(tune.getAttribute('href')).toBe('/p?service=ac_tune_up');
    expect(tune.getAttribute('aria-current')).toBe('true');
    expect(tune.textContent).toContain('Your service');
    expect(tune.textContent).toContain('$79');
    expect(tune.textContent).toContain('PROMO');
    expect(tune.textContent).toContain('▼ $20');
    expect(screen.getByRole('link', { name: /Furnace repair/ }).textContent).toContain('from $129');
  });

  it('says so when the competitor shows no prices', () => {
    render(<PriceCard row={{ ...row, cells: [] }} services={services} selectedServiceId={null} hrefFor={() => '#'} />);
    expect(screen.getByText('No prices seen on its website yet.')).toBeTruthy();
  });
});
```

Nav tests:
- In `sidebar-nav.test.tsx` add:

```tsx
  it('lists the 5c-2 modules between Changes and Moves for dashboard users only', () => {
    pathname = `/c/${CLIENT_ID}`;
    const { unmount } = render(<SidebarNav flags={clientOwnerWithDashboard} />);
    const names = screen.getAllByRole('link').map((l) => l.textContent?.trim());
    expect(names.slice(names.indexOf('Changes'), names.indexOf('Moves') + 1)).toEqual(['Changes', 'Pricing', 'Moves']);
    unmount();
    render(<SidebarNav flags={clientViewer} />);
    expect(screen.queryByRole('link', { name: 'Pricing' })).toBeNull();
  });
```

- In `apps/web/src/server/nav.test.ts`, insert `` `/c/${C}/pricing` `` right after `` `/c/${C}/changes` `` in the agency href list (~line 19) and in the owner href list (~line 28). In the group map (~line 35), add `` [`/c/${C}/pricing`]: 'client', `` after the changes entry.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @cs/web exec vitest run "src/app/(app)/c/\[clientId\]/pricing" src/components/shell src/server/nav.test.ts` (timeout 600000). If the bracket path doesn't match on Windows, use the plain substring filter `pricing`.
Expected: FAIL — the modules don't exist, and the nav lists lack Pricing.

- [ ] **Step 3: Implement `pricing/format.ts`:**

```ts
import type { PriceNowView } from '@cs/tools';

const money = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

/** Decision 2: `$89`, `from $79`, `up to $1,200`, `$95/hour`. */
export function formatPrice(p: Pick<PriceNowView, 'amount' | 'unit' | 'qualifier'>): string {
  const per = p.unit.startsWith('USD/') ? `/${p.unit.slice(4)}` : '';
  const base = `${money(p.amount)}${per}`;
  return p.qualifier === 'from' ? `from ${base}` : p.qualifier === 'up_to' ? `up to ${base}` : base;
}

/** The change pill against 90 days ago; a cut is `down`. */
export function formatChange(c: { before: number; after: number } | null): { text: string; tone: 'up' | 'down' } | null {
  if (!c) return null;
  const d = c.after - c.before;
  return { text: `${d < 0 ? '▼' : '▲'} ${money(Math.abs(d))}`, tone: d < 0 ? 'down' : 'up' };
}

/** The pricing URL for a selection; the default 90-day period is left out. */
export function pricingHref(clientId: string, q: { competitor?: string; service?: string; days?: number }): string {
  const p = new URLSearchParams();
  if (q.competitor) p.set('competitor', q.competitor);
  if (q.service) p.set('service', q.service);
  if (q.days && q.days !== 90) p.set('days', String(q.days));
  const s = p.toString();
  return `/c/${clientId}/pricing${s ? `?${s}` : ''}`;
}
```

- [ ] **Step 4: Implement `pricing/price-card.tsx`:**

```tsx
import type { PriceMatrixView } from '@cs/tools';
import Link from 'next/link';
import { formatChange, formatPrice } from './format';

type Row = PriceMatrixView['rows'][number];
type Service = PriceMatrixView['services'][number];

const CHANGE_TONE = { down: 'bg-[#FEE2E2] text-[#B91C1C]', up: 'bg-[#DCFCE7] text-[#15803D]' } as const;

/** Decision 2: one card per competitor; each priced service is a link that opens its history under the card (`children`). */
export function PriceCard({ row, services, selectedServiceId, hrefFor, children }: {
  row: Row;
  services: Service[];
  selectedServiceId: string | null;
  hrefFor: (serviceId: string) => string;
  children?: React.ReactNode;
}) {
  const byId = new Map(services.map((s) => [s.id, s]));
  const headingId = `price-card-${row.competitorId}`;
  return (
    <section aria-labelledby={headingId} className="rounded-[14px] bg-surface p-6 shadow-card">
      <h2 id={headingId} className="text-lg font-bold text-ink">{row.name}</h2>
      {row.cells.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No prices seen on its website yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-line">
          {row.cells.map((cell) => {
            const s = byId.get(cell.serviceId);
            const change = formatChange(cell.change);
            const selected = cell.serviceId === selectedServiceId;
            return (
              <li key={cell.serviceId}>
                <Link
                  href={hrefFor(cell.serviceId)}
                  aria-current={selected ? 'true' : undefined}
                  className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-2.5 hover:bg-muted-surface ${selected ? 'bg-primary-soft' : ''}`}
                >
                  <span className="min-w-0 flex-1 font-semibold text-ink">
                    {s?.name ?? cell.serviceId}
                    {s?.offered && <span className="ml-2 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary-soft-text">Your service</span>}
                  </span>
                  <span className="font-bold text-secondary">{cell.prices.map(formatPrice).join(' · ')}</span>
                  {cell.prices.some((p) => p.promo) && <span className="rounded-full bg-[#FFF3DC] px-2 py-0.5 text-xs font-bold text-[#B45309]">PROMO</span>}
                  {change && <span title="Change against 90 days ago" className={`rounded-full px-2 py-0.5 text-xs font-bold ${CHANGE_TONE[change.tone]}`}>{change.text}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {children}
    </section>
  );
}
```

- [ ] **Step 5: Implement `pricing/page.tsx`:**

```tsx
import { hasFeature } from '@cs/core';
import type { PriceHistoryView, PriceMatrixView } from '@cs/tools';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { foldSeries, LineChart } from '@/components/charts/line-chart';
import { requireContext } from '@/server/current-viewer';
import { webEnv } from '@/server/env';
import { callTool, tryCallTool } from '@/server/tools';
import { pricingHref } from './format';
import { PriceCard } from './price-card';

export const dynamic = 'force-dynamic';

const PERIODS = [90, 180, 365] as const;
type Period = (typeof PERIODS)[number];
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const parseDays = (v: string | string[] | undefined): Period => {
  const n = Number(one(v));
  return (PERIODS as readonly number[]).includes(n) ? (n as Period) : 90;
};

/** Module 4 (decision 2): competitor cards; a selected service's history opens under its card. */
export default async function PricingPage({ params, searchParams }: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { clientId } = await params;
  const sp = await searchParams;
  const { ctx } = await requireContext();
  if (!hasFeature(ctx, 'dashboard')) notFound();
  const days = parseDays(sp.days);
  const matrix = await callTool<PriceMatrixView>(ctx, 'get_price_matrix', { clientId });
  const competitor = one(sp.competitor);
  const service = one(sp.service);
  // A stale selection (removed competitor, price gone) simply shows no chart.
  const selected = matrix.rows.some((r) => r.competitorId === competitor && r.cells.some((c) => c.serviceId === service))
    ? { competitorId: competitor!, serviceId: service! }
    : null;
  const history = selected ? await tryCallTool<PriceHistoryView>(ctx, 'get_price_history', { clientId, serviceId: selected.serviceId, days }) : null;
  const anyPrice = matrix.rows.some((r) => r.cells.length > 0);

  return (
    <>
      <div>
        <h1 className="text-[26px] font-extrabold tracking-tight">Pricing</h1>
        <p className="mt-1 text-muted-foreground">What each competitor charges on its website now, and how that changed. Pick a service to see its price history.</p>
      </div>
      {matrix.rows.length === 0 ? (
        <p className="rounded-lg bg-muted-surface p-3 text-ink">No competitors are tracked yet.</p>
      ) : (
        <>
          {!anyPrice && (
            <p className="rounded-lg bg-muted-surface p-3 text-ink">
              Prices come from competitor websites.{!webEnv().webMonitoring && ' Website monitoring isn’t switched on yet, so there’s nothing to show.'}
            </p>
          )}
          <div className="grid gap-4 xl:grid-cols-2">
            {matrix.rows.map((row) => (
              <PriceCard
                key={row.competitorId}
                row={row}
                services={matrix.services}
                selectedServiceId={selected?.competitorId === row.competitorId ? selected.serviceId : null}
                hrefFor={(serviceId) => pricingHref(clientId, { competitor: row.competitorId, service: serviceId, days })}
              >
                {selected?.competitorId === row.competitorId && (
                  <div className="mt-4 border-t border-line pt-4">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-ink">{history ? `${history.serviceName} — price history` : 'Price history'}</h3>
                      <nav aria-label="Period" className="flex gap-3 text-sm">
                        {PERIODS.map((d) => (
                          <Link
                            key={d}
                            href={pricingHref(clientId, { competitor: selected.competitorId, service: selected.serviceId, days: d })}
                            aria-current={d === days ? 'page' : undefined}
                            className={d === days ? 'font-semibold text-ink' : 'text-muted-foreground hover:text-ink'}
                          >
                            {d} days
                          </Link>
                        ))}
                      </nav>
                    </div>
                    {history ? (
                      <LineChart
                        title={`${history.serviceName} price history`}
                        labels={history.labels}
                        series={foldSeries(history.series.map((s) => ({ key: s.competitorId, name: s.name, points: s.points })))}
                        valueLabel="lowest price"
                        formatValue={(v) => `$${Math.round(v).toLocaleString('en-US')}`}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">This price history is no longer available.</p>
                    )}
                  </div>
                )}
              </PriceCard>
            ))}
          </div>
        </>
      )}
    </>
  );
}
```

- [ ] **Step 6: Add the nav item.**
  - In `nav-items.ts`, add `'pricing'` to the `icon` union, and replace the `// 5c-2: Pricing, Ads, Reviews, Local rankings` line with:

```ts
  if (flags.dashboard) add(`${base}/pricing`, 'Pricing', 'pricing');
  // 5c-2: Ads, Reviews, Local rankings
```

  - In `sidebar-nav.tsx`, import `BadgeDollarSign` from `lucide-react` and add `pricing: BadgeDollarSign` to `ICONS`. (it exists in the installed lucide-react).

- [ ] **Step 7: Run the tests and typecheck**

Run: `pnpm --filter @cs/web exec vitest run pricing src/components/shell src/server/nav.test.ts` (timeout 600000), then `pnpm --filter @cs/web typecheck`.
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add "apps/web/src/app/(app)/c/[clientId]/pricing" apps/web/src/components/shell/nav-items.ts apps/web/src/components/shell/sidebar-nav.tsx apps/web/src/components/shell/sidebar-nav.test.tsx apps/web/src/server/nav.test.ts
git commit -m "feat(web): pricing tracker page"
```

---

### Task 6: `list_ads`

**Files:**
- Create: `packages/tools/src/tools/ads.ts`, `packages/tools/src/tools/ads.test.ts`
- Modify: `packages/tools/src/tools/schemas.ts`, `packages/tools/src/tools/all.ts`

**Interfaces:**
- Consumes: `workspaceClient`, `requireTracked`, `workspaceBusinesses`, `toIso`; fixture `seedAds`.
- Produces:
  - tool `list_ads`, with input `{ clientId, competitorId?, platform?: 'meta' | 'google', status: 'active' | 'ended' | 'all' = 'active', offset = 0, limit 1–100 = 50 }` and output `AdList` = `{ items: AdView[], hasMore }`;
  - `AdView`: `{ id, competitorId, competitorName, platform, format, title, text, landingUrl, firstSeenAt, lastSeenAt, endedAt, active, libraryUrl }`;
  - exported `libraryUrl(a)`;
  - `adTools`.

- [ ] **Step 1: Write the failing test** — `packages/tools/src/tools/ads.test.ts`:

```ts
import { IDS } from '@cs/db/test-helpers';
import { beforeEach, describe, expect, it } from 'vitest';
import { libraryUrl } from './ads';
import type { AdList } from './schemas';
import { ctx, day, registry, resetWorkspace, seedAds } from './workspace-fixtures';

const am = ctx('account_manager', 'all');
const owner = ctx('client_owner', [IDS.clientA1], ['dashboard']);
const ownerNoDash = ctx('client_owner', [IDS.clientA1]);
const otherAgency = ctx('agency_admin', 'all', [], IDS.agencyB);
const ago = (d: number) => new Date(Date.now() - d * day);

beforeEach(async () => {
  await resetWorkspace();
  await seedAds({
    ads: [
      { platform: 'meta', externalId: 'm1', title: '$49 tune-up', text: 'Book now', landingUrl: 'https://smithhvac.example/tuneup', isActive: true, firstSeenAt: ago(20), lastSeenAt: ago(1) },
      { platform: 'google', externalId: 'g1', advertiserId: 'AR123', title: 'Furnace repair', isActive: false, firstSeenAt: ago(60), lastSeenAt: ago(30), endedAt: ago(30) },
      { platform: 'google', externalId: 'g2', title: 'No advertiser id', isActive: true, firstSeenAt: ago(5), lastSeenAt: ago(2) },
    ],
  });
  await seedAds({ competitorId: IDS.competitorY, ads: [{ platform: 'meta', externalId: 'y1', isActive: true }] });
});

describe('list_ads', () => {
  it('lists active ads of tracked competitors by default, newest first (decision 5)', async () => {
    const r = (await registry.invoke(owner, 'list_ads', { clientId: IDS.clientA1 })) as AdList;
    expect(r.items.map((a) => a.title)).toEqual(['$49 tune-up', 'No advertiser id']);
    expect(r.items[0]).toMatchObject({ competitorName: 'Smith HVAC', platform: 'meta', active: true, endedAt: null, libraryUrl: 'https://www.facebook.com/ads/library/?id=m1' });
    expect(r.hasMore).toBe(false);
  });

  it('filters by status and platform, active first under "all", and pages', async () => {
    const all = (await registry.invoke(am, 'list_ads', { clientId: IDS.clientA1, status: 'all' })) as AdList;
    expect(all.items.map((a) => a.title)).toEqual(['$49 tune-up', 'No advertiser id', 'Furnace repair']);
    const ended = (await registry.invoke(am, 'list_ads', { clientId: IDS.clientA1, status: 'ended', platform: 'google' })) as AdList;
    expect(ended.items.map((a) => [a.title, a.libraryUrl])).toEqual([['Furnace repair', 'https://adstransparency.google.com/advertiser/AR123/creative/g1']]);
    const page = (await registry.invoke(am, 'list_ads', { clientId: IDS.clientA1, status: 'all', limit: 2, offset: 1 })) as AdList;
    expect([page.items.map((a) => a.title), page.hasMore]).toEqual([['No advertiser id', 'Furnace repair'], false]);
    const first = (await registry.invoke(am, 'list_ads', { clientId: IDS.clientA1, status: 'all', limit: 2 })) as AdList;
    expect(first.hasMore).toBe(true);
  });

  it('refuses an untracked competitor, another agency and a client without dashboard', async () => {
    await expect(registry.invoke(am, 'list_ads', { clientId: IDS.clientA1, competitorId: IDS.competitorY })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(otherAgency, 'list_ads', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(ownerNoDash, 'list_ads', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'permission_denied' });
  });
});

describe('libraryUrl', () => {
  it('escapes ids and has no Google link without an advertiser id', () => {
    expect(libraryUrl({ platform: 'meta', externalId: 'a b', advertiserId: null })).toBe('https://www.facebook.com/ads/library/?id=a%20b');
    expect(libraryUrl({ platform: 'google', externalId: 'g', advertiserId: null })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @cs/tools exec vitest run src/tools/ads.test.ts` (timeout 600000)
Expected: FAIL — `./ads` doesn't exist.

- [ ] **Step 3: Add the schemas** to `schemas.ts`:

```ts
export const AdView = z.object({
  id: uuid, competitorId: uuid, competitorName: z.string(), platform: z.enum(['meta', 'google']), format: z.string().nullable(),
  title: z.string().nullable(), text: z.string().nullable(), landingUrl: z.string().nullable(),
  firstSeenAt: iso, lastSeenAt: iso, endedAt: iso.nullable(), active: z.boolean(), libraryUrl: z.string().nullable(),
});
export type AdView = z.infer<typeof AdView>;
export const AdList = z.object({ items: z.array(AdView), hasMore: z.boolean() });
export type AdList = z.infer<typeof AdList>;
```

- [ ] **Step 4: Create `packages/tools/src/tools/ads.ts`:**

```ts
import { toolkit } from '@cs/core';
import { ad } from '@cs/db';
import { and, desc, eq, inArray, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { workspaceBusinesses } from '../workspace/business';
import { workspaceClient } from '../workspace/scope';
import { requireTracked } from './pages';
import { AdList, toIso } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();

/** Decision 5: the public library page of an ad, or null when Google gave no advertiser id. */
export function libraryUrl(a: { platform: string; externalId: string; advertiserId: string | null }): string | null {
  if (a.platform === 'meta') return `https://www.facebook.com/ads/library/?id=${encodeURIComponent(a.externalId)}`;
  if (a.platform === 'google' && a.advertiserId) {
    return `https://adstransparency.google.com/advertiser/${encodeURIComponent(a.advertiserId)}/creative/${encodeURIComponent(a.externalId)}`;
  }
  return null;
}

export const listAds = defineTool({
  name: 'list_ads',
  description: 'Ad creatives of tracked competitors (Meta and Google) with first and last seen dates; active ads first.',
  input: z.object({
    clientId: uuid,
    competitorId: uuid.optional(),
    platform: z.enum(['meta', 'google']).optional(),
    status: z.enum(['active', 'ended', 'all']).default('active'),
    offset: z.number().int().min(0).default(0),
    limit: z.number().int().min(1).max(100).default(50),
  }),
  output: AdList,
  permission: 'read',
  feature: 'dashboard',
  async handler(ctx, input, deps) {
    const c = await workspaceClient(deps, ctx, input.clientId);
    if (input.competitorId) await requireTracked(deps.app, ctx, c.id, input.competitorId);
    const tracked = (await workspaceBusinesses(deps, ctx, c)).filter((b) => !b.self && (!input.competitorId || b.key === input.competitorId));
    if (tracked.length === 0) return { items: [], hasMore: false };
    const names = new Map(tracked.map((t) => [t.competitorId!, t.name]));
    const conds: SQL[] = [inArray(ad.competitorId, [...names.keys()])];
    if (input.platform) conds.push(eq(ad.platform, input.platform));
    if (input.status !== 'all') conds.push(eq(ad.isActive, input.status === 'active'));
    // Global `ad` rows — visibility proved by workspaceBusinesses (RLS).
    const rows = await deps.service.select().from(ad).where(and(...conds))
      .orderBy(desc(ad.isActive), desc(ad.lastSeenAt), desc(ad.id)).offset(input.offset).limit(input.limit + 1);
    return {
      items: rows.slice(0, input.limit).map((a) => ({
        id: a.id, competitorId: a.competitorId, competitorName: names.get(a.competitorId)!, platform: a.platform as 'meta' | 'google',
        format: a.format, title: a.title, text: a.text, landingUrl: a.landingUrl,
        firstSeenAt: a.firstSeenAt.toISOString(), lastSeenAt: a.lastSeenAt.toISOString(), endedAt: toIso(a.endedAt), active: a.isActive, libraryUrl: libraryUrl(a),
      })),
      hasMore: rows.length > input.limit,
    };
  },
});

export const adTools = [listAds];
```

  Add `...adTools` to `allTools` in `all.ts`.

- [ ] **Step 5: Run the test**

Run: `pnpm --filter @cs/tools exec vitest run src/tools/ads.test.ts` (timeout 600000)
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/tools/src/tools/ads.ts packages/tools/src/tools/ads.test.ts packages/tools/src/tools/schemas.ts packages/tools/src/tools/all.ts
git commit -m "feat(tools): list_ads"
```

---

### Task 7: Ads page and its nav item

**Files:**
- Create in `apps/web/src/app/(app)/c/[clientId]/ads/`: `ad-card.tsx`, `ad-card.test.tsx`, `page.tsx`
- Modify: `nav-items.ts`, `sidebar-nav.tsx`, `sidebar-nav.test.tsx`, `server/nav.test.ts`

**Interfaces:**
- Consumes: tools `list_ads`, `get_ad_activity` (`AdList`, `AdView`, `AdActivityView`); `LineChart`, `foldSeries`.
- Produces: `AdCard`; route `/c/[clientId]/ads`; nav icon key `'ads'`.

- [ ] **Step 1: Write the failing tests.**

`ads/ad-card.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdCard } from './ad-card';

const base = {
  id: 'a', competitorId: 'x', competitorName: 'Smith HVAC', platform: 'meta' as const, format: 'image', title: '$49 tune-up', text: 'Book now',
  landingUrl: 'https://smithhvac.example/tuneup?utm=1', firstSeenAt: '2026-09-12T00:00:00.000Z', lastSeenAt: '2026-10-06T00:00:00.000Z',
  endedAt: null, active: true, libraryUrl: 'https://www.facebook.com/ads/library/?id=m1',
};

describe('AdCard', () => {
  it('shows the creative text, dates, the targeting note and the library link (decision 5)', () => {
    render(<AdCard ad={base} />);
    expect(screen.getByRole('heading', { name: '$49 tune-up' })).toBeTruthy();
    expect(screen.getByText('Book now')).toBeTruthy();
    expect(screen.getByText('smithhvac.example/tuneup?utm=1')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText(/First seen Sep 12 · last seen Oct 6/)).toBeTruthy();
    expect(screen.getByText('Targeting not disclosed (US)')).toBeTruthy();
    const link = screen.getByRole('link', { name: 'View in Meta Ad Library' });
    expect([link.getAttribute('href'), link.getAttribute('rel')]).toEqual([base.libraryUrl, 'noopener noreferrer']);
  });

  it('marks an ended Google ad and has no link without a library url', () => {
    render(<AdCard ad={{ ...base, platform: 'google', active: false, endedAt: '2026-09-30T00:00:00.000Z', libraryUrl: null }} />);
    expect(screen.getByText('Ended')).toBeTruthy();
    expect(screen.getByText(/ended Sep 30/)).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
```

Nav:
- In `sidebar-nav.test.tsx`, change the expected slice to `['Changes', 'Pricing', 'Ads', 'Moves']`.
- In `nav.test.ts`, insert `` `/c/${C}/ads` `` after `` `/c/${C}/pricing` `` in both href lists, and add the `'client'` group entry.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @cs/web exec vitest run ad-card src/components/shell src/server/nav.test.ts` (timeout 600000)
Expected: FAIL.

- [ ] **Step 3: Implement `ads/ad-card.tsx`:**

```tsx
import type { AdView } from '@cs/tools';

const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const displayUrl = (u: string) => {
  const s = u.replace(/^https?:\/\//, '');
  return s.length > 60 ? `${s.slice(0, 59)}…` : s;
};

/** Decision 5: a text card — no images (vendor media URLs expire). The landing URL is shown as text, never linked. */
export function AdCard({ ad }: { ad: AdView }) {
  const platform = ad.platform === 'meta' ? 'Meta' : 'Google';
  return (
    <article className="flex flex-col gap-2 rounded-[14px] bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-muted-foreground">
        <span>{platform}</span>
        {ad.format && <span>· {ad.format}</span>}
        <span>· {ad.competitorName}</span>
        <span className={`ml-auto rounded-full px-2 py-0.5 font-bold ${ad.active ? 'bg-[#DCFCE7] text-[#15803D]' : 'bg-muted-surface-2 text-muted-foreground'}`}>
          {ad.active ? 'Active' : 'Ended'}
        </span>
      </div>
      {ad.title && <h3 className="font-bold text-ink">{ad.title}</h3>}
      {ad.text && <p className="line-clamp-4 whitespace-pre-line text-sm text-ink">{ad.text}</p>}
      {ad.landingUrl && (
        <p className="truncate text-sm text-muted-foreground">
          → <span>{displayUrl(ad.landingUrl)}</span>
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        First seen {fmt(ad.firstSeenAt)} · {ad.active ? `last seen ${fmt(ad.lastSeenAt)}` : `ended ${fmt(ad.endedAt ?? ad.lastSeenAt)}`}
      </p>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-xs">
        <span className="text-muted-foreground">Targeting not disclosed (US)</span>
        {ad.libraryUrl && (
          <a href={ad.libraryUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary-soft-text">
            View in {ad.platform === 'meta' ? 'Meta Ad Library' : 'Google Ads Transparency'}
          </a>
        )}
      </div>
    </article>
  );
}
```

  (`bg-muted-surface-2` and `text-muted-surface-2` are real tokens — `--color-muted-surface-2` in `packages/ui/src/styles.css`. There is **no** `line` colour token: `border-line`/`divide-line` only work because the base layer gives every border `--line`; never use `text-line`.)

- [ ] **Step 4: Implement `ads/page.tsx`:**

```tsx
import { hasFeature } from '@cs/core';
import type { AdActivityView, AdList } from '@cs/tools';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { foldSeries, LineChart } from '@/components/charts/line-chart';
import { requireContext } from '@/server/current-viewer';
import { callTool, tryCallTool } from '@/server/tools';
import { AdCard } from './ad-card';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 50;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const pick = <T extends string>(v: string | undefined, allowed: readonly T[], fallback: T): T => ((allowed as readonly string[]).includes(v ?? '') ? (v as T) : fallback);

/** Module 5 (decision 5): active-ads trend plus the creative archive. */
export default async function AdsPage({ params, searchParams }: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { clientId } = await params;
  const sp = await searchParams;
  const { ctx } = await requireContext();
  if (!hasFeature(ctx, 'dashboard')) notFound();
  const competitorParam = one(sp.competitor);
  const competitorId = competitorParam && UUID.test(competitorParam) ? competitorParam : undefined;
  const platform = pick(one(sp.platform), ['all', 'meta', 'google'] as const, 'all');
  const status = pick(one(sp.status), ['active', 'ended', 'all'] as const, 'active');
  const offset = Math.max(0, Math.floor(Number(one(sp.offset)) || 0));

  const activity = await callTool<AdActivityView>(ctx, 'get_ad_activity', { clientId, weeks: 12 });
  const list = await tryCallTool<AdList>(ctx, 'list_ads', {
    clientId, ...(competitorId ? { competitorId } : {}), ...(platform !== 'all' ? { platform } : {}), status, offset, limit: PAGE,
  });
  const more = new URLSearchParams({ ...(competitorId ? { competitor: competitorId } : {}), platform, status, offset: String(offset + PAGE) });

  return (
    <>
      <div>
        <h1 className="text-[26px] font-extrabold tracking-tight">Ads</h1>
        <p className="mt-1 text-muted-foreground">Ads your competitors run on Google and Meta, with when we first and last saw each one.</p>
      </div>

      <div className="rounded-[14px] bg-surface p-6 shadow-card">
        <h2 className="mb-2 text-lg font-bold text-ink">Active ads per week</h2>
        <LineChart
          title="Active competitor ads per week"
          labels={activity.weeks}
          series={foldSeries(activity.series.map((s) => ({ key: s.competitorId, name: s.name, points: s.points })))}
          valueLabel="active ads"
        />
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-[14px] bg-surface p-4 shadow-card">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-ink">Competitor</span>
          <select name="competitor" defaultValue={competitorId ?? ''} className="rounded-md border border-line bg-surface px-2 py-1.5">
            <option value="">All competitors</option>
            {activity.series.map((s) => <option key={s.competitorId} value={s.competitorId}>{s.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-ink">Platform</span>
          <select name="platform" defaultValue={platform} className="rounded-md border border-line bg-surface px-2 py-1.5">
            <option value="all">All</option>
            <option value="meta">Meta</option>
            <option value="google">Google</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-ink">Status</span>
          <select name="status" defaultValue={status} className="rounded-md border border-line bg-surface px-2 py-1.5">
            <option value="active">Active</option>
            <option value="ended">Ended</option>
            <option value="all">All</option>
          </select>
        </label>
        <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white">Apply</button>
      </form>

      {!list ? (
        <p className="rounded-lg bg-muted-surface p-3 text-ink">This competitor is no longer tracked.</p>
      ) : list.items.length === 0 ? (
        <p className="rounded-lg bg-muted-surface p-3 text-ink">No ads match these filters.</p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {list.items.map((a) => <AdCard key={a.id} ad={a} />)}
          </div>
          {list.hasMore && <Link href={`/c/${clientId}/ads?${more.toString()}`} className="font-semibold text-primary-soft-text">More ads</Link>}
        </>
      )}
    </>
  );
}
```

- [ ] **Step 5: Add the nav item.** In `nav-items.ts`, add `'ads'` to the icon union, then after the Pricing line add:

```ts
  if (flags.dashboard) add(`${base}/ads`, 'Ads', 'ads');
  // 5c-2: Reviews, Local rankings
```

  (replacing the marker). In `sidebar-nav.tsx`, add `ads: Megaphone` (import `Megaphone`).

- [ ] **Step 6: Run the tests and typecheck**

Run: `pnpm --filter @cs/web exec vitest run ad-card src/components/shell src/server/nav.test.ts` (timeout 600000), then `pnpm --filter @cs/web typecheck`.
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/src/app/(app)/c/[clientId]/ads" apps/web/src/components/shell apps/web/src/server/nav.test.ts
git commit -m "feat(web): ads archive page"
```

---

### Task 8: `get_theme_benchmark`

**Files:**
- Create: `packages/tools/src/tools/reputation.ts`, `packages/tools/src/tools/reputation.test.ts`
- Modify: `packages/tools/src/tools/schemas.ts`, `packages/tools/src/tools/all.ts`

**Interfaces:**
- Consumes: engine `reviewBenchmark`, `themesForVertical`; fixtures `seedSelf`, `seedReview`.
- Produces:
  - tool `get_theme_benchmark` with input `{ clientId }` and output `ThemeBenchmarkView` = `{ windowDays, from, to, themes: { id, name }[], businesses: { competitorId, name, self, reviews, avgRating, prevReviews, prevAvgRating, themes: { themeId, mentions, asked, share, sentiment, shareDelta, sentimentDelta }[] }[] }`;
  - `reputationTools` (Tasks 9–10 append).

- [ ] **Step 1: Write the failing test** — `packages/tools/src/tools/reputation.test.ts`:

```ts
import { IDS } from '@cs/db/test-helpers';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ThemeBenchmarkView } from './schemas';
import { ctx, day, registry, resetWorkspace, seedReview, seedSelf } from './workspace-fixtures';

const am = ctx('account_manager', 'all');
const owner = ctx('client_owner', [IDS.clientA1], ['dashboard']);
const ownerNoDash = ctx('client_owner', [IDS.clientA1]);
const otherAgency = ctx('agency_admin', 'all', [], IDS.agencyB);
const ago = (d: number) => new Date(Date.now() - d * day);

beforeEach(resetWorkspace);

describe('get_theme_benchmark', () => {
  it('compares theme share and sentiment, self first, with null for a theme never asked (decision 7, Review Focus 3)', async () => {
    const selfId = await seedSelf();
    await seedReview({ competitorId: selfId, rating: 5, postedAt: ago(3), analysis: { asked: ['response_time'], themes: ['response_time'], sentiment: 4 } });
    await seedReview({ rating: 1, postedAt: ago(5), analysis: { asked: ['response_time', 'price_transparency'], themes: ['response_time'], sentiment: 0 } });
    await seedReview({ rating: 5, postedAt: ago(6), analysis: { asked: ['response_time'], themes: [], sentiment: 4 } });
    await seedReview({ competitorId: IDS.competitorY, postedAt: ago(2), analysis: { asked: ['response_time'], themes: ['response_time'], sentiment: 4 } });
    const r = (await registry.invoke(owner, 'get_theme_benchmark', { clientId: IDS.clientA1 })) as ThemeBenchmarkView;
    expect(r.windowDays).toBe(90);
    expect(r.themes.slice(0, 2)).toEqual([{ id: 'response_time', name: 'Response time' }, { id: 'price_transparency', name: 'Price transparency' }]);
    expect(r.businesses.map((b) => [b.name, b.self, b.reviews, b.avgRating])).toEqual([['A1 HVAC', true, 1, 5], ['Smith HVAC', false, 2, 3]]);
    const smith = r.businesses[1]!.themes;
    expect(smith.find((t) => t.themeId === 'response_time')).toMatchObject({ mentions: 1, asked: 2, share: 0.5, sentiment: -1 });
    expect(smith.find((t) => t.themeId === 'price_transparency')).toMatchObject({ mentions: 0, asked: 1, share: 0, sentiment: null });
    expect(smith.find((t) => t.themeId === 'upsell_pressure')).toMatchObject({ asked: 0, share: null });
  });

  it('works without a self business, refuses another agency and needs dashboard', async () => {
    const r = (await registry.invoke(am, 'get_theme_benchmark', { clientId: IDS.clientA1 })) as ThemeBenchmarkView;
    expect(r.businesses.map((b) => b.self)).toEqual([false]);
    await expect(registry.invoke(otherAgency, 'get_theme_benchmark', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(ownerNoDash, 'get_theme_benchmark', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'permission_denied' });
  });
});
```

  Check the theme names against `packages/verticals/packs/hvac_plumbing.yaml`: `response_time` is "Response time", `price_transparency` is "Price transparency".

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @cs/tools exec vitest run src/tools/reputation.test.ts` (timeout 600000)
Expected: FAIL — not registered.

- [ ] **Step 3: Add the schema** to `schemas.ts`:

```ts
export const ThemeBenchmarkView = z.object({
  windowDays: z.number().int(), from: iso, to: iso,
  themes: z.array(z.object({ id: z.string(), name: z.string() })),
  businesses: z.array(z.object({
    competitorId: uuid, name: z.string(), self: z.boolean(), reviews: z.number().int(), avgRating: z.number().nullable(),
    prevReviews: z.number().int(), prevAvgRating: z.number().nullable(),
    themes: z.array(z.object({
      themeId: z.string(), mentions: z.number().int(), asked: z.number().int(), share: z.number().nullable(), sentiment: z.number().nullable(),
      shareDelta: z.number().nullable(), sentimentDelta: z.number().nullable(),
    })),
  })),
});
export type ThemeBenchmarkView = z.infer<typeof ThemeBenchmarkView>;
```

- [ ] **Step 4: Create `packages/tools/src/tools/reputation.ts`:**

```ts
import { toolkit } from '@cs/core';
import { reviewBenchmark, themesForVertical } from '@cs/engine';
import { z } from 'zod';
import { packsOf, type ToolDeps } from '../deps';
import { workspaceClient } from '../workspace/scope';
import { ThemeBenchmarkView } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();

export const getThemeBenchmark = defineTool({
  name: 'get_theme_benchmark',
  description: 'Review themes, your business vs each tracked competitor: how often each theme comes up and how positively, last 90 days vs the 90 before.',
  input: z.object({ clientId: uuid }),
  output: ThemeBenchmarkView,
  permission: 'read',
  feature: 'dashboard',
  async handler(ctx, { clientId }, deps) {
    const c = await workspaceClient(deps, ctx, clientId);
    const packs = packsOf(deps);
    // reviewBenchmark/themesForVertical read client_competitor, review, review_analysis and theme_proposal with the service
    // Db — the client was proved through RLS above, and they only reach its tracked competitors and its self business.
    const b = await reviewBenchmark({ db: deps.service, packs }, c.id);
    const themes = await themesForVertical(deps.service, await packs(c.verticalId));
    return {
      windowDays: b.windowDays, from: b.from.toISOString(), to: b.to.toISOString(),
      themes: themes.map((t) => ({ id: t.id, name: t.name })),
      businesses: b.businesses.map((x) => ({
        competitorId: x.competitorId, name: x.name, self: x.self, reviews: x.reviews, avgRating: x.avgRating, prevReviews: x.prevReviews, prevAvgRating: x.prevAvgRating,
        themes: x.themes.map((t) => ({ themeId: t.themeId, mentions: t.mentions, asked: t.asked, share: t.share, sentiment: t.sentiment, shareDelta: t.shareDelta, sentimentDelta: t.sentimentDelta })),
      })),
    };
  },
});

export const reputationTools = [getThemeBenchmark];
```

  Add `...reputationTools` to `allTools`.

- [ ] **Step 5: Run the test**

Run: `pnpm --filter @cs/tools exec vitest run src/tools/reputation.test.ts` (timeout 600000)
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/tools/src/tools/reputation.ts packages/tools/src/tools/reputation.test.ts packages/tools/src/tools/schemas.ts packages/tools/src/tools/all.ts
git commit -m "feat(tools): get_theme_benchmark"
```

---

### Task 9: `get_rating_trend`

**Files:**
- Modify: `packages/tools/src/tools/reputation.ts`, `reputation.test.ts`, `schemas.ts`

**Interfaces:**
- Consumes: `workspaceBusinesses`, `gbpSummary` (`@cs/collectors`), `review`, `observation`; fixtures `seedReview`, `seedGbpRating`, `seedSelf`.
- Produces:
  - tool `get_rating_trend`, with input `{ clientId, months: 6 | 12 = 12 }` and output `RatingTrendView` = `{ months: string[] /* YYYY-MM */, businesses: { competitorId, name, self, gbpRating, reviews90d, perMonth, replyRate, mix: [n1..n5], monthly: { reviews, avgRating }[] }[] }`;
  - exported pure `monthKeys(now: Date, n: number): string[]`.

- [ ] **Step 1: Write the failing tests** — append to `reputation.test.ts` (extend the imports with `monthKeys` from `./reputation`, `RatingTrendView`, and `seedGbpRating`):

```ts
describe('monthKeys', () => {
  it('lists UTC calendar months ending with the current one', () => {
    expect(monthKeys(new Date('2026-01-15T12:00:00Z'), 3)).toEqual(['2025-11', '2025-12', '2026-01']);
  });
});

describe('get_rating_trend', () => {
  it('gives per-business rating, velocity, reply rate, mix and monthly stars (decision 8)', async () => {
    const selfId = await seedSelf();
    await seedGbpRating(selfId, 4.7);
    const now = new Date();
    await seedReview({ competitorId: selfId, rating: 5, postedAt: now, ownerAnswer: 'Thanks!' });
    await seedReview({ competitorId: selfId, rating: 3, postedAt: now });
    await seedReview({ competitorId: selfId, rating: 4, postedAt: ago(40) });
    await seedReview({ competitorId: selfId, rating: 1, postedAt: ago(400) }); // outside the months, still in the mix
    await seedReview({ competitorId: selfId, rating: null, postedAt: null }); // undated, rating-less
    const r = (await registry.invoke(owner, 'get_rating_trend', { clientId: IDS.clientA1, months: 6 })) as RatingTrendView;
    expect(r.months).toHaveLength(6);
    expect(r.months.at(-1)).toBe(now.toISOString().slice(0, 7));
    const self = r.businesses[0]!;
    expect([self.name, self.self, self.gbpRating, self.reviews90d, self.perMonth, self.replyRate]).toEqual(['A1 HVAC', true, 4.7, 3, 0.5, 0.33]);
    expect(self.mix).toEqual([1, 0, 1, 1, 1]);
    expect(self.monthly.at(-1)).toEqual({ reviews: 2, avgRating: 4 });
    const fortyAgo = r.months.indexOf(ago(40).toISOString().slice(0, 7));
    if (fortyAgo !== r.months.length - 1) expect(self.monthly[fortyAgo]).toEqual({ reviews: 1, avgRating: 4 });
    expect(self.monthly.find((m) => m.reviews === 0)).toEqual({ reviews: 0, avgRating: null }); // Review Focus 3
    expect(r.businesses.map((b) => b.name)).toEqual(['A1 HVAC', 'Smith HVAC']);
    expect(r.businesses[1]).toMatchObject({ gbpRating: null, reviews90d: 0, replyRate: null, mix: [0, 0, 0, 0, 0] });
  });

  it('refuses another agency and needs dashboard', async () => {
    await expect(registry.invoke(otherAgency, 'get_rating_trend', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(ownerNoDash, 'get_rating_trend', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'permission_denied' });
  });
});
```

  The worked values:
  - 90-day reviews: the two from today plus the one 40 days ago, so `reviews90d` is 3; one has an answer, so `replyRate` is 0.33.
  - 180-day count 3 ÷ 6 = 0.5.
  - The current month has the 5★ and 3★ reviews, so the average is 4.

  The "40 days ago" month assertion is skipped when that month is the current one (it can't be — 40 days is always an earlier month — but the guard keeps the test honest).

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @cs/tools exec vitest run src/tools/reputation.test.ts` (timeout 600000)
Expected: FAIL.

- [ ] **Step 3: Add the schema** to `schemas.ts`:

```ts
export const RatingTrendView = z.object({
  months: z.array(z.string()),
  businesses: z.array(z.object({
    competitorId: uuid, name: z.string(), self: z.boolean(), gbpRating: z.number().nullable(), reviews90d: z.number().int(), perMonth: z.number(),
    replyRate: z.number().nullable(), mix: z.array(z.number().int()).length(5),
    monthly: z.array(z.object({ reviews: z.number().int(), avgRating: z.number().nullable() })),
  })),
});
export type RatingTrendView = z.infer<typeof RatingTrendView>;
```

- [ ] **Step 4: Implement** in `reputation.ts`:
  - add the imports `import { gbpSummary } from '@cs/collectors';`, `import { observation, review } from '@cs/db';` and `import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';`;
  - add `import { workspaceBusinesses } from '../workspace/business';` and `RatingTrendView` to the schema import;
  - add `const DAY = 86_400_000;` and the code below;
  - change the array to `[getThemeBenchmark, getRatingTrend]`:

```ts
/** UTC calendar months `YYYY-MM`, the last one containing `now`. */
export function monthKeys(now: Date, n: number): string[] {
  return Array.from({ length: n }, (_, k) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (n - 1 - k), 1)).toISOString().slice(0, 7));
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;

export const getRatingTrend = defineTool({
  name: 'get_rating_trend',
  description: 'Per business: Google rating, reviews in 90 days, reviews per month, reply rate, star mix and monthly average stars.',
  input: z.object({ clientId: uuid, months: z.union([z.literal(6), z.literal(12)]).default(12) }),
  output: RatingTrendView,
  permission: 'read',
  feature: 'dashboard',
  async handler(ctx, input, deps) {
    const c = await workspaceClient(deps, ctx, input.clientId);
    const businesses = (await workspaceBusinesses(deps, ctx, c)).filter((b) => b.competitorId !== null);
    const now = new Date();
    const months = monthKeys(now, input.months);
    if (businesses.length === 0) return { months, businesses: [] };
    const ids = businesses.map((b) => b.competitorId!);
    const since90 = new Date(now.getTime() - 90 * DAY).toISOString();
    const since180 = new Date(now.getTime() - 180 * DAY).toISOString();
    const monthExpr = sql<string>`to_char(date_trunc('month', ${review.postedAt} AT TIME ZONE 'UTC'), 'YYYY-MM')`;
    // Global review/observation rows — visibility proved by workspaceBusinesses (RLS; the self row via client.self_competitor_id).
    const monthly = await deps.service
      .select({ competitorId: review.competitorId, month: monthExpr, n: sql<number>`count(*)::int`, avg: sql<number | null>`round(avg(${review.rating})::numeric, 2)::float8` })
      .from(review)
      .where(and(inArray(review.competitorId, ids), gte(review.postedAt, new Date(`${months[0]}-01T00:00:00Z`))))
      .groupBy(review.competitorId, monthExpr);
    const stats = await deps.service
      .select({
        competitorId: review.competitorId,
        n90: sql<number>`count(*) FILTER (WHERE ${review.postedAt} > ${since90}::timestamptz)::int`,
        answered90: sql<number>`count(*) FILTER (WHERE ${review.postedAt} > ${since90}::timestamptz AND ${review.ownerAnswer} IS NOT NULL)::int`,
        n180: sql<number>`count(*) FILTER (WHERE ${review.postedAt} > ${since180}::timestamptz)::int`,
        s1: sql<number>`count(*) FILTER (WHERE ${review.rating} = 1)::int`,
        s2: sql<number>`count(*) FILTER (WHERE ${review.rating} = 2)::int`,
        s3: sql<number>`count(*) FILTER (WHERE ${review.rating} = 3)::int`,
        s4: sql<number>`count(*) FILTER (WHERE ${review.rating} = 4)::int`,
        s5: sql<number>`count(*) FILTER (WHERE ${review.rating} = 5)::int`,
      })
      .from(review).where(inArray(review.competitorId, ids)).groupBy(review.competitorId);
    const gbp = await deps.service.selectDistinctOn([observation.competitorId], { competitorId: observation.competitorId, data: observation.data })
      .from(observation).where(and(inArray(observation.competitorId, ids), eq(observation.kind, 'gbp_profile'), eq(observation.key, 'profile')))
      .orderBy(observation.competitorId, desc(observation.observedAt));

    return {
      months,
      businesses: businesses.map((b) => {
        const s = stats.find((x) => x.competitorId === b.competitorId);
        const n90 = Number(s?.n90 ?? 0);
        return {
          competitorId: b.competitorId!, name: b.name, self: b.self,
          gbpRating: gbpSummary(gbp.find((g) => g.competitorId === b.competitorId)?.data ?? null)?.rating ?? null,
          reviews90d: n90,
          perMonth: r1(Number(s?.n180 ?? 0) / 6),
          replyRate: n90 > 0 ? r2(Number(s!.answered90) / n90) : null,
          mix: [s?.s1, s?.s2, s?.s3, s?.s4, s?.s5].map((v) => Number(v ?? 0)),
          monthly: months.map((m) => {
            const row = monthly.find((x) => x.competitorId === b.competitorId && x.month === m);
            return { reviews: Number(row?.n ?? 0), avgRating: row?.avg === null || row?.avg === undefined ? null : Number(row.avg) };
          }),
        };
      }),
    };
  },
});
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @cs/tools exec vitest run src/tools/reputation.test.ts` (timeout 600000)
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/tools/src/tools/reputation.ts packages/tools/src/tools/reputation.test.ts packages/tools/src/tools/schemas.ts
git commit -m "feat(tools): get_rating_trend"
```

---

### Task 10: `search_reviews`

**Files:**
- Modify: `packages/tools/src/tools/reputation.ts`, `reputation.test.ts`, `schemas.ts`

**Interfaces:**
- Consumes: `workspaceBusinesses`, `pickBusiness`, `escapeLike`, `themesForVertical`, `review`, `reviewAnalysis`, `BusinessKey`.
- Produces: tool `search_reviews`, with input `{ clientId, business?, themeId?, stars?, text?, days: 30 | 90 | 365 = 90, offset = 0 }` and output `ReviewList` = `{ items: { reviewId, competitorId, name, self, rating, text, postedAt, themes: { id, name }[], sentiment, ownerAnswer }[], hasMore }`. The page size is 20.

- [ ] **Step 1: Write the failing tests** — append to `reputation.test.ts` (add `ReviewList` to the type import):

```ts
describe('search_reviews', () => {
  beforeEach(async () => {
    const selfId = await seedSelf();
    await seedReview({ competitorId: selfId, rating: 5, text: 'Fast and friendly', postedAt: ago(2), analysis: { asked: ['response_time'], themes: ['response_time'], sentiment: 4 } });
    await seedReview({ rating: 2, text: 'Tech was late and pushy', postedAt: ago(1), ownerAnswer: 'Sorry!', analysis: { asked: ['response_time', 'upsell_pressure'], themes: ['response_time', 'upsell_pressure'], sentiment: 0 } });
    await seedReview({ rating: 4, text: 'Fair price, 100% happy', postedAt: ago(100) });
    await seedReview({ competitorId: IDS.competitorY, text: 'Other client’s competitor', postedAt: ago(1) });
  });

  it('returns text as published, never the reviewer, newest first (decision 6)', async () => {
    const r = (await registry.invoke(owner, 'search_reviews', { clientId: IDS.clientA1 })) as ReviewList;
    expect(r.items.map((i) => [i.name, i.self, i.text])).toEqual([['Smith HVAC', false, 'Tech was late and pushy'], ['A1 HVAC', true, 'Fast and friendly']]);
    expect(r.items[0]).toMatchObject({ rating: 2, ownerAnswer: 'Sorry!', sentiment: 0, themes: [{ id: 'response_time', name: 'Response time' }, { id: 'upsell_pressure', name: 'Upsell pressure' }] });
    expect(JSON.stringify(r)).not.toContain('hash-secret');
    expect(r.hasMore).toBe(false);
  });

  it('filters by business, theme, stars, text (escaped) and period', async () => {
    const q = async (input: Record<string, unknown>) => ((await registry.invoke(am, 'search_reviews', { clientId: IDS.clientA1, ...input })) as ReviewList).items.map((i) => i.text);
    expect(await q({ business: 'self' })).toEqual(['Fast and friendly']);
    expect(await q({ business: IDS.competitorX, themeId: 'upsell_pressure' })).toEqual(['Tech was late and pushy']);
    expect(await q({ stars: 5 })).toEqual(['Fast and friendly']);
    expect(await q({ text: 'LATE' })).toEqual(['Tech was late and pushy']);
    expect(await q({ text: '100%', days: 365 })).toEqual(['Fair price, 100% happy']);
    expect(await q({ text: '%', days: 30 })).toEqual([]);
    expect(await q({ days: 365 })).toHaveLength(3);
  });

  it('refuses an unknown theme, an untracked competitor and a missing self business (Review Focus 2)', async () => {
    await expect(registry.invoke(am, 'search_reviews', { clientId: IDS.clientA1, themeId: 'nope' })).rejects.toMatchObject({ code: 'invalid_input', message: 'Unknown theme' });
    await expect(registry.invoke(am, 'search_reviews', { clientId: IDS.clientA1, business: IDS.competitorY })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(ctx('account_manager', 'all'), 'search_reviews', { clientId: IDS.clientA2, business: 'self' })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(ownerNoDash, 'search_reviews', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'permission_denied' });
  });

  it('pages 20 at a time', async () => {
    for (let i = 0; i < 20; i++) await seedReview({ text: `bulk ${i}`, postedAt: ago(3) });
    const first = (await registry.invoke(am, 'search_reviews', { clientId: IDS.clientA1 })) as ReviewList;
    expect([first.items.length, first.hasMore]).toEqual([20, true]);
    const second = (await registry.invoke(am, 'search_reviews', { clientId: IDS.clientA1, offset: 20 })) as ReviewList;
    expect([second.items.length, second.hasMore]).toEqual([2, false]);
  });
});
```

  The "% matches nothing" line relies on `escapeLike`: an unescaped `%` would match every review in 30 days.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @cs/tools exec vitest run src/tools/reputation.test.ts` (timeout 600000)
Expected: FAIL.

- [ ] **Step 3: Add the schema** to `schemas.ts`:

```ts
export const ReviewView = z.object({
  reviewId: uuid, competitorId: uuid, name: z.string(), self: z.boolean(), rating: z.number().int().nullable(), text: z.string().nullable(),
  postedAt: iso.nullable(), themes: z.array(z.object({ id: z.string(), name: z.string() })), sentiment: z.number().int().nullable(), ownerAnswer: z.string().nullable(),
});
export type ReviewView = z.infer<typeof ReviewView>;
export const ReviewList = z.object({ items: z.array(ReviewView), hasMore: z.boolean() });
export type ReviewList = z.infer<typeof ReviewList>;
```

- [ ] **Step 4: Implement** in `reputation.ts`:
  - add `ToolError` to the `@cs/core` import and `reviewAnalysis` to the `@cs/db` import;
  - add `ilike`, `type SQL` to the drizzle import;
  - import `pickBusiness` from `'../workspace/business'`, `escapeLike` from `'../workspace/scope'`, and `BusinessKey, ReviewList` from `./schemas`;
  - add the code below, and change the array to `[getThemeBenchmark, getRatingTrend, searchReviews]`:

```ts
const REVIEW_PAGE = 20;

export const searchReviews = defineTool({
  name: 'search_reviews',
  description: 'Search Google reviews of your business and tracked competitors by business, theme, stars or text. Reviewer identities are never returned.',
  input: z.object({
    clientId: uuid,
    business: BusinessKey.optional(),
    themeId: z.string().regex(/^[a-z0-9_]{1,64}$/).optional(),
    stars: z.number().int().min(1).max(5).optional(),
    text: z.string().trim().min(1).max(100).optional(),
    days: z.union([z.literal(30), z.literal(90), z.literal(365)]).default(90),
    offset: z.number().int().min(0).default(0),
  }),
  output: ReviewList,
  permission: 'read',
  feature: 'dashboard',
  async handler(ctx, input, deps) {
    const c = await workspaceClient(deps, ctx, input.clientId);
    // A self business known only by place id has no review rows, so it is not searchable (pickBusiness → not_found).
    const all = (await workspaceBusinesses(deps, ctx, c)).filter((b) => b.competitorId !== null);
    const scope = input.business ? [pickBusiness(all, input.business)] : all;
    const themes = await themesForVertical(deps.service, await packsOf(deps)(c.verticalId));
    if (input.themeId && !themes.some((t) => t.id === input.themeId)) throw new ToolError('invalid_input', 'Unknown theme');
    if (scope.length === 0) return { items: [], hasMore: false };
    const byId = new Map(scope.map((b) => [b.competitorId!, b]));
    const themeName = new Map(themes.map((t) => [t.id, t.name]));
    const conds: SQL[] = [inArray(review.competitorId, [...byId.keys()]), gte(review.postedAt, new Date(Date.now() - input.days * DAY))];
    if (input.stars) conds.push(eq(review.rating, input.stars));
    if (input.text) conds.push(ilike(review.text, `%${escapeLike(input.text)}%`));
    if (input.themeId) conds.push(sql`${reviewAnalysis.themes} @> ${JSON.stringify([input.themeId])}::jsonb`);
    // Global review rows — visibility proved by workspaceBusinesses (RLS). reviewer_hash is never selected (spec §4.5).
    const rows = await deps.service
      .select({ id: review.id, competitorId: review.competitorId, rating: review.rating, text: review.text, postedAt: review.postedAt, ownerAnswer: review.ownerAnswer, themes: reviewAnalysis.themes, sentiment: reviewAnalysis.sentiment })
      .from(review)
      .leftJoin(reviewAnalysis, and(eq(reviewAnalysis.reviewId, review.id), eq(reviewAnalysis.verticalId, c.verticalId)))
      .where(and(...conds))
      .orderBy(sql`${review.postedAt} DESC NULLS LAST`, desc(review.id))
      .offset(input.offset).limit(REVIEW_PAGE + 1);
    return {
      items: rows.slice(0, REVIEW_PAGE).map((r) => {
        const b = byId.get(r.competitorId)!;
        return {
          reviewId: r.id, competitorId: r.competitorId, name: b.name, self: b.self, rating: r.rating, text: r.text, postedAt: r.postedAt ? r.postedAt.toISOString() : null,
          themes: (r.themes ?? []).map((id) => ({ id, name: themeName.get(id) ?? id })), sentiment: r.sentiment ?? null, ownerAnswer: r.ownerAnswer,
        };
      }),
      hasMore: rows.length > REVIEW_PAGE,
    };
  },
});
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @cs/tools exec vitest run src/tools/reputation.test.ts` (timeout 600000)
Expected: PASS (9 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/tools/src/tools/reputation.ts packages/tools/src/tools/reputation.test.ts packages/tools/src/tools/schemas.ts
git commit -m "feat(tools): search_reviews"
```

---

### Task 11: `ThemeHeatmap` component

**Files:**
- Create: `apps/web/src/components/charts/theme-heatmap.tsx`, `apps/web/src/components/charts/theme-heatmap.test.tsx`

**Interfaces:**
- Consumes: type `ThemeBenchmarkView` (`import type` from `@cs/tools`).
- Produces:
  - `sentimentFill(sentiment: number | null, share: number | null): { fill: string; text: string; stroke: string | null }`;
  - `ThemeHeatmap({ title, benchmark }: { title: string; benchmark: Pick<ThemeBenchmarkView, 'themes' | 'businesses'> })` — server-renderable, no hooks.

- [ ] **Step 1: Write the failing test** — `theme-heatmap.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { sentimentFill, ThemeHeatmap } from './theme-heatmap';

const t = (themeId: string, share: number | null, sentiment: number | null, shareDelta: number | null = null) =>
  ({ themeId, mentions: 1, asked: 2, share, sentiment, shareDelta, sentimentDelta: null });

const benchmark = {
  themes: [{ id: 'response_time', name: 'Response time' }, { id: 'upsell_pressure', name: 'Upsell pressure' }],
  businesses: [
    { competitorId: 's', name: 'A1 HVAC', self: true, reviews: 4, avgRating: 4.5, prevReviews: 2, prevAvgRating: 4, themes: [t('response_time', 0.34, 0.6, 0.08), t('upsell_pressure', null, null)] },
    { competitorId: 'x', name: 'Smith HVAC', self: false, reviews: 3, avgRating: 3, prevReviews: 3, prevAvgRating: 3, themes: [t('response_time', 0.5, -1), t('upsell_pressure', 0.2, null)] },
  ],
};

describe('sentimentFill (decision 12)', () => {
  it('maps sentiment to the validated diverging steps with readable text', () => {
    expect(sentimentFill(-1, 0.5)).toEqual({ fill: '#d03b3b', text: '#FFFFFF', stroke: null });
    expect(sentimentFill(-0.3, 0.5)).toEqual({ fill: '#f19c99', text: '#0B2540', stroke: null });
    expect(sentimentFill(0, 0.5)).toEqual({ fill: '#f0efec', text: '#0B2540', stroke: '#E2E8F0' });
    expect(sentimentFill(0.3, 0.5)).toEqual({ fill: '#86b6ef', text: '#0B2540', stroke: null });
    expect(sentimentFill(0.5, 0.5)).toEqual({ fill: '#256abf', text: '#FFFFFF', stroke: null });
    expect(sentimentFill(null, 0.2)).toEqual({ fill: '#f0efec', text: '#0B2540', stroke: '#E2E8F0' });
    expect(sentimentFill(null, null)).toEqual({ fill: '#FFFFFF', text: '#64748B', stroke: '#E2E8F0' });
  });
});

describe('ThemeHeatmap', () => {
  it('prints the share in each cell, "—" when the theme was never asked, and an arrow for a big change', () => {
    render(<ThemeHeatmap title="What customers talk about" benchmark={benchmark} />);
    const svg = screen.getByRole('img', { name: /What customers talk about/ });
    const texts = [...svg.querySelectorAll('text[data-cell]')].map((n) => n.textContent);
    expect(texts).toEqual(['34% ▲', '50%', '—', '20%']);
    expect(svg.querySelector('[data-cell="response_time|x"]')!.closest('g')!.querySelector('rect')!.getAttribute('fill')).toBe('#d03b3b');
    expect([...svg.querySelectorAll('text[data-head]')].map((n) => n.textContent)).toEqual(['You', 'Smith HVAC']); // self column first
  });

  it('has a legend and a table view with a caption', () => {
    render(<ThemeHeatmap title="What customers talk about" benchmark={benchmark} />);
    expect(screen.getByText('Very negative')).toBeTruthy();
    expect(screen.getByText('Very positive')).toBeTruthy();
    const table = screen.getByRole('table');
    expect(table.querySelector('caption')!.textContent).toBe('What customers talk about');
    expect(screen.getByRole('rowheader', { name: 'Response time' })).toBeTruthy();
  });

  it('says so when there is nothing to show', () => {
    render(<ThemeHeatmap title="T" benchmark={{ themes: [], businesses: [] }} />);
    expect(screen.getByText('No reviews analysed yet.')).toBeTruthy();
  });
});
```

  Cells are emitted row by row (theme), then column by column (business). That is why the expected order is `[response_time|s, response_time|x, upsell_pressure|s, upsell_pressure|x]`.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @cs/web exec vitest run theme-heatmap` (timeout 600000)
Expected: FAIL — the module doesn't exist.

- [ ] **Step 3: Implement `theme-heatmap.tsx`:**

```tsx
import type { ThemeBenchmarkView } from '@cs/tools';

const INK = '#0B2540';
const WHITE = '#FFFFFF';
const LINE = '#E2E8F0';
const NEUTRAL = '#f0efec';

/** Decision 12: diverging sentiment steps (validated 2026-10-08); share null → blank cell. */
export function sentimentFill(sentiment: number | null, share: number | null): { fill: string; text: string; stroke: string | null } {
  if (share === null) return { fill: WHITE, text: '#64748B', stroke: LINE };
  if (sentiment === null) return { fill: NEUTRAL, text: INK, stroke: LINE };
  if (sentiment <= -0.5) return { fill: '#d03b3b', text: WHITE, stroke: null };
  if (sentiment < -0.15) return { fill: '#f19c99', text: INK, stroke: null };
  if (sentiment <= 0.15) return { fill: NEUTRAL, text: INK, stroke: LINE };
  if (sentiment < 0.5) return { fill: '#86b6ef', text: INK, stroke: null };
  return { fill: '#256abf', text: WHITE, stroke: null };
}

const LEGEND: { label: string; s: number }[] = [
  { label: 'Very negative', s: -1 }, { label: 'Negative', s: -0.3 }, { label: 'Neutral', s: 0 }, { label: 'Positive', s: 0.3 }, { label: 'Very positive', s: 1 },
];
const pct = (x: number) => `${Math.round(x * 100)}%`;
const signed = (x: number) => `${x > 0 ? '+' : ''}${x.toFixed(1)}`;
const short = (s: string, n = 16) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Module 6 heatmap: rows = themes, columns = businesses (you first). Colour = sentiment of mentions, number = mention share. */
export function ThemeHeatmap({ title, benchmark }: { title: string; benchmark: Pick<ThemeBenchmarkView, 'themes' | 'businesses'> }) {
  const { themes, businesses } = benchmark;
  if (themes.length === 0 || businesses.length === 0) return <p className="text-sm text-muted-foreground">No reviews analysed yet.</p>;
  const LABEL_W = 200;
  const COL_W = 104;
  const ROW_H = 34;
  const HEAD_H = 40;
  const GAP = 2;
  const W = LABEL_W + businesses.length * COL_W;
  const H = HEAD_H + themes.length * ROW_H;
  const colName = (b: (typeof businesses)[number]) => (b.self ? 'You' : b.name);
  const cell = (b: (typeof businesses)[number], themeId: string) => b.themes.find((x) => x.themeId === themeId) ?? null;
  return (
    <figure className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. ${themes.length} themes for ${businesses.length} businesses; colour shows how positive mentions are, the number how often the theme comes up.`} style={{ minWidth: Math.round(W * 0.75) }} className="w-full">
          {businesses.map((b, j) => (
            <g key={b.competitorId}>
              <title>{b.name}</title>
              <text data-head x={LABEL_W + j * COL_W + COL_W / 2} y={HEAD_H - 14} textAnchor="middle" fontSize={12} fontWeight={600} fill={INK}>
                {short(colName(b))}
              </text>
            </g>
          ))}
          {themes.map((th, i) => (
            <g key={th.id}>
              <text x={LABEL_W - 10} y={HEAD_H + i * ROW_H + ROW_H / 2 + 4} textAnchor="end" fontSize={12} fill={INK}>{short(th.name, 28)}</text>
              {businesses.map((b, j) => {
                const c = cell(b, th.id);
                const share = c?.share ?? null;
                const f = sentimentFill(c?.sentiment ?? null, share);
                const arrow = c?.shareDelta != null && Math.abs(c.shareDelta) >= 0.05 ? (c.shareDelta > 0 ? ' ▲' : ' ▼') : '';
                const label = share === null ? '—' : `${pct(share)}${arrow}`;
                const tip = share === null
                  ? `${b.name}: ${th.name} — not enough reviews`
                  : `${b.name}: ${th.name} — mentioned in ${pct(share)} of reviews that could mention it${c?.sentiment != null ? `, sentiment ${signed(c.sentiment)}` : ''}${c?.shareDelta != null ? ` (${signed(c.shareDelta * 100)} points vs the previous 90 days)` : ''}`;
                return (
                  <g key={b.competitorId}>
                    <rect x={LABEL_W + j * COL_W + GAP / 2} y={HEAD_H + i * ROW_H + GAP / 2} width={COL_W - GAP} height={ROW_H - GAP} rx={4} fill={f.fill} stroke={f.stroke ?? 'none'} strokeWidth={f.stroke ? 1 : 0}>
                      <title>{tip}</title>
                    </rect>
                    <text data-cell={`${th.id}|${b.competitorId}`} x={LABEL_W + j * COL_W + COL_W / 2} y={HEAD_H + i * ROW_H + ROW_H / 2 + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill={f.text} pointerEvents="none">
                      {label}
                    </text>
                  </g>
                );
              })}
            </g>
          ))}
        </svg>
      </div>
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink">
        {LEGEND.map((l) => {
          const f = sentimentFill(l.s, 1);
          return (
            <li key={l.label} className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-3 w-4 rounded-sm" style={{ background: f.fill, outline: f.stroke ? `1px solid ${f.stroke}` : undefined }} />
              <span>{l.label}</span>
            </li>
          );
        })}
        <li className="text-muted-foreground">— not enough reviews · ▲▼ share changed by 5+ points</li>
      </ul>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">Show as table</summary>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full text-left">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr>
                <th scope="col">Theme</th>
                {businesses.map((b) => <th key={b.competitorId} scope="col">{colName(b)}</th>)}
              </tr>
            </thead>
            <tbody>
              {themes.map((th) => (
                <tr key={th.id}>
                  <th scope="row" className="font-normal">{th.name}</th>
                  {businesses.map((b) => {
                    const c = cell(b, th.id);
                    return <td key={b.competitorId}>{c?.share == null ? '—' : `${pct(c.share)}${c.sentiment != null ? ` · ${signed(c.sentiment)}` : ''}`}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @cs/web exec vitest run theme-heatmap` (timeout 600000)
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/charts/theme-heatmap.tsx apps/web/src/components/charts/theme-heatmap.test.tsx
git commit -m "feat(web): theme heatmap chart"
```

---

### Task 12: Reviews & reputation page and its nav item

**Files:**
- Create in `apps/web/src/app/(app)/c/[clientId]/reviews/`: `review-item.tsx`, `review-item.test.tsx`, `rating-mix.tsx`, `rating-mix.test.tsx`, `page.tsx`
- Modify: `nav-items.ts`, `sidebar-nav.tsx`, `sidebar-nav.test.tsx`, `server/nav.test.ts`

**Interfaces:**
- Consumes: tools `get_theme_benchmark`, `get_rating_trend`, `search_reviews`; `ThemeHeatmap`, `LineChart`, `foldSeries`, `StatCard`.
- Produces: `ReviewItem`, `RatingMix`; route `/c/[clientId]/reviews`; nav icon key `'reputation'`.

- [ ] **Step 1: Write the failing tests.**

`reviews/review-item.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReviewItem } from './review-item';

describe('ReviewItem', () => {
  it('shows stars, business, text as published, themes and the owner reply — never a reviewer name (decision 6)', () => {
    render(
      <ReviewItem
        review={{
          reviewId: 'r', competitorId: 'x', name: 'Smith HVAC', self: false, rating: 2, text: 'Tech was late', postedAt: '2026-10-03T00:00:00.000Z',
          themes: [{ id: 'response_time', name: 'Response time' }], sentiment: 0, ownerAnswer: 'Sorry about that',
        }}
      />,
    );
    expect(screen.getByLabelText('2 of 5 stars')).toBeTruthy();
    expect(screen.getByText(/Google reviewer · Smith HVAC · Oct 3, 2026/)).toBeTruthy();
    expect(screen.getByText('Tech was late')).toBeTruthy();
    expect(screen.getByText('Response time')).toBeTruthy();
    expect(screen.getByText(/Owner replied: Sorry about that/)).toBeTruthy();
  });

  it('names the self business "You" and handles a rating-only review', () => {
    render(<ReviewItem review={{ reviewId: 'r', competitorId: 's', name: 'A1 HVAC', self: true, rating: null, text: null, postedAt: null, themes: [], sentiment: null, ownerAnswer: null }} />);
    expect(screen.getByText(/Google reviewer · You/)).toBeTruthy();
    expect(screen.getByText('No written review.')).toBeTruthy();
  });
});
```

`reviews/rating-mix.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RatingMix } from './rating-mix';

describe('RatingMix', () => {
  it('lists 5★ to 1★ with counts and bar widths', () => {
    render(<RatingMix mix={[1, 0, 1, 2, 6]} />);
    const rows = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(rows).toEqual(['5★6', '4★2', '3★1', '2★0', '1★1']);
    expect((screen.getAllByTestId('bar')[0] as HTMLElement).style.width).toBe('60%');
  });

  it('says so with no reviews', () => {
    render(<RatingMix mix={[0, 0, 0, 0, 0]} />);
    expect(screen.getByText('No reviews yet.')).toBeTruthy();
  });
});
```

Nav:
- Expected slice becomes `['Changes', 'Pricing', 'Ads', 'Reviews', 'Moves']`.
- `nav.test.ts`: insert `` `/c/${C}/reviews` `` after `/ads` in both lists, plus the group entry.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @cs/web exec vitest run review-item rating-mix src/components/shell src/server/nav.test.ts` (timeout 600000)
Expected: FAIL.

- [ ] **Step 3: Implement `reviews/review-item.tsx`:**

```tsx
import type { ReviewView } from '@cs/tools';

const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** Decision 6: text as published; the reviewer is always "Google reviewer". */
export function ReviewItem({ review }: { review: ReviewView }) {
  const meta = ['Google reviewer', review.self ? 'You' : review.name, ...(review.postedAt ? [fmt(review.postedAt)] : [])].join(' · ');
  return (
    <article className="flex flex-col gap-1.5 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {review.rating !== null && (
          <span aria-label={`${review.rating} of 5 stars`} className="tracking-tight text-[#B45309]">
            {'★'.repeat(review.rating)}
            <span className="text-muted-surface-2">{'★'.repeat(5 - review.rating)}</span>
          </span>
        )}
        <span className="text-xs text-muted-foreground">{meta}</span>
      </div>
      {review.text ? <p className="whitespace-pre-line text-sm text-ink">{review.text}</p> : <p className="text-sm text-muted-foreground">No written review.</p>}
      {review.themes.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {review.themes.map((t) => <li key={t.id} className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary-soft-text">{t.name}</li>)}
        </ul>
      )}
      {review.ownerAnswer && <p className="rounded-md bg-muted-surface p-2 text-xs text-ink">Owner replied: {review.ownerAnswer}</p>}
    </article>
  );
}
```

  The stars use the accent-text colour `#B45309` (the brief-pill text colour), not a series colour, and the `aria-label` carries the meaning.

- [ ] **Step 4: Implement `reviews/rating-mix.tsx`:**

```tsx
/** Decision 7: your star mix, 5★ first. `mix[0]` is 1★. */
export function RatingMix({ mix }: { mix: number[] }) {
  const total = mix.reduce((a, b) => a + b, 0);
  if (total === 0) return <p className="text-sm text-muted-foreground">No reviews yet.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {[5, 4, 3, 2, 1].map((stars) => {
        const n = mix[stars - 1] ?? 0;
        return (
          <li key={stars} className="grid grid-cols-[2.5rem_1fr_2.5rem] items-center gap-2 text-sm">
            <span className="font-semibold text-ink">{stars}★</span>
            <span className="h-2.5 rounded-full bg-muted-surface">
              <span data-testid="bar" className="block h-2.5 rounded-full bg-secondary" style={{ width: `${Math.round((n / total) * 100)}%` }} />
            </span>
            <span className="text-right text-muted-foreground">{n}</span>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 5: Implement `reviews/page.tsx`:**

```tsx
import { hasFeature, isAgencyRole } from '@cs/core';
import type { RatingTrendView, ReviewList, ThemeBenchmarkView } from '@cs/tools';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { foldSeries, LineChart } from '@/components/charts/line-chart';
import { ThemeHeatmap } from '@/components/charts/theme-heatmap';
import { StatCard } from '@/components/stat-card';
import { requireContext } from '@/server/current-viewer';
import { callTool, tryCallTool } from '@/server/tools';
import { RatingMix } from './rating-mix';
import { ReviewItem } from './review-item';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const THEME = /^[a-z0-9_]{1,64}$/;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Module 6 (mockup 03, decisions 6–8). */
export default async function ReviewsPage({ params, searchParams }: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { clientId } = await params;
  const sp = await searchParams;
  const { ctx } = await requireContext();
  if (!hasFeature(ctx, 'dashboard')) notFound();

  const businessParam = one(sp.business);
  const business = businessParam === 'self' || (businessParam && UUID.test(businessParam)) ? businessParam : undefined;
  const themeParam = one(sp.theme);
  const themeRaw = themeParam && THEME.test(themeParam) ? themeParam : undefined;
  const starsN = Number(one(sp.stars));
  const stars = Number.isInteger(starsN) && starsN >= 1 && starsN <= 5 ? starsN : undefined;
  const text = (one(sp.q) ?? '').trim().slice(0, 100) || undefined;
  const daysN = Number(one(sp.days));
  const days = [30, 90, 365].includes(daysN) ? daysN : 90;
  const offset = Math.max(0, Math.floor(Number(one(sp.offset)) || 0));

  const [benchmark, trend] = await Promise.all([
    callTool<ThemeBenchmarkView>(ctx, 'get_theme_benchmark', { clientId }),
    callTool<RatingTrendView>(ctx, 'get_rating_trend', { clientId, months: 12 }),
  ]);
  // An unknown theme id (hand-edited URL, retired theme) is dropped rather than hiding the whole list.
  const themeId = themeRaw && benchmark.themes.some((t) => t.id === themeRaw) ? themeRaw : undefined;
  const reviews = await tryCallTool<ReviewList>(ctx, 'search_reviews', {
    clientId, ...(business ? { business } : {}), ...(themeId ? { themeId } : {}), ...(stars ? { stars } : {}), ...(text ? { text } : {}), days, offset,
  });
  const self = trend.businesses.find((b) => b.self) ?? null;
  const filters = new URLSearchParams({ ...(business ? { business } : {}), ...(themeId ? { theme: themeId } : {}), ...(stars ? { stars: String(stars) } : {}), ...(text ? { q: text } : {}), days: String(days) });
  const trendSeries = foldSeries(
    [...trend.businesses].sort((a, b) => a.name.localeCompare(b.name, 'en'))
      .map((b) => ({ key: b.competitorId, name: b.self ? 'You' : b.name, points: b.monthly.map((m) => m.avgRating) })),
  );

  return (
    <>
      <div>
        <h1 className="text-[26px] font-extrabold tracking-tight">Reviews &amp; reputation</h1>
        <p className="mt-1 text-muted-foreground">What customers say about you and your competitors on Google.</p>
      </div>

      {self ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Your rating" value={self.gbpRating === null ? '—' : `${self.gbpRating.toFixed(1)} ★`} hint="Google rating" />
          <StatCard title="New reviews (90 days)" value={String(self.reviews90d)} hint="Reviews posted in the last 90 days" />
          <StatCard title="Reviews per month" value={self.perMonth.toFixed(1)} hint="Average over the last 6 months" />
          <StatCard title="Replies to reviews" value={self.replyRate === null ? '—' : `${Math.round(self.replyRate * 100)}%`} hint="Share of the last 90 days’ reviews you answered" />
        </div>
      ) : (
        <p className="rounded-lg bg-muted-surface p-3 text-ink">
          Add your Google place id on the Profile page to compare your own reviews.
          {isAgencyRole(ctx.role) && <> <Link href={`/c/${clientId}/settings/profile`} className="font-semibold text-primary-soft-text">Open Profile</Link></>}
        </p>
      )}

      <section className="rounded-[14px] bg-surface p-6 shadow-card">
        <h2 className="mb-1 text-lg font-bold text-ink">What customers talk about</h2>
        <p className="mb-3 text-sm text-muted-foreground">Last 90 days. The number is how often a theme comes up; the colour is how positive those mentions are.</p>
        <ThemeHeatmap title="What customers talk about" benchmark={benchmark} />
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <section className="rounded-[14px] bg-surface p-6 shadow-card">
          <h2 className="mb-3 text-lg font-bold text-ink">Your rating mix</h2>
          {self ? <RatingMix mix={self.mix} /> : <p className="text-sm text-muted-foreground">Not available until your business is set up.</p>}
        </section>
        <section className="rounded-[14px] bg-surface p-6 shadow-card">
          <h2 className="mb-3 text-lg font-bold text-ink">Rating trend</h2>
          <LineChart title="Average stars per month" labels={trend.months} series={trendSeries} valueLabel="stars" yMax={5} period="month" formatValue={(v) => v.toFixed(1)} />
        </section>
      </div>

      <section className="flex flex-col gap-3 rounded-[14px] bg-surface p-6 shadow-card">
        <h2 className="text-lg font-bold text-ink">Reviews</h2>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold text-ink">Business</span>
            <select name="business" defaultValue={business ?? ''} className="rounded-md border border-line bg-surface px-2 py-1.5">
              <option value="">All</option>
              {trend.businesses.map((b) => <option key={b.competitorId} value={b.self ? 'self' : b.competitorId}>{b.self ? 'You' : b.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold text-ink">Theme</span>
            <select name="theme" defaultValue={themeId ?? ''} className="rounded-md border border-line bg-surface px-2 py-1.5">
              <option value="">All themes</option>
              {benchmark.themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold text-ink">Stars</span>
            <select name="stars" defaultValue={stars ? String(stars) : ''} className="rounded-md border border-line bg-surface px-2 py-1.5">
              <option value="">Any</option>
              {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}★</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold text-ink">Period</span>
            <select name="days" defaultValue={String(days)} className="rounded-md border border-line bg-surface px-2 py-1.5">
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">12 months</option>
            </select>
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
            <span className="font-semibold text-ink">Contains</span>
            <input name="q" defaultValue={text ?? ''} maxLength={100} className="rounded-md border border-line bg-surface px-2 py-1.5" />
          </label>
          <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white">Search</button>
        </form>
        {!reviews ? (
          <p className="rounded-lg bg-muted-surface p-3 text-ink">That business is no longer available.</p>
        ) : reviews.items.length === 0 ? (
          <p className="text-muted-foreground">No reviews match.</p>
        ) : (
          <>
            <div className="flex flex-col divide-y divide-line">{reviews.items.map((r) => <ReviewItem key={r.reviewId} review={r} />)}</div>
            {reviews.hasMore && (
              <Link href={`/c/${clientId}/reviews?${new URLSearchParams({ ...Object.fromEntries(filters), offset: String(offset + 20) }).toString()}`} className="font-semibold text-primary-soft-text">
                More reviews
              </Link>
            )}
          </>
        )}
      </section>
    </>
  );
}
```

  `tryCallTool` returns `null` for `not_found`, `permission_denied` and `invalid_input` (`isHiddenToolError`). A stale `business` therefore shows "That business is no longer available". An unknown theme is dropped before the call, so the list still shows.

- [ ] **Step 6: Add the nav item.** In `nav-items.ts`, add `'reputation'` to the icon union, then after Ads add:

```ts
  if (flags.dashboard) add(`${base}/reviews`, 'Reviews', 'reputation');
  // 5c-2: Local rankings
```

  In `sidebar-nav.tsx`, add `reputation: Star` (import `Star`). The existing `reviews` key stays for the platform "Model reviews" item.

- [ ] **Step 7: Run the tests and typecheck**

Run: `pnpm --filter @cs/web exec vitest run review-item rating-mix src/components/shell src/server/nav.test.ts` (timeout 600000), then `pnpm --filter @cs/web typecheck`.
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add "apps/web/src/app/(app)/c/[clientId]/reviews" apps/web/src/components/shell apps/web/src/server/nav.test.ts
git commit -m "feat(web): reviews and reputation page"
```

---

### Task 13: `get_geogrid`

**Files:**
- Create: `packages/tools/src/tools/rankings.ts`, `packages/tools/src/tools/rankings.test.ts`
- Modify: `packages/tools/src/tools/schemas.ts`, `packages/tools/src/tools/all.ts`

**Interfaces:**
- Consumes: `workspaceClient` (`keywords`, `radiusKm`), `workspaceBusinesses`, `pickBusiness`, `withTenant`, `rankScan`, `rankSnapshot`, engine `competitorMatcher`, `NOT_FOUND_RANK`; fixtures `seedSelf`, `setPlace`, `gridSnapshots`, `rr`, `seedRankScan`.
- Produces:
  - tool `get_geogrid`, with input `{ clientId, keyword?, business?, scanId? }` and output `GeoGridView` (decision 9);
  - `rankingTools` (Task 14 appends).

- [ ] **Step 1: Write the failing test** — `packages/tools/src/tools/rankings.test.ts`:

```ts
import { client } from '@cs/db';
import { IDS } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { GeoGridView } from './schemas';
import { ctx, day, dbs, gridSnapshots, registry, resetWorkspace, rr, seedRankScan, seedSelf, setPlace } from './workspace-fixtures';

const am = ctx('account_manager', 'all');
const owner = ctx('client_owner', [IDS.clientA1], ['dashboard']);
const ownerNoDash = ctx('client_owner', [IDS.clientA1]);
const ago = (d: number) => new Date(Date.now() - d * day);
const AREA = { center: { lat: 32, lng: -97 }, radiusKm: 25, zips: ['76048'] };

async function setupClient(): Promise<void> {
  await dbs.owner.update(client).set({ keywords: ['plumber', 'ac repair'], serviceArea: AREA }).where(eq(client.id, IDS.clientA1));
  await seedSelf({ placeId: 'self-place' });
  await setPlace(IDS.competitorX, 'px');
}

/** 3×3 "ac repair": the top row has self #1, the rest self #5; X is #2 or #1; point (2,2) failed. "plumber": only others. */
const acRepair = () => gridSnapshots('ac repair', 3, (r, c) => {
  if (r === 2 && c === 2) return null;
  return r === 0 ? [rr(1, 'self-place'), rr(2, 'px'), rr(3, 'o1')] : [rr(1, 'px'), rr(2, 'o1'), rr(3, 'o2'), rr(5, 'self-place')];
});
const plumber = () => gridSnapshots('plumber', 3, () => [rr(1, 'o1')]);

beforeEach(resetWorkspace);

describe('get_geogrid', () => {
  it('draws the newest scan for the self business, with no-data points as null (decision 9, Review Focus 3)', async () => {
    await setupClient();
    await seedRankScan({ finishedAt: ago(40), snapshots: gridSnapshots('ac repair', 1, () => [rr(9, 'self-place')]) });
    const newest = await seedRankScan({ finishedAt: ago(5), snapshots: [...acRepair(), ...plumber()] });
    const r = (await registry.invoke(owner, 'get_geogrid', { clientId: IDS.clientA1 })) as GeoGridView;
    expect([r.setup, r.scan?.id, r.keyword, r.business, r.size, r.radiusKm]).toEqual(['ready', newest, 'ac repair', 'self', 3, 25]);
    expect(r.keywords).toEqual(['ac repair', 'plumber']);
    expect(r.businesses).toEqual([{ key: 'self', name: 'A1 HVAC', self: true }, { key: IDS.competitorX, name: 'Smith HVAC', self: false }]);
    expect(r.cells).toEqual([[1, 1, 1], [5, 5, 5], [5, 5, null]]);
    expect([r.top3, r.points, r.avgRank]).toEqual([3, 8, 3.5]);
    expect(r.scans.map((s) => s.id)).toEqual([newest, expect.any(String)]);
  });

  it('shows a competitor not in the top 20 as 21, and summarises every keyword', async () => {
    await setupClient();
    await seedRankScan({ finishedAt: ago(5), snapshots: [...acRepair(), ...plumber()] });
    const r = (await registry.invoke(am, 'get_geogrid', { clientId: IDS.clientA1, business: IDS.competitorX, keyword: 'plumber' })) as GeoGridView;
    expect(r.cells).toEqual([[21, 21, 21], [21, 21, 21], [21, 21, 21]]);
    expect([r.top3, r.points, r.avgRank]).toEqual([0, 9, 21]);
    expect(r.keywordSummaries).toEqual([
      { keyword: 'ac repair', top3: 8, points: 8, avgRank: 1.4 },
      { keyword: 'plumber', top3: 0, points: 9, avgRank: 21 },
    ]);
  });

  it('falls back to the first keyword for an unknown one and opens an older scan by id', async () => {
    await setupClient();
    const older = await seedRankScan({ finishedAt: ago(40), snapshots: gridSnapshots('ac repair', 1, () => [rr(9, 'self-place')]) });
    await seedRankScan({ finishedAt: ago(5), snapshots: [...acRepair(), ...plumber()] });
    expect(((await registry.invoke(am, 'get_geogrid', { clientId: IDS.clientA1, keyword: 'zzz' })) as GeoGridView).keyword).toBe('ac repair');
    const r = (await registry.invoke(am, 'get_geogrid', { clientId: IDS.clientA1, scanId: older })) as GeoGridView;
    expect([r.scan?.id, r.cells]).toEqual([older, [[9]]]);
  });

  it('never reads another client’s scans (Review Focus 1)', async () => {
    await setupClient();
    const mine = await seedRankScan({ finishedAt: ago(5), snapshots: acRepair() });
    const a2 = await seedRankScan({ finishedAt: ago(1), snapshots: acRepair(), clientId: IDS.clientA2 });
    const b1 = await seedRankScan({ finishedAt: ago(1), snapshots: acRepair(), agencyId: IDS.agencyB, clientId: IDS.clientB1 });
    await seedRankScan({ finishedAt: ago(2), snapshots: acRepair(), status: 'failed' });
    const r = (await registry.invoke(am, 'get_geogrid', { clientId: IDS.clientA1 })) as GeoGridView;
    expect(r.scans.map((s) => s.id)).toEqual([mine]);
    await expect(registry.invoke(am, 'get_geogrid', { clientId: IDS.clientA1, scanId: a2 })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(am, 'get_geogrid', { clientId: IDS.clientA1, scanId: b1 })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('reports the setup state, and refuses an untracked business and a missing dashboard flag', async () => {
    let r = (await registry.invoke(am, 'get_geogrid', { clientId: IDS.clientA1 })) as GeoGridView;
    expect([r.setup, r.business, r.cells]).toEqual(['no_keywords', IDS.competitorX, []]);
    await dbs.owner.update(client).set({ keywords: ['ac repair'], serviceArea: AREA }).where(eq(client.id, IDS.clientA1));
    r = (await registry.invoke(am, 'get_geogrid', { clientId: IDS.clientA1 })) as GeoGridView;
    expect([r.setup, r.scans]).toEqual(['no_scan', []]);
    await expect(registry.invoke(am, 'get_geogrid', { clientId: IDS.clientA1, business: IDS.competitorY })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(am, 'get_geogrid', { clientId: IDS.clientA1, business: 'self' })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(ownerNoDash, 'get_geogrid', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'permission_denied' });
  });
});
```

  Worked numbers:
  - Self on "ac repair" has ranks 1,1,1 / 5,5,5 / 5,5 = 28 over 8 points, so the average is 3.5.
  - X on "ac repair" has 2,2,2 then 1 ×5 = 11 over 8, so 1.375 rounds to 1.4.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @cs/tools exec vitest run src/tools/rankings.test.ts` (timeout 600000)
Expected: FAIL — not registered.

- [ ] **Step 3: Add the schema** to `schemas.ts`:

```ts
export const ScanRef = z.object({ id: uuid, finishedAt: iso });
export const GeoGridView = z.object({
  setup: z.enum(['ready', 'no_keywords', 'no_scan']),
  scan: ScanRef.nullable(),
  scans: z.array(ScanRef),
  keywords: z.array(z.string()),
  keyword: z.string().nullable(),
  businesses: z.array(z.object({ key: z.string(), name: z.string(), self: z.boolean() })),
  business: z.string().nullable(),
  size: z.number().int(),
  /** Rows north → south, columns west → east; null = no data for the point; 21 = not in the top 20. */
  cells: z.array(z.array(z.number().int().nullable())),
  top3: z.number().int(),
  points: z.number().int(),
  avgRank: z.number().nullable(),
  keywordSummaries: z.array(z.object({ keyword: z.string(), top3: z.number().int(), points: z.number().int(), avgRank: z.number().nullable() })),
  radiusKm: z.number().nullable(),
});
export type GeoGridView = z.infer<typeof GeoGridView>;
```

- [ ] **Step 4: Create `packages/tools/src/tools/rankings.ts`:**

```ts
import { toolkit, ToolError } from '@cs/core';
import { type RankResult, rankScan, rankSnapshot, withTenant } from '@cs/db';
import { competitorMatcher, NOT_FOUND_RANK } from '@cs/engine';
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { pickBusiness, workspaceBusinesses } from '../workspace/business';
import { workspaceClient } from '../workspace/scope';
import { BusinessKey, GeoGridView } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();
const r1 = (x: number) => Math.round(x * 10) / 10;
const byWord = (a: string, b: string) => a.localeCompare(b, 'en');

export const getGeogrid = defineTool({
  name: 'get_geogrid',
  description: 'Local-pack rank of one business (you or a tracked competitor) at every point of a rank-scan grid for one keyword, plus per-keyword summaries.',
  input: z.object({ clientId: uuid, keyword: z.string().trim().min(1).max(100).optional(), business: BusinessKey.optional(), scanId: uuid.optional() }),
  output: GeoGridView,
  permission: 'read',
  feature: 'dashboard',
  async handler(ctx, input, deps) {
    const c = await workspaceClient(deps, ctx, input.clientId);
    const list = await workspaceBusinesses(deps, ctx, c);
    const business = input.business ? pickBusiness(list, input.business) : (list[0] ?? null);
    const base = {
      scan: null, scans: [], keywords: [], keyword: null, size: 0, cells: [], top3: 0, points: 0, avgRank: null, keywordSummaries: [], radiusKm: c.radiusKm,
      businesses: list.map((b) => ({ key: b.key, name: b.name, self: b.self })), business: business?.key ?? null,
    };
    if (c.keywords.length === 0 || c.radiusKm === null) return { ...base, setup: 'no_keywords' as const };

    // Tenant tables: only ever through withTenant (Review Focus 1).
    const { scans, scan, snaps } = await withTenant(deps.app, ctx, async (tx) => {
      const recent = await tx.select({ id: rankScan.id, finishedAt: rankScan.finishedAt }).from(rankScan)
        .where(and(eq(rankScan.clientId, c.id), eq(rankScan.status, 'done'), isNotNull(rankScan.finishedAt)))
        .orderBy(desc(rankScan.finishedAt)).limit(12);
      let chosen = recent[0];
      if (input.scanId) {
        [chosen] = await tx.select({ id: rankScan.id, finishedAt: rankScan.finishedAt }).from(rankScan)
          .where(and(eq(rankScan.id, input.scanId), eq(rankScan.clientId, c.id), eq(rankScan.status, 'done'), isNotNull(rankScan.finishedAt)));
        if (!chosen) throw new ToolError('not_found', 'Scan not found');
      }
      const rows = chosen
        ? await tx.select({ keyword: rankSnapshot.keyword, lat: rankSnapshot.lat, lng: rankSnapshot.lng, results: rankSnapshot.results }).from(rankSnapshot).where(eq(rankSnapshot.scanId, chosen.id))
        : [];
      return { scans: recent, scan: chosen ?? null, snaps: rows };
    });
    const scanList = scans.map((s) => ({ id: s.id, finishedAt: s.finishedAt!.toISOString() }));
    if (!scan) return { ...base, scans: scanList, setup: 'no_scan' as const };

    const keywords = [...new Set(snaps.map((s) => s.keyword))].sort(byWord);
    const keyword = input.keyword && keywords.includes(input.keyword) ? input.keyword : (keywords[0] ?? null);
    const lats = [...new Set(snaps.map((s) => s.lat))].sort((a, b) => b - a);
    const lngs = [...new Set(snaps.map((s) => s.lng))].sort((a, b) => a - b);
    const match = business ? competitorMatcher(business) : () => false;
    const rankIn = (results: RankResult[]) => results.find(match)?.rank ?? NOT_FOUND_RANK;
    const cells = lats.map((lat) => lngs.map((lng) => {
      const s = snaps.find((x) => x.keyword === keyword && x.lat === lat && x.lng === lng);
      return s ? rankIn(s.results) : null;
    }));
    const summary = (kw: string) => {
      const ranks = snaps.filter((s) => s.keyword === kw).map((s) => rankIn(s.results));
      return { keyword: kw, top3: ranks.filter((r) => r <= 3).length, points: ranks.length, avgRank: ranks.length ? r1(ranks.reduce((a, b) => a + b, 0) / ranks.length) : null };
    };
    const current = keyword ? summary(keyword) : { top3: 0, points: 0, avgRank: null };
    return {
      ...base, setup: 'ready' as const, scan: { id: scan.id, finishedAt: scan.finishedAt!.toISOString() }, scans: scanList, keywords, keyword,
      size: Math.max(lats.length, lngs.length), cells, top3: current.top3, points: current.points, avgRank: current.avgRank, keywordSummaries: keywords.map(summary),
    };
  },
});

export const rankingTools = [getGeogrid];
```

  Add `...rankingTools` to `allTools`. If `ToolError`/`toolkit` are not both exported from `@cs/core` under those names, follow the imports in `overview.ts`/`scope.ts`.

- [ ] **Step 5: Run the test**

Run: `pnpm --filter @cs/tools exec vitest run src/tools/rankings.test.ts` (timeout 600000)
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/tools/src/tools/rankings.ts packages/tools/src/tools/rankings.test.ts packages/tools/src/tools/schemas.ts packages/tools/src/tools/all.ts
git commit -m "feat(tools): get_geogrid"
```

---

### Task 14: `get_share_of_voice`

**Files:**
- Modify: `packages/tools/src/tools/rankings.ts`, `rankings.test.ts`, `schemas.ts`

**Interfaces:**
- Produces: tool `get_share_of_voice`, with input `{ clientId, keyword?, scans: 1–12 = 6 }` and output `ShareOfVoiceView` = `{ keyword: string | null, keywords: string[], scans: ScanRef[] /* oldest → newest */, series: { key, name, self, points: (number | null)[] }[] }`. The last series has key `other_businesses`.

- [ ] **Step 1: Write the failing tests** — append to `rankings.test.ts` (add `ShareOfVoiceView` to the type import):

```ts
describe('get_share_of_voice', () => {
  it('splits the top-3 slots between you, competitors and other businesses per scan (decision 10)', async () => {
    await setupClient();
    const a = await seedRankScan({
      finishedAt: ago(40),
      snapshots: [
        ...gridSnapshots('ac repair', 1, () => [rr(1, 'self-place'), rr(2, 'px'), rr(3, 'o1')]),
        ...gridSnapshots('plumber', 1, () => [rr(1, 'o1'), rr(2, 'o2'), rr(3, 'o3')]),
      ],
    });
    const b = await seedRankScan({ finishedAt: ago(5), snapshots: gridSnapshots('ac repair', 2, () => [rr(1, 'px'), rr(2, 'o1'), rr(3, 'o2'), rr(4, 'self-place')]) });
    const c = await seedRankScan({ finishedAt: ago(1), snapshots: gridSnapshots('ac repair', 1, () => []) });
    await seedRankScan({ finishedAt: ago(1), snapshots: gridSnapshots('ac repair', 1, () => [rr(1, 'px')]), clientId: IDS.clientA2 });

    const r = (await registry.invoke(owner, 'get_share_of_voice', { clientId: IDS.clientA1 })) as ShareOfVoiceView;
    expect(r.scans.map((s) => s.id)).toEqual([a, b, c]);
    expect([r.keyword, r.keywords]).toEqual([null, ['ac repair', 'plumber']]);
    expect(r.series.map((s) => [s.key, s.name, s.self, s.points])).toEqual([
      ['self', 'A1 HVAC', true, [0.167, 0, null]],
      [IDS.competitorX, 'Smith HVAC', false, [0.167, 0.333, null]],
      ['other_businesses', 'Other businesses', false, [0.667, 0.667, null]],
    ]);
  });

  it('filters one keyword, limits the scans, and treats an unknown keyword as all', async () => {
    await setupClient();
    await seedRankScan({
      finishedAt: ago(40),
      snapshots: [
        ...gridSnapshots('ac repair', 1, () => [rr(1, 'self-place'), rr(2, 'px'), rr(3, 'o1')]),
        ...gridSnapshots('plumber', 1, () => [rr(1, 'o1'), rr(2, 'o2'), rr(3, 'o3')]),
      ],
    });
    const newest = await seedRankScan({ finishedAt: ago(5), snapshots: gridSnapshots('ac repair', 1, () => [rr(1, 'px')]) });
    const one = (await registry.invoke(am, 'get_share_of_voice', { clientId: IDS.clientA1, keyword: 'ac repair' })) as ShareOfVoiceView;
    expect(one.series[0]!.points[0]).toBeCloseTo(0.333, 3);
    const last = (await registry.invoke(am, 'get_share_of_voice', { clientId: IDS.clientA1, scans: 1 })) as ShareOfVoiceView;
    expect(last.scans.map((s) => s.id)).toEqual([newest]);
    expect(((await registry.invoke(am, 'get_share_of_voice', { clientId: IDS.clientA1, keyword: 'zzz' })) as ShareOfVoiceView).keyword).toBeNull();
    await expect(registry.invoke(ownerNoDash, 'get_share_of_voice', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'permission_denied' });
  });
});
```

  Worked numbers:
  - Scan a, all keywords: 6 slots — self 1, X 1, other 4.
  - Scan b: 4 points × 3 slots = 12 — X 4, other 8, self 0 (self is rank 4).
  - Scan c has no results, so every series is `null` (Review Focus 3).
  - Client A2's scan is never counted (Review Focus 1).

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @cs/tools exec vitest run src/tools/rankings.test.ts` (timeout 600000)
Expected: FAIL.

- [ ] **Step 3: Add the schema** to `schemas.ts`:

```ts
export const ShareOfVoiceView = z.object({
  keyword: z.string().nullable(),
  keywords: z.array(z.string()),
  scans: z.array(ScanRef),
  /** Shares 0–1 per scan (null when the scan had no top-3 results); the last series is `other_businesses`. */
  series: z.array(z.object({ key: z.string(), name: z.string(), self: z.boolean(), points: z.array(z.number().nullable()) })),
});
export type ShareOfVoiceView = z.infer<typeof ShareOfVoiceView>;
```

- [ ] **Step 4: Implement** in `rankings.ts`:
  - add `inArray` to the drizzle import and `ShareOfVoiceView` to the schema import;
  - add the code below, and change the array to `[getGeogrid, getShareOfVoice]`:

```ts
/** Not `other` — that key is `foldSeries`'s folded remainder. */
export const OTHER_BUSINESSES = 'other_businesses';
const r3 = (x: number) => Math.round(x * 1000) / 1000;

export const getShareOfVoice = defineTool({
  name: 'get_share_of_voice',
  description: 'Share of the top-3 local-pack slots held by you, each tracked competitor and other businesses, per monthly rank scan.',
  input: z.object({ clientId: uuid, keyword: z.string().trim().min(1).max(100).optional(), scans: z.number().int().min(1).max(12).default(6) }),
  output: ShareOfVoiceView,
  permission: 'read',
  feature: 'dashboard',
  async handler(ctx, input, deps) {
    const c = await workspaceClient(deps, ctx, input.clientId);
    const businesses = await workspaceBusinesses(deps, ctx, c);
    // Tenant tables: only ever through withTenant (Review Focus 1).
    const { scans, snaps } = await withTenant(deps.app, ctx, async (tx) => {
      const recent = await tx.select({ id: rankScan.id, finishedAt: rankScan.finishedAt }).from(rankScan)
        .where(and(eq(rankScan.clientId, c.id), eq(rankScan.status, 'done'), isNotNull(rankScan.finishedAt)))
        .orderBy(desc(rankScan.finishedAt)).limit(input.scans);
      const rows = recent.length
        ? await tx.select({ scanId: rankSnapshot.scanId, keyword: rankSnapshot.keyword, results: rankSnapshot.results }).from(rankSnapshot).where(inArray(rankSnapshot.scanId, recent.map((s) => s.id)))
        : [];
      return { scans: recent.reverse(), snaps: rows };
    });
    const keywords = [...new Set(snaps.map((s) => s.keyword))].sort(byWord);
    const keyword = input.keyword && keywords.includes(input.keyword) ? input.keyword : null;
    const matchers = businesses.map((b) => ({ key: b.key, match: competitorMatcher(b) }));
    const tallies = scans.map((scan) => {
      const tally = new Map<string, number>();
      let total = 0;
      for (const s of snaps) {
        if (s.scanId !== scan.id || (keyword && s.keyword !== keyword)) continue;
        for (const r of s.results) {
          if (r.rank > 3) continue;
          total++;
          const key = matchers.find((m) => m.match(r))?.key ?? OTHER_BUSINESSES;
          tally.set(key, (tally.get(key) ?? 0) + 1);
        }
      }
      return { tally, total };
    });
    const share = (key: string) => tallies.map(({ tally, total }) => (total === 0 ? null : r3((tally.get(key) ?? 0) / total)));
    return {
      keyword, keywords,
      scans: scans.map((s) => ({ id: s.id, finishedAt: s.finishedAt!.toISOString() })),
      series: [
        ...businesses.map((b) => ({ key: b.key, name: b.name, self: b.self, points: share(b.key) })),
        { key: OTHER_BUSINESSES, name: 'Other businesses', self: false, points: share(OTHER_BUSINESSES) },
      ],
    };
  },
});
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @cs/tools exec vitest run src/tools/rankings.test.ts` (timeout 600000)
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/tools/src/tools/rankings.ts packages/tools/src/tools/rankings.test.ts packages/tools/src/tools/schemas.ts
git commit -m "feat(tools): get_share_of_voice"
```

---

### Task 15: `GeoGrid` component

**Files:**
- Create: `apps/web/src/components/charts/geo-grid.tsx`, `apps/web/src/components/charts/geo-grid.test.tsx`

**Interfaces:**
- Produces:
  - `rankFill(rank: number | null): { fill: string; text: string; label: string; stroke: string | null }`;
  - `GeoGrid({ title, summary, cells, businessName, keyword }: { title: string; summary: string; cells: (number | null)[][]; businessName: string; keyword: string })` — server-renderable, no hooks.

- [ ] **Step 1: Write the failing test** — `geo-grid.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GeoGrid, rankFill } from './geo-grid';

describe('rankFill (decision 12)', () => {
  it('uses the validated single-hue ramp, darker for better ranks', () => {
    expect(rankFill(1)).toEqual({ fill: '#0d366b', text: '#FFFFFF', label: '1', stroke: null });
    expect(rankFill(3)).toMatchObject({ fill: '#0d366b' });
    expect(rankFill(4)).toEqual({ fill: '#256abf', text: '#FFFFFF', label: '4', stroke: null });
    expect(rankFill(11)).toEqual({ fill: '#86b6ef', text: '#0B2540', label: '11', stroke: null });
    expect(rankFill(21)).toEqual({ fill: '#f0efec', text: '#0B2540', label: '20+', stroke: '#E2E8F0' });
    expect(rankFill(null)).toEqual({ fill: 'url(#geogrid-hatch)', text: '#64748B', label: '–', stroke: '#E2E8F0' });
  });
});

describe('GeoGrid', () => {
  const cells = [[1, 4], [21, null]];

  it('draws one labelled cell per point, rows north to south, with compass labels', () => {
    render(<GeoGrid title="Local rankings for ac repair" summary="Top 3 at 1 of 3 points · average rank 8.7" cells={cells} businessName="You" keyword="ac repair" />);
    const svg = screen.getByRole('img', { name: 'Local rankings for ac repair. Top 3 at 1 of 3 points · average rank 8.7' });
    expect([...svg.querySelectorAll('text[data-rank]')].map((n) => n.textContent)).toEqual(['1', '4', '20+', '–']);
    expect([...svg.querySelectorAll('text[data-compass]')].map((n) => n.textContent)).toEqual(['N', 'S', 'W', 'E']);
    const titles = [...svg.querySelectorAll('g > title')].map((n) => n.textContent);
    expect(titles).toContain('You: not in the top 20 for "ac repair" (row 2 of 2, column 1 of 2)');
    expect(titles).toContain('You: no data for this point for "ac repair" (row 2 of 2, column 2 of 2)');
  });

  it('has a legend and a table view', () => {
    render(<GeoGrid title="T" summary="S" cells={cells} businessName="You" keyword="k" />);
    expect(screen.getByText('Not in top 20')).toBeTruthy();
    expect(screen.getByText('No data')).toBeTruthy();
    const table = screen.getByRole('table');
    expect(table.querySelector('caption')!.textContent).toBe('T');
    expect(screen.getByRole('rowheader', { name: 'Row 1 (north)' })).toBeTruthy();
  });

  it('says so with no cells', () => {
    render(<GeoGrid title="T" summary="S" cells={[]} businessName="You" keyword="k" />);
    expect(screen.getByText('No rank data in this scan.')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @cs/web exec vitest run geo-grid` (timeout 600000)
Expected: FAIL.

- [ ] **Step 3: Implement `geo-grid.tsx`:**

```tsx
const INK = '#0B2540';
const WHITE = '#FFFFFF';
const LINE = '#E2E8F0';
const HATCH_ID = 'geogrid-hatch';

/** Decision 12: single-hue ordinal ramp (validated 2026-10-08), darker = better; 21 = not in the top 20; null = no data. */
export function rankFill(rank: number | null): { fill: string; text: string; label: string; stroke: string | null } {
  if (rank === null) return { fill: `url(#${HATCH_ID})`, text: '#64748B', label: '–', stroke: LINE };
  if (rank <= 3) return { fill: '#0d366b', text: WHITE, label: String(rank), stroke: null };
  if (rank <= 10) return { fill: '#256abf', text: WHITE, label: String(rank), stroke: null };
  if (rank <= 20) return { fill: '#86b6ef', text: INK, label: String(rank), stroke: null };
  return { fill: '#f0efec', text: INK, label: '20+', stroke: LINE };
}

const sayRank = (rank: number | null) => (rank === null ? 'no data for this point' : rank > 20 ? 'not in the top 20' : `rank ${rank}`);
const LEGEND: { label: string; rank: number | null }[] = [
  { label: '1–3', rank: 1 }, { label: '4–10', rank: 4 }, { label: '11–20', rank: 11 }, { label: 'Not in top 20', rank: 21 }, { label: 'No data', rank: null },
];

function Swatch({ rank }: { rank: number | null }) {
  const f = rankFill(rank);
  return (
    <svg aria-hidden width={16} height={12} viewBox="0 0 16 12">
      <defs>
        <pattern id={`${HATCH_ID}-legend`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="4" height="4" fill={WHITE} />
          <line x1="0" y1="0" x2="0" y2="4" stroke="#CBD5E1" strokeWidth="1.5" />
        </pattern>
      </defs>
      <rect x={0.5} y={0.5} width={15} height={11} rx={2} fill={rank === null ? `url(#${HATCH_ID}-legend)` : f.fill} stroke={f.stroke ?? 'none'} />
    </svg>
  );
}

/**
 * Module 7 geo-grid (decision 9): a plain N×N grid, rows north → south and columns west → east, as the scan's
 * `gridPoints` lays them out. Every cell prints its rank, so colour is never the only signal.
 */
export function GeoGrid({ title, summary, cells, businessName, keyword }: { title: string; summary: string; cells: (number | null)[][]; businessName: string; keyword: string }) {
  const rows = cells.length;
  const cols = Math.max(0, ...cells.map((r) => r.length));
  if (rows === 0 || cols === 0) return <p className="text-sm text-muted-foreground">No rank data in this scan.</p>;
  const CELL = 44;
  const M = 22;
  const W = cols * CELL + 2 * M;
  const H = rows * CELL + 2 * M;
  return (
    <figure className="flex flex-col gap-2">
      <div className="mx-auto w-full max-w-[520px]">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. ${summary}`} className="w-full">
          <defs>
            <pattern id={HATCH_ID} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill={WHITE} />
              <line x1="0" y1="0" x2="0" y2="6" stroke="#CBD5E1" strokeWidth="2" />
            </pattern>
          </defs>
          <text data-compass x={W / 2} y={15} textAnchor="middle" fontSize={12} fontWeight={700} fill="#64748B">N</text>
          <text data-compass x={W / 2} y={H - 6} textAnchor="middle" fontSize={12} fontWeight={700} fill="#64748B">S</text>
          <text data-compass x={9} y={H / 2 + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="#64748B">W</text>
          <text data-compass x={W - 9} y={H / 2 + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="#64748B">E</text>
          {cells.map((row, r) =>
            row.map((rank, c) => {
              const f = rankFill(rank);
              return (
                <g key={`${r}-${c}`}>
                  <title>{`${businessName}: ${sayRank(rank)} for "${keyword}" (row ${r + 1} of ${rows}, column ${c + 1} of ${cols})`}</title>
                  <rect x={M + c * CELL + 1} y={M + r * CELL + 1} width={CELL - 2} height={CELL - 2} rx={4} fill={f.fill} stroke={f.stroke ?? 'none'} strokeWidth={f.stroke ? 1 : 0} />
                  <text data-rank x={M + c * CELL + CELL / 2} y={M + r * CELL + CELL / 2 + 5} textAnchor="middle" fontSize={13} fontWeight={700} fill={f.text} pointerEvents="none">
                    {f.label}
                  </text>
                </g>
              );
            }),
          )}
        </svg>
      </div>
      <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-ink">
        {LEGEND.map((l) => (
          <li key={l.label} className="flex items-center gap-1.5">
            <Swatch rank={l.rank} />
            <span>{l.label}</span>
          </li>
        ))}
      </ul>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">Show as table</summary>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full text-left">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr>
                <th scope="col">Row</th>
                {Array.from({ length: cols }, (_, c) => <th key={c} scope="col">{c === 0 ? 'Col 1 (west)' : c === cols - 1 ? `Col ${c + 1} (east)` : `Col ${c + 1}`}</th>)}
              </tr>
            </thead>
            <tbody>
              {cells.map((row, r) => (
                <tr key={r}>
                  <th scope="row" className="font-normal">{r === 0 ? 'Row 1 (north)' : r === rows - 1 ? `Row ${r + 1} (south)` : `Row ${r + 1}`}</th>
                  {row.map((rank, c) => <td key={c}>{rank === null ? 'no data' : rank > 20 ? '20+' : rank}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
```

  The pattern ids are fixed strings, which is fine: there is one geo-grid per page. If a page ever renders two, pass an id prefix.

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @cs/web exec vitest run geo-grid` (timeout 600000)
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/charts/geo-grid.tsx apps/web/src/components/charts/geo-grid.test.tsx
git commit -m "feat(web): geo-grid chart"
```

---

### Task 16: Local rankings page and its nav item

**Files:**
- Create: `apps/web/src/app/(app)/c/[clientId]/rankings/page.tsx`, `rankings/sov.ts`, `rankings/sov.test.ts`
- Modify: `nav-items.ts`, `sidebar-nav.tsx`, `sidebar-nav.test.tsx`, `server/nav.test.ts`

**Interfaces:**
- Consumes: tools `get_geogrid`, `get_share_of_voice`; `GeoGrid`, `LineChart`, `foldSeries`.
- Produces:
  - `sovSeries(view: ShareOfVoiceView): ChartSeries[]` — you first, then up to 3 others plus "Other", in percent;
  - route `/c/[clientId]/rankings`;
  - nav icon key `'rankings'`.

- [ ] **Step 1: Write the failing tests.**

`rankings/sov.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { sovSeries } from './sov';

const s = (key: string, name: string, points: (number | null)[], self = false) => ({ key, name, self, points });

describe('sovSeries (decision 10)', () => {
  it('puts you first as percentages and folds the rest beyond three into Other', () => {
    const out = sovSeries({
      keyword: null, keywords: [], scans: [],
      series: [s('self', 'A1 HVAC', [0.3, 0.34], true), s('a', 'Alpha', [0.1, 0.2]), s('b', 'Bravo', [0.1, 0.05]), s('c', 'Charlie', [0.1, 0.1]), s('d', 'Delta', [0.1, 0.01]), s('other_businesses', 'Other businesses', [0.3, 0.3])],
    });
    expect(out.map((x) => x.name)).toEqual(['You', 'Alpha', 'Charlie', 'Other businesses', 'Other']);
    expect(out[0]!.points).toEqual([30, 34]);
    expect(out.at(-1)!.points).toEqual([20, 6]);
  });

  it('keeps nulls as gaps', () => {
    expect(sovSeries({ keyword: null, keywords: [], scans: [], series: [s('other_businesses', 'Other businesses', [null])] })[0]!.points).toEqual([null]);
  });
});
```

  The worked fold: the four non-self series by latest value are Other businesses 30, Alpha 20, Charlie 10, Bravo 5 and Delta 1. `foldSeries(…, 4)` keeps the top 3 (name-sorted: Alpha, Charlie, Other businesses) and folds Bravo + Delta into Other: 10 + 10 = 20, then 5 + 1 = 6.

Nav:
- Expected slice becomes `['Changes', 'Pricing', 'Ads', 'Reviews', 'Local rankings', 'Moves']`.
- `nav.test.ts`: insert `` `/c/${C}/rankings` `` after `/reviews` in both lists, plus the group entry.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @cs/web exec vitest run sov src/components/shell src/server/nav.test.ts` (timeout 600000)
Expected: FAIL.

- [ ] **Step 3: Implement `rankings/sov.ts`:**

```ts
import type { ShareOfVoiceView } from '@cs/tools';
import { type ChartSeries, foldSeries } from '@/components/charts/line-chart';

const pct = (points: (number | null)[]) => points.map((v) => (v === null ? null : Math.round(v * 1000) / 10));

/** Decision 10: you first (slot 1), then the three largest others name-sorted, the rest folded into "Other" — at most 5 lines. */
export function sovSeries(view: ShareOfVoiceView): ChartSeries[] {
  const self = view.series.filter((s) => s.self).map((s) => ({ key: s.key, name: 'You', points: pct(s.points) }));
  const others = view.series.filter((s) => !s.self).map((s) => ({ key: s.key, name: s.name, points: pct(s.points) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
  return [...self, ...foldSeries(others, self.length ? 4 : 5)];
}
```

- [ ] **Step 4: Implement `rankings/page.tsx`:**

```tsx
import { hasFeature, isAgencyRole } from '@cs/core';
import type { GeoGridView, ShareOfVoiceView } from '@cs/tools';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GeoGrid } from '@/components/charts/geo-grid';
import { LineChart } from '@/components/charts/line-chart';
import { requireContext } from '@/server/current-viewer';
import { callTool, tryCallTool } from '@/server/tools';
import { sovSeries } from './sov';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** Module 7 (decisions 9–11): geo-grid per keyword and business, then share of voice over time. */
export default async function RankingsPage({ params, searchParams }: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { clientId } = await params;
  const sp = await searchParams;
  const { ctx } = await requireContext();
  if (!hasFeature(ctx, 'dashboard')) notFound();
  const keyword = (one(sp.keyword) ?? '').trim().slice(0, 100) || undefined;
  const businessParam = one(sp.business);
  const business = businessParam === 'self' || (businessParam && UUID.test(businessParam)) ? businessParam : undefined;
  const scanParam = one(sp.scan);
  const scanId = scanParam && UUID.test(scanParam) ? scanParam : undefined;
  const sovKeyword = (one(sp.sov) ?? '').trim().slice(0, 100) || undefined;

  // A stale business (removed competitor) or scan id falls back to the defaults and says so.
  const picked = await tryCallTool<GeoGridView>(ctx, 'get_geogrid', { clientId, ...(keyword ? { keyword } : {}), ...(business ? { business } : {}), ...(scanId ? { scanId } : {}) });
  const geo = picked ?? (await callTool<GeoGridView>(ctx, 'get_geogrid', { clientId, ...(keyword ? { keyword } : {}) }));
  const sov = geo.setup === 'ready' ? await callTool<ShareOfVoiceView>(ctx, 'get_share_of_voice', { clientId, ...(sovKeyword ? { keyword: sovKeyword } : {}) }) : null;
  const chosen = geo.businesses.find((b) => b.key === geo.business);
  const chosenName = chosen ? (chosen.self ? 'You' : chosen.name) : '';
  const summary = `Top 3 at ${geo.top3} of ${geo.points} points · average rank ${geo.avgRank ?? '—'}`;

  return (
    <>
      <div>
        <h1 className="text-[26px] font-extrabold tracking-tight">Local rankings</h1>
        <p className="mt-1 text-muted-foreground">Where each business shows up in Google’s local results across your service area, from the monthly rank scan.</p>
      </div>

      {geo.setup === 'no_keywords' ? (
        <p className="rounded-lg bg-muted-surface p-3 text-ink">
          Rank tracking starts once keywords and a service area are set on the Profile page.
          {isAgencyRole(ctx.role) && <> <Link href={`/c/${clientId}/settings/profile`} className="font-semibold text-primary-soft-text">Open Profile</Link></>}
        </p>
      ) : geo.setup === 'no_scan' ? (
        <p className="rounded-lg bg-muted-surface p-3 text-ink">The first monthly rank scan hasn’t run yet.</p>
      ) : (
        <>
          {!picked && <p role="alert" className="rounded-lg bg-muted-surface p-3 text-ink">That selection is no longer available, so the defaults are shown.</p>}
          <form method="get" className="flex flex-wrap items-end gap-3 rounded-[14px] bg-surface p-4 shadow-card">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold text-ink">Keyword</span>
              <select name="keyword" defaultValue={geo.keyword ?? ''} className="rounded-md border border-line bg-surface px-2 py-1.5">
                {geo.keywords.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold text-ink">Business</span>
              <select name="business" defaultValue={geo.business ?? ''} className="rounded-md border border-line bg-surface px-2 py-1.5">
                {geo.businesses.map((b) => <option key={b.key} value={b.key}>{b.self ? 'You' : b.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold text-ink">Scan</span>
              <select name="scan" defaultValue={geo.scan?.id ?? ''} className="rounded-md border border-line bg-surface px-2 py-1.5">
                {geo.scans.map((s) => <option key={s.id} value={s.id}>{fmtDate(s.finishedAt)}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold text-ink">Share of voice for</span>
              <select name="sov" defaultValue={sovKeyword && geo.keywords.includes(sovKeyword) ? sovKeyword : ''} className="rounded-md border border-line bg-surface px-2 py-1.5">
                <option value="">All keywords</option>
                {geo.keywords.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </label>
            <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white">Show</button>
          </form>

          <section className="rounded-[14px] bg-surface p-6 shadow-card">
            <h2 className="text-lg font-bold text-ink">{chosenName} · “{geo.keyword}”</h2>
            <p className="mb-3 text-sm text-muted-foreground">
              {geo.scan && `Scan of ${fmtDate(geo.scan.finishedAt)} · `}Grid {geo.size}×{geo.size}{geo.radiusKm !== null && ` · ${geo.radiusKm} km radius`}
            </p>
            <p className="mb-3 font-semibold text-ink">{summary}</p>
            <GeoGrid title={`Local rankings for ${geo.keyword}`} summary={summary} cells={geo.cells} businessName={chosenName} keyword={geo.keyword ?? ''} />
          </section>

          {sov && (
            <section className="rounded-[14px] bg-surface p-6 shadow-card">
              <h2 className="mb-1 text-lg font-bold text-ink">Share of voice</h2>
              <p className="mb-3 text-sm text-muted-foreground">Share of the top-3 local-pack places, scan by scan ({sov.keyword ?? 'all keywords'}).</p>
              <LineChart
                title="Share of top-3 local-pack slots"
                labels={sov.scans.map((s) => s.finishedAt.slice(0, 10))}
                series={sovSeries(sov)}
                valueLabel="share of top-3 places"
                period="scan"
                yMax={100}
                formatValue={(v) => `${Math.round(v)}%`}
              />
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Share of voice in the latest scan</caption>
                  <thead><tr><th scope="col">Business</th><th scope="col">Latest scan</th></tr></thead>
                  <tbody>
                    {sov.series.map((s) => {
                      const v = s.points.at(-1) ?? null;
                      return <tr key={s.key}><th scope="row" className="font-normal">{s.self ? 'You' : s.name}</th><td>{v === null ? '—' : `${Math.round(v * 100)}%`}</td></tr>;
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}
```

- [ ] **Step 5: Add the nav item.** In `nav-items.ts`, add `'rankings'` to the icon union and replace the remaining marker with:

```ts
  if (flags.dashboard) add(`${base}/rankings`, 'Local rankings', 'rankings');
```

  In `sidebar-nav.tsx`, add `rankings: MapPin` (import `MapPin`).

- [ ] **Step 6: Run the tests and typecheck**

Run: `pnpm --filter @cs/web exec vitest run sov src/components/shell src/server/nav.test.ts` (timeout 600000), then `pnpm --filter @cs/web typecheck`.
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/src/app/(app)/c/[clientId]/rankings" apps/web/src/components/shell apps/web/src/server/nav.test.ts
git commit -m "feat(web): local rankings page"
```

---

### Task 17: Competitor profile sections and profile minors

**Files:**
- Create: `apps/web/src/app/(app)/c/[clientId]/competitors/[competitorId]/sections.tsx`, `sections.test.tsx`
- Modify: `apps/web/src/app/(app)/c/[clientId]/competitors/[competitorId]/page.tsx`

**Interfaces:**
- Consumes: tools `get_price_matrix` (`competitorId`), `list_ads` (`competitorId`, `limit: 3`), `get_theme_benchmark`, `get_geogrid` (`business: competitorId`); `formatPrice`/`pricingHref` from `../../pricing/format`.
- Produces: `PricesSection`, `AdsSection`, `ReviewsSection`, `RankingsSection` (decision 13).

- [ ] **Step 1: Write the failing test** — `sections.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdsSection, PricesSection, RankingsSection, ReviewsSection } from './sections';

const C = 'c1';
const X = 'x1';

describe('competitor profile sections (decision 13)', () => {
  it('lists up to five current prices and links to pricing', () => {
    render(<PricesSection clientId={C} competitorId={X} matrix={{
      services: [{ id: 'ac_tune_up', name: 'AC tune-up', offered: true }],
      rows: [{ competitorId: X, name: 'Smith HVAC', cells: [{ serviceId: 'ac_tune_up', prices: [{ amount: 79, unit: 'USD', qualifier: 'exact', promo: false, since: '2026-10-01T00:00:00.000Z' }], change: null }] }],
    }} />);
    expect(screen.getByRole('heading', { name: 'Prices' })).toBeTruthy();
    expect(screen.getByText('AC tune-up')).toBeTruthy();
    expect(screen.getByText('$79')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'See pricing' }).getAttribute('href')).toBe(`/c/${C}/pricing?competitor=${X}&service=ac_tune_up`);
  });

  it('shows the newest active ads, or says there are none', () => {
    const { unmount } = render(<AdsSection clientId={C} competitorId={X} ads={{ hasMore: false, items: [{ id: 'a', competitorId: X, competitorName: 'Smith HVAC', platform: 'meta', format: null, title: '$49 tune-up', text: null, landingUrl: null, firstSeenAt: '2026-09-12T00:00:00.000Z', lastSeenAt: '2026-10-06T00:00:00.000Z', endedAt: null, active: true, libraryUrl: null }] }} />);
    expect(screen.getByText('$49 tune-up')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'See ads' }).getAttribute('href')).toBe(`/c/${C}/ads?competitor=${X}`);
    unmount();
    render(<AdsSection clientId={C} competitorId={X} ads={{ hasMore: false, items: [] }} />);
    expect(screen.getByText('No active ads.')).toBeTruthy();
  });

  it('compares its top themes with yours', () => {
    const theme = (themeId: string, share: number | null) => ({ themeId, mentions: 1, asked: 2, share, sentiment: 0, shareDelta: null, sentimentDelta: null });
    render(<ReviewsSection clientId={C} competitorId={X} benchmark={{
      windowDays: 90, from: '', to: '',
      themes: [{ id: 'response_time', name: 'Response time' }, { id: 'upsell_pressure', name: 'Upsell pressure' }],
      businesses: [
        { competitorId: 's', name: 'A1 HVAC', self: true, reviews: 4, avgRating: 4.5, prevReviews: 0, prevAvgRating: null, themes: [theme('response_time', 0.1), theme('upsell_pressure', null)] },
        { competitorId: X, name: 'Smith HVAC', self: false, reviews: 2, avgRating: 3, prevReviews: 0, prevAvgRating: null, themes: [theme('response_time', 0.5), theme('upsell_pressure', 0.25)] },
      ],
    }} />);
    expect(screen.getByText('3.0 ★ average · 2 reviews in 90 days')).toBeTruthy();
    expect(screen.getByText('Response time — 50% (you 10%)')).toBeTruthy();
    expect(screen.getByText('Upsell pressure — 25% (you —)')).toBeTruthy();
  });

  it('lists each keyword’s ranking with a link to its geo-grid, or the setup state', () => {
    const base = { scan: null, scans: [], keywords: ['ac repair'], keyword: 'ac repair', businesses: [], business: X, size: 3, cells: [], top3: 0, points: 0, avgRank: null, radiusKm: 25 };
    const { unmount } = render(<RankingsSection clientId={C} competitorId={X} geo={{ ...base, setup: 'ready', keywordSummaries: [{ keyword: 'ac repair', top3: 8, points: 8, avgRank: 1.4 }] }} />);
    const link = screen.getByRole('link', { name: 'ac repair — top 3 at 8 of 8 · avg 1.4' });
    expect(link.getAttribute('href')).toBe(`/c/${C}/rankings?keyword=ac+repair&business=${X}`);
    unmount();
    render(<RankingsSection clientId={C} competitorId={X} geo={{ ...base, setup: 'no_scan', keywordSummaries: [] }} />);
    expect(screen.getByText('The first monthly rank scan hasn’t run yet.')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @cs/web exec vitest run sections` (timeout 600000)
Expected: FAIL.

- [ ] **Step 3: Implement `sections.tsx`:**

```tsx
import type { AdList, GeoGridView, PriceMatrixView, ThemeBenchmarkView } from '@cs/tools';
import Link from 'next/link';
import { formatPrice, pricingHref } from '../../pricing/format';

const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);
const LINK = 'mt-3 inline-block text-sm font-semibold text-primary-soft-text';

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-[14px] bg-surface p-6 shadow-card">
      <h2 id={id} className="mb-3 text-lg font-bold text-ink">{title}</h2>
      {children}
    </section>
  );
}

export function PricesSection({ clientId, competitorId, matrix }: { clientId: string; competitorId: string; matrix: PriceMatrixView }) {
  const row = matrix.rows.find((r) => r.competitorId === competitorId);
  const names = new Map(matrix.services.map((s) => [s.id, s.name]));
  const cells = row?.cells.slice(0, 5) ?? [];
  return (
    <Section id="profile-prices" title="Prices">
      {cells.length === 0 ? <p className="text-sm text-muted-foreground">No prices seen on its website yet.</p> : (
        <ul className="flex flex-col divide-y divide-line text-sm">
          {cells.map((c) => (
            <li key={c.serviceId} className="flex items-baseline justify-between gap-3 py-2">
              <span className="text-ink">{names.get(c.serviceId) ?? c.serviceId}</span>
              <span className="font-bold text-secondary">{c.prices.map(formatPrice).join(' · ')}</span>
            </li>
          ))}
        </ul>
      )}
      <Link href={pricingHref(clientId, cells[0] ? { competitor: competitorId, service: cells[0].serviceId } : {})} className={LINK}>See pricing</Link>
    </Section>
  );
}

export function AdsSection({ clientId, competitorId, ads }: { clientId: string; competitorId: string; ads: AdList }) {
  return (
    <Section id="profile-ads" title="Ads">
      {ads.items.length === 0 ? <p className="text-sm text-muted-foreground">No active ads.</p> : (
        <ul className="flex flex-col divide-y divide-line text-sm">
          {ads.items.map((a) => (
            <li key={a.id} className="py-2">
              <span className="font-semibold text-ink">{a.title ?? a.text?.slice(0, 80) ?? 'Untitled ad'}</span>
              <span className="block text-xs text-muted-foreground">{a.platform === 'meta' ? 'Meta' : 'Google'} · first seen {fmt(a.firstSeenAt)}</span>
            </li>
          ))}
        </ul>
      )}
      <Link href={`/c/${clientId}/ads?competitor=${competitorId}`} className={LINK}>See ads</Link>
    </Section>
  );
}

export function ReviewsSection({ clientId, competitorId, benchmark }: { clientId: string; competitorId: string; benchmark: ThemeBenchmarkView }) {
  const me = benchmark.businesses.find((b) => b.competitorId === competitorId);
  const you = benchmark.businesses.find((b) => b.self);
  const names = new Map(benchmark.themes.map((t) => [t.id, t.name]));
  const top = (me?.themes ?? []).filter((t) => t.share !== null && t.share > 0).sort((a, b) => b.share! - a.share!).slice(0, 3);
  return (
    <Section id="profile-reviews" title="Reviews">
      {!me || me.reviews === 0 ? <p className="text-sm text-muted-foreground">No reviews in the last 90 days.</p> : (
        <>
          <p className="text-sm text-ink">{me.avgRating === null ? '—' : me.avgRating.toFixed(1)} ★ average · {me.reviews} reviews in 90 days</p>
          {top.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1 text-sm text-ink">
              {top.map((t) => (
                <li key={t.themeId}>
                  {names.get(t.themeId) ?? t.themeId} — {pct(t.share)}{you ? ` (you ${pct(you.themes.find((y) => y.themeId === t.themeId)?.share ?? null)})` : ''}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <Link href={`/c/${clientId}/reviews?business=${competitorId}`} className={LINK}>See reviews</Link>
    </Section>
  );
}

export function RankingsSection({ clientId, competitorId, geo }: { clientId: string; competitorId: string; geo: GeoGridView }) {
  return (
    <Section id="profile-rankings" title="Local rankings">
      {geo.setup === 'no_keywords' ? <p className="text-sm text-muted-foreground">Rank tracking starts once keywords and a service area are set.</p>
        : geo.setup === 'no_scan' ? <p className="text-sm text-muted-foreground">The first monthly rank scan hasn’t run yet.</p>
        : (
          <ul className="flex flex-col gap-1 text-sm">
            {geo.keywordSummaries.map((k) => (
              <li key={k.keyword}>
                <Link href={`/c/${clientId}/rankings?${new URLSearchParams({ keyword: k.keyword, business: competitorId }).toString()}`} className="font-semibold text-primary-soft-text">
                  {`${k.keyword} — top 3 at ${k.top3} of ${k.points} · avg ${k.avgRank ?? '—'}`}
                </Link>
              </li>
            ))}
          </ul>
        )}
    </Section>
  );
}
```

- [ ] **Step 4: Wire the page and fix the carried minors** in `competitors/[competitorId]/page.tsx`:
  1. Import the four sections and the types `AdList, GeoGridView, PriceMatrixView, ThemeBenchmarkView`. After the existing `profile`/`timeline`/`pages` reads, add:

```ts
  const [matrix, ads, benchmark, geo] = await Promise.all([
    callTool<PriceMatrixView>(ctx, 'get_price_matrix', { clientId, competitorId }),
    callTool<AdList>(ctx, 'list_ads', { clientId, competitorId, limit: 3 }),
    callTool<ThemeBenchmarkView>(ctx, 'get_theme_benchmark', { clientId }),
    callTool<GeoGridView>(ctx, 'get_geogrid', { clientId, business: competitorId }),
  ]);
```

     The variable names `profile`, `timeline`, `pages`, `ctx` and `now` are the existing ones in that file; adjust if they differ.
  2. Replace `{/* 5c-2 adds Pricing, Ads, Reviews and Rankings sections here. */}` with:

```tsx
      <div className="grid gap-4 lg:grid-cols-2">
        <PricesSection clientId={clientId} competitorId={competitorId} matrix={matrix} />
        <AdsSection clientId={clientId} competitorId={competitorId} ads={ads} />
        <ReviewsSection clientId={clientId} competitorId={competitorId} benchmark={benchmark} />
        <RankingsSection clientId={clientId} competitorId={competitorId} geo={geo} />
      </div>
```

  3. Carried minors (roadmap "Phase 5c-1 carry-over", competitor profile UI):
     - KPI numbers use the brand size: replace `text-xl font-extrabold` with `text-[34px] font-extrabold leading-tight text-secondary` in the rating, open-moves and pages KPIs.
     - The ads KPI shows the total big (`{profile.activeAds.google + profile.activeAds.meta}`) and `Google n · Meta n` as a `text-sm text-muted-foreground` line beneath.
     - The collection-status line no longer leaves a dangling " · ": `{s.lastRunAt ? `${relativeTime(s.lastRunAt, now)}${s.lastStatus ? ` · ${s.lastStatus}` : ''}` : 'Not run yet'}`.
     - An empty `profile.sources` shows `<p className="text-sm text-muted-foreground">No data sources yet.</p>` instead of an empty list.
     - The pages table is wrapped in `<div className="overflow-x-auto">` (phone width, Task 18).

- [ ] **Step 5: Run the tests and typecheck**

Run: `pnpm --filter @cs/web exec vitest run sections timeline` (timeout 600000), then `pnpm --filter @cs/web typecheck`.
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/(app)/c/[clientId]/competitors/[competitorId]"
git commit -m "feat(web): pricing, ads, reviews and rankings sections on the competitor profile"
```

---

### Task 18: Responsive app shell

**Files:**
- Create: `packages/ui/src/components/sheet.tsx`, `apps/web/src/components/shell/mobile-nav.tsx`, `apps/web/src/components/shell/mobile-nav.test.tsx`
- Modify: `packages/ui/src/index.ts`, `apps/web/src/components/shell/sidebar.tsx`, `top-bar.tsx`, `apps/web/src/app/(app)/layout.tsx`, `apps/web/e2e/workspace.spec.ts`
- Modify as needed: any page whose content overflows at 390 px (see Step 6)

**Interfaces:**
- Consumes: `SidebarNav` (`flags`, `clients`), `Wordmark`, `radix-ui` `Dialog` (already a `@cs/ui` dependency).
- Produces:
  - `@cs/ui` exports `Sheet`, `SheetTrigger`, `SheetContent` (`side?: 'left' | 'right'`), `SheetTitle`, `SheetClose`;
  - `MobileNav({ displayName, logoUrl, whiteLabel, flags, clients })`;
  - `TopBar` gains `menu?: React.ReactNode`.

- [ ] **Step 1: Write the failing test** — `apps/web/src/components/shell/mobile-nav.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { NavRoleFlags } from './nav-items';

vi.mock('next/navigation', () => ({ usePathname: () => '/c/11111111-1111-1111-1111-111111111111' }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) => <a href={href} {...rest}>{children}</a>,
}));

const { MobileNav } = await import('./mobile-nav');

const flags: NavRoleFlags = {
  isAgency: false, isAgencyAdmin: false, isUser: true, homePath: '/c/11111111-1111-1111-1111-111111111111',
  dashboard: true, manageCompetitors: false, alertRules: false, mcp: false,
};

describe('MobileNav (decision 14)', () => {
  it('opens a drawer with the same nav items and closes when a link is tapped', () => {
    render(<MobileNav displayName="Rival Monday" logoUrl={null} whiteLabel={false} flags={flags} clients={[]} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const dialog = screen.getByRole('dialog', { name: 'Menu' });
    expect(dialog).toBeTruthy();
    const pricing = screen.getByRole('link', { name: 'Pricing' });
    fireEvent.click(pricing);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on Escape', () => {
    render(<MobileNav displayName="Rival Monday" logoUrl={null} whiteLabel={false} flags={flags} clients={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @cs/web exec vitest run mobile-nav` (timeout 600000)
Expected: FAIL — `./mobile-nav` doesn't exist.

- [ ] **Step 3: Create `packages/ui/src/components/sheet.tsx`**, mirroring `dialog.tsx`'s imports (`'use client'` if `dialog.tsx` has it, `radix-ui`, `cn` from `../lib/cn`):

```tsx
'use client';

import { Dialog as SheetPrimitive } from 'radix-ui';
import type * as React from 'react';
import { cn } from '../lib/cn';

function Sheet(props: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger(props: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose(props: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return <SheetPrimitive.Title data-slot="sheet-title" className={cn('font-semibold text-ink', className)} {...props} />;
}

/** A side drawer on radix Dialog: focus is trapped while open and returns to the trigger on close; Escape and the backdrop close it. */
function SheetContent({ className, children, side = 'left', ...props }: React.ComponentProps<typeof SheetPrimitive.Content> & { side?: 'left' | 'right' }) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay data-slot="sheet-overlay" className="fixed inset-0 z-50 bg-black/40" />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          'fixed inset-y-0 z-50 flex w-[280px] max-w-[85vw] flex-col gap-1 overflow-y-auto bg-surface px-3.5 py-[22px] shadow-lg outline-none',
          side === 'left' ? 'left-0 border-r border-line' : 'right-0 border-l border-line',
          className,
        )}
        {...props}
      >
        {children}
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

export { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger };
```

  Add `export * from './components/sheet';` to `packages/ui/src/index.ts`.

- [ ] **Step 4: Create `apps/web/src/components/shell/mobile-nav.tsx`:**

```tsx
'use client';

import { Sheet, SheetContent, SheetTitle, SheetTrigger, Wordmark } from '@cs/ui';
import { Menu } from 'lucide-react';
import { useState } from 'react';
import type { NavRoleFlags } from './nav-items';
import { type NavClient, SidebarNav } from './sidebar-nav';

/**
 * Decision 14: below `lg` the sidebar is hidden and this menu button opens the same `SidebarNav` in a drawer.
 * Any link tap closes it (including a tap on the current page, where the pathname doesn't change).
 * Plain props only — no `@cs/email` import in a client file (HANDOVER §6).
 */
export function MobileNav({ displayName, logoUrl, whiteLabel, flags, clients }: {
  displayName: string;
  logoUrl: string | null;
  whiteLabel: boolean;
  flags: NavRoleFlags;
  clients: NavClient[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger aria-label="Open menu" className="grid h-[38px] w-[38px] flex-shrink-0 place-items-center rounded-lg text-ink hover:bg-muted-surface lg:hidden">
        <Menu aria-hidden className="h-5 w-5" />
      </SheetTrigger>
      <SheetContent side="left" aria-describedby={undefined} onClick={(e) => { if ((e.target as HTMLElement).closest('a')) setOpen(false); }}>
        <SheetTitle className="sr-only">Menu</SheetTitle>
        <div className="px-2.5 pb-[18px]">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={displayName} className="h-8 w-auto" />
          ) : (
            <Wordmark name={whiteLabel ? displayName : undefined} />
          )}
        </div>
        <SidebarNav flags={flags} clients={clients} />
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 5: Wire the shell.**
  1. `sidebar.tsx`: change the `<aside>` class from `sticky top-0 flex h-screen …` to `sticky top-0 hidden h-screen … lg:flex` (keep every other class).
  2. `top-bar.tsx`: add `menu?: React.ReactNode` to the props, render `{menu}` as the first child of the inner `div`, and change its `px-7` to `px-4 lg:px-7`.
  3. `app/(app)/layout.tsx`:
     - pass `menu={<MobileNav displayName={branding.displayName} logoUrl={branding.logoUrl} whiteLabel={branding.displayName !== 'Rival Monday'} flags={navFlagsFor(viewer, webEnv().platformAdmins)} clients={clients.map(({ id, name }) => ({ id, name }))} />}` to `TopBar`;
     - compute the flags and the client list once in a `const` and reuse them for `Sidebar`;
     - change `<main className="… px-7 …">` to `px-4 lg:px-7`.
  4. `apps/web/e2e/workspace.spec.ts`: change `test.fixme('the overview has no horizontal page scroll at 390 px'` to `test(` and delete the "KNOWN APP GAP" comment above it.

- [ ] **Step 6: Run the unit tests, then look for overflow at 390 px.**

Run: `pnpm --filter @cs/web exec vitest run mobile-nav src/components/shell` (timeout 600000). Expected: PASS.

Then grep the pages for fixed widths that don't collapse:
- `grep -rnE "w-\[[0-9]{3,}px\]|min-w-\[[0-9]{3,}px\]|grid-cols-\[[0-9]{3,}px" apps/web/src/app apps/web/src/components`;
- for each hit without an `lg:`/`md:`/`sm:` prefix, make it responsive (e.g. `lg:grid-cols-[420px_1fr]`, `w-full lg:w-[420px]`);
- wrap any `<Table>` that isn't already inside an `overflow-x-auto` container.

Check free commit memory (Global Constraints). Then run `pnpm --filter @cs/web e2e -- -g "390"` (timeout 600000). Expected: PASS. If it fails, open the trace and fix the element that is wider than the viewport.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/components/sheet.tsx packages/ui/src/index.ts apps/web/src/components/shell apps/web/src/app apps/web/e2e/workspace.spec.ts
git commit -m "feat(web): responsive app shell with a mobile nav drawer"
```

---

### Task 19: E2E, full suite, final review and documentation

**Files:**
- Modify: `apps/web/e2e/seed.ts`
- Create: `apps/web/e2e/data-views.spec.ts`
- Modify: `docs/HANDOVER.md`, `docs/superpowers/plans/2026-09-29-roadmap.md`, this plan (status line)

- [ ] **Step 1: Extend the E2E seed** (`apps/web/e2e/seed.ts`):
  - Add `pricePoint, rankScan, rankSnapshot, review, reviewAnalysis` to the `@cs/db` import.
  - In `seed()`, give the client `keywords: ['ac repair'], serviceArea: { center: { lat: 32.4, lng: -97.79 }, radiusKm: 25, zips: ['76048'] }, placeId: 'e2e-self-place'`.
  - Give `Smith HVAC` `placeId: 'e2e-smith-place'`.
  - At the end of `seedWorkspace` (before the `briefItem` update), append:

```ts
  // 5c-2 data views.
  const ago = (days: number) => new Date(Date.now() - days * DAY);
  await db.insert(pricePoint).values([
    { competitorId, trackedPageId: page!.id, verticalId: 'hvac_plumbing', serviceId: 'ac_tune_up', amount: 99, unit: 'USD', qualifier: 'exact', promo: false, raw: '$99', context: 'AC tune-up $99',
      firstSeenAt: ago(120), lastSeenAt: ago(2), firstCaptureId: before.id, lastCaptureId: before.id, endedAt: ago(1), endedCaptureId: after.id },
    { competitorId, trackedPageId: page!.id, verticalId: 'hvac_plumbing', serviceId: 'ac_tune_up', amount: 79, unit: 'USD', qualifier: 'exact', promo: true, raw: '$79', context: 'AC tune-up $79',
      firstSeenAt: ago(1), lastSeenAt: new Date(), firstCaptureId: after.id, lastCaptureId: after.id },
  ]);

  await db.insert(ad).values({ competitorId, platform: 'meta', externalId: 'e2e-meta-1', title: 'Spring AC special', text: 'Book a $49 tune-up this week.', isActive: true, firstSeenAt: adsAt, lastSeenAt: new Date(), firstCaptureId: adsCap!.id, lastCaptureId: adsCap!.id });

  const [self] = await db.insert(competitor).values({ name: 'E2E HVAC', placeId: 'e2e-self-place' }).returning();
  await db.update(client).set({ selfCompetitorId: self!.id }).where(eq(client.id, clientId));
  const [r1] = await db.insert(review).values({ competitorId, dedupeKey: 'e2e-r1', rating: 2, text: 'The technician was late and pushy.', reviewerHash: 'e2e-hash-1', postedAt: ago(3) }).returning();
  const [r2] = await db.insert(review).values({ competitorId: self!.id, dedupeKey: 'e2e-r2', rating: 5, text: 'Fast and friendly service.', reviewerHash: 'e2e-hash-2', postedAt: ago(4) }).returning();
  await db.insert(reviewAnalysis).values([
    { reviewId: r1!.id, verticalId: 'hvac_plumbing', competitorId, textSha: 'e2e', asked: ['response_time', 'upsell_pressure'], themes: ['response_time', 'upsell_pressure'], sentiment: 0, confidence: 0.9, analysisVersion: 1 },
    { reviewId: r2!.id, verticalId: 'hvac_plumbing', competitorId: self!.id, textSha: 'e2e', asked: ['response_time'], themes: ['response_time'], sentiment: 4, confidence: 0.9, analysisVersion: 1 },
  ]);

  const [scan] = await db.insert(rankScan).values({ agencyId, clientId, status: 'done', snapshots: 8, startedAt: ago(2), finishedAt: ago(2) }).returning();
  const res = (rank: number, placeId: string, title: string) => ({ rank, placeId, cid: null, domain: null, title });
  const round = (n: number) => Math.round(n * 1e6) / 1e6;
  const snaps = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (r === 2 && c === 2) continue; // a failed point → "no data"
      const results = r === 0
        ? [res(1, 'e2e-self-place', 'E2E HVAC'), res(2, 'e2e-smith-place', 'Smith HVAC'), res(3, 'e2e-other', 'Other Air')]
        : [res(1, 'e2e-smith-place', 'Smith HVAC'), res(2, 'e2e-other', 'Other Air'), res(3, 'e2e-other-2', 'Third Air'), res(5, 'e2e-self-place', 'E2E HVAC')];
      snaps.push({ agencyId, clientId, scanId: scan!.id, keyword: 'ac repair', lat: round(32.45 - 0.05 * r), lng: round(-97.84 + 0.05 * c), results, capturedAt: ago(2) });
    }
  }
  await db.insert(rankSnapshot).values(snaps);
```

  `competitor` and `client` are already imported in `seed.ts`; add them if not. If `adsAt`/`adsCap` are declared after this point, place the meta-ad insert after them.

- [ ] **Step 2: Write `apps/web/e2e/data-views.spec.ts`:**

```ts
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import { signIn } from './helpers';

/** One sign-in for the whole run, reused as storage state (HANDOVER §6 magic-link rate limit) — same as workspace.spec.ts. */
const ADMIN_STATE = fileURLToPath(new URL('../test-results/admin-state.json', import.meta.url));

test.beforeAll(async ({ browser }, testInfo) => {
  if (existsSync(ADMIN_STATE)) return;
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await signIn(page, 'admin@e2e.test');
  await expect(page).toHaveURL(/\/agency$/);
  await context.storageState({ path: ADMIN_STATE });
  await context.close();
});

test.use({ storageState: ADMIN_STATE });

async function openClient(page: Page): Promise<string> {
  await page.goto('/agency');
  await page.getByRole('link', { name: 'E2E HVAC' }).first().click();
  await page.waitForURL(/\/c\/[0-9a-f-]{36}/);
  return /\/c\/([0-9a-f-]{36})/.exec(page.url())![1]!;
}

const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test('pricing shows the competitor card and opens a price history', async ({ page }) => {
  await openClient(page);
  await page.getByRole('link', { name: 'Pricing' }).click();
  const tune = page.getByRole('link', { name: /AC tune-up/ });
  await expect(tune).toContainText('$79');
  await expect(tune).toContainText('▼ $20');
  await tune.click();
  await expect(page.getByRole('img', { name: /AC tune-up price history/ })).toBeVisible();
});

test('ads lists creatives with a library link', async ({ page }) => {
  await openClient(page);
  await page.getByRole('link', { name: 'Ads', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Spring AC special' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View in Meta Ad Library' })).toHaveAttribute('href', /id=e2e-meta-1/);
  await expect(page.getByText('Targeting not disclosed (US)').first()).toBeVisible();
});

test('reviews shows the heatmap and searches review text', async ({ page }) => {
  const clientId = await openClient(page);
  await page.getByRole('link', { name: 'Reviews', exact: true }).click();
  await expect(page.getByRole('img', { name: /What customers talk about/ })).toBeVisible();
  await expect(page.getByText('The technician was late and pushy.')).toBeVisible();
  await page.goto(`/c/${clientId}/reviews?q=zzz`);
  await expect(page.getByText('No reviews match.')).toBeVisible();
});

test('local rankings draws the geo-grid and share of voice', async ({ page }) => {
  await openClient(page);
  await page.getByRole('link', { name: 'Local rankings' }).click();
  await expect(page.getByRole('img', { name: /Local rankings for ac repair/ })).toBeVisible();
  await expect(page.getByText('Top 3 at 3 of 8 points · average rank 3.5').first()).toBeVisible();
  await expect(page.getByRole('img', { name: /Share of top-3 local-pack slots/ })).toBeVisible();
});

test('the competitor profile shows prices, ads, reviews and rankings', async ({ page }) => {
  await openClient(page);
  await page.getByRole('link', { name: 'Competitors' }).click();
  await page.getByRole('link', { name: 'Smith HVAC', exact: true }).click();
  for (const name of ['Prices', 'Ads', 'Reviews', 'Local rankings']) await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /ac repair — top 3 at 8 of 8/ })).toBeVisible();
});

test.describe('at 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('no module page scrolls sideways (Review Focus 5)', async ({ page }) => {
    const clientId = await openClient(page);
    for (const path of ['', '/pricing', '/ads', '/reviews', '/rankings', '/competitors']) {
      await page.goto(`/c/${clientId}${path}`);
      expect(await noSideScroll(page), `${path || '/'} fits`).toBe(true);
    }
    await page.getByRole('link', { name: 'Smith HVAC', exact: true }).click();
    await page.waitForURL(/\/competitors\/[0-9a-f-]{36}/);
    expect(await noSideScroll(page), 'competitor profile fits').toBe(true);
  });

  test('the menu opens a drawer that navigates and closes', async ({ page }) => {
    const clientId = await openClient(page);
    await page.getByRole('button', { name: 'Open menu' }).click();
    await page.getByRole('dialog').getByRole('link', { name: 'Pricing' }).click();
    await expect(page).toHaveURL(new RegExp(`/c/${clientId}/pricing`));
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Open menu' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
```

  Smith's geo-grid has rank 2 on the top row and rank 1 elsewhere: top 3 at 8 of 8. Self has 1 ×3 and 5 ×5: 3 of 8, average 3.5.

- [ ] **Step 3: Run E2E.** Check free commit memory (≥ ~8 GB), then run `pnpm --filter @cs/web e2e` (timeout 600000).
Expected: all pass, with no `test.fixme` left in `workspace.spec.ts`. Fix any failures before going on. If an existing spec trips over the new seed data (e.g. the overview's ZIP count or ad counts), update its expectation, and say so in the commit message.

- [ ] **Step 4: Run the full suite** in the background (~50 min): `npx turbo run test --concurrency=1 --continue`, then `pnpm typecheck`. Don't start anything else that uses `cs_test` while it runs. Record the per-package counts. Neon `ECONNRESET` flakes in `db` re-run clean (HANDOVER §6).

- [ ] **Step 5: Commit the E2E work**

```bash
git add apps/web/e2e
git commit -m "test(e2e): 5c-2 data views, 390 px checks and the mobile drawer"
```

- [ ] **Step 6: Final whole-branch review** on the most capable model, against this plan's Review Focus and Decisions (superpowers:requesting-code-review, base = the commit before Task 1). Fix Critical and Important findings in one fix wave, re-run the touched packages' tests, then re-review the fix wave.

- [ ] **Step 7: Documentation.**
  - `docs/HANDOVER.md`:
    - the status line and §3 (5c-2 done on branch `phase-5c2-data-views`, test counts, review outcome);
    - the key-documents table row for this plan;
    - §5 item 2 — Phase 5 complete;
    - append **5c-2 owner-verification steps** under the end-of-Phase-5 checklist:
      1. Pricing on `cs_dev` shows the "website monitoring isn't switched on" message (no `price_point` rows).
      2. Ads lists the tracked competitors' real Meta/Google ads, and the library links open the right ad.
      3. Reviews shows the heatmap for the self business plus the 5 competitors; search finds a known phrase; the rating mix matches Google.
      4. Local rankings: for each keyword, compare the grid with a map of Granbury (north at the top, east on the right); spot-check one cell against a manual Google Maps search from that area; check that share of voice adds up to about 100 %.
      5. The competitor profile shows all four sections.
      6. On a phone (or 390 px devtools), every page fits, and the menu drawer works.
    - any new carry-over.
  - Roadmap: mark 5c-2 done. Add a "Phase 5c-2 carry-over" section with the plan's decision 16 list, plus every minor parked during execution or review.
  - This plan: add a status line under the title ("Done on branch … — merged only with the owner's go-ahead").

```bash
git add docs
git commit -m "docs: Phase 5c-2 complete — handover and roadmap"
```

- [ ] **Step 8: Hand back to the owner** with the branch, test results, review outcome and the verification checklist. **Merge only with the owner's go-ahead** (HANDOVER §5 item 2.5).

---

## Self-review notes (writing-plans checklist, done 2026-10-08)

1. **Spec coverage.**
   - §5.2 module 4 (price matrix with history): Tasks 2, 3, 5.
   - Module 5 (creative archive, first/last seen, active-ad trend, "targeting not disclosed (US)"): Tasks 6, 7.
   - Module 6 (theme heatmap, rating and review-velocity trends, sample reviews): Tasks 8–12. Velocity is the "reviews per month" KPI and the monthly counts. "Pseudonymised" is met by never returning the reviewer; the text is as published by owner decision 6.
   - Module 7 (geo-grid per keyword, share of voice over time): Tasks 13–16.
   - Module 2 (competitor profile: prices, ads, reviews, rankings): Task 17.
   - All eight §8.2 tools have a task.
   - §4.3 tenant-private ranks: Review Focus 1 (Tasks 13, 14).
   - §11 no existence leaks: `not_found` everywhere (Review Focus 2).
   - Spec items deliberately not here: list tools' `detail=summary|full` and dashboard deep links in results — Phase 6 (MCP), as in 5c-1.
2. **Placeholder scan.** No TBDs. Names checked against the repo while writing: `competitor.cid`, the `BadgeDollarSign` icon, the `muted-surface-2` token (there is no `line` colour token), and `tryCallTool` hiding `invalid_input`.
3. **Type consistency.**
   - `Business.key` is `'self'` or a competitor id everywhere (`BusinessKey`, `GeoGridView.business`, `ShareOfVoiceView.series[].key`, search `business`).
   - `OTHER_BUSINESSES = 'other_businesses'` never collides with `foldSeries`'s `'other'`.
   - `ScanRef` is shared by `GeoGridView` and `ShareOfVoiceView`.
   - `PriceNowView`/`PriceMatrixView` are used by `format.ts`, `PriceCard` and `sections.tsx`.
   - `AdView`/`AdList` are used by `AdCard` and `AdsSection`.
   - `ThemeBenchmarkView` is used by `ThemeHeatmap` and `ReviewsSection`.
   - `GeoGridView` is used by the rankings page and `RankingsSection`.
4. **Review Focus.** Each line has a test in the owning task:
   - 1 → Tasks 13/14 isolation tests;
   - 2 → `not_found` tests in Tasks 1, 2, 3, 6, 10, 13;
   - 3 → null tests in Tasks 3, 9, 11, 13, 14, 15;
   - 4 → a `permission_denied` test in every tool task;
   - 5 → Tasks 18, 19 (the drawer unit test and the 390 px E2E).
