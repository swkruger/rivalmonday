# phase-8c — Platform hosting costs

**Kind:** feature   **Worktree:** ../CompetitorSpy-wt/phase-8c   **Base:** phase-8b @ f666e79 (stacked on phase-8 → main)   **Test DB:** cs_phase_8c_test
**Spec:** `docs/superpowers/specs/2026-10-13-phase-8c-platform-costs-design.md` (c1–c12). Vendor contracts: `docs/research/2026-10-13-phase-8c-cost-apis.md`.
Plan: `docs/superpowers/plans/2026-10-13-phase-8c-platform-costs.md` (Tasks 0–8).

## Status (overwrite)
**8c complete 2026-10-14**, ready for `/rm-merge` after phase-8 and phase-8b. Tasks 0–8 each passed task review; final whole-branch review (opus) found 3 Important + 5 Minor, all fixed in one wave (ff4fa93..ceea316) and re-reviewed (all addressed). `test:affected`: green except the known `@cs/engine score-stage.test.ts` time-bomb. `e2e:affected` (pre-fix): 55/57, only `smoke.spec.ts` :6/:41 flakes (pass alone); `@costs|@support` after fixes: 12/12.

## Next (overwrite)
1. Merge order: phase-8 → phase-8b → phase-8c; in this worktree `git rebase main` after 8b merges, re-run `@costs` `@support` `@platform`.
2. Owner, before relying on live data: set `ANTHROPIC_ADMIN_KEY`, `NEON_API_KEY`, `NEON_ORG_ID` in the **worker** env (web doesn't need them); then live-check Neon field paths (docs-only).
3. Owner verification below, then `/rm-merge phase-8c`.

## Interfaces this branch adds or changes
- Tables `platform_cost_service` (6 rows seeded by migration 0051), `platform_cost_snapshot`, `platform_cost_item` (service role only; numerics are strings).
- Worker job `platform-costs-snapshot` (daily 06:00 UTC; "Refresh now" enqueues it); email template `platform-cost-low`.
- Tools (owner only, `supportHidden`): `list_platform_costs`, `refresh_platform_costs`, `update_platform_cost_service`, `save_platform_cost_item`, `archive_platform_cost_item`.
- Route `/platform/costs` (404 for non-owners); owners also get the Costs nav item and a low-balance strip on every `/platform/**` page.
- Env vars `ANTHROPIC_ADMIN_KEY`, `NEON_API_KEY`, `NEON_ORG_ID` (+ existing `PLATFORM_ADMIN_EMAILS`) in `turbo.json` globalPassThroughEnv; keys not yet set.
- "Configured" = the service has at least one snapshot (the worker is the source of truth; web never reads vendor keys). Archived recurring items count up to their archive month.
- Tests: `apps/web/e2e/platform-costs.spec.ts` (`@costs`, in e2e-affected rules). Demo seed `packages/demo/src/platform-costs.ts`.

## Decisions (owner, 2026-10-13 brainstorm)
1. Own sub-phase stacked on 8b; every service/cost shows its billing URL.
2. Daily worker snapshot + history + "Refresh now" (not live-on-load).
3. Warnings: console strip + email on newly-low; balance threshold or days-left (default 7).
4. Owners only (view + edit). No renewal reminders.
5. API reads: OpenRouter, DataForSEO, Apify, ScrapeCreators + Anthropic admin + Neon (new keys). Rest manual.
6. Manual entries: recurring (monthly/yearly) + one-off, USD only.
7. Controller rulings (SDD): Neon/Anthropic adapters docs-only (owner: go without keys); Refresh feedback inline (no toast lib); each owner `/platform` view writes one platform audit row (strip read); archive ends a recurring cost after its archive month (maths, not ends_on); "configured" from snapshots, not web env; settings hints "Warnings need a dollars-per-credit rate." / "Usage services without a plan cap never warn." (copy not in spec).

## New backlog (target → item)
- Unscheduled → Vercel / Cloudflare R2 cost APIs; Neon storage cost; CSV export; renewal reminders.
- Polish → Neon settings dialog wrongly shows "Warnings need a dollars-per-CU-hour rate." (uncapped usage never warns): gate the rate hint on `kind==='balance'`, fix `costs-components.test.tsx:328`.
- Polish → `evaluateAlerts` throw → job retry re-inserts the day's snapshots (wrap in try/catch); concurrent refresh + cron can double-email (conditional update before send).
- Polish → key present but no reading yet shows "Not configured" ("No reading yet" clearer); Apify with no cap gets no hint.
- Polish → strip read audits every owner `/platform` view; strip sits outside the 1560px wrapper; services-table Actions header in read-only; empty warnDays → 0; run dataviz skill on chart colours.
- Polish → Neon `from==to` before 01:00 UTC on the 1st; Anthropic partial sum after 3 pages; empty `APP_URL` → relative link in email; tools' toFixed silently rounds threshold/rate; read.ts 12 sequential queries.
- Polish → seed rows duplicated in migration 0051 and `@cs/db` test helpers (cross-reference comments).

## Owner verification steps
After `pnpm demo:reset`, as the demo platform owner:
1. `/platform/costs`: summary cards, 6 services (DataForSEO Low at $8.20, billing links open new tabs), 3 manual costs, 6-month chart; the Low strip shows on every `/platform` page.
2. Add a monthly cost → dialog closes, it appears in the table and "Spent this month"; archive it → gone from the table.
3. Edit a service (threshold, warn days, ScrapeCreators $/credit) → status updates after "Refresh now" + worker run.
4. As a staff platform operator: `/platform/costs` 404, no Costs nav, no strip.
5. With the worker running and keys set: a newly Low service emails each owner once.
