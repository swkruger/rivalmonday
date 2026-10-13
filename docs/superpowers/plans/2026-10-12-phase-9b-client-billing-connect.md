# Phase 9b — Agency → client billing (Stripe Connect) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Lean plan format** (root `CLAUDE.md`).

**Goal:** Agencies optionally bill their clients through the app on their own Stripe Standard account (direct charges, 0 % platform fee), with client pause, agency-controlled non-payment handling and a revenue card.

**Architecture:** Extends 9a's `@cs/billing` (gateway gets Connect methods, daily job gets auto-pause + Connect reconciliation), new tables `agency_connect`, `client_billing`, `stripe_connect_event`, `platform_setting`, new `client.paused_at`; a shared `clientServiceable` filter; a second webhook route; agency, client-owner and platform tools; agency-branded client UI and emails.

**Tech Stack:** as 9a (TypeScript, Drizzle/Postgres RLS, `stripe` SDK pinned, pg-boss, Next.js, `@cs/email`, Vitest, Playwright).

**Spec:** `docs/superpowers/specs/2026-10-12-phase-9b-client-billing-connect-design.md` (f1–f13). Builds on 9a spec + plan. Read both specs before Task 1.

## Global constraints
- All 9a global constraints apply (service-role tables, no real Stripe in DEMO/TEST/CI, cents, `runTool`, 404 refusals, owner adds env vars).
- **No "Rival Monday" in anything client-facing** (client pages, client emails, Checkout/Portal configuration on the connected account). Use agency branding (`branding.displayName` / agency name).
- Every Connect API call passes `stripeAccount`; never create client objects on the platform account.
- `application_fee_percent` attached only when the effective percent > 0 (agency override ?? global setting).
- Amounts only for agency admins (and platform). Account managers see states; client owners see their own next charge; client viewers see nothing.
- Copy is binding as written in the spec (UI, banners, dialog, emails).

## Decisions (plan-local)
- **Q1** `clientServiceable(clientTable)` lives next to 9a's `agencyServiceable` in `@cs/db`; Task 1 replaces every `client.status = 'active'` scheduler predicate with it (9a Task 0 inventory list) and 9a's seat-count queries use it.
- **Q2** Connect state changes go through `applyClientBillingSignal(tx, clientId, signal, actor)` in `@cs/billing/connect-apply.ts` (row lock, write, outbox) — same pattern as 9a P1.
- **Q3** Effective fee = `agency_connect.application_fee_percent ?? platform_setting['connect_application_fee_percent']`, read at Checkout creation only.
- **Q4** Pill precedence helper `clientBillingPill(client, billing): 'paused'|'payment_needed'|'invited'|'paying'|'off'` in `@cs/billing/pill.ts`, used by every UI.

## File structure
- `packages/db/src/schema/billing-connect.ts` (new), `tenancy.ts` (`pausedAt`, `pausedBy`), filters module; migrations (generated + custom RLS).
- `packages/billing/src/{connect-gateway-types,connect-apply,connect-webhook,connect-daily,pill,client-pause}.ts`; extend `gateway.ts`, `stripe-gateway.ts`, `fake-gateway.ts`, `daily.ts`, `seats.ts`, `access.ts`.
- `packages/tools/src/tools/client-billing.ts`, `client-pause.ts`, `my-billing.ts`, extend `platform-billing.ts`.
- `packages/email/src/templates/client-billing-notice.tsx`, `agency-client-billing-notice.tsx`.
- `apps/web/src/app/api/stripe/connect-webhook/route.ts`; `app/(app)/agency/settings/billing/client-billing/*`; client list/settings pill + actions; `app/(app)/c/[clientId]/settings/billing/page.tsx`; client banners; `platform/billing` Connect panel.
- `packages/demo/src/client-billing.ts`; `apps/web/e2e/client-billing.spec.ts`.

## Dependencies on in-flight work
- **9a merged** (hard): `BillingGateway`, `gatewayFor`, `applyBillingSignal`, `syncSeats`, `billingAccess`, `billing-daily`, `/agency/settings/billing`, `agencyServiceable`, `agency_daily_stat` billing columns, `/platform/billing`.
- **Owner go-ahead after pilot feedback** (9a e1).
- Owner: Connect enabled on the platform Stripe account; `STRIPE_CONNECT_WEBHOOK_SECRET` in `.env`.

## Review focus
1. A Connect event for agency A's account must never update agency B's clients (look up by `stripe_account_id` + subscription id, both must match).
2. Price change with `applyTo: 'next_bill'` must not prorate or charge immediately; `new_only` must leave existing subscriptions untouched.
3. Paused client: every scheduler skips it, it drops out of 9a seats at renewal, history pages still render, and resume restores schedules without backfilling missed runs.
4. Client-facing leak: any client page/email/Checkout showing "Rival Monday", amounts to client viewers, or agency margin data.
5. Disconnect / deauthorize while subscriptions are `payment_needed`: states move to `disconnected`, auto-pause stops acting on them, no further emails to clients.

---

### Task 0: Pre-flight
- [ ] Confirm owner go-ahead (pilot feedback). `git rebase main` (9a merged). Re-check dependencies and file paths; record drift in `docs/work/phase-9.md`.
- [ ] Ask owner to enable Connect (Standard) and add `STRIPE_CONNECT_WEBHOOK_SECRET`; proceed with fake gateway meanwhile.
- **Done when:** `pnpm test:affected` green after rebase.

### Task 1: Schema, migrations, `clientServiceable`
**Goal:** spec § Data model + Q1 filter rewire.
**Files:** schema files, migrations, filters module, every scheduler file from 9a Task 0's inventory, 9a `seats.ts`/`access.ts`/seat report.
**Custom migration (full):**
```sql
ALTER TABLE agency_connect ENABLE ROW LEVEL SECURITY; ALTER TABLE agency_connect FORCE ROW LEVEL SECURITY;
ALTER TABLE client_billing ENABLE ROW LEVEL SECURITY; ALTER TABLE client_billing FORCE ROW LEVEL SECURITY;
ALTER TABLE stripe_connect_event ENABLE ROW LEVEL SECURITY; ALTER TABLE stripe_connect_event FORCE ROW LEVEL SECURITY;
ALTER TABLE platform_setting ENABLE ROW LEVEL SECURITY; ALTER TABLE platform_setting FORCE ROW LEVEL SECURITY;
REVOKE ALL ON agency_connect, client_billing, stripe_connect_event, platform_setting FROM app_user;
-- service-role grants: mirror 9a's billing RLS migration
-- client.paused_at / paused_by: service role only (no app_user column grant), like client.status
ALTER TABLE agency_daily_stat ADD COLUMN client_mrr_cents integer;
INSERT INTO platform_setting (key, value, updated_by) VALUES ('connect_application_fee_percent', '0'::jsonb, 'migration');
```
**Interfaces:** `clientServiceable(t: typeof client): SQL`; Drizzle tables `agencyConnect`, `clientBilling`, `stripeConnectEvent`, `platformSetting`.
**Tests:** `app_user` can't read new tables or write `paused_at`; one test per scheduler file: paused client excluded; 9a seat count excludes paused client.
**Done when:** `pnpm test:affected` green.

### Task 2: Client pause / resume
**Goal:** `pause_client`, `resume_client` + `clientBillingPill`.
**Files:** `packages/billing/src/{client-pause,pill}.ts` (+ tests), `packages/tools/src/tools/client-pause.ts` (+ test), `all.ts`.
**Interfaces:** `pauseClient(tx, clientId, actor: string, by: 'agency'|'auto')`, `resumeClient(tx, clientId, actor)`; tools input `{ clientId }`; pill per Q4.
**Behaviour:** roles agency_admin + account_manager in scope (client roles refused → 404); idempotent; after commit call 9a `syncSeats`. Resume clears `paused_at`/`paused_by`; schedulers pick it up at the next normal run (no backfill).
**Tests:** role matrix; idempotency; `syncSeats` called; pill precedence table.
**Done when:** `pnpm --filter @cs/billing exec vitest run pause pill` and `pnpm --filter @cs/tools exec vitest run client-pause` pass.

### Task 3: Gateway Connect methods
**Goal:** spec § Gateway on `stripeGateway` and `fakeGateway`.
**Files:** `packages/billing/src/{gateway,stripe-gateway,fake-gateway}.ts` (+ tests).
**Behaviour:** `createAccountLink` creates a `type: 'standard'` account on first call (no `accountId`), returns account link URL (`type: 'account_onboarding'`); every connected call sets `{ stripeAccount }`; `createConnectedCheckout` adds setup fee as a one-time line item and `subscription_data.application_fee_percent` only when > 0; `verifyConnectWebhook` uses `STRIPE_CONNECT_WEBHOOK_SECRET`.
**Tests:** mocked Stripe client payload shapes (stripeAccount header, fee omission at 0, setup fee line); fake mirrors and failure injection.
**Done when:** `pnpm --filter @cs/billing exec vitest run gateway` passes.

### Task 4: Connect onboarding + defaults tools
**Goal:** `get_connect_status`, `start_stripe_connect`, `disconnect_stripe`, `set_client_billing_defaults`.
**Files:** `packages/tools/src/tools/client-billing.ts` (+ test), `all.ts`.
**Behaviour:** agency_admin only. `start_stripe_connect` upserts `agency_connect` (`pending`), returns URL with `returnUrl = ${APP_URL}/agency/settings/billing?connect=done`, `refreshUrl = …?connect=retry`. `disconnect_stripe({ confirm: true })` → status `disconnected`, all `client_billing` → `disconnected` (via Q2), no Stripe-side cancellation. Defaults create/update product + price on the connected account (price change = new price, old price archived); `autoPauseAfterDays` 1–90 or null.
**Tests:** roles; confirm required; disconnect cascades states; defaults create price on connected account (fake records `stripeAccount`).
**Done when:** `pnpm --filter @cs/tools exec vitest run client-billing` passes.

### Task 5: Per-client billing tools + revenue
**Goal:** `enable_client_billing`, `disable_client_billing`, `resend_client_payment_link`, `set_client_price`, `get_client_revenue`, `list_client_billing_status`.
**Files:** `client-billing.ts` (+ test), `packages/billing/src/connect-apply.ts` (+ test).
**Behaviour:** eligibility (f8): 9a state `active|pilot` else `billing_not_eligible` "Client billing is available once your Rival Monday subscription is active."; `charges_enabled` else `connect_not_ready` "Finish your Stripe setup first."; enable → per-client price if override, Checkout (24 h expiry) to client owner email(s), state `invited`, outbox `client-payment-link`. No client owner → `no_client_owner` "Invite a client owner first.". `set_client_price` `next_bill` → `updateConnectedSubscriptionPrice(prorate:false)`; `new_only` → store only. `disable` → cancel at period end (gateway) after `{ confirm: true }`. Revenue: client MRR (active subscriptions' prices), paying count, `payment_needed` count, our cost = 9a base + extra seats (from 9a summary). AM list = states only.
**Tests:** eligibility refusals with exact copy; invited email queued; price change modes (Review focus 2); AM payload has no amounts; revenue math.
**Done when:** `pnpm --filter @cs/tools exec vitest run client-billing` and `pnpm --filter @cs/billing exec vitest run connect-apply` pass.

### Task 6: Connect webhook
**Goal:** `handleConnectEvent` + `POST /api/stripe/connect-webhook`.
**Files:** `packages/billing/src/connect-webhook.ts` (+ test), `apps/web/src/app/api/stripe/connect-webhook/route.ts` (+ test), env wiring (`turbo.json`, `server/env.ts`).
**Behaviour:** pipeline and mapping exactly as spec § Webhook; resolve agency by `event.account` → `agency_connect.stripe_account_id`, client by subscription/customer **and** agency (Review focus 1); `invoice.paid` lifts pause only when `paused_by = 'auto'`; first `invoice.paid` → agency `client-paid` notice; `invoice.payment_failed` → agency `client-payment-failed` + client `client-payment-needed`; deauthorize → disconnect cascade; stale-event guard as 9a.
**Tests:** each mapping; cross-agency mismatch ignored; dedupe; bad signature 400; manual pause not lifted by payment.
**Done when:** `pnpm --filter @cs/billing exec vitest run connect-webhook` + route test pass.

### Task 7: Daily job extension
**Goal:** auto-pause, Connect reconciliation, `client_mrr_cents`.
**Files:** `packages/billing/src/connect-daily.ts` (+ test), call from 9a `daily.ts`.
**Behaviour:** spec § Daily job; skip `disconnected` (Review focus 5); auto-pause notifies agency `client-auto-paused`; reconciliation: Stripe wins, log ids only.
**Tests:** auto-pause at exactly N days; none when setting null or disconnected; drift fix; stat column written.
**Done when:** `pnpm --filter @cs/billing exec vitest run connect-daily` passes.

### Task 8: Emails
**Goal:** spec § Emails templates.
**Files:** `packages/email/src/templates/client-billing-notice.tsx` (agency branding: `client-payment-link`, `client-payment-needed`), `agency-client-billing-notice.tsx` (Rival Monday branding: `client-payment-failed`, `client-paid`, `client-auto-paused`) (+ tests); delivery wiring as 9a Task 7.
**Copy:** subjects exactly as spec; client bodies — link: "{agencyName} now bills your competitor reports through a secure payment page. It takes about a minute." button "Set up payment"; needed: "We couldn't process your latest payment. Please update your payment method to keep your reports running." button "Update payment". Agency bodies one line each with button "Open client billing".
**Tests:** client templates contain no "Rival Monday" and use agency branding; agency templates render client name.
**Done when:** `pnpm --filter @cs/email exec vitest run billing-notice` passes.

### Task 9: Agency UI
**Goal:** "Client billing" section on `/agency/settings/billing`; client list + client settings pill and actions.
**Files:** `app/(app)/agency/settings/billing/client-billing/{section.tsx,defaults-form.tsx,revenue-card.tsx,disconnect-dialog.tsx,actions.ts}` (+ tests); client list component and client settings page (pill + actions menu).
**Behaviour:** buttons "Connect Stripe" / "Finish Stripe setup" per status; `?connect=done|retry` messages "Stripe connected." / "Stripe setup isn't finished yet."; revenue card copy per spec; disconnect dialog copy per spec; pill via Q4; actions per role (AM: pause/resume only).
**Tests:** section states; dialog requires confirm; AM sees no amounts or billing actions except pause.
**Done when:** `pnpm --filter @cs/web exec vitest run client-billing` passes; typecheck clean.

### Task 10: Client workspace billing
**Goal:** `get_my_billing`, `open_billing_portal`, `/c/<id>/settings/billing`, client banners.
**Files:** `packages/tools/src/tools/my-billing.ts` (+ test); `app/(app)/c/[clientId]/settings/billing/page.tsx`; client banner component; nav entry (client owner only, only when `client_billing.enabled`).
**Behaviour:** client_owner only (viewer → 404); shows agency name, state, next charge date + amount, "Manage payment" → portal on connected account (`returnUrl` back to the page). Banners copy per spec; paused banner shows for all client roles.
**Tests:** viewer 404; no "Rival Monday" in page output; banner per state.
**Done when:** `pnpm --filter @cs/tools exec vitest run my-billing` and `pnpm --filter @cs/web exec vitest run billing` pass.

### Task 11: Platform Connect controls
**Goal:** `set_connect_fee_percent`, `get_connect_overview`, Connect panel on `/platform/billing`.
**Files:** extend `packages/tools/src/tools/platform-billing.ts` (+ test); `platform/billing/connect-panel.tsx`.
**Behaviour:** owner sets 0–20 (global or per agency), audited; viewer overview: connected agencies (status, charges enabled), client MRR via Connect, paying clients.
**Tests:** role minimums; range validation; effective-fee resolution (Q3).
**Done when:** `pnpm --filter @cs/tools exec vitest run platform-billing` passes.

### Task 12: Demo, coverage, E2E, brand-leak guard
**Goal:** demo data + E2E `@client-billing` + a test that greps client-facing output for "Rival Monday".
**Files:** `packages/demo/src/client-billing.ts` (+ test), `reset.ts`, `coverage.ts`; `apps/web/e2e/client-billing.spec.ts`; brand-leak test in `apps/web` (renders client billing page + client templates).
**Behaviour:** demo: active agency connected with 3 paying clients, 1 payment needed, 1 paused. E2E (fake gateway): admin connects and enables billing; client owner sees Billing page, client viewer 404; payment-failed banners for client + agency; pause/resume changes pill.
**Done when:** `pnpm --filter @cs/demo exec vitest run client-billing coverage` and `pnpm --filter @cs/web e2e:affected` pass.

## Owner verification (Stripe test mode, connected test account, `stripe listen --forward-connect-to localhost:3000/api/stripe/connect-webhook`)
Connect a test Standard account; set $199 default; enable billing for a client → email link → pay with 4242… → Paying; switch card to a failing one → Payment needed + both emails; auto-pause after N days (set N=1, run `billing-daily`); refund in the agency's Stripe dashboard → reflected; disconnect → Billing disconnected.
