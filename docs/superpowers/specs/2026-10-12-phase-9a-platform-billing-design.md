# Phase 9a — Platform billing (design)

**Status:** owner-approved design, 2026-10-12. **Branch:** `phase-9`. **Brief:** `docs/work/phase-9.md`.
New decisions and interfaces only. Core spec (`2026-09-29-core-platform-design.md`) §10.6/§2.2 put Stripe Billing and Connect in later phases; this phase pulls Stripe Billing forward. Root `CLAUDE.md` § Decisions and phase-8a spec d1–d9 still bind.

## Goal
Rival Monday charges agencies: free pilot or 30-day trial, then a monthly plan (current: $229 incl. 3 client seats, $99 per extra seat), with discount codes, manageable prices, a clear non-payment ladder, and platform-console controls. Agencies bill their own clients outside the system (seat report + CSV).

## Decisions (owner-approved 2026-10-12)
- **e1 Split.** 9a = platform → agency billing + seat report/CSV. 9b = agency → client billing via Stripe Connect, **parked until pilot-agency feedback**.
- **e2 Provider.** Stripe Billing + Stripe Tax. Owner creates the Stripe account (test mode first). USD, monthly only.
- **e3 Prices.** Versioned `plan` table in our DB, synced to Stripe (new Stripe prices per version); owner edits in the console; existing subscribers grandfathered until moved.
- **e4 Trial.** No card at start. Reminders at 7 and 1 days left.
- **e5 Non-payment ladder.** trial end without card or payment failure → `past_due` (everything works; banner; no new active clients) → +7 d `read_only` (history viewable; collection, briefs, alerts, Ask, MCP and prospect snapshots paused) → +30 d `suspended` (billing page only; data kept) → +90 d flagged for owner review in console (never auto-deleted). Any successful payment → `active` immediately.
- **e6 Seats.** Billable seat = `client.status = 'active'`; prospects free. First 3 included. Adds prorated immediately; removals take effect at renewal (no refund).
- **e7 Cap.** In `pilot` and `trialing`, max 3 active clients; more requires a subscription ("Upgrade").
- **e8 Pilot.** Status flag (not a coupon), granted by platform owner/staff with optional end date. Converting a pilot = normal subscription, optionally with a discount the owner attaches. Pilot end → normal 30-day trial.
- **e9 Discounts.** Stripe coupons + promotion codes, managed from the console (owner): percent or amount; applies to base, seats or both; once / N months / forever; expiry; max uses; **optionally restricted to selected agencies**. Owner/staff can attach a discount directly to an agency.
- **e10 Invite links.** 9a generates and manages agency invite links (offer, pilot end, discount, email lock, max uses, expiry, note, revoke). **Redemption and invite emails are Phase 10.**
- **e11 Flat pricing.** No usage charges; per-client spend caps remain internal cost guards (enforcement Phase 7b).
- **e12 UI.** Stripe Checkout + Customer Portal for card data, invoices and cancellation; our `/agency/settings/billing` summary page (agency admin only). Portal plan switching off.
- **e13 Emails.** Stripe sends receipts, invoices and payment retries; Postmark sends lifecycle notices in Rival Monday branding to agency admins.
- **e14 Sync.** Stripe webhook route with signature check + event-id dedupe; nightly reconciliation (Stripe wins); seat sync from client activation/deactivation tools.
- **e15 Console.** Plan editor, codes, invite links, per-agency billing panel and actions, MRR tile; MRR + paid seats added to `agency_daily_stat`. Full income statement later.

## Data model (service role only: RLS forced, no policies, no `app_user` grants; next free migration numbers at execution time)

```sql
CREATE TABLE plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,                       -- 'standard'
  version integer NOT NULL,
  name text NOT NULL,
  base_price_cents integer NOT NULL CHECK (base_price_cents >= 0),
  included_seats integer NOT NULL CHECK (included_seats >= 0),
  seat_price_cents integer NOT NULL CHECK (seat_price_cents >= 0),
  trial_days integer NOT NULL CHECK (trial_days BETWEEN 0 AND 90),
  stripe_product_id text, stripe_base_price_id text, stripe_seat_price_id text,
  is_current boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), created_by text NOT NULL,
  UNIQUE (code, version)
);
CREATE UNIQUE INDEX plan_current_uq ON plan (code) WHERE is_current;

CREATE TABLE agency_billing (
  agency_id uuid PRIMARY KEY REFERENCES agency(id) ON DELETE CASCADE,
  state text NOT NULL CHECK (state IN ('pilot','trialing','active','past_due','read_only','suspended','cancelled')),
  plan_id uuid REFERENCES plan(id),
  stripe_customer_id text UNIQUE, stripe_subscription_id text UNIQUE,
  trial_ends_at timestamptz, pilot_ends_at timestamptz, past_due_since timestamptz,
  cancel_at timestamptz, review_flagged_at timestamptz,
  billable_seats_synced integer, seat_sync_pending boolean NOT NULL DEFAULT false,
  attached_coupon_id text,
  state_changed_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE agency_billing_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agency(id) ON DELETE CASCADE,
  from_state text, to_state text NOT NULL, reason text NOT NULL,   -- e.g. 'stripe:invoice.paid', 'timer:trial_ended', 'admin:grant_pilot'
  actor text NOT NULL,                                              -- user id, 'stripe', 'job'
  stripe_event_id text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agency_billing_event_agency_idx ON agency_billing_event (agency_id, created_at);

CREATE TABLE stripe_event (id text PRIMARY KEY, type text NOT NULL, received_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz, error text);

CREATE TABLE discount_code (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  stripe_coupon_id text NOT NULL, stripe_promotion_code_id text,   -- promotion code null for attach-only discounts
  percent_off numeric(5,2), amount_off_cents integer,
  applies_to text NOT NULL CHECK (applies_to IN ('base','seats','both')),
  duration text NOT NULL CHECK (duration IN ('once','repeating','forever')), duration_months integer,
  restricted_agency_ids uuid[] ,                                     -- null = any agency
  expires_at timestamptz, max_redemptions integer,
  created_at timestamptz NOT NULL DEFAULT now(), created_by text NOT NULL, revoked_at timestamptz,
  CHECK ((percent_off IS NULL) <> (amount_off_cents IS NULL))
);

CREATE TABLE agency_invite_link (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE, token_prefix text NOT NULL,
  offer text NOT NULL CHECK (offer IN ('pilot','trial')),
  pilot_ends_at timestamptz, discount_code_id uuid REFERENCES discount_code(id),
  email_lock text, max_uses integer NOT NULL DEFAULT 1 CHECK (max_uses >= 1), uses integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL, note text,
  created_at timestamptz NOT NULL DEFAULT now(), created_by text NOT NULL, revoked_at timestamptz
);
```
- `agency_daily_stat` (phase-8) gains `mrr_cents integer`, `paid_seats integer`, `billing_state text` (NULL before 9a).
- Migration backfills `agency_billing` for every existing agency as `state='pilot'`, `pilot_ends_at NULL`, and seeds `plan` `standard` v1 (22900 / 3 / 9900 / 30, Stripe ids NULL until the first console save or `billing:sync-plan` CLI).
- Invite token: `rm_inv_` + 32 random bytes base64url; store SHA-256 hash + 12-char prefix; shown once (mirror phase-6 `generatePat`/`hashPat`).

## State machine (`packages/billing/src/state.ts`)
```ts
export type BillingState = 'pilot'|'trialing'|'active'|'past_due'|'read_only'|'suspended'|'cancelled';
export type BillingSignal =
  | { kind: 'subscription_active' }            // checkout completed / invoice.paid / subscription status active|trialing-with-card
  | { kind: 'payment_failed' }                 // invoice.payment_failed / subscription past_due|unpaid
  | { kind: 'subscription_cancelled_at_period_end'; at: Date }
  | { kind: 'subscription_ended' }             // customer.subscription.deleted
  | { kind: 'timer'; now: Date }               // nightly job
  | { kind: 'admin_grant_pilot'; endsAt: Date | null } | { kind: 'admin_end_pilot' } | { kind: 'admin_extend_trial'; until: Date };
export function nextBillingState(row: AgencyBillingRow, s: BillingSignal): { state: BillingState; patch: Partial<AgencyBillingRow>; reason: string } | null;
```
Rules (null = no change):
- `subscription_active` → `active` from any state; clears `past_due_since`, `cancel_at`, `review_flagged_at`.
- `payment_failed` from `active` → `past_due` (`past_due_since = now`).
- `timer`: `trialing` and `trial_ends_at ≤ now` and no active subscription → `past_due`; `past_due` and `now − past_due_since ≥ 7 d` → `read_only`; `read_only` and `≥ 37 d` → `suspended`; `suspended` and `≥ 127 d` → set `review_flagged_at` (state unchanged); `pilot` and `pilot_ends_at ≤ now` → `trialing` (`trial_ends_at = now + plan.trial_days`); `cancelled` and `cancel_at ≤ now` → `past_due` path with `past_due_since = cancel_at`.
- `subscription_cancelled_at_period_end` → `cancelled` (`cancel_at`); `subscription_ended` → `past_due` (if not already later in the ladder).
- Admin: `grant_pilot` from any state except `active` → `pilot`; `end_pilot` → `trialing`; `extend_trial` only from `trialing`/`past_due` → `trialing` with new `trial_ends_at`.
Every transition writes `agency_billing_event` and enqueues its email (outbox, same transaction).

## `@cs/billing` package
- `BillingGateway` interface: `createCustomer`, `createCheckoutSession`, `createPortalSession`, `updateSeatQuantity(subId, qty, { prorate: boolean })`, `getSubscription`, `upcomingInvoice`, `listInvoices`, `createPrices(plan)`, `createCoupon`, `createPromotionCode`, `deactivatePromotionCode`, `attachCustomerDiscount`, `verifyWebhook(rawBody, signature)`. `stripeGateway(secretKey)` (pinned `stripe` SDK, exact version) and `fakeGateway()` (in-memory, for tests, DEMO and TEST).
- `billingAccess(db, agencyId): Promise<{ state; canAddActiveClient: boolean; readOnly: boolean; suspended: boolean; activeClients: number; includedSeats: number }>`.
- `startAgencyTrial(db, gw, agencyId, opts: { offer: 'pilot'|'trial'; pilotEndsAt?: Date; couponId?: string })` — for Phase 10.
- `syncSeats(db, gw, agencyId)` — active subscription: qty = max(0, active − included); increase → prorate now; decrease → no proration (takes effect at renewal). Gateway failure → `seat_sync_pending = true`, never fails the client change.
- `handleStripeEvent(db, gw, event)`, `runBillingDaily(db, gw, now)`.

## Tools (`@cs/tools`, writes via `runTool`)
Agency (role `agency_admin`; everyone else `permission_denied` → 404): `get_billing_summary` (plan, state, dates, seats used/included/extra, next invoice estimate, discount, recent invoices), `create_checkout_session` → `{ url }`, `create_portal_session` → `{ url }`, `redeem_discount_code({ code })`, `get_seat_report` (active clients `{ id, name, activatedAt }`) + CSV route `/agency/settings/billing/seats.csv` (same tool).
Platform (`requirePlatformOperator(deps, ctx, min)`): `list_plans` (viewer), `create_plan_version` (owner), `list_discount_codes` (viewer), `create_discount_code` / `revoke_discount_code` (owner), `list_invite_links` (staff), `create_invite_link` → `{ url, token }` shown once / `revoke_invite_link` (staff), `get_agency_billing` (viewer), `grant_pilot` / `end_pilot` / `extend_trial` / `attach_agency_discount` (staff), `get_billing_overview` (viewer: MRR, paid seats, agencies by state).
Existing tools changed: `create_client` (active), `convert_prospect`, client reactivation → check `billingAccess.canAddActiveClient` (error code `billing_seat_limit`), then `syncSeats` after commit. Web write tools refuse with `service_paused` in `read_only`/`suspended`, except billing, team and sign-out flows.

## Enforcement
- Worker schedulers: shared filter `agencyServiceable(agency)` (state not in `read_only`, `suspended`) beside `client.status = 'active'` — collection, brief generation/delivery, alerts, prospect snapshots.
- Ask + MCP (phase-6): `service_paused` error in `read_only`/`suspended`.
- `suspended`: agency users → redirect to `/agency/settings/billing`; client users and guests → page with copy "This workspace is temporarily unavailable. Please contact {agencyName}." (agency branding, no billing words).
- Banners (agency shell): agency admin — trialing "Your trial ends {date}. Add a payment method to keep going." + button; past_due/read_only red "Payment needed — service pauses on {date}." / "Service is paused. Update your payment method to resume."; account manager — "Your agency's account needs attention." Cap refusal copy: "You've used your 3 included clients. Upgrade to add more." (number from plan).

## Web
- `POST /api/stripe/webhook` (Node runtime, raw body): verify signature → insert `stripe_event` (conflict ⇒ 200, skip) → `handleStripeEvent` → `processed_at`; handler errors stored in `error`, respond 500 so Stripe retries. Unknown customer → 200 + logged.
- `/agency/settings/billing` page (agency admin; others 404); seat CSV route.
- Console: `/platform/billing` (MRR tile, plans + editor, codes, invite links); billing panel + actions on `/platform/agencies/[id]`; billing-state column on `/platform/agencies`. Nav: "Billing" under Platform; "Billing" under agency settings (admin only).
- Env (owner adds; `turbo.json` `globalPassThroughEnv`; `server/env.ts`): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_TAX_ENABLED`. DEMO/TEST always use `fakeGateway`.

## Emails (`@cs/email`, Postmark, Rival Monday branding, to agency admins)
Templates: `trial-started`, `trial-ending` (7 d, 1 d), `trial-ended`, `payment-failed`, `service-paused`, `account-suspended`, `account-reactivated`, `pilot-ending` (7 d). Sent through the notification outbox in the transition's transaction.

## Testing
- Unit: `nextBillingState` exhaustive table (every state × signal, day boundaries 7/37/127); `syncSeats` up/down/no-subscription/gateway failure; webhook dedupe and unknown customer; `runBillingDaily` timers, reminders, retries, reconciliation drift (Stripe wins, logged); cap enforcement in each changed tool; `service_paused` refusals; scheduler filter; every platform tool's role minimum; invite token hash-only storage; discount restricted to agencies.
- E2E `@billing` (fake gateway): trial agency blocked at 4th active client with Upgrade prompt; billing page renders for admin, 404 for account manager; suspended agency → admin redirected, client sees branded copy; console creates a code and an invite link (URL shown once).
- Owner verification (manual, not CI): Stripe test mode + Stripe CLI webhook forwarding — checkout with test card, seat add prorates, failed card → past_due, Portal cancel.

## Dependencies on in-flight work
- **phase-8** (8a) must merge first: `platform_admin` roles, `requirePlatformOperator(min)`, console pages, `agency_daily_stat`.
- **phase-6**: Ask/MCP refusal hooks for `service_paused`; migration numbers 0038–0043.
- **Phase 10** consumes `startAgencyTrial`, invite links (redemption), invite emails.

## Out of scope
Stripe Connect / agency → client billing (9b), annual plans, non-USD, usage-based pricing, income statement, invite redemption and invite emails (Phase 10), automatic data deletion.
