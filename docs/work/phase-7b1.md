# phase-7b1 — cost guards: credits, platform-owned limits, spend pause, spike guard, housekeeping

**Kind:** implementation   **Worktree:** ../CompetitorSpy-wt/phase-7b1   **Base:** `b93f7ff4` (main)
**Plan/spec:** [plan](../superpowers/plans/2026-10-23-phase-7b1-cost-guards.md) · [spec](../superpowers/specs/2026-10-22-phase-7b-money-design.md) — owner-approved 2026-10-23 (planned on `phase-7-planning`).

## Status (overwrite)
Execution started 2026-10-23 (worktree created; test DB `cs_phase_7b1_test`).

## Next (overwrite)
`/rm-kickoff phase-7b1` → Task 0 pre-flight → SDD. May run in parallel with phase-7c1.

## Interfaces this branch adds or changes
See the plan's Interfaces blocks; migrations take the next free number at execution.

## Assumes from other branches
None blocking. Overlaps 7c1 (isolation fixtures for new tools/tables), 7b2 (notice kinds in billing-notices), 15c (money formatter, usage page, /platform/costs, health).

## Decisions (owner-approved)
Spec decisions + plan "Decisions"; owner decisions 2026-10-22/23 summarised in `git show phase-7-planning:docs/work/phase-7-planning.md` (folded into STATE/BACKLOG at merge).

## New backlog (target → item)
None yet.

## Owner verification steps
Listed in the plan's docs task.

## Pre-flight findings (Task 0, 2026-10-23)
- Migrations claimed: 0085 `ledger_cost_numeric`, 0086 `spend_guard`, 0087 `retry_backoff`. In-flight 15b3b and 15c2 are docs-only; 15c2 may claim 0085 (`ask_thread.deleted_at`): second merger renumbers. Tell the 15c2 session: its alert-queue "cap notice" must use `SpendLevel`/credits.
- `cost_usd` reads: all safe, no Task 1 reader fixes. Drizzle column reads: `tools/usage.ts:19`, `db/spend.ts:16`, `platform-costs.ts:72`, `platform-verticals.ts:68` (all `::float8`). Raw SQL `platform/stats.ts:116`, `platform-console.ts:101` sum then `::numeric ... ::text` (fine for numeric). `rivals.ts` `discovery_run.cost_usd` stays double (out of scope).
- Collection call sites match Task 3 (`ads/google.ts:70`, `gbp/collect-gbp.ts:96`, `jobs/post.ts:18`, `reviews/post.ts:18`, `reviews/collect.ts:14,31,40`, `apify.ts:64`, `scrapecreators.ts:40`). No extras: `rivals/*`, `local/maps`, `fetchGbpProfile` callers, `dataforseo-advertisers` receive caller scopes (client/agency-scoped).
- `usesAi` list confirmed. `rival-search` does not reach `Ai` (no `usesAi`). `model-batch-poll` reaches `Ai` but stays unguarded by design. pg-boss 10.4.2: `includeMetadata` and `singletonKey` supported (typings checked).
- `clientServiceable` lists: all Task 8 file:line match; every call site is in a list except `tools/rank-scan.ts:36` (keep, add separate spend_paused read) and the definition `db/filters.ts:28`.
- DB: `client_monthly_cap_check` and `monthly_cap_usd` (double, default 15) exist (0036); `platform_setting` has key, value, updated_at, updated_by.
