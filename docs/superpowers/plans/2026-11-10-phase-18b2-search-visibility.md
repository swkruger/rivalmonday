# Phase 18b-2 — Google search & AI answers visibility — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Weekly page-one positions, AI-answer citations and Local Services ad names for each client's rank keywords; confirmed
entries/citations become brief lines; a "Google search" section on Rankings; "Cited in AI answers" scorecard column.
**Architecture:** The 13b `rank-scan` job calls the live organic endpoint once per keyword after the map grid; results go to a new
tenant-private `serp_snapshot`; `diffRankScan` also runs `diffSerp` (two-scan confirm) → `rank_change` with `details.surface`.
**Tech stack:** TypeScript, Drizzle, Vitest, pg-boss worker, Next.js App Router.
**Spec:** `docs/superpowers/specs/2026-11-10-phase-18b2-search-visibility-design.md` (E1–E10 and Interfaces binding).

## Global constraints
- Tenant-private: `serp_snapshot` is `tenant_client`; the new tool refuses out-of-scope clients with `not_found`; `ISOLATION_FIXTURES` entry.
- Client text never names the vendor; copy exactly as spec § Copy; strings reach `pnpm copy:review` (agents never sign).
- Vendor calls via `DataForSeoClient` (ledger scope = client); scans keep `clientWorkAllowed` + `checkRankScanBudget`.
- No new change type, no pack bump. Map rank behaviour unchanged.
- Never edit applied migrations; next free number at execution time. Commits end with your model's `Co-Authored-By`; LF only.
- Implementers run focused tests only; `test:affected` + `e2e:affected` once at final review.

## Decisions
Spec E1–E10. Task 0 applies E3 as a ruling (no stop) unless live price > $0.005/call (then stop and ask).

## File structure
- Create: migration `serp_snapshot`; `packages/collectors/src/rankings/serp.ts` (+ test, fixture `__fixtures__/serp-live.json`);
  `packages/engine/src/structured/serp.ts` (+ test); web section component under `apps/web/src/app/(app)/c/[clientId]/rankings/`.
- Modify: `packages/db/src/schema/client-intel.ts`, `packages/db/test/table-classes.ts`, isolation world; `packages/collectors/src/rankings/{scan,budget}.ts`;
  `packages/engine/src/structured/rank.ts`, `tag/structured.ts`, `score/score.ts`; `packages/engine/src/briefs/{scorecard,scorecard-model}.ts` + renderers;
  `packages/tools/src/tools/{rankings,schemas}.ts`, isolation fixtures; rankings page; `docs/help/pages/client.rankings*.md`; `docs/OPS.md`.

## Dependencies on in-flight work
18b-1 on the same branch (scorecard `googlePosts30d` column, preprocess pattern for old scorecards). No other branches.

## Review focus
1. A keyword edit changes `rankSettingsKey` → SERP series restarts (no events from mixed keyword sets).
2. A scan whose AI answer failed to load (`ai_overview` null) must never produce cited/dropped events.
3. A rival with no domain, or the client without a domain, gets `null`, never 0 or a false "not cited".
4. A failed search call must not fail or skip the map scan, and must not count as "left page one".
5. Old stored scorecards (no `aiCited`) still parse and render.

---

### Task 0: Probe (controller)
- [ ] Sandbox `POST /serp/google/organic/live/advanced` with `load_async_ai_overview: true`, `location_coordinate`, depth 10 → save as `packages/collectors/src/rankings/__fixtures__/serp-live.json`.
- [ ] Live, ≤ $0.05 (approved with this plan): the 5 rank keywords of 1–2 cs_dev clients at their centre. Record cost/call, AI-answer presence rate, `local_services` block title + item fields, whether `references` carry domains.
- [ ] Apply E3: presence < 30 % → ledger ruling drops AI-answer events and the scorecard column (Tasks 3/5 shrink). Set `SERP_CALL_USD`. Write findings to the work file.

### Task 1: Migration + schema
**Goal:** `serp_snapshot` per spec, RLS like `rank_snapshot`.
**Tests (first):** RLS sweep + isolation-world pass with the new table; a client-A session cannot read client-B rows; unique (scan_id, keyword).
**Done when:** `pnpm --filter @cs/db exec vitest run src/rls-sweep.test.ts src/isolation-world.test.ts <new>` green; tsc.

### Task 2: Collector in the rank scan
**Goal:** one live search per keyword after the grid; snapshot + evidence; budget includes it.
**Interfaces:** `serpSearch`, `parseSerp`, `SerpResult`, `SERP_CALL_USD` as spec.
**Behaviour:** VendorError per keyword → log, skip; no snapshot row; map scan status unaffected. Evidence `source 'google_search'`. `estimateRankScanUsd` += keywords × `SERP_CALL_USD` (Scan now availability uses the same estimate).
**Follow pattern:** `rankings/scan.ts` grid loop and evidence; `gbp/posts.ts` parse style.
**Tests (first):** `parseSerp` on the fixture (≤ 10 organic, ranks, AI answer present + reference domains, local services names); no `ai_overview` item → `{present:false}`; scan writes one snapshot per keyword; a throwing keyword leaves the scan `done` with the other snapshots; budget estimate includes search cost.
**Done when:** `pnpm --filter @cs/collectors exec vitest run src/rankings` green; tsc.

### Task 3: Differ, summaries, scoring
**Goal:** confirmed page-one entries/exits and AI-answer citations → `rank_change` with `surface`.
**Interfaces:** `diffSerp(tx, scanId): Promise<StructuredChange[]>` called from `diffRankScan`; details per spec.
**Behaviour:** spec § Differ (3 scans, same `rankSettingsKey`, `s0 == s1 != s2`, null AI answer skips). Summaries exactly as § Copy. `sizeFactor` hook (E7).
**Tests (first):** rival in top 10 on scans 2 and 3 but not 1 → one `entered` change with position; only one scan in → nothing; keyword changed between scans → nothing; cited twice after not cited → `cited`; middle scan `ai_overview` null → nothing; a failed search (no snapshot) in the series → series uses the 3 newest scans that have one; self is never a change subject; scoring: entered ≈ 50 → brief, left ≈ 30 → archive, never alert; map rank_change scores unchanged.
**Done when:** `pnpm --filter @cs/engine exec vitest run src/structured/serp.test.ts src/structured/rank.test.ts src/score src/tag` green.

### Task 4: Tool + Rankings section + help
**Goal:** `get_search_visibility` and a "Google search" section on the client Rankings page.
**Behaviour:** tool per spec (latest done scan with snapshots; names from client/tracked competitors by domain, else title); `ISOLATION_FIXTURES` entry; page reads through the tool; section per keyword: page-one list (you highlighted, rivals named), "Cited in AI answer" marks, AI-answer-not-shown note, "Local Services ads shown" names; empty state; design system v1 (section, not card; 36 px controls; phone at 390 px). Help: Rankings guide section; `kb:seed` noted for the owner.
**Tests (first):** tool returns the shape for a seeded scan; out-of-scope client → `not_found`; isolation fixture passes; page test renders section, empty state and "no AI answer" note; copy strings match.
**Done when:** `pnpm --filter @cs/tools exec vitest run src/tools/rankings src/isolation`, web page tests, `pnpm --filter web exec tsc --noEmit`, `pnpm design:lint` green.

### Task 5: Scorecard "Cited in AI answers" (skip if Task 0 ruled AI answers out)
**Goal:** row metric `aiCited` (count, null rules per E8), label "Cited in AI answers", email short header "AI" + key line.
**Behaviour:** pattern of 18b-1 Task 8 (`googlePosts30d`): append to `COLUMNS`, preprocess default null for old scorecards, evidence = the latest search captures, within the cap.
**Tests (first):** you 2 / rival 0 / rival without domain null / no AI answer loaded null; old scorecard parses; email/PDF/web render header + not-measured mark.
**Done when:** `pnpm --filter @cs/engine exec vitest run src/briefs`, `@cs/email` tests, web brief views tests green.

### Final review (controller)
`test:affected` + `e2e:affected` once; top-model branch review; one fix wave. Work file: owner steps (migrate; first Sunday scan on staging; check the Rankings "Google search" section and one confirmed entry after the third scan; `pnpm copy:review`; `kb:seed`). OPS section "Google search (18b-2)".
