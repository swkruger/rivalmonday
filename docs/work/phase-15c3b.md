# phase-15c3b — separate plans + change an agency's plan

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/phase-15c3b   **Base:** main @ 015a948c
**Plan/spec:** [15c spec](../superpowers/specs/2026-10-21-phase-15c-page-fixes-design.md) §5.5 (binding); 3b spec/plan to come.

## Status (overwrite)
Kickoff brief written 2026-10-25. Nothing designed or built.

## Next (overwrite)
Owner answers the open questions -> brainstorming -> spec -> lean plan.

## Interfaces this branch adds or changes
Expected: migration **0095** `plan_visibility`; tools `create_plan`, `platform_change_agency_plan`; `create_plan_version.code`; `list_plans.visibility`; `BillingGateway.swapSubscriptionPlan`.

## Assumes from other branches
- **phase-7b2** (executing, no migration): edits `packages/tools/src/tools/billing.ts` (`redeem_discount_code`), `access/signup-complete.ts` (`couponFor`), `packages/billing/src/index.ts` (+ `discount.ts`), `connect-*`, `billing-daily.ts`. It does not edit `types.ts`/`fake-gateway.ts`/`stripe-gateway.ts`. Overlaps: `index.ts` exports (append-only), and `billing.ts` only if Q4 b/c. Second to merge rebases.
- **phase-16** (docs only, code on hold): will restyle `/platform/billing` + `/platform/agencies/[id]` later. 16-onboarding removes the wizard `plan` step but leaves `trial.ts`/checkout alone. No overlap now.
- Migration: main ends at 0094, so this branch takes **0095**.

## Decisions (owner-approved)
None yet. These bind: 15c C1, C5, C10, C11, §5.5, §8; the 15c-3a spec A1 (3b = §5.5, own spec/plan) and §4.5 (Manage menu: 3b adds Change plan).

## New backlog (target -> item)
None yet.

## Owner verification steps
TBD.

## Brief
### 1. Scope (roadmap row 15: "15c-3b plans *to be planned*")
15c spec §5.5 (C11): operators create plans beyond `standard` and move any agency to the current version of any plan. Owner-only, platform tools (`operate()`, one `withPlatformAudit` row, every write behind `ConfirmDialog`).
- **Migration:** `plan.visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private'))`. `standard` is the only public code. Self-sign-up, trials and `currentStandardPlan` keep using it. Only an operator can assign a private plan.
- **`create_plan`** `{ code, name, basePriceCents, includedSeats, seatPriceCents, trialDays }` (+ `features`, Q2): `code` matches `^[a-z][a-z0-9_]{2,30}$`, is not `standard` and is unique. It creates v1 as current and private, synced via `syncPlanToStripe`, which already makes one product pair per code. **`create_plan_version`** gains `code` (default `standard`); the advisory lock becomes per code (today it is `plan:standard`).
- **`list_plans`** returns every code's versions plus `visibility`. The `/platform/billing` plans tab groups versions by code (`plan-editor.tsx`).
- **Gateway:** `swapSubscriptionPlan(subscriptionId, { basePriceId, seatPriceId, seatQuantity })` uses `subscriptions.update` to swap the items with `proration_behavior: 'create_prorations'`. The fake gateway records the call.
- **`platform_change_agency_plan`** `{ agencyId, planId }` (owner): the target must be a current version and differ from the agency's plan. With a live subscription, swap the prices (seats recomputed from the new `includedSeats`), then set `agency_billing.plan_id`. Without one, set `plan_id` only. Writes an `agency_billing_event` (`admin_change_plan`). Refused while on hold.
- **Webhook:** `recordCheckoutFacts` matches all plans. *Already true:* `webhook.ts:63` uses `inArray(plan.stripeBasePriceId, …)` with no code filter, so only a test is needed.
- **Pre-flight:** callers of `currentStandardPlan` that must honour an assigned `plan_id`: `trial.ts:42` and `apply.ts:11` (they insert the row, so pre-assignment needs a row first), `platform-billing.ts:183` (discount products, Q4), `:533` `set_seat_cap_exempt` (insert-only default), `billing.ts:208` (fallback after `planFor`, OK).
- **Page (§5.6):** Manage ▾ gets "Change plan" (owner). The billing panel shows the plan name + version. Help guides `platform.billing.operator.md` and `platform.agencies.detail.operator.md`. Mockup first, plus one copy sign-off `docs/archive/phase-15c3b-copy-signoff.md` (C10).
- **Tests (§7):** create_plan code rules, plan swap via the fake gateway, the webhook matching a private plan, role floors, refused on hold/archived.

### 2. Already built — reuse, don't rebuild
- `packages/db/src/schema/billing.ts`: `plan` (code/version, `plan_code_version_uq`, `plan_current_uq`, Stripe ids, `features` jsonb from 7a2 with CHECK `<@ ["ask","mcp"]`), `agency_billing.plan_id`, `agency_billing_event` (from/to state, reason, actor). `TABLE_CLASS.plan = 'platform'`, so there is no new table.
- `packages/billing/src/access.ts`: `DEFAULT_PLAN_CODE`, `currentStandardPlan`, `planFor` (prefers `plan_id`), `billingAccess` (`maxActiveClients` = plan `includedSeats`, trial cap 1, `onHold`). `seats.ts` `syncSeats` (`planFor`, seat price), `plan-sync.ts`, `daily.ts` (MRR via `planFor`), `hold.ts`, gateway `types.ts`/`fake-gateway.ts`/`stripe-gateway.ts` (the items-swap pattern at l.267).
- `packages/tools/src/access/plan-features.ts` `planFeaturesFor` (pilot / no plan => all features), `hasChannel` in `@cs/core`.
- `packages/tools/src/tools/platform-billing.ts`: `operate`, `requireAgency`, `list_plans`, `create_plan_version`, `get_agency_billing`, `adminSignal`, `attach_agency_discount`, `create_invite_link` (offer only, no plan). `tools/platform-agency.ts` (3a). `billing-guard.ts` `PLATFORM_TOOLS`.
- Web: `app/(platform)/platform/billing/{page,plan-editor,actions,parse}.tsx|ts`, `agencies/[id]/{manage-menu,billing-panel,action-dialog,actions}.tsx|ts`.

### 3. Binding decisions
Root CLAUDE.md: Billing Phase 9 (pilot / 30-day trial / $229 incl. 3 seats, $99/seat, nothing client-facing names Rival Monday). Page fixes (separate plans; hold = read-only, so a plan change is refused). Cost guards (only platform staff set limits). Quality gates (new tool => `ISOLATION_FIXTURES` + access marks + 8b tool-access row; new table => `TABLE_CLASS`). Refusals = 404, writes via `runTool`. 7a2 D1/D13 (plan features; pilot gets every feature). 9a R8 (existing subscriptions keep their prices on a new version), R26/R29. No Stripe call inside a DB transaction, except the existing `create_plan_version` sync-in-tx pattern (keep it for `create_plan`).

### 4. Backlog to fold in (verbatim)
- "**15c-3b** plans (15c spec §5.5, incl. `create_plan` features, Q5)" — *phase-15c3*
- If touched: "`syncSeats` unlocked (out-of-order syncs leave Stripe < DB until nightly reconcile); `applyBillingSignal` inserts a default pilot row on a null transition → `startAgencyTrial` returns early" — *9a ledger*
- If touched: "grant/extend live-subscription check outside the `adminSignal` tx (TOCTOU)" — *9a ledger*

### 5. Open questions for the owner (by design impact)
1. **Split?** a) **one plan** (rec.); b) 3b-1 catalogue, then 3b-2 change plan; c) fold change plan into 7b2.
2. **Plan features (Q5).** a) **`create_plan` takes `features`; `create_plan_version` takes optional `features`, defaulting to the code's current version** (rec.); b) every plan gets both, changed only by a new version; c) editable in place.
3. **Discount codes on private plans** (coupons are limited to `standard` products). a) **codes stay standard-only; refuse attach/redeem for an agency on a private plan; price the deal in the plan** (rec.); b) `create_discount_code` gains `planCodes`; c) unrestricted coupons.
4. **Assign before or at sign-up.** a) **Change plan only (works pre-card: sets `plan_id`; inserts a pilot row if none)** (rec.); b) `create_invite_link` gains `planId`.
5. **Trial length on a mid-trial change.** a) **keep `trial_ends_at`; use Extend trial** (rec.); b) recompute from the new `trialDays`.
6. **Fewer included seats than active clients** (pilot/trialing cap). a) **allow; dialog warns; new activations refused until under** (rec.); b) refuse the change.
7. **What agencies see.** a) **plan name + prices as today** (rec.); b) "Custom plan".
8. **Retiring a private plan.** a) **not in 3b (backlog)** (rec.); b) add `retired` visibility.
