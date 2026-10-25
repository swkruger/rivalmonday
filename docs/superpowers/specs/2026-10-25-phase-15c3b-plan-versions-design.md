# Phase 15c-3b — plan features per version + move agencies to the current version

**Status:** draft for owner review (2026-10-25). **Branch:** `phase-15c3b`. **No migration.**
**Replaces** 15c spec §5.5 (C11 "separate plans"): the owner dropped private / separate plans on 2026-10-25. Only the
`standard` code exists; operators publish new versions of it (`create_plan_version`, 9a) and now move agencies onto the
current version. Binding context: core spec billing §, 9a R8 (existing subscriptions keep their prices on a new version),
7a2 D1/D13 (plan features; pilot / no plan ⇒ every feature), 7a2 D16 (archived = deleted for the console), 15c-3a spec
§4.4 (admin emails) and §4.5 (Manage menu).

## 1. Intent
When the owner changes the standard plan (price, included seats, seat price, Ask/MCP), they need to (a) decide which
features the new version carries, and (b) move existing agencies onto it — chosen agencies at a time, not all-or-one —
with the new price starting at each agency's next billing date and the agency's admins told by email.

**Non-goals:** private/custom plans, a second plan code, `plan.visibility`, per-agency feature overrides, retiring a
version, choosing an older target version (target is always the current version), proration, a "pending plan" applied
at renewal, a stored subscription period end, client-facing changes. **Anti-goals:** an agency charged mid-cycle; an
email naming the operator; a batch where one Stripe failure blocks or rolls back the others; a moved agency whose
Stripe prices and `plan_id` disagree without the operator seeing it.

## 2. Decisions
**Owner (2026-10-25):**
- **P1** Scope = features on a new version + moving agencies; private plans dropped. One sub-phase, one plan.
- **P2** Batch move by selection: a list of agencies not on the current version, with checkboxes and "Move selected";
  plus a single-agency "Move to current plan" in the agency Manage menu. Same tool for both.
- **P3** New price from the **next billing date**: Stripe price swap with `proration_behavior: 'none'` for every item,
  seats included (nothing charged or credited now; the next invoice bills the new prices and seat count).
- **P4** Admins of a moved agency get an email.

**Design calls (Claude; owner may override at review):**
- **P5** `plan_id` switches at once, so a feature change (Ask/MCP on/off) applies immediately; only the price waits.
- **P6** `trial_ends_at` is unchanged by a move (operators use Extend trial).
- **P7** Fewer included seats than active clients ⇒ allowed, with a per-agency warning in the dialog: `active` /
  `past_due` → "Pays for {n} extra seat(s) from the next billing date."; `pilot` (not cap-exempt) / full `trialing` →
  "Over the client limit: new clients can't be activated until they're under it." Reduced (open sign-up) trials
  show no warning (their cap is `TRIAL_ACTIVE_CLIENTS` whatever the plan says).
- **P8** Email only when the agency's price (base, seat price or included seats) or features actually change, and never
  for `pilot` agencies. Rival Monday branded, never names the operator.
- **P9** Feature checkboxes on "Publish new version" pre-fill from the current version.
- **P10** Discounts on the subscription are kept (the swap replaces items only; versions share the standard Stripe
  products, `plan-sync.ts`, so standard-only coupons still apply).
- **P11** Agencies with a billing row and `plan_id IS NULL` are listed (version shown as "Not set") and movable; the move
  sets `plan_id`. `planFeaturesFor` keeps 7a2's "no plan ⇒ every feature" until they are moved. Agencies with no
  `agency_billing` row are out of scope.
- **P12** Who gets a Stripe swap: state `active`, `past_due`, or `trialing` with a stored subscription id. `cancelled`
  agencies are refused (`cancelled`): their subscription is ending, there is nothing to move. Everyone else (pilot,
  trialing without a card) gets `plan_id` only and the `on_subscribe` email.
- **P13** Archived agencies never appear (D16) and are refused as `not_found`; held agencies appear disabled with the
  hold chip and are refused as `on_hold`.
- **P14** Ordering and drift: one tx sets `plan_id`, `billable_seats_synced` (new seat qty), clears `seat_sync_pending`
  and writes the billing event; **then** the Stripe swap; on Stripe failure a compensating tx restores the old
  `plan_id`/`billable_seats_synced` and writes a second event (`admin_plan_version_move_reverted`) → `failed/stripe_error`.
  The first tx takes the billing row `FOR UPDATE` (like `lockBillingRow` in `apply.ts`, but never inserting a row) so a
  concurrent `syncSeats` sees either the old or the new plan, not a mix. Belt and braces: `reconcile()` in
  `daily.ts` gains a price-id check (subscription base/seat price ≠ `plan_id`'s prices ⇒ reported in its existing drift
  output; no auto-fix).
- **P15** Audit: one `withPlatformAudit` row **per agency** (via `operate(..., agencyId)` per item after a single role
  check), so each agency's own history shows the move.

## 3. Interfaces

### 3.1 `create_plan_version` (extend, `packages/tools/src/tools/platform-billing.ts`)
Input gains `features: z.array(z.enum(PLAN_FEATURES)).max(PLAN_FEATURES.length).optional()` (deduped, stored in
`PLAN_FEATURES` order). Omitted ⇒ copy the current standard version's `features` (inside the existing tx, under the
existing `plan:standard` lock). `list_plans` output **gains** `features` per version.

### 3.2 `list_plan_agencies` (new read tool, viewer floor like `list_plans`)
`input: {}` → `{ currentPlanId, currentVersion, agencies: Array<{ agencyId, name, state, planId: string|null,
version: number|null, basePriceCents, includedSeats, seatPriceCents, features, activeClients, swapsStripe: boolean,
onHold: boolean, seatWarning: 'extra_seats' | 'over_cap' | null, extraSeatsAfter: number, monthlyNowCents,
monthlyAfterCents }> }` — every non-archived agency with a billing row whose `plan_id` is null or not the current
version, ordered by version asc nulls first, name. Null `plan_id` rows report the prices `planFor` resolves for them.
`monthly*` = base + max(0, activeClients − includedSeats) × seat price, old vs current. No Stripe calls. Needs an
`ISOLATION_FIXTURES` entry and the 8b tool-access row.

### 3.3 `move_agencies_to_current_plan` (new write tool, **owner**)
`input: { agencyIds: z.array(z.string().uuid()).min(1).max(50) }` (deduped) →
`{ targetPlanId, targetVersion, results: Array<{ agencyId, outcome: 'moved' | 'already_current' | 'refused' | 'failed',
reason?: 'on_hold' | 'cancelled' | 'not_found' | 'stripe_error' | 'db_error', emailed: boolean }> }`.
- Role check once (`requirePlatformOperator`, owner), then per agency, **independently**, in input order: refuse
  unknown/archived/no billing row (`not_found`), held (`on_hold`), `cancelled`; `already_current` if `plan_id` = target;
  else P14 sequence; after success, `sendAgencyPlanChangeEmail` (P8) — its failure never changes `outcome`.
- Seat quantity = max(0, activeClients − target.includedSeats), same rule as `syncSeats`.
- `agency_billing_event { fromState: state, toState: state, reason: 'admin_plan_version_move', actor: userId }`.

### 3.4 Gateway (`packages/billing/src/types.ts`, `stripe-gateway.ts`, `fake-gateway.ts`)
`swapSubscriptionPlan(subscriptionId: string, i: { basePriceId: string; seatPriceId: string; seatQuantity: number }):
Promise<{ currentPeriodEnd: Date | null }>` — retrieves the subscription, maps its base line and seat line (`seatItem`)
to the new prices, one `subscriptions.update({ items, proration_behavior: 'none' })`, returns the period end from the
update response (feeds the email date). Missing seat line with qty > 0 ⇒ added; qty 0 with no line ⇒ nothing. The fake
gateway records calls, updates its in-memory items and can be told to fail.

### 3.5 Email `agency_plan_change` (`packages/email`, sender `packages/tools/src/platform/plan-change-email.ts`)
Mirror `hold-email.ts` (direct `deps.leadEmail`, one per distinct admin, Rival Monday branding, Reply-To support, never
throws, logs agency id + error name only). Props: `{ branding, recipientName, agencyName, before: PlanTerms,
after: PlanTerms, featuresAdded: PlanFeature[], featuresRemoved: PlanFeature[], effective: { kind: 'next_billing',
date: string | null } | { kind: 'on_subscribe' } }`, `PlanTerms = { basePriceCents, includedSeats, seatPriceCents }`.
Draft copy (owner signs in `docs/archive/phase-15c3b-copy-signoff.md`):
- Subject: `Your Rival Monday plan is changing`
- Lead (paid): `From {date|your next billing date}, your plan is {base}/month including {n} client seats, then {seat}
  per extra seat (was {oldBase} with {oldN} seats, {oldSeat} each).` Lead (on_subscribe): `Your plan is now {base}/month
  including {n} client seats, then {seat} per extra seat. These prices apply when you subscribe.`
- Features (only if changed): `Now included: {Ask, MCP access}.` / `No longer included: {…}. This applies straight away.`
- Footer: `Questions? Reply to this email.`
Dates date-only UTC (15c-2a). Feature names: "Ask" (assistant name from branding, as elsewhere) and "MCP access".

### 3.6 Web
- `/platform/billing` plans tab (`plan-editor.tsx`): the publish form gains "Includes" checkboxes **Ask** / **MCP
  access** (P9); the versions table shows each version's features. Below it, new section **"Agencies not on the current
  version"** (`list_plan_agencies`): checkbox, agency, version, state, monthly now → after; held rows disabled with the
  hold chip; header checkbox selects all enabled rows. **"Move selected to v{N}"** (owner only; viewers/staff see the
  table read-only) → `ConfirmDialog` listing each agency's now → after and its P7 warning, plus "New prices start at
  each agency's next billing date. Feature changes apply now. Admins are emailed." Result: inline "Moved {n}." and, if
  any, "{m} not moved: {name} ({reason label})". Empty state: "Every agency is on the current version."
- `/platform/agencies/[id]`: billing panel shows "Plan v{n}" (or "Plan version not set") plus "(current: v{N})" when
  behind; Manage ▾ gets **"Move to current plan"** (owner, only when behind, hidden on hold/archived/cancelled) → the
  same dialog for one agency, same tool.
- Server actions call `runTool` only. Reason labels via `lib/labels.ts`. Help: update
  `docs/help/pages/platform.billing.operator.md` and `platform.agencies.detail.operator.md`.

## 4. Tests (beyond per-tool unit tests)
- `create_plan_version`: explicit features stored; omitted ⇒ copied from current; invalid feature rejected.
- `move_agencies_to_current_plan`: viewer/staff refused; held/cancelled/archived refused per row while others move;
  `already_current`; null `plan_id` moved; live subscription ⇒ fake `swapSubscriptionPlan` with new price ids, seat
  qty rule, `'none'`; pilot / no-card trial ⇒ no gateway call; Stripe failure on one of three ⇒ two moved, the failed
  one has its old `plan_id` + `billable_seats_synced` back and a reverted event; one platform audit row per agency;
  email only when terms/features change, never for pilot, `on_subscribe` variant without a subscription.
- `planFeaturesFor` after a move to a version without `mcp` ⇒ gone for active/trialing, kept for pilot.
- `reconcile()`: price-id mismatch reported.
- `list_plan_agencies`: excludes current + archived, includes null `plan_id`; monthly math; `seatWarning` per state
  (incl. reduced trial ⇒ null, cap-exempt pilot ⇒ null); isolation fixture.
- Web: section render, disabled held rows, dialog warning rows, result summary; Manage menu visibility rules.
- E2E (one): publish v2 with MCP off → select one agency → move → table empties, billing panel shows v2.

## 5. Left to the builder
Exact component split, dialog layout within design system v1, sharing `seatItem`, how `reconcile()` surfaces the new
drift line within its existing output, test file names.
