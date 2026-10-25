# Phase 15c-3b — plan features per version + move agencies to the current version — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Operators choose Ask/MCP per new standard-plan version and move selected agencies onto the current version (new price from the next billing date, admins emailed).
**Architecture:** Two new platform tools (`list_plan_agencies`, `move_agencies_to_current_plan`) in a new `@cs/tools` file, a gateway method `swapSubscriptionPlan`, a Rival-Monday-branded admin email, and UI on `/platform/billing` (plans tab) and `/platform/agencies/[id]`. No migration.
**Tech Stack:** TypeScript, Drizzle, Stripe SDK, React Email, Next.js App Router, Vitest, Playwright.
**Spec:** `docs/superpowers/specs/2026-10-25-phase-15c3b-plan-versions-design.md` (P1–P15 binding; read it in full).

## Global Constraints
- No migration. `plan.features` (7a2) and `agency_billing_event.reason` (free text) already exist.
- Platform tools: `operate()` / `requirePlatformOperator`, refusals never audited; web writes via `runTool` only; page refusals 404.
- New tool ⇒ `ISOLATION_FIXTURES` (`packages/tools/src/isolation/fixtures.ts`), `channels.test.ts` + `access-marks.test.ts` lists, `packages/demo/src/coverage.ts`, registry — follow `packages/tools/CLAUDE.md` and how `list_plans` / `create_plan_version` are registered.
- No Stripe call inside a DB transaction (the existing `create_plan_version` sync-in-tx is the only exception).
- Emails never name the operator; Rival Monday branded (platform → agency); dates date-only UTC.
- Archived agencies are invisible (7a2 D16); held = `agency.suspended_*`.
- Status/reason text via `apps/web/src/lib/labels.ts` maps (grep gates cover all `apps/web/src`).
- Before code: read `docs/gotchas-cross-cutting.md` and the `CLAUDE.md` of each package touched. LF only.
- Test scope: focused tests per task (`pnpm --filter <pkg> exec vitest run <pattern>`); `test:affected` + `e2e:affected` only at the final review.

## Decisions
Spec §2: P1–P4 owner, P5–P15 design calls approved with the spec (2026-10-25). Copy in spec §3.5/§3.6 is draft until the owner signs `docs/archive/phase-15c3b-copy-signoff.md` (Task 6).

## File structure
- Modify `packages/tools/src/tools/platform-billing.ts` (features on `create_plan_version`/`list_plans`).
- Create `packages/tools/src/tools/platform-plan-move.ts` (+ `.test.ts`): `list_plan_agencies`, `move_agencies_to_current_plan`, pure helpers `seatWarningFor`, `monthlyCents`.
- Create `packages/tools/src/platform/plan-change-email.ts` (+ test).
- Modify `packages/billing/src/{types,stripe-gateway,fake-gateway,daily}.ts` (+ tests).
- Create `packages/email/src/templates/agency-plan-change.tsx`, modify `types.ts`, `render.ts`, `index.ts` (+ test `agency-plan-change.test.ts`).
- Web: modify `apps/web/src/app/(platform)/platform/billing/{plan-editor.tsx,page.tsx,actions.ts,parse.ts}`; create `.../billing/plan-agencies.tsx`; modify `.../agencies/[id]/{billing-panel,manage-menu,actions,page}.tsx|ts`; `apps/web/src/lib/labels.ts`.
- Docs: `docs/help/pages/platform.billing.operator.md`, `platform.agencies.detail.operator.md`, `docs/archive/phase-15c3b-copy-signoff.md`.

## Dependencies on in-flight work (re-check in Task 0)
- **phase-7b2** (may be executing): edits `packages/billing/src/index.ts` (exports), possibly billing daily code. If merged first, rebase and keep both export sets; if it changed `daily.ts` `reconcile()`, re-place the Task 2 check.
- **phase-16** (on hold): later restyles the same pages; nothing to do now.

## Review Focus
1. Stripe swap succeeds but the follow-up fails, or Stripe fails after the DB commit — operator must see `failed` and DB must equal pre-move state (Task 4 test `stripe failure reverts plan_id and seats`).
2. Batch with mixed rows (held, cancelled, archived, current, null plan) — each gets its own outcome, others move (Task 4 test `mixed batch`).
3. Concurrent `syncSeats` during a move — row lock means it reads old or new plan wholly (Task 4: the first tx uses `FOR UPDATE`; test asserts the lock query via a second tx blocking — or, if not testable cheaply, reviewer checks the `.for('update')`).
4. Double-click / re-submit of the same batch — second run returns `already_current` for every row, no second Stripe call, no second email (Task 4 test `idempotent rerun`).
5. A version with no features (both unticked) — stored `[]`, Ask/MCP disappear for moved non-pilot agencies, UI shows "None" (Task 1 test `empty features`, Task 4 `planFeaturesFor` test).

---

### Task 0: Pre-flight
- [ ] `git fetch && git rebase main` in the worktree; re-check "Dependencies on in-flight work" against `git branch --no-merged main` and their work files; conflict-scan this plan's files vs code (`git log main -- <files>` since `015a948c`).
- [ ] Confirm the facts the spec relies on still hold: `seatItem` in `stripe-gateway.ts`, `reconcile()` in `daily.ts`, `planFeaturesFor` null ⇒ all, `isPaying`, `hold-email.ts` shape. Fix the plan inline if not; commit `docs(phase-15c3b): pre-flight`.

### Task 1: Features on `create_plan_version` and `list_plans`
**Files:** modify `packages/tools/src/tools/platform-billing.ts`, `platform-billing.test.ts`; `packages/tools/src/isolation/fixtures.ts` (fixture input may stay as is).
**Interfaces:** Produces `create_plan_version` input `features?: PlanFeature[]`; `list_plans` version rows gain `features: PlanFeature[]`.
**Behaviour:** dedupe + order by `PLAN_FEATURES`; omitted ⇒ copy current standard version's `features` (read inside the existing tx after the advisory lock; no current version ⇒ column default). Description string mentions features.
**Tests (write first):** `stores explicit features in PLAN_FEATURES order` (`['mcp','ask','mcp']` ⇒ `['ask','mcp']`); `omitted features copy the current version` (current `['ask']` ⇒ new `['ask']`); `empty features` (`[]` stored, listed as `[]`); `rejects unknown feature` (`['sms']` ⇒ validation error); `list_plans returns features`.
**Done when:** `pnpm --filter @cs/tools exec vitest run platform-billing` passes; commit.

### Task 2: Gateway `swapSubscriptionPlan` + reconcile price drift
**Files:** modify `packages/billing/src/types.ts`, `stripe-gateway.ts`, `fake-gateway.ts`, `daily.ts`; tests `stripe-gateway.test.ts`, `fake-gateway.test.ts`, `daily.test.ts`.
**Interfaces (binding):**
```ts
swapSubscriptionPlan(subscriptionId: string, i: { basePriceId: string; seatPriceId: string; seatQuantity: number }): Promise<{ currentPeriodEnd: Date | null }>;
```
**Behaviour:** Stripe impl: retrieve with `items.data.price`; base line = item whose price metadata `rm_role` = `base` (add a `baseItem` helper beside `seatItem`); build `items`: base `{ id, price: basePriceId }`; seat line present ⇒ `{ id, price: seatPriceId, quantity }` (quantity 0 ⇒ `{ id, deleted: true }`); absent and qty > 0 ⇒ `{ price: seatPriceId, quantity }`; one `subscriptions.update(id, { items, proration_behavior: 'none' })`; return `date(updated.items.data[0]?.current_period_end ?? updated.current_period_end)` the same way `getSubscription` derives `currentPeriodEnd` today (mirror it exactly). No base line ⇒ throw. Fake: records `{ subscriptionId, ...i }` in a `swaps` array, updates in-memory items/seatQuantity, honours its existing failure-injection mechanism (add one if none: `failNext('swapSubscriptionPlan')`).
`reconcile()`: after the seat block, if `row.planId` resolves to a plan with Stripe price ids and `sub.items` lacks its `stripeBasePriceId`, or `sub.seatQuantity > 0` and lacks its `stripeSeatPriceId` ⇒ `drift++` and `console.error('[billing-daily] plan price drift', { agencyId })`. No write, no auto-fix.
**Tests:** stripe mock: `swaps base and seat items with proration none`, `adds seat line when absent and qty>0`, `removes seat line when qty 0`, `throws without base line`; fake: `records swaps and updates items`; daily: `reconcile reports plan price drift`, `no drift when prices match`.
**Done when:** `pnpm --filter @cs/billing exec vitest run stripe-gateway fake-gateway daily` passes; commit.

### Task 3: Email `agency_plan_change`
**Files:** create `packages/email/src/templates/agency-plan-change.tsx`, `packages/email/src/agency-plan-change.test.ts`; modify `packages/email/src/{types,render,index}.ts`; create `packages/tools/src/platform/plan-change-email.ts` + `.test.ts`.
**Interfaces (binding):**
```ts
type PlanTerms = { basePriceCents: number; includedSeats: number; seatPriceCents: number };
type AgencyPlanChangeProps = { branding: Branding; recipientName: string | null; agencyName: string; before: PlanTerms; after: PlanTerms;
  featuresAdded: PlanFeature[]; featuresRemoved: PlanFeature[]; effective: { kind: 'next_billing'; date: string | null } | { kind: 'on_subscribe' } };
export function planChangeWorthEmailing(before: PlanTerms & { features: PlanFeature[] }, after: PlanTerms & { features: PlanFeature[] }): boolean;
export async function sendAgencyPlanChangeEmail(deps: ToolDeps, agencyId: string, props: Omit<AgencyPlanChangeProps, 'branding' | 'recipientName' | 'agencyName'>): Promise<number>;
```
**Behaviour:** template copy exactly spec §3.5 (subject `Your Rival Monday plan is changing`; money `$229` style via the existing email money formatter; `date === null` ⇒ "your next billing date"; feature names "Ask" / "MCP access"; features lines only when non-empty). Sender mirrors `hold-email.ts` line for line (admins query, Rival Monday branding, Reply-To support, tag `agency_plan_change`, never throws, returns count). The pilot / no-change gating lives in the caller (Task 4) using `planChangeWorthEmailing` (true if any term differs or feature sets differ).
**Tests:** template: `paid variant shows date and old→new terms`, `null date says your next billing date`, `on_subscribe variant`, `features lines only when changed`, `never mentions an operator name` (props carry none); sender: `one email per distinct admin`, `returns 0 without transport`, `swallows transport errors`; `planChangeWorthEmailing` true/false cases.
**Done when:** `pnpm --filter @cs/email exec vitest run agency-plan-change` and `pnpm --filter @cs/tools exec vitest run plan-change-email` pass; commit.

### Task 4: `list_plan_agencies` + `move_agencies_to_current_plan`
**Files:** create `packages/tools/src/tools/platform-plan-move.ts`, `platform-plan-move.test.ts`; register (registry, `fixtures.ts`, `channels.test.ts`, `access-marks.test.ts`, `packages/demo/src/coverage.ts`).
**Interfaces (binding):** tool I/O exactly spec §3.2/§3.3. Helpers:
```ts
export function monthlyCents(t: PlanTerms, activeClients: number): number; // base + max(0, active - included) * seat
export function seatWarningFor(row: { state: BillingState; seatCapExempt: boolean; reducedTrial: boolean }, activeClients: number, target: PlanTerms): 'extra_seats' | 'over_cap' | null;
```
`seatWarningFor`: `activeClients <= target.includedSeats` ⇒ null; `active`/`past_due` ⇒ `extra_seats`; `pilot` && !exempt ⇒ `over_cap`; `trialing` && !reducedTrial ⇒ `over_cap`; else null. Use the same exempt / reduced-trial sources `billingAccess` uses (`access.ts`).
**Behaviour — move, per agency (write this sequence as given):**
```ts
// after one requirePlatformOperator(deps, ctx, 'owner'); target = current standard plan (none ⇒ throw not_configured)
for (const id of dedupe(input.agencyIds)) {
  // operate(deps, ctx, 'owner', 'move_agencies_to_current_plan', { agencyId: id, targetPlanId }, id, ...) per agency (P15);
  // requireAgency refusals (unknown/archived) map to { outcome: 'refused', reason: 'not_found' } — catch, don't abort the loop.
  // 1. tx: row = select agency_billing where agency_id = id FOR UPDATE (no row ⇒ refused/not_found); held ⇒ refused/on_hold;
  //    state 'cancelled' ⇒ refused/cancelled; row.planId === target.id ⇒ already_current.
  //    old = planFor(tx, row); qty = max(0, activeClients - target.includedSeats);
  //    update agency_billing set plan_id = target.id, billable_seats_synced = swaps ? qty : row.billableSeatsSynced,
  //      seat_sync_pending = swaps ? false : row.seatSyncPending, updated_at = now;
  //    insert agency_billing_event { fromState: row.state, toState: row.state, reason: 'admin_plan_version_move', actor: ctx.userId }.
  //    swaps = row.stripeSubscriptionId && ['active','past_due','trialing'].includes(row.state)
  // 2. if swaps: try gw.swapSubscriptionPlan(row.stripeSubscriptionId, { basePriceId, seatPriceId, seatQuantity: qty })
  //    catch ⇒ tx: restore plan_id = row.planId, billable_seats_synced = row.billableSeatsSynced, seat_sync_pending = row.seatSyncPending;
  //           insert event reason 'admin_plan_version_move_reverted'; outcome failed/stripe_error (revert tx failing ⇒ failed/db_error, log agency id + error name).
  // 3. moved: if state !== 'pilot' && planChangeWorthEmailing(old, target) ⇒ emailed = (await sendAgencyPlanChangeEmail(...)) > 0,
  //    effective = swaps ? { kind: 'next_billing', date: isoDate(periodEnd) } : { kind: 'on_subscribe' }.
}
```
Null `old` plan (null `plan_id`) ⇒ `planFor` fallback terms (current standard) — then terms equal and only features may differ (`planFeaturesFor` gave all).
**list:** spec §3.2; join `agency` (exclude `archived_at` not null), `agency_billing`, `plan`; active-client count via the existing helper used by `billingAccess`; `onHold` from `agency.suspended_*`; `swapsStripe` same rule as above.
**Tests:** `viewer and staff refused for move; viewer can list`; `mixed batch` (held, cancelled, archived, current, null plan, active-with-sub, pilot ⇒ outcomes refused/on_hold, refused/cancelled, refused/not_found, already_current, moved, moved, moved); `active with sub swaps prices with seat qty rule` (5 active, target includes 3 ⇒ qty 2, fake `swaps[0]` has target price ids); `pilot and no-card trial: no gateway call, plan_id set`; `stripe failure reverts plan_id and seats` (1 of 3 fails ⇒ that row's `plan_id`/`billable_seats_synced` as before + reverted event; other two moved); `one platform audit row per agency`; `email: sent when terms change, not for pilot, not when nothing changes, on_subscribe without sub`; `idempotent rerun` (second call ⇒ all already_current, `swaps.length` unchanged, no new emails); `planFeaturesFor after move to version without mcp` (active loses mcp, pilot keeps); list: `excludes current and archived, includes null plan`, `monthly math`, `seatWarning per state incl. reduced trial and exempt pilot`; isolation suite passes with the new fixtures.
**Done when:** `pnpm --filter @cs/tools exec vitest run platform-plan-move isolation channels access-marks` passes; commit.

### Task 5: Web — plans tab, agency page
**Files:** modify `apps/web/src/app/(platform)/platform/billing/{plan-editor.tsx,page.tsx,actions.ts,parse.ts}` (+ existing tests); create `.../billing/plan-agencies.tsx` + `.test.tsx`; modify `.../agencies/[id]/{billing-panel.tsx,manage-menu.tsx,actions.ts,page.tsx}` (+ tests); `apps/web/src/lib/labels.ts`.
**Interfaces:** server action `moveAgenciesToCurrentPlanAction(agencyIds: string[])` (billing) and `moveAgencyToCurrentPlanAction(agencyId)` (agency page) → both `runTool(ctx, 'move_agencies_to_current_plan', { agencyIds })`, return the tool result; `parse.ts` reads `features` checkboxes (`fd.getAll('features')`).
**Behaviour:** spec §3.6 exactly (labels, empty state, disabled held rows with hold chip, header select-all of enabled rows, owner-only button, viewers read-only, dialog rows "now → after" + P7 warning text, note line, result summary). Labels in `labels.ts`: `PLAN_MOVE_REASON_LABEL` = `{ on_hold: 'On hold', cancelled: 'Cancelled', not_found: 'Not found', stripe_error: 'Stripe error', db_error: 'Save failed' }`; `PLAN_FEATURE_LABEL` = `{ ask: 'Ask', mcp: 'MCP access' }`. Versions table shows features joined by ", " or "None". Agency billing panel: "Plan v{n}" / "Plan version not set", "(current: v{N})" when behind — page passes `list_plans` current version (or a cheap read already on the page). Manage item **"Move to current plan"**: owner, behind, not held/archived/cancelled. Use `ConfirmDialog` as other Manage items do. Design system v1 rules (sections over cards).
**Follow pattern:** `agencies/[id]/manage-menu.tsx` + `action-dialog.tsx` (dialogs), `billing/codes.tsx` (table + action).
**Tests:** `plan-agencies.test.tsx`: renders rows + empty state; held row checkbox disabled; select-all skips held; button hidden for viewer; dialog lists now→after and the two warning texts; result summary with reason label. `actions.test.ts`: both actions call `runTool` with `{ agencyIds }`; `parse.test.ts`: features from checkboxes; `manage-menu.test.tsx`: item visibility matrix; `billing-panel.test.tsx`: version + "(current: vN)".
**Done when:** `pnpm --filter @cs/web exec vitest run platform/billing platform/agencies` passes; `pnpm --filter @cs/web typecheck` clean; commit.

### Task 6: Help, copy sign-off, E2E
**Files:** modify `docs/help/pages/platform.billing.operator.md`, `docs/help/pages/platform.agencies.detail.operator.md`; create `docs/archive/phase-15c3b-copy-signoff.md`; modify `apps/web/e2e/billing.spec.ts` (or a new `platform-plan-move.spec.ts` following `platform.spec.ts`).
**Behaviour:** guides: one short section each ("Plan versions and features", "Moving agencies to the current version": next-billing-date pricing, features apply now, admins emailed, held/cancelled can't be moved). Sign-off file lists every new user-visible string (email subject/lines, section heading, button, dialog note, warnings, empty state, result lines, labels, menu item, panel text) with checkbox + owner signature line, same format as `docs/archive/phase-15c3a-copy-signoff.md`. E2E: owner publishes v2 with MCP unticked → plans tab lists a seeded agency on v1 → select → Move → confirm → section shows empty state → agency page panel shows "Plan v2".
**Done when:** `pnpm --filter @cs/web e2e -- platform-plan-move` (or the billing spec) passes on this worktree's test DB; `kb:seed` lint for help pages passes if one exists (`pnpm --filter @cs/web exec vitest run help`); commit. Then update `docs/work/phase-15c3b.md` (Status, owner verification steps: publish a version with MCP off; move two test agencies incl. one with a Stripe test subscription — Stripe shows new prices, no proration invoice item; admin email arrives; held agency greyed; sign the copy file).
