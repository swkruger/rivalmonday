# phase-7b2 — billing correctness (Phase 9 leftovers: R27, M3, M8, fake gateway, max_redemptions)

**Kind:** implementation   **Worktree:** ../CompetitorSpy-wt/phase-7b2   **Base:** 015a948c
**Plan/spec:** [plan](../superpowers/plans/2026-10-23-phase-7b2-billing-correctness.md) · [spec](../superpowers/specs/2026-10-22-phase-7b-money-design.md) — owner-approved 2026-10-23 (planned on `phase-7-planning`).

## Status (overwrite)
Execution started 2026-10-25 (base main 015a948c). Task 0 done: 15c-3 assumptions hold — (a) held agencies skip runConnectDaily; (b) hold ⇒ `service_paused` from assertCanActivateClient (liftAutoPause swallows it with `billing_seat_limit`); (c) guard allow-list unchanged; (d) no 15c-3 edits to connect-daily/client-pause/gateway logic. No migration.

## Next (overwrite)
SDD Tasks 1–6.

## Interfaces this branch adds or changes
See the plan's Interfaces blocks; migrations take the next free number at execution.

## Assumes from other branches
15c-3 agency suspension (billingAccess, daily.ts, BillingGateway.pauseCollection) — see plan § Dependencies; 7b1 notice kind `client_spend_paused`.

## Decisions (owner-approved)
Spec decisions + plan "Decisions"; owner decisions 2026-10-22/23 summarised in `git show phase-7-planning:docs/work/phase-7-planning.md` (folded into STATE/BACKLOG at merge).

## New backlog (target → item)
None yet.

## Owner verification steps
Listed in the plan's docs task.
