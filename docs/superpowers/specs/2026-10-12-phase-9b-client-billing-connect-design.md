# Phase 9b — Agency → client billing via Stripe Connect (design)

**Status:** owner-approved design, 2026-10-12. **Branch:** `phase-9`. Builds on 9a (`2026-10-12-phase-9a-platform-billing-design.md`, e1–e16), which must be merged first. **Execution waits for pilot-agency feedback** (9a e1) unless the owner says otherwise.
New decisions and interfaces only.

## Goal
Agencies can optionally bill their clients through the app, at any price they choose, on their own Stripe account, white-labelled. Agencies that bill elsewhere keep using 9a's seat report + CSV.

## Decisions (owner-approved 2026-10-12)
- **f1 No platform fee.** Stored `application_fee_percent` (global default + per-agency override), default **0**; only attached to charges when > 0.
- **f2 Standard accounts, direct charges.** The agency connects its own Stripe account; it is the merchant (receipts, statements, refunds, disputes, its own tax). We never hold client funds.
- **f3 Pricing.** One agency default monthly price + per-client override + optional one-time setup fee. Monthly only (annual → backlog).
- **f4 Start.** Agency turns billing on per client → agency-branded email to the client owner with a Checkout link on the connected account; afterwards the client owner uses the agency's Customer Portal from the client workspace.
- **f5 Non-payment = agency control.** Failed payment → agency alert + email, client banner; service continues until the agency pauses the client. Optional per-agency auto-pause after N days (default off). Payment lifts an auto-pause.
- **f6 Client pause.** New `client.paused_at`, independent of billing: stops collection, briefs, alerts for that client; history stays visible. **Changes 9a e6:** billable seat = `status='active' AND paused_at IS NULL` (effective at renewal, like other decreases).
- **f7 Roles.** Agency admin: connect, prices, enable/disable billing, revenue. Account manager (in scope): billing state only, no amounts; may pause/resume. Client owner: own Billing page. Client viewer: none.
- **f8 Eligibility.** Connect + price setup at any 9a state; enabling client billing requires 9a state `active` or `pilot` and `charges_enabled`.
- **f9 Tax/refunds/disputes** in the agency's Stripe dashboard; our app reflects refunded/disputed state only.
- **f10 Disconnect.** Warn; on disconnect all `client_billing` → `disconnected`; subscriptions keep running in the agency's account; we stop tracking.
- **f11 Webhooks.** Separate `/api/stripe/connect-webhook` with its own secret (`STRIPE_CONNECT_WEBHOOK_SECRET`), event-id dedupe; 9a's nightly reconciliation extended to connected subscriptions.
- **f12 Agency revenue card** with margin vs 9a cost.
- **f13 Emails.** Clients: Stripe receipts (agency account) + our agency-branded notices. Agencies: failed / first paid / auto-paused. **No Rival Monday name in anything client-facing.**

## Data model (service role only; next free migrations)
```sql
ALTER TABLE client ADD COLUMN paused_at timestamptz, ADD COLUMN paused_by text;

CREATE TABLE agency_connect (
  agency_id uuid PRIMARY KEY REFERENCES agency(id) ON DELETE CASCADE,
  stripe_account_id text UNIQUE,
  status text NOT NULL CHECK (status IN ('pending','connected','restricted','disconnected')),
  charges_enabled boolean NOT NULL DEFAULT false, details_submitted boolean NOT NULL DEFAULT false,
  default_price_cents integer CHECK (default_price_cents >= 0), default_setup_fee_cents integer CHECK (default_setup_fee_cents >= 0),
  currency text NOT NULL DEFAULT 'usd',
  stripe_product_id text, stripe_default_price_id text,
  application_fee_percent numeric(5,2),                -- null = use global default
  auto_pause_after_days integer CHECK (auto_pause_after_days BETWEEN 1 AND 90),
  connected_at timestamptz, disconnected_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE client_billing (
  client_id uuid PRIMARY KEY REFERENCES client(id) ON DELETE CASCADE,
  agency_id uuid NOT NULL REFERENCES agency(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  price_cents integer CHECK (price_cents >= 0), setup_fee_cents integer CHECK (setup_fee_cents >= 0),
  stripe_price_id text, stripe_customer_id text, stripe_subscription_id text UNIQUE,
  state text NOT NULL CHECK (state IN ('off','invited','active','payment_needed','cancelled','disconnected')),
  checkout_sent_at timestamptz, payment_failed_since timestamptz, last_paid_at timestamptz,
  refunded_at timestamptz, disputed_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE stripe_connect_event (id text PRIMARY KEY, account_id text NOT NULL, type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz, error text);

CREATE TABLE platform_setting (key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), updated_by text NOT NULL);
-- seed: ('connect_application_fee_percent', '0', …, 'migration')
```
Paused is a property of the **client** (`paused_at`), not a `client_billing.state`; UI pill precedence: Paused > Payment needed > Invited > Paying > Off.

## Shared filters
- 9a `agencyServiceable` stays; add `clientServiceable(clientTable)` = `status='active' AND paused_at IS NULL` and use it in every scheduler query and in 9a seat counts (`syncSeats`, `billingAccess`, seat report).

## Gateway (extends 9a `BillingGateway`; all take `{ stripeAccount: string }`)
`createAccountLink({ accountId?, refreshUrl, returnUrl }) → { url, accountId }` (creates the Standard account on first call), `getAccount`, `createConnectedProduct`, `createConnectedPrice`, `createConnectedCheckout({ priceId, setupFeeCents?, customerEmail, applicationFeePercent?, successUrl, cancelUrl })`, `createConnectedPortal`, `getConnectedSubscription`, `updateConnectedSubscriptionPrice({ subscriptionId, priceId, prorate: false })`, `verifyConnectWebhook`. Fake gateway mirrors all.

## Tools
| Tool | Who | Notes |
|---|---|---|
| `get_connect_status`, `start_stripe_connect` → `{ url }`, `disconnect_stripe` | agency_admin | disconnect requires `{ confirm: true }` |
| `set_client_billing_defaults({ priceCents, setupFeeCents?, autoPauseAfterDays? })` | agency_admin | creates/updates product + default price on connected account |
| `enable_client_billing({ clientId, priceCents?, setupFeeCents? })`, `disable_client_billing`, `resend_client_payment_link`, `set_client_price({ clientId, priceCents, applyTo: 'next_bill'\|'new_only' })`, `get_client_revenue` | agency_admin | eligibility f8 → `billing_not_eligible`, `connect_not_ready` |
| `pause_client` / `resume_client({ clientId })` | agency_admin, account_manager in scope | audited; triggers 9a `syncSeats` |
| `list_client_billing_status` | agency_admin, account_manager in scope | states only for AMs |
| `get_my_billing`, `open_billing_portal` → `{ url }` | client_owner | viewers `permission_denied` → 404 |
| `set_connect_fee_percent({ agencyId?, percent })` | platform owner | 0–20; null agencyId = global |
| `get_connect_overview` | platform viewer | connected agencies, client MRR via Connect |

`disable_client_billing` cancels the subscription at period end (agency confirms). Checkout links expire after 24 h; `resend` regenerates.

## Webhook `POST /api/stripe/connect-webhook`
Same pipeline as 9a (verify → dedupe in `stripe_connect_event` → handle → `processed_at`; errors → 500). Mapping: `account.updated` → `charges_enabled`, `details_submitted`, status; `account.application.deauthorized` → disconnect (f10); `checkout.session.completed` → store customer/subscription, `active`, `last_paid_at`; `invoice.paid` → `active` (+ lift auto-pause if `paused_by='auto'`); `invoice.payment_failed` → `payment_needed` (`payment_failed_since`); `customer.subscription.deleted` → `cancelled`; `charge.refunded` → `refunded_at`; `charge.dispute.created` → `disputed_at`. Out-of-order guard as 9a.

## Daily job (extends 9a `billing-daily`)
Auto-pause: `payment_needed` and `now − payment_failed_since ≥ auto_pause_after_days` → `paused_at = now`, `paused_by = 'auto'`, notify agency. Reconcile connected subscriptions (Stripe wins). Write client-billing MRR into a new `agency_daily_stat.client_mrr_cents` column.

## UI
- `/agency/settings/billing` → "Client billing": connect status + button ("Connect Stripe" / "Finish Stripe setup"), defaults form, auto-pause setting, "Client revenue" card: "You bill ${clientMrr}/mo · Rival Monday costs you ${ourCost}/mo", paying clients, payments needing attention.
- Client list + client settings: billing pill and actions (turn on, resend link, change price, pause/resume).
- `/c/<id>/settings/billing` (client owner; agency branding): status, next charge, "Manage payment". Banners: payment needed — "Payment needed — please update your payment method."; paused — "Monitoring is paused. Please contact {agencyName}."
- Disconnect dialog copy: "Disconnect Stripe? Your clients' subscriptions keep running in your Stripe account, but Rival Monday will stop tracking payments."
- Console `/platform/billing`: Connect panel (connected agencies, client MRR, fee setting for owners).

## Emails
Client owner (agency branding): `client-payment-link` — subject "{agencyName} has set up billing for your competitor reports", button "Set up payment"; `client-payment-needed` — "Payment needed for your competitor reports". Agency admins (Rival Monday branding): `client-payment-failed` "{clientName}'s payment failed", `client-paid` "{clientName} is now paying", `client-auto-paused` "{clientName} was paused after {n} days without payment".

## Testing
Unit (fake gateway): every tool's role and eligibility rule; price change `next_bill` vs `new_only`; webhook mapping, dedupe, stale events, deauthorize; auto-pause timing and lift on payment; `clientServiceable` in every scheduler query and 9a seat counts; fee attached only when > 0; no "Rival Monday" string in client-facing templates/pages (snapshot grep test). E2E `@client-billing`: admin connects (fake) and enables billing; client owner sees Billing page, client viewer 404; failed payment banners; pause/resume. Owner verification: Stripe test-mode connected account end to end.

## Dependencies
9a merged (gateway, `billing-daily`, `/agency/settings/billing`, `syncSeats`, `agency_daily_stat` billing columns). Env (owner): `STRIPE_CONNECT_WEBHOOK_SECRET`; Connect enabled on the platform Stripe account.

## Out of scope
Annual client plans (backlog), multiple packages/tiers, bank-transfer/invoice collection, platform fees > 0 in practice, agency payouts reporting beyond the revenue card.
