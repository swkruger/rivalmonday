# phase-15c3b — plan features per version + move agencies to the current version

**Kind:** implementation   **Worktree:** ../CompetitorSpy-wt/phase-15c3b   **Base:** main @ 015a948c
**Plan/spec:** spec [2026-10-25-phase-15c3b-plan-versions-design.md](../superpowers/specs/2026-10-25-phase-15c3b-plan-versions-design.md) (owner-approved 2026-10-25, replaces 15c §5.5) · plan [2026-10-25-phase-15c3b-plan-versions.md](../superpowers/plans/2026-10-25-phase-15c3b-plan-versions.md) (Tasks 0-6).

## Status (overwrite)
Code complete 2026-10-25: Tasks 0-6 + final-review fix wave (762e29b7). Final review clean after fixes. `test:affected --base main`: 10/11 packages green before the fix wave (the `@cs/demo` coverage failure was fixed; demo 96/96 after). `e2e:affected`: 141/141. No migration. Copy NOT signed (`docs/archive/phase-15c3b-copy-signoff.md`).

## Next (overwrite)
Owner: sign the copy file, run the verification steps below. Then `/rm-merge` on the owner's go-ahead (phase-7b2 may merge first: rebase; overlaps `packages/billing/src/index.ts`, `packages/email/src/types.ts` append-only).

## Interfaces this branch adds or changes
No migration. Tools `list_plan_agencies` (read), `move_agencies_to_current_plan` (owner write); `create_plan_version.features`; `list_plans` gains `features`; `BillingGateway.swapSubscriptionPlan`; email `agency_plan_change`; `reconcile()` price-id drift check.

## Assumes from other branches
- **phase-7b2** (executing on its branch, no migration; as of 2026-10-25 touches `packages/billing/src/index.ts`, `packages/email/src/types.ts`, not `daily.ts`/`stripe-gateway.ts`): edits `packages/tools/src/tools/billing.ts` (`redeem_discount_code`), `access/signup-complete.ts` (`couponFor`), `packages/billing/src/index.ts` (+ `discount.ts`), `connect-*`, `billing-daily.ts`. It does not edit `types.ts`/`fake-gateway.ts`/`stripe-gateway.ts`. Overlaps: `index.ts` exports (append-only); check whether its `billing-daily.ts` work touches `packages/billing/src/daily.ts` `reconcile()` (we add a price-id check). Second to merge rebases.
- **phase-16** (docs only, code on hold): will restyle `/platform/billing` + `/platform/agencies/[id]` later. 16-onboarding removes the wizard `plan` step but leaves `trial.ts`/checkout alone. No overlap now.
- Migration: none (private plans dropped).

## Decisions (owner-approved)
2026-10-25: private/separate plans dropped (15c §5.5 replaced). P1 one sub-phase; P2 batch move by selection + single-agency Manage item; P3 new price from next billing date (no proration); P4 admins emailed. Design calls P5-P15 in the spec.

## New backlog (target -> item)
- Phase 15 Soon: `syncSeats` takes no lock; a move racing it can leave the old seat qty on the new seat price (reconcile logs drift) — *15c-3b final review*
- Phase 15 Soon: move dialog/list says v{N} but the tool targets whatever is current at submit (stale page after another publish) — *15c-3b*
- Phase 15 Soon: refused moves (on_hold/cancelled/no row) write an `ok` platform audit row; record the outcome in the audit note — *15c-3b R7*
- Phase 15 Soon: audit-write failure after a committed move reports `failed/db_error` (rerun self-heals) — *15c-3b*
- Phase 16: plans-tab section uses the shadow `card`; `plan-move-parts.tsx` belongs in `platform/_components/`; `['ask','mcp']` hard-coded in web instead of `PLAN_FEATURES` — *15c-3b*
- Testing: E2E `platform-plan-move` leaves v2 (no MCP) current for later specs; `list_plan_agencies` is N+1 (fine <= 20 agencies) — *15c-3b*
- Owner: email says "1 client seats" when included seats = 1 (sign-off file asks) — *15c-3b*

## Owner verification steps
1. Platform > Billing > Plans: publish a new version with MCP unticked; the table shows Includes "Ask" for it.
2. The "Agencies not on the current version" section lists agencies on v1; held agencies are greyed and cannot be ticked.
3. Move two test agencies, one with a Stripe test subscription: Stripe shows the new prices from the next billing date and no proration invoice item.
4. The agency's admins receive the plan-change email; the agency page shows "Plan v2" and the Manage menu item disappears.
5. Sign the copy file `docs/archive/phase-15c3b-copy-signoff.md` (incl. the "1 client seats" question).

## Brief
Kickoff brief (private plans; superseded 2026-10-25 when the owner dropped them) is in git history of this file (3314ed0d). Spec + plan are the reference now.
