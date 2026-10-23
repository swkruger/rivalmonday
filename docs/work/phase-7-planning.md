# phase-7-planning — specs + plans for 7b (money) and 7c (quality, scale & pilot)

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/phase-7-planning   **Base:** main @ d7d42e47 (main now bf4ce990)
**Specs:** [7b](../superpowers/specs/2026-10-22-phase-7b-money-design.md) · [7c](../superpowers/specs/2026-10-22-phase-7c-quality-scale-pilot-design.md)
**Plans:** [7b1](../superpowers/plans/2026-10-23-phase-7b1-cost-guards.md) · [7b2](../superpowers/plans/2026-10-23-phase-7b2-billing-correctness.md) · [7c1](../superpowers/plans/2026-10-23-phase-7c1-quality-gates.md) · [7c2](../superpowers/plans/2026-10-23-phase-7c2-scale-pilot.md)
**Kickoff brief:** `git show c848f1c0:docs/work/phase-7-planning.md` (scope, reuse list, backlog fold-in).

## Status (overwrite)
Docs only, no code. Both specs builder-checked and **owner-approved 2026-10-23**; all four lean plans written, self-reviewed and **owner-approved 2026-10-23** (incl. build order). Planned-ahead work files created: `phase-7b1.md`, `phase-7b2.md`, `phase-7c1.md`, `phase-7c2.md`. Nothing uncommitted.

## Next (overwrite)
Owner go-ahead → `/rm-merge phase-7-planning` (docs-only merge). Then `/rm-kickoff phase-7b1` and `/rm-kickoff phase-7c1` (parallel worktrees; kickoff's "already planned" path → Task 0 pre-flight → SDD). 7b2 after 15c-3 merges; 7c2 after 7b1, its rehearsal task after the owner sets up staging.

## Interfaces this branch adds or changes
None in code. Plans claim (numbers "next free at execution"): 7b1 three migrations (numeric `cost_usd`; `spend_guard` cols/tables + drops `client.monthly_cap_usd`; `retry_backoff`); 7c2 one (`ops_alert`, `REVOKE INSERT ON client FROM app_user`, `notification_provider_id_idx`); 7b2, 7c1 none. New env vars (owner OK needed before adding): `SERVICE_DATABASE_POOLED_URL`, `WORKER_QUEUE_CONCURRENCY`, rehearsal-only `AI_PROVIDER_MODE`/`VENDOR_FAKE_MODE`/`CRAWL_HOST_ALLOWLIST`/`REHEARSAL_LIVE_CLIENT_IDS` (refused in prod); GitHub `evals` env secrets incl. `EVALS_ALERT_TO`. New package `@cs/evals`.

## Assumes from other branches
7b2 assumes 15c-3 (agency suspension; no branch/plan yet) — see 7b2 plan § Dependencies. 7c1 ↔ 7b1: whichever merges second adds isolation fixtures/table classes for the other's tools/tables. 7c2 assumes 7b1's `AiGuard`/`usesAi`/`createAiFromEnv(…, guard?)`.

## Decisions (owner-approved, 2026-10-22/23)
1. Fees (agency fee + per-client seats, some free) cover generous AI use; nothing usage-billed. Caps protect platform margin.
2. Tenants see **credits** (1 USD = 100, platform setting); platform sees USD. Agency + client usage views, read-only.
3. Agencies can't set caps or limits (spend, competitor limit, Ask quota); platform staff set global defaults and per-client overrides. Extra-credit purchase = later, after pilot feedback.
4. 100 %: calm notice (blue/grey, not red/orange), "nothing affected". 130 % (setting): alert + auto-pause of ALL the client's AI/recurring work; client view stays open; lifts on raise or month rollover. **Replaces O10.**
5. Platform spike guard, self-adjusting baseline per active client: +100 % staff email + Platform banner; +200 % pause all AI until staff reset on `/platform/health`; tenants see neutral "heavy load, try again later".
6. Jev excluded from limits/credits/spike guard until its real price is confirmed (Jev is cheap).
7. 7b split 7b1 (cost guards + housekeeping) / 7b2 (Phase 9 billing correctness, after 15c-3); M4 + billing auto-refresh → 15c-2.
8. Pilot: 20 agencies × ≤ 3 clients (≤ 60); invites slow and controlled. Bar: all starting-point + weekly briefs complete well before send. Rehearsal at 2× (120 clients) on staging.
9. Staging = Vercel Preview + Neon staging branch + Railway worker sized like prod ("to see how prod will perform").
10. Quality gates block on cross-tenant leaks, unsupported claims, injection; accuracy report-only until pilot labels. Live evals only on AI-config/prompt changes + nightly.
11. Pilot feedback by email (clients → their agency; agencies → platform support address); ticket portal later.
12. 7c split 7c1 (quality gates, parallel with 7b1) / 7c2 (scale & pilot). Build order: 7b1 ∥ 7c1 → 7b2 (after 15c-3) → 7c2 (after 7b1; rehearsal after staging).

## New backlog (target → item)
- Owner → sign off copy marked in the 7b1/7b2/7c2 plans before each task builds it (notices, pause/heavy-load banners, credit-based refusals, staff emails, duplicate-subscription notice, feedback links).
- Owner → confirm Jev's real price (then drop the Jev exclusion).
- Owner → staging setup (needs prod Neon project, O17) incl. a third Railway service for fixture hosts on 5 custom domains (~$20 infra for the rehearsal).
- Phase 7 → at merge, mark BACKLOG Phase 7 "Budget & cost" / "Scale & performance" items as owned by these plans (each plan's docs task lists exact lines to close).

## Owner verification steps
None for this docs merge.
