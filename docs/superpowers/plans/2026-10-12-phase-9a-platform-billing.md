# Phase 9a — Platform billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Lean plan format** (root `CLAUDE.md`): interfaces are binding; full code only for SQL/RLS, security-sensitive logic, non-obvious algorithms and decided copy.

**Goal:** Agencies are billed by Rival Monday through Stripe (pilot / 30-day trial / monthly base + seats), with a non-payment ladder, discount codes, invite links and platform-console controls.

**Architecture:** New `@cs/billing` package (gateway interface with Stripe + fake implementations, pure state machine, seat sync, webhook + daily handlers); service-role billing tables; `@cs/tools` tools for agency admins and platform operators; one webhook route; enforcement via a shared "serviceable agency" filter and tool-level checks; Postmark lifecycle emails through the existing notification outbox.

**Tech Stack:** TypeScript, Drizzle/Postgres (RLS), `stripe` Node SDK (exact pinned version), pg-boss, Next.js App Router, `@cs/email` (React email + Postmark), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-12-phase-9a-platform-billing-design.md` (e1–e16). Read it in full before Task 1; its SQL, state rules and copy are binding.

## Global constraints
- Read `docs/gotchas-cross-cutting.md` and each touched package's `CLAUDE.md` first.
- New tables: RLS enabled + forced, no policies, no `app_user` grants (service role only). Migrations: next free number at execution time; never edit applied ones.
- **No real Stripe call in DEMO, TEST or CI** — `fakeGateway()` is selected whenever `STRIPE_SECRET_KEY` is unset or the env is DEMO/TEST.
- Card data never touches our app (Checkout + Portal only). Never log Stripe secrets or full webhook payloads.
- Money is integer cents everywhere in our code; `numeric` only where the spec says so.
- Every write goes through `runTool` and is audit-logged; tools decide permissions; refusals → 404 on pages.
- Billing UI and amounts are agency-admin only; account managers see only the neutral banner; client users and guests never see billing words.
- New env vars (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_TAX_ENABLED`) are added by the **owner**; add them to `turbo.json` `globalPassThroughEnv` and `apps/web/src/server/env.ts` + worker env.
- Copy is binding as written in the spec § Enforcement and below.
- Commits end with the Co-Authored-By line from root `CLAUDE.md`; LF only.

## Decisions (plan-local)
- **P1** Transitions are applied by one function `applyBillingSignal(tx, gw, agencyId, signal, actor)` in `@cs/billing/apply.ts`: locks the row (`FOR UPDATE`), calls `nextBillingState`, writes the row + `agency_billing_event` + outbox notification in the same transaction. Webhook, daily job and admin tools all use it.
- **P2** Shared filter `serviceableAgencyIds` lives in `@cs/db` as a SQL fragment `agencyServiceable(agencyIdColumn)` = `NOT EXISTS (select 1 from agency_billing b where b.agency_id = <col> and b.state in ('read_only','suspended'))`. Agencies without a billing row are serviceable (safety for tests/seeds).
- **P3** Plan-to-Stripe sync on `create_plan_version` and CLI `pnpm --filter @cs/worker billing:sync-plan` (creates product once, two prices per version, `tax_behavior: 'exclusive'`).
- **P4** Lifecycle emails go to active `agency_admin` memberships. **Pre-flight drift:** the `notification` outbox (`packages/db/src/schema/delivery.ts`) is client-scoped (`client_id` NOT NULL + composite client FK, `subject_type/subject_id` NOT NULL, recipient = `contact`/webhook; `kind` is plain text but `recipientsFor` validates against `AGENCY_KINDS`), so agency-level billing mail does not fit it. Controller decision needed: (a) send directly through the transport like `apps/web/src/server/support-email.ts` / worker `platform_cost_low` (idempotency via `agency_billing_event` / a reminder row, not `notification.dedupe_key`), or (b) a migration making `notification.client_id` nullable. Default: (a).
- **P5** Seat-cap check lives in a `@cs/billing` function `assertCanActivateClient(db, agencyId)` throwing `ToolError('billing_seat_limit', …)`; tools call it inside their transaction before setting `status='active'`; `syncSeats` runs after commit (fire-and-forget with `seat_sync_pending` on failure).

## File structure
- `packages/billing/` (new package: `package.json`, `CLAUDE.md`, `src/{index,gateway,stripe-gateway,fake-gateway,state,apply,access,seats,trial,webhook,daily,tokens,plan-sync}.ts` + tests).
- `packages/db/src/schema/billing.ts` (new) + `schema/index.ts` export; migrations `0052_billing.sql` (generated), `0053_billing_rls.sql` (custom; 0052 is the next free number at pre-flight 2026-10-14); `packages/db/src/filters.ts` (new file, re-export from `packages/db/src/index.ts`) `agencyServiceable`; edit `schema/platform.ts` (`agencyDailyStat`) for the 3 new columns.
- `packages/tools/src/tools/billing.ts` (agency tools), `platform-billing.ts` (platform tools) + `all.ts`; modified `onboarding.ts` (`create_client`), `prospects.ts` (`convert_prospect`), write refusal for paused agencies in `ToolRegistry.invoke` (`packages/core/src/tools.ts`; `apps/web/src/server/run-tool.ts` only wraps it); new error codes in `ToolErrorCode` (`packages/core/src/tools.ts`) + `packages/mcp/src/errors.ts` `mapError` + `apps/web/src/server/forms.ts` `FORM_COPY`; new tool names added to the lists in `packages/tools/src/tools/channels.test.ts`.
- Scheduler filter sites (full inventory in `docs/work/phase-9.md`): `packages/collectors/src/{schedule/due-pages.ts,sources/due.ts,local/self.ts,rankings/scan.ts}`, `packages/engine/src/{sweep.ts,moves/moves-stage.ts,briefs/generate.ts,score/score-stage.ts,reports/quarterly.ts}`, delivery side `packages/engine/src/{briefs/deliver.ts,alerts/create.ts,alerts/digest.ts,delivery/outbox.ts}`; Ask/MCP entry points `packages/mcp/src/{server.ts,auth.ts}`, `packages/ask/src/{turn.ts,quota.ts,starters.ts}`.
- `packages/email/src/templates/billing-notice.tsx` (+ test).
- `apps/web/src/app/api/stripe/webhook/route.ts` (add `/^\/api\/stripe\//` to `PUBLIC` in `apps/web/src/proxy.ts`); `app/(app)/agency/settings/billing/{page.tsx,seats.csv/route.ts,actions.ts}`; `components/shell/billing-banner.tsx`; `app/(app)/paused/page.tsx`; `app/(platform)/platform/billing/page.tsx` (+ components); billing panel in `app/(platform)/platform/agencies/[id]/page.tsx`.
- `apps/worker/src/jobs/billing-daily.ts`; `apps/worker/src/cli/billing-sync-plan.ts`.
- `packages/demo/src/billing.ts`; `apps/web/e2e/billing.spec.ts`.

## Dependencies on in-flight work
- **phase-8 merged** (hard): `platform_admin`, `requirePlatformOperator(deps, ctx, min)`, `/platform/*` pages, `agency_daily_stat`, `list_platform_agencies`.
- **phase-6 merged** (hard): Ask/MCP entry points to refuse with `service_paused`; registry `CallOptions` (`packages/core/src/tools.ts`); migrations 0038–0046 (phase-8 holds 0047–0051; next free 0052).
- Owner: Stripe account in test mode; `STRIPE_*` vars in `.env` (Task 0 asks).

## Review focus
1. Webhook delivered twice or out of order (e.g. `invoice.paid` before `checkout.session.completed`) must converge to the correct state — never regress `active` → `past_due` on a stale event (compare Stripe object `created`/subscription status, not arrival order).
2. Two concurrent client activations at seat 3 must not both succeed in `trialing` (row lock / count inside the transaction).
3. A Stripe outage during client activation must not block the agency's work (`seat_sync_pending`, retried nightly).
4. Suspended / read-only agency: no scheduled job for its clients runs, and no client-facing page or email mentions billing.
5. A platform `staff` user must not reach owner-only tools (plan editor, discount codes, seat-cap exemption); a guest or account manager must never see billing amounts.

---

### Task 0: Pre-flight
- [ ] `git rebase main` (phase-6 and phase-8 merged). Re-check "Dependencies on in-flight work" against the code; update file paths in this plan; record drift in `docs/work/phase-9.md`.
- [ ] Ask the owner to create the Stripe test-mode account and add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_TAX_ENABLED` to `.env` (never print them). Work proceeds without them (fake gateway).
- [ ] Inventory every place that schedules work for clients (grep `status, 'active'` / `eq(client.status` in collectors, engine, worker) and list them in Task 8's notes.
- **Done when:** `pnpm test:affected` green after rebase.

### Task 1: Schema, migrations, backfill
**Goal:** spec § Data model tables + `agency_daily_stat` columns + backfill + `standard` v1 seed.
**Files:** `packages/db/src/schema/billing.ts`, `schema/index.ts`, `schema/platform.ts` (3 stat columns), generated + custom migrations (0052/0053), new `packages/db/src/filters.ts` (`agencyServiceable`, exported from `src/index.ts`).
**Interfaces:** Drizzle `plan`, `agencyBilling`, `agencyBillingEvent`, `stripeEvent`, `discountCode`, `agencyInviteLink`; types `PlanRow`, `AgencyBillingRow`, `BillingState`. `agencyServiceable(col: AnyColumn): SQL` (P2).
**Custom migration (full):**
```sql
ALTER TABLE plan ENABLE ROW LEVEL SECURITY; ALTER TABLE plan FORCE ROW LEVEL SECURITY;
ALTER TABLE agency_billing ENABLE ROW LEVEL SECURITY; ALTER TABLE agency_billing FORCE ROW LEVEL SECURITY;
ALTER TABLE agency_billing_event ENABLE ROW LEVEL SECURITY; ALTER TABLE agency_billing_event FORCE ROW LEVEL SECURITY;
ALTER TABLE stripe_event ENABLE ROW LEVEL SECURITY; ALTER TABLE stripe_event FORCE ROW LEVEL SECURITY;
ALTER TABLE discount_code ENABLE ROW LEVEL SECURITY; ALTER TABLE discount_code FORCE ROW LEVEL SECURITY;
ALTER TABLE agency_invite_link ENABLE ROW LEVEL SECURITY; ALTER TABLE agency_invite_link FORCE ROW LEVEL SECURITY;
REVOKE ALL ON plan, agency_billing, agency_billing_event, stripe_event, discount_code, agency_invite_link FROM app_user;
-- service role is `app_service`: 0001_rls.sql default privileges already grant it SELECT/INSERT/UPDATE/DELETE on new public tables, so no GRANT line is needed (same as 0034/0048); add the tables to the privilege-guard / service-only lists in packages/db tests
ALTER TABLE agency_daily_stat ADD COLUMN mrr_cents integer, ADD COLUMN paid_seats integer, ADD COLUMN billing_state text;
INSERT INTO plan (code, version, name, base_price_cents, included_seats, seat_price_cents, trial_days, is_current, created_by)
VALUES ('standard', 1, 'Standard', 22900, 3, 9900, 30, true, 'migration');
INSERT INTO agency_billing (agency_id, state, plan_id)
SELECT a.id, 'pilot', (SELECT id FROM plan WHERE code='standard' AND version=1) FROM agency a
ON CONFLICT (agency_id) DO NOTHING;
```
**Behaviour:** new agencies created by existing scripts/seeds get no row until Phase 10 calls `startAgencyTrial` (P2 treats missing as serviceable; `billingAccess` treats missing as `pilot` without cap exemption).
**Tests:** `app_user` cannot read any new table; one current plan per code; `discount_code` percent XOR amount check; backfill gives every agency a `pilot` row.
**Done when:** `pnpm --filter @cs/db exec vitest run billing` passes.

### Task 2: `@cs/billing` package, gateways, tokens
**Goal:** package scaffold, `BillingGateway`, `stripeGateway`, `fakeGateway`, invite-token helpers.
**Files:** `packages/billing/*` (mirror `packages/email` package layout), `pnpm-workspace`/turbo picks it up; `packages/billing/CLAUDE.md` (gotchas: fake in DEMO/TEST, cents, no secrets in logs).
**Interfaces:** `BillingGateway` methods exactly as spec § `@cs/billing` with typed inputs/outputs, e.g. `createCheckoutSession(i: { customerId: string; basePriceId: string; seatPriceId: string; seatQty: number; trialEnd?: Date; couponId?: string; allowPromotionCodes: boolean; successUrl: string; cancelUrl: string }): Promise<{ url: string }>`; `verifyWebhook(rawBody: string, signature: string): StripeEventLike` (throws `InvalidSignature`). `gatewayFor(env): BillingGateway` (P: fake unless key set and env not DEMO/TEST). `generateInviteToken(): { token: string; hash: string; prefix: string }` (`rm_inv_` + 32 random bytes base64url; SHA-256 hex; prefix = first 12 chars), `hashInviteToken(token)`. Mirror `packages/core/src/tokens.ts` (`generatePat`/`hashPat`).
**Behaviour:** Stripe SDK pinned exact; `stripe-gateway.ts` sets `automatic_tax: { enabled: STRIPE_TAX_ENABLED === 'true' }` on Checkout; promotion codes restricted via `customer` when one agency, else store `restricted_agency_ids` and validate in `redeem_discount_code` before applying. Fake gateway records calls and can be told to fail the next call.
**Tests:** `gatewayFor` selection matrix; token format, hash stability, prefix; fake records calls and failure injection; stripe-gateway unit-tested against a mocked `Stripe` client (payload shapes: seat line quantity, trial_end, automatic_tax).
**Done when:** `pnpm --filter @cs/billing exec vitest run` passes.

### Task 3: State machine
**Goal:** `nextBillingState` exactly per spec § State machine.
**Files:** `packages/billing/src/state.ts` (+ test).
**Interfaces:** `BillingSignal`, `nextBillingState(row, signal)` as spec. Constants `PAST_DUE_TO_READ_ONLY_DAYS = 7`, `READ_ONLY_TO_SUSPENDED_DAYS = 30`, `SUSPENDED_TO_REVIEW_DAYS = 90` (cumulative 7 / 37 / 127 from `past_due_since`).
**Tests:** table-driven: every state × every signal (expected state or `null`); boundaries at 6d23h / 7d, 36d23h / 37d, 127d; pilot end → trialing with `trial_ends_at = now + trial_days`; `subscription_active` clears `past_due_since`, `cancel_at`, `review_flagged_at`; `admin_grant_pilot` refused from `active`; `extend_trial` only from trialing/past_due.
**Done when:** `pnpm --filter @cs/billing exec vitest run state` passes.

### Task 4: Apply, access, trial start, seat sync
**Goal:** P1 `applyBillingSignal`, `billingAccess`, `assertCanActivateClient`, `startAgencyTrial`, `syncSeats`.
**Files:** `packages/billing/src/{apply,access,trial,seats}.ts` (+ tests).
**Interfaces:** `applyBillingSignal(tx, agencyId, signal, actor: string, stripeEventId?: string): Promise<{ changed: boolean; state: BillingState }>`; `billingAccess(db, agencyId)` (spec + `seatCapExempt`); `assertCanActivateClient(tx, agencyId): Promise<void>` (counts active clients inside tx after `SELECT … FOR UPDATE` on `agency_billing`); `startAgencyTrial(db, gw, agencyId, opts)`; `syncSeats(db, gw, agencyId): Promise<'synced'|'skipped'|'pending'>`.
**Behaviour:** cap applies when state `trialing`, or `pilot` and not `seat_cap_exempt`; states `past_due|read_only|suspended|cancelled-after-cancel_at` refuse activation; `active` always allows. Error message: "You've used your {includedSeats} included clients. Upgrade to add more." Seat qty = max(0, active − included); increase → `prorate: true`; decrease → `prorate: false`; no subscription → `'skipped'`; gateway throw → `seat_sync_pending = true`, return `'pending'`. Outbox notification per transition (P4) with kind `billing_<to_state>` and template params.
**Tests:** concurrent activation at seat 3 (two transactions, one fails — Review focus 2); exempt pilot allowed at 4; trialing blocked at 4; past_due blocked; sync up prorates, down doesn't; gateway failure → pending; `applyBillingSignal` writes exactly one event row and one outbox row per change, none on `null`.
**Done when:** `pnpm --filter @cs/billing exec vitest run apply access seats trial` passes.

### Task 5: Webhook handler + route
**Goal:** `handleStripeEvent` and `POST /api/stripe/webhook`.
**Files:** `packages/billing/src/webhook.ts` (+ test); `apps/web/src/app/api/stripe/webhook/route.ts`; env wiring (`server/env.ts`, `turbo.json`).
**Interfaces:** `handleStripeEvent(db, gw, event: StripeEventLike): Promise<'processed'|'duplicate'|'ignored'>`.
**Behaviour:** route: `runtime = 'nodejs'`, raw text body, `verifyWebhook` (400 on bad signature), insert `stripe_event` (conflict ⇒ 200 `duplicate`), dispatch, set `processed_at`; handler error → store `error`, 500. Mapping: `checkout.session.completed` → store `stripe_subscription_id`, `plan_id` by price id, then `subscription_active`; `customer.subscription.updated` → status `active`/`trialing` with default payment method ⇒ `subscription_active`, `past_due`/`unpaid` ⇒ `payment_failed`, `cancel_at_period_end` ⇒ `subscription_cancelled_at_period_end`; `customer.subscription.deleted` ⇒ `subscription_ended`; `invoice.paid` ⇒ `subscription_active`; `invoice.payment_failed` ⇒ `payment_failed`. **Ordering guard:** for subscription events, ignore if `event.data.object` is older than the last applied event for this agency (`agency_billing_event` max Stripe-object timestamp) — Review focus 1. Unknown customer → `ignored`, logged without payload.
**Tests:** each mapping; duplicate; bad signature 400 (route test); stale `payment_failed` after newer `invoice.paid` ignored; unknown customer.
**Done when:** `pnpm --filter @cs/billing exec vitest run webhook` and route test pass.

### Task 6: Daily job + plan sync CLI
**Goal:** `runBillingDaily` + job `billing-daily` (cron `30 2 * * *`, after `platform-daily-stats`) + `billing:sync-plan` CLI.
**Files:** `packages/billing/src/{daily,plan-sync}.ts` (+ tests); `apps/worker/src/jobs/billing-daily.ts` (+ test; follow `jobs/platform-stats.ts`: `createBillingJobs(deps)` returning `defineJob({ cron })`, added to the `registerJobs([...])` list in `apps/worker/src/main.ts`); `apps/worker/src/cli/billing-sync-plan.ts`; worker `package.json` script `billing:sync-plan`; `@cs/billing` dependency in worker/tools/web `package.json`; worker env comes from `createWorkerDeps(process.env)` in `apps/worker/src/deps.ts`. `platform-daily-stats` is cron `0 2 * * *` (confirmed); its upsert only sets its own columns so the billing columns survive, but upsert the `agency_daily_stat` row if yesterday's is missing.
**Interfaces:** `runBillingDaily(db, gw, now): Promise<{ transitions: number; reminders: number; seatRetries: number; drift: number }>`; `syncPlanToStripe(db, gw, planId): Promise<PlanRow>`.
**Behaviour:** per agency: `timer` signal; reminder notifications at exactly 7 and 1 days before `trial_ends_at` and 7 days before `pilot_ends_at` (idempotent via a `billing_reminder_<n>` notification dedupe key); retry `syncSeats` where pending; reconciliation: fetch subscription, if Stripe status/quantity differs → apply matching signal / fix `billable_seats_synced`, count drift, log agency id only; write `mrr_cents` (base + seats × price − discount, from Stripe upcoming invoice when available), `paid_seats`, `billing_state` into yesterday's `agency_daily_stat` row. Not scheduled in DEMO/TEST.
**Tests:** timers via fake clock; reminders once only; drift corrected; pending sync retried; stat columns written; `syncPlanToStripe` creates product once and two prices per version.
**Done when:** `pnpm --filter @cs/billing exec vitest run daily plan-sync` and `pnpm --filter @cs/worker exec vitest run billing-daily` pass.

### Task 7: Lifecycle email template
**Goal:** one `billing-notice` template rendering all spec § Emails variants in Rival Monday branding.
**Files:** `packages/email/src/templates/billing-notice.tsx` (+ test); add a `billing_notice` variant to `EmailPayload` in `packages/email/src/types.ts` and the `switch` in `packages/email/src/render.ts` (follow `support-session-started.tsx`); sending per P4 (no outbox).
**Interfaces:** `BillingNoticeKind = 'trial_started'|'trial_ending_7'|'trial_ending_1'|'trial_ended'|'payment_failed'|'service_paused'|'account_suspended'|'account_reactivated'|'pilot_ending_7'`; props `{ kind; agencyName; date?: string; billingUrl: string }`.
**Copy (decided):** subject / one-line body —
- trial_started: "Your Rival Monday trial has started" / "Your 30-day trial runs until {date}. Up to 3 clients are included."
- trial_ending_7 / _1: "Your trial ends in 7 days" / "…in 1 day" / "Add a payment method to keep your clients monitored without interruption."
- trial_ended: "Your trial has ended" / "Add a payment method to keep going. Service pauses on {date}."
- payment_failed: "Payment failed" / "We couldn't charge your card. Service pauses on {date} unless payment succeeds."
- service_paused: "Service is paused" / "Monitoring, briefs and alerts are paused. Update your payment method to resume."
- account_suspended: "Your account is suspended" / "Your data is kept. Update your payment method to restore access."
- account_reactivated: "You're all set" / "Payment received — everything is running again."
- pilot_ending_7: "Your pilot ends in 7 days" / "After {date} your agency moves to a 30-day trial."
Every email: button "Open billing" → `billingUrl`.
**Tests:** each kind renders subject + button; no client names; Rival Monday branding (not agency).
**Done when:** `pnpm --filter @cs/email exec vitest run billing-notice` passes.

### Task 8: Enforcement
**Goal:** cap in client activation; `service_paused` for paused agencies; scheduler filter; Ask/MCP refusal.
**Files:** `packages/tools/src/tools/onboarding.ts`, `prospects.ts`, write-path refusal in `ToolRegistry.invoke` (`packages/core/src/tools.ts`; the registry is generic over deps, so add an optional `guard(ctx, tool, opts)` hook that `createToolRegistry` in `packages/tools/src/registry.ts` supplies), the scheduler files from Task 0's inventory (`docs/work/phase-9.md`), Ask/MCP entry (`packages/mcp/src/server.ts` CallTool handler / `auth.ts`; `packages/ask/src/quota.ts` `beginTurn`). `create_client` currently inserts without a transaction: wrap it in `deps.service.transaction`. There is no client reactivation/status-change tool besides `convert_prospect`.
**Behaviour:** `create_client` (when `status='active'`) and `convert_prospect` call `assertCanActivateClient` in-tx, then `syncSeats` after commit. Write tools for an agency in `read_only|suspended` → `ToolError('service_paused')`, allow-list: billing tools, team tools (`invite_member`, `revoke_membership`, `revoke_invitation`), sign-out. Every scheduler query that selects clients adds `agencyServiceable(client.agencyId)`. Ask + MCP `tools/call` → `service_paused` for those agencies.
**Tests:** each changed tool: blocked at cap with exact message, allowed when exempt/active; paused agency write refused, team write allowed; each scheduler query excludes a read_only agency's clients (one test per file); Ask/MCP refusal.
**Done when:** `pnpm test:affected` green.

### Task 9: Agency billing tools, page, banners, paused page
**Goal:** spec § Tools (agency) + `/agency/settings/billing` + CSV + banners + suspended routing.
**Files:** `packages/tools/src/tools/billing.ts` (+ test), `all.ts`; `apps/web/src/app/(app)/agency/settings/billing/{page.tsx,actions.ts,seats.csv/route.ts}`; `components/shell/billing-banner.tsx` (+ test); `app/(app)/paused/page.tsx`; suspended redirect in `app/(app)/layout.tsx` (there is no middleware; `proxy.ts` only checks cookies); nav entry (admin only) in `components/shell/nav-items.ts` (`account(...)`; add a `billing` icon to the union) and `apps/web/src/server/nav.ts`.
**Interfaces:** tools `get_billing_summary`, `create_checkout_session`, `create_portal_session`, `redeem_discount_code({ code: string })`, `get_seat_report` (outputs as spec). Checkout/portal `successUrl`/`returnUrl` = `${APP_URL}/agency/settings/billing?done=1`.
**Behaviour:** role `agency_admin` only (others `permission_denied` → 404). Redeem: unknown/expired/revoked/not-restricted-to-this-agency → `invalid_code` "That code isn't valid for your account."; applies via gateway. CSV columns `client,activated_on` (ISO date). Suspended: agency users → redirect to billing page; client users/guests → `/paused` with copy "This workspace is temporarily unavailable. Please contact {agencyName}." Banners exactly as spec copy.
**Tests:** tool role checks; redeem rules; CSV content; banner variants per state/role; account manager sees neutral banner only; client user never sees banner.
**Done when:** `pnpm --filter @cs/tools exec vitest run billing` and `pnpm --filter @cs/web exec vitest run billing` pass; typecheck clean.

### Task 10: Platform billing tools
**Goal:** spec § Tools (platform) incl. `set_seat_cap_exempt`.
**Files:** `packages/tools/src/tools/platform-billing.ts` (+ test), `all.ts`.
**Interfaces:** names and role minimums exactly as spec (`set_seat_cap_exempt` owner). `create_discount_code` input `{ code, percentOff?, amountOffCents?, appliesTo, duration, durationMonths?, restrictedAgencyIds?, expiresAt?, maxRedemptions? }`; `create_invite_link` input `{ offer, pilotEndsAt?, discountCodeId?, emailLock?, maxUses?, expiresInDays? (default 14, 1–90), note? }` → `{ url: \`${APP_URL}/join/${token}\`, token }` (route built in Phase 10). `create_plan_version` input `{ name, basePriceCents, includedSeats, seatPriceCents, trialDays }` → new version `is_current`, previous unset, `syncPlanToStripe`; Stripe failure → nothing written.
**Behaviour:** admin actions call `applyBillingSignal` with actor = user id; all audited (per-agency into target agency's `audit_log` via `withPlatformAudit(deps, ctx, { tool, input, role, agencyId }, fn)` from `packages/tools/src/platform/audit.ts`, after `requirePlatformOperator(deps, ctx, min)` from `packages/tools/src/platform.ts`). `get_billing_overview` → `{ mrrCents, paidSeats, agenciesByState }`.
**Tests:** every tool's role minimum (viewer/staff/owner, incl. staff refused on owner tools — Review focus 5); invite link stores hash only, URL token not retrievable later; discount restricted ids validated to exist; plan version switch atomic.
**Done when:** `pnpm --filter @cs/tools exec vitest run platform-billing` passes.

### Task 11: Console pages
**Goal:** `/platform/billing` and the billing panel on `/platform/agencies/[id]`; billing-state column in the agency list.
**Files:** `apps/web/src/app/(platform)/platform/billing/{page.tsx,plan-editor.tsx,codes.tsx,invite-links.tsx,actions.ts}` (+ component tests); modify `app/(platform)/platform/agencies/[id]/page.tsx`, `app/(platform)/platform/agencies/agency-table.tsx`, platform nav in `components/shell/nav-items.ts` (`flags.isPlatformOperator` block; "Billing"); `StatCard` is `apps/web/src/components/stat-card.tsx`; register `/platform/billing` in `packages/demo/src/coverage.ts`.
**Behaviour:** MRR tile (`StatCard`); plan editor form (owner only; others see read-only table); codes list + create form + revoke; invite links list + create form (URL shown once in a copy box with "Copy link — it won't be shown again.") + revoke; agency panel: state pill, plan v, seats, invoices (links), actions per role. Hide owner-only controls for staff/viewer (tools still enforce).
**Tests:** forms render per role; invite-link one-time display; state pill labels.
**Done when:** `pnpm --filter @cs/web exec vitest run platform` passes; typecheck clean.

### Task 12: Demo, coverage, E2E
**Goal:** demo agencies in varied states; E2E `@billing`.
**Files:** `packages/demo/src/billing.ts` (+ test), `reset.ts`, `coverage.ts`; `apps/web/e2e/billing.spec.ts` (tag convention `{ tag: ['@billing', ...] }`; add `@billing` rules in `apps/web/scripts/e2e-affected-rules.ts`), `e2e/seed.ts`.
**Behaviour:** demo: one agency `active` with 4 clients and a discount, one `trialing` with 9 days left, one `past_due`; fake gateway invoices. Register new pages in coverage. E2E (fake gateway): trial agency blocked at 4th active client with Upgrade prompt; billing page for admin, 404 for account manager; suspended agency → admin redirected to billing, client user sees `/paused` copy; console: owner creates a code and an invite link (URL shown once).
**Tests:** demo seed deterministic; coverage test.
**Done when:** `pnpm --filter @cs/demo exec vitest run billing coverage` and `pnpm --filter @cs/web e2e:affected` pass.

## Owner verification (after merge, Stripe test mode + `stripe listen --forward-to localhost:3000/api/stripe/webhook`)
Checkout with card 4242… → `active`; add 4th client → prorated invoice line; card 4000 0000 0000 0341 → `past_due` + email; Portal cancel → `cancelled`; redeem an agency-restricted code from another agency → refused.
