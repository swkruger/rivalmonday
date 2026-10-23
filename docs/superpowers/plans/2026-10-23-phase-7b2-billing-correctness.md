# Phase 7b2 — Billing correctness (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task by task. **Lean plan format** (root `CLAUDE.md`): Interfaces are binding; implementers write code + tests from Behaviour + Tests. Full code appears only for security-sensitive logic (in-tx re-checks, the fake-gateway refusal, the redemption reservation) and decided copy.

**Goal:** Close the five Phase 9 billing correctness gaps before real money flows: `disable_client_billing` race (R27), daily reconcile not lifting an auto-pause (M3), a second live client subscription only logged (M8), `BILLING_FAKE_GATEWAY` honoured on Vercel previews and by the worker, and `max_redemptions` ignored by `couponFor` / `redeem_discount_code`.

**Architecture:** All changes sit on existing seams: the pure transition table (`packages/billing/src/client-billing-state.ts`), its persister (`connect-apply.ts`), the Connect webhook and daily job (`connect-webhook.ts`, `connect-daily.ts`), the gateway selector (`gateway.ts`), and two tools (`packages/tools/src/tools/client-billing.ts`, `tools/billing.ts`) plus `access/signup-complete.ts`. No new tables, no migration, no UI (M4 and billing auto-refresh moved to 15c-2, spec §3 d17).

**Spec:** `docs/superpowers/specs/2026-10-22-phase-7b-money-design.md` §3 d17, §6 "7b2", §7 (redemption counting), §8 (binding). Backlog wording: `docs/BACKLOG.md` Phase 9 › Soon (lines "R27", "M3", "M8", "`BILLING_FAKE_GATEWAY`"), Phase 9 ledger "`redeem_discount_code` … `max_redemptions`", phase-10 "`couponFor` ignores `max_redemptions`". Context: `packages/billing/CLAUDE.md` (R11, R14, R16, R21, R22, R23, R27).

**Branch / worktree:** `phase-7b2` in `../CompetitorSpy-wt/phase-7b2`; work file `docs/work/phase-7b2.md`. Starts only after **15c-3** has merged (spec d17).

## Global constraints
- Root `CLAUDE.md` Essentials, `docs/gotchas-cross-cutting.md`, `packages/billing/CLAUDE.md`, `packages/tools/CLAUDE.md`, `apps/worker/CLAUDE.md`, `apps/web/CLAUDE.md`, `packages/email/CLAUDE.md`. Never print/stage `.env`; no new env vars.
- **No Stripe call inside a DB transaction** (billing CLAUDE.md); Stripe work after commit is best effort or compensated.
- Every client lookup in webhook code stays `AND client_billing.agency_id = <event agency>` (Connect isolation).
- Decided refusal copy uses `refuse(code, msg)` (`ToolError` with `userFacing: true`, R19). `redeem_discount_code` keeps one message for every refusal (`INVALID_CODE_MESSAGE`, no oracle).
- Logs carry ids and error names only: never Stripe messages, Checkout URLs, coupon ids in user-visible errors, or webhook payloads.
- Web writes stay on `runTool`; no web page changes in 7b2.
- Commits end with the trailer from root `CLAUDE.md` (subagents: own model); LF only. Test scope: root `CLAUDE.md` § Process 6.

## Decisions (plan-local; spec §3 binds)
1. **R27 = refuse, not cancel-after-commit.** If the row locked in the disable transaction tracks a subscription the tool did not cancel (Checkout completed between the tool's read and its write) the tool throws `refuse('conflict', JUST_PAID_MESSAGE)` and changes nothing; the admin refreshes and disables again (which then cancels). Mirrors R13a/d `commitInvite`; avoids a committed "off" row with a live, uncancelled subscription when a post-commit Stripe call fails.
2. **M3 "paid" = Stripe status `active`.** `reconcileTarget` maps `trialing` to `active` too; a trialing subscription has not paid, so only `status === 'active'` sets `last_paid_at`. The reconcile also queues `client-paid` when `last_paid_at` was null (first payment, exactly like `payment_succeeded`); otherwise it stays silent. This removes the "is now paying" mail arriving a month late instead of just suppressing it.
3. **One lift helper.** `liftAutoPause` (`client-pause.ts`) is used by the webhook (R14, behaviour unchanged) and the daily reconcile. It lifts only `paused_by = 'auto'`, runs `resumeClient` in a savepoint, and swallows the expected refusals (`billing_seat_limit`; plus 15c-3's hold code if `resumeClient` can now refuse with it, see Dependencies), returning `'refused'`. Any other error propagates.
4. **M8 covers R21 "processing" rows too.** The R11 check for `checkout_completed` uses `isSubscribed(row)` (adds `invited` + tracked subscription, R16/R21) instead of `active`/`payment_needed` only. Today a second Checkout on a processing row silently replaces the tracked subscription id, leaving the first one live and untracked. Now the first stays tracked, the second is ignored and the agency is told.
5. **M8 notice** = new agency-audience kind `client-duplicate-subscription`, dedupe key `client-duplicate-subscription:<clientId>:<subscriptionId>` (`onConflictDoNothing`), params `{}` (the worker resolves the client name). Queued in the webhook transaction; the event still ends `ignored` (`untracked_subscription`) and is logged as today.
6. **Fake gateway:** the web refuses `BILLING_FAKE_GATEWAY` when `VERCEL_ENV` is set to any non-empty value (production, preview, development). `gatewayFor`/`gatewayMode` gain `opts.allowFakeFlag` (default `true`); the worker passes `false`, so the flag is ignored there and a warning is logged once at job creation. DEMO/TEST env names and test runs still get the fake (unchanged).
7. **Redemption count = local, distinct agencies.** Redemptions of a code = `agency_billing` rows whose `attached_coupon_id` = the code's `stripe_coupon_id`, excluding the redeeming agency (re-redeeming one's own code costs nothing). No migration (spec §7 "migration only if no column fits": `attached_coupon_id` fits). Stripe (coupon and promotion code both carry `max_redemptions`) stays the final authority; the local check only stops us offering an exhausted code.
8. **Serialisation:** both paths lock the `discount_code` row `FOR UPDATE` before counting. `redeem_discount_code` reserves the slot (writes `attached_coupon_id`) inside that locked transaction, attaches in Stripe after commit, and on attach failure restores the previous coupon (compare-and-set). `couponFor` exhausted ⇒ `undefined` (sign-up proceeds without the coupon, like a revoked/expired code).
9. `attach_agency_discount` (platform staff, `platform-billing.ts`) stays a deliberate override: not capped (spec names only `couponFor` and `redeem_discount_code`); its rows still count toward the cap.

## File structure
- `packages/billing/src/client-billing-state.ts` (+ test) — `reconciled.paid`, M3 patch/notice, R11 `isSubscribed`, kind `client-duplicate-subscription`, `noticeAudience`
- `packages/billing/src/client-pause.ts` (+ `client-pause.test.ts`) — `liftAutoPause`
- `packages/billing/src/connect-daily.ts` (+ test) — pass `paid`, lift, `resumed`, seat sync
- `packages/billing/src/connect-webhook.ts` (+ test) — use `liftAutoPause`; queue M8 notice
- `packages/billing/src/gateway.ts` (+ `gateway.test.ts`) — `allowFakeFlag`
- `packages/billing/src/discount.ts` (create, + `discount.test.ts`), `packages/billing/src/index.ts` — `discountRedemptions`
- `packages/email/src/types.ts`, `packages/email/src/templates/agency-client-billing-notice.tsx`, `packages/email/src/client-billing-notice.test.ts`
- `apps/worker/src/jobs/billing-notices.ts` (+ test), `apps/worker/src/jobs/billing-daily.ts` (+ test)
- `apps/web/src/server/env.ts` (+ `env.test.ts`)
- `packages/tools/src/tools/client-billing.ts` (+ test), `packages/tools/src/tools/billing.ts` (+ test), `packages/tools/src/access/signup-complete.ts` (+ test)
- Docs: `packages/billing/CLAUDE.md`, `docs/DEPLOY.md`, `docs/work/phase-7b2.md`

## Dependencies on in-flight work (re-check in Task 0)
- **15c-3 (agency management)** — as of 2026-10-23 **unplanned, no branch**; only 15c spec §5.3 on `main` (`docs/superpowers/specs/2026-10-21-phase-15c-page-fixes-design.md`). 7b2 assumes, and Task 0 verifies against merged code:
  - `agency.suspended_at` exists; `billingAccess()` has `onHold`; held agencies are refused with `ToolError('service_paused', …)` by `billingWriteGuard`. The guard allow-list (`packages/tools/src/billing-guard.ts`, contains `disable_client_billing`, `redeem_discount_code`) is unchanged.
  - `runBillingDaily` (`daily.ts`) skips held agencies for timers/`syncSeats`. **Unknown:** whether it also skips `runConnectDaily`. Either is fine for M3: skipped ⇒ no reconcile lift under hold (lifts after unsuspend); not skipped ⇒ `liftAutoPause` must swallow whatever `resumeClient`/`assertCanActivateClient` now throws for a held agency (Decision 3). Task 0 records which, and Task 2 adds the matching test.
  - `BillingGateway` gains `pauseCollection`/`resumeCollection` (types, fake, Stripe). 7b2 does not call them and does not edit `fake-gateway.ts`/`stripe-gateway.ts`/`types.ts`.
  - Collection pause leaves Stripe subscription `status` unchanged, so `reconcileTarget` needs no new case. If 15c-3 maps `paused` differently, re-check Task 2.
- **7b1** (planned in parallel): adds billing-notice kind `client_spend_paused` (agency audience) to `apps/worker/src/jobs/billing-notices.ts` and an email template; may touch `packages/email/src/types.ts`. Hunks are adjacent to Task 3's; second to merge rebases. 7b1's `clientWorkAllowed` does not affect billing paths (seats/billing keep `clientServiceable`, spec §5).
- **15c-2**: owns M4 + billing auto-refresh (agency/client billing pages). 7b2 changes no page.
- **13a**, **15b-3b**: no overlap with the files above.
- **Migrations:** none planned. If Task 0 finds a need, take the next free number at execution time (main is at `0084` on 2026-10-23; 15c-3, 13a, 15c-2, 7b1 claim numbers first).

## Review focus
1. **R27 race** — a Checkout completes (row becomes `active`/processing with `sub_new`) between the tool's read and its transaction: the tool refuses `conflict` with `JUST_PAID_MESSAGE`, the row is untouched (`enabled: true`), and `cancelConnectedSubscriptionAtPeriodEnd` was never called for `sub_new` (Task 1 test "R27: refuses when a Checkout completes mid-disable").
2. **M3 lift scope** — a manual pause (`paused_by = <userId>`) stays; a seat-cap (or hold) refusal keeps the reconciled `active` state and the other rows continue; `trialing` sets no `last_paid_at` (Task 2 tests).
3. **M8 idempotency** — a redelivered or retried `checkout.session.completed` for the same second subscription queues exactly one notice; the tracked subscription id is unchanged; the event result stays `ignored` (Task 3 test "M8: one notice across redelivery").
4. **Fake gateway in deployed envs** — `VERCEL_ENV=preview` (and `development`) with the flag throws in `parseWebEnv`; the worker with only the flag gets **no** gateway (not the fake), while `envName` `demo`/`test` still get the fake (Task 4 tests).
5. **Last redemption slot** — two concurrent `redeem_discount_code` calls from different agencies on a code with one slot left: exactly one succeeds, the other gets `invalid_code`; an attach failure releases the slot (Task 5 tests).

---

### Task 0: Pre-flight
**Goal:** Prove the Dependencies; fix the plan inline where they fail.
**Steps:**
- `git fetch && git rebase main` (15c-3 must be merged; stop and report if not). `pnpm install`; own test DB (`cs_phase_7b2_test`) + `E2E_PORT`.
- Re-check Dependencies (`git branch --no-merged main`, open worktrees). For 15c-3 record in the work file: (a) does `runBillingDaily` call `runConnectDaily` for held agencies; (b) what `resumeClient` / `assertCanActivateClient` throw for a held agency (code); (c) `billing-guard.ts` allow-list still has `disable_client_billing`, `redeem_discount_code`; (d) any edits 15c-3 made to `connect-daily.ts`, `client-pause.ts`, `gateway.ts`.
- `rg "untracked_subscription|reconcileTarget|resumeClient\(" packages apps --glob '!*.test.ts'` — every caller still matches Tasks 2–3.
- `rg "gatewayFor\(|gatewayMode\(" apps packages --glob '!*.test.ts'` — expected: web routes + `server/tools.ts`, worker `billing-daily.ts`, CLI `billing-sync-plan.ts` (already refuses the fake, unchanged).
- Conflict-scan every task's Files against `main` (7b1 if merged: `billing-notices.ts`, `email/types.ts`).
**Done when:** findings in `docs/work/phase-7b2.md`; plan edited where an assumption failed.

### Task 1: R27 — `disable_client_billing` re-checks the row inside the transaction
**Goal:** A Checkout completing mid-disable can no longer leave an uncancelled subscription behind a disabled row.
**Files:** modify `packages/tools/src/tools/client-billing.ts`, `packages/tools/src/tools/client-billing.test.ts`.
**Interfaces:** tool input/output unchanged. **Consumes:** `isSubscribed` (`@cs/billing`), `JUST_PAID_MESSAGE`, `refuse`, `connectRowOf`, `applyClientBillingSignal`.
**Behaviour:**
- Read `connect` once; `live = !!connect?.stripeAccountId && connect.status !== 'disconnected'`. Track `cancelled: string | null` = the subscription id the tool cancelled (only set after a successful cancel).
- Transaction (full code — security-sensitive):
```ts
const r = await deps.service.transaction(async (tx) => {
  const [cur] = await tx.select().from(clientBilling).where(eq(clientBilling.clientId, c.id)).for('update');
  // R27 (7b2): a Checkout that completed after our read left a subscription this call did not cancel.
  // Refuse and write nothing; the admin refreshes and disables again (which then cancels it).
  if (cur && live && cur.enabled && isSubscribed(cur) && cur.stripeSubscriptionId !== cancelled) throw refuse('conflict', JUST_PAID_MESSAGE);
  return applyClientBillingSignal(tx, c.id, { type: 'disabled' }, ctx.userId);
});
```
- Disconnected agency (`!live`): no re-check refusal (no Stripe call is possible; local only, as today).
- A completion landing **after** commit is unchanged (documented R21 rule: "whoever pays is tracked, even after a disable" → row becomes `active`, `enabled: true`).
- **Follow pattern:** `commitInvite` + `guardPendingInvite` in the same file.
**Tests (TDD)** (`client-billing.test.ts` › `disable_client_billing`):
- `R27: refuses when a Checkout completes mid-disable` — invited row, no subscription; wrap `gw.expireConnectedCheckout` to first write `{ state: 'active', stripeSubscriptionId: 'sub_new', enabled: true }` via `dbs.owner`; expect `conflict` with message `JUST_PAID_MESSAGE`; row still `active`/`enabled: true`; `gw.callsTo('cancelConnectedSubscriptionAtPeriodEnd')` empty.
- `R27: processing (R16) completion mid-disable also refuses` — same, but the injected write is `{ state: 'invited', stripeSubscriptionId: 'sub_new' }`.
- `R27: an active row whose tracked subscription is the one cancelled succeeds` — existing active case still `{ state: 'active', cancelAtPeriodEnd: true }`, `enabled: false`.
- `R27: disconnected agency never refuses` — row switched to subscribed mid-call with `status: 'disconnected'` → ok, local only, no Stripe call.
- Existing disable tests stay green.
**Done when:** `pnpm --filter @cs/tools exec vitest run client-billing` and `pnpm test:affected` pass.

### Task 2: M3 — daily reconcile `→ active` lifts the auto-pause and records the payment
**Goal:** A client whose missed `invoice.paid` is caught by the daily reconcile is un-paused (if auto-paused), gets `last_paid_at`, and the agency's first "is now paying" mail is not a month late.
**Files:** modify `packages/billing/src/client-billing-state.ts` (+ test), `packages/billing/src/client-pause.ts` (+ `client-pause.test.ts`), `packages/billing/src/connect-daily.ts` (+ test), `packages/billing/src/connect-webhook.ts` (+ test, refactor only).
**Interfaces (Produces):**
```ts
// client-billing-state.ts — reconciled signal gains `paid`
| { type: 'reconciled'; subscriptionId: string; target: 'active' | 'payment_needed' | 'cancelled' | null; billedPriceCents: number | null; /** 7b2 M3: Stripe status is `active` (not `trialing`). */ paid?: boolean }
// client-pause.ts
export async function liftAutoPause(tx: Tx, clientId: string, actor: string): Promise<'lifted' | 'not_paused' | 'refused'>;
// connect-daily.ts
export interface ConnectDailyResult { paused: number; reconciled: number; resumed: number }
```
**Behaviour:**
- Transition `reconciled`, `target 'active'` from `invited`/`payment_needed`: patch `{ ...price, paymentFailedSince: null, ...(s.paid && { lastPaidAt: now }) }`; notice `client-paid` iff `s.paid && !row.lastPaidAt`. Every other `reconciled` branch unchanged (silent). Update the signal's doc comment ("silently except M3").
- `reconcileClients` passes `paid: sub.status === 'active'`. In the same transaction, after a `changed` result with `state === 'active'` and `target === 'active'`, call `liftAutoPause(tx, clientId, ACTOR)`; count `resumed` on `'lifted'`; on `'refused'` log `[billing-daily] connect auto-pause not lifted` with `{ clientId }` only.
- `liftAutoPause`: read `client.paused_at`/`paused_by`; not `'auto'` ⇒ `'not_paused'`; else `tx.transaction((sp) => resumeClient(sp, clientId, actor))` (savepoint); `ToolError` with code `billing_seat_limit` (and, per Task 0 finding (b), 15c-3's hold code) ⇒ `'refused'`; anything else rethrows.
- `runConnectDaily`: `syncSeats` when `gw && (paused || resumed)`.
- Webhook R14 block becomes `liftAutoPause(...)`; `'lifted'` ⇒ `post.syncSeatsFor = agencyId`; `'refused'` ⇒ the existing `console.warn`. Behaviour and existing tests unchanged.
- **Follow pattern:** webhook R14 block in `connect-webhook.ts`; `autoPause` in `connect-daily.ts`.
**Tests (TDD):**
- state test `reconciled active from payment_needed with paid sets lastPaidAt; first payment queues client-paid` / `… with lastPaidAt already set: no notice` / `trialing (paid false): no lastPaidAt, no notice`.
- `client-pause.test.ts`: `liftAutoPause lifts only paused_by auto` (manual pause ⇒ `'not_paused'`, row still paused); `seat-cap refusal returns 'refused' and keeps the outer transaction usable`.
- `connect-daily.test.ts` (update "moves payment_needed to active … silently"): now `lastPaidAt` = `NOW`, notices unchanged (it had `lastPaidAt`); new `M3: an auto-paused client is resumed and the agency told once on first payment`; `M3: a manual pause stays paused`; `M3: a seat-cap refusal keeps the reconciled state and the next row is still processed`; `M3: syncSeats runs after a lift`; held-agency case per Task 0 finding (a).
- `connect-webhook.test.ts` R14 suite green unchanged.
**Done when:** `pnpm --filter @cs/billing exec vitest run client-billing-state client-pause connect-daily connect-webhook` and `pnpm test:affected` pass.

### Task 3: M8 — a second live subscription queues an agency notice
**Goal:** A Checkout that creates a second live subscription for an already-subscribed client tells the agency admins (real double charge) instead of only logging.
**Files:** modify `packages/billing/src/client-billing-state.ts` (+ test), `packages/billing/src/connect-webhook.ts` (+ test), `packages/email/src/types.ts`, `packages/email/src/templates/agency-client-billing-notice.tsx`, `packages/email/src/client-billing-notice.test.ts`, `apps/worker/src/jobs/billing-notices.ts` (+ test).
**Interfaces (Produces):**
```ts
// @cs/billing client-billing-state.ts and @cs/email types.ts (AgencyClientBillingNoticeKind)
ClientBillingNoticeKind += 'client-duplicate-subscription'   // noticeAudience → 'agency'
// connect-webhook.ts (internal)
async function queueDuplicateSubscriptionNotice(tx: Tx, agencyId: string, clientId: string, subscriptionId: string): Promise<void>;
```
**Behaviour:**
- R11 line for `checkout_completed` becomes `isSubscribed(row) && row.stripeSubscriptionId !== s.subscriptionId` (Decision 4). The `unpaid` and paid branches are otherwise unchanged.
- In `dispatch`, when `applyClientBillingSignal` returns `ignored: 'untracked_subscription'` for a `checkout_completed` signal: insert `billing_notice { agencyId, clientId, audience: 'agency', kind: 'client-duplicate-subscription', params: {}, dedupeKey: 'client-duplicate-subscription:<clientId>:<subscriptionId>' }` `.onConflictDoNothing({ target: billingNotice.dedupeKey })`, then return `ignored(event, 'untracked_subscription')` as today (the transaction commits the notice). Only reached after the existing `LIVE_SUBSCRIPTION_STATUSES` filter, so the second subscription is live.
- Worker: add the kind to `AGENCY_CLIENT_KINDS` and the `props.kind` union; no `n`.
- Email copy (**owner sign-off**; Rival Monday-branded, agency audience):
  - Subject: `` `${clientName} may be paying twice` ``
  - Body: `` `${clientName} completed a new payment while their existing subscription is still running, so they may be charged twice. Check their subscriptions in your Stripe dashboard and cancel the one you don't need.` ``
  - Button: existing "Open client billing".
- **Follow pattern:** `client-auto-paused` (state kind, template switch, worker branch); dedupe like `reminder:` keys in `daily.ts`.
**Tests (TDD):**
- state: `R11/M8: checkout for another subscription on a processing (invited + tracked) row is ignored`; existing R11 ignore test still passes.
- webhook: `M8: a second live subscription queues one agency notice and keeps the tracked id` (row `active` `sub_1`; event for `sub_2` live ⇒ result `ignored`, `stripeSubscriptionId` still `sub_1`, one notice kind `client-duplicate-subscription`, audience `agency`); `M8: one notice across redelivery` (same event after a forced failure + a second event id for `sub_2` ⇒ still one row); `M8: a non-live second subscription queues nothing`; `M8: another agency's account never reaches the client` (isolation).
- email: subject/body snapshot for the new kind; no "undefined" in output.
- worker: `delivers client-duplicate-subscription to agency admins with the client name`.
**Done when:** focused vitest in `@cs/billing` (`client-billing-state connect-webhook`), `@cs/email` (`client-billing-notice`), `@cs/worker` (`billing-notices`); `pnpm test:affected`.

### Task 4: `BILLING_FAKE_GATEWAY` refused on any Vercel env, ignored by the worker
**Goal:** The constant-signature fake gateway can never serve a deployed web app or a worker.
**Files:** modify `apps/web/src/server/env.ts` (+ `env.test.ts`), `packages/billing/src/gateway.ts` (+ `gateway.test.ts`), `apps/worker/src/jobs/billing-daily.ts` (+ test).
**Interfaces:**
```ts
export interface GatewayOptions { /** false = ignore BILLING_FAKE_GATEWAY (worker). Default true. */ allowFakeFlag?: boolean }
export function gatewayMode(env: GatewayEnv, envName: DbEnvName, opts?: GatewayOptions): GatewayMode;
export function gatewayFor(env: GatewayEnv, envName: DbEnvName, opts?: GatewayOptions): BillingGateway | null;
```
**Behaviour (full code for the two security lines):**
```ts
// apps/web/src/server/env.ts — replaces the production-only check
if (billingFake && env.VERCEL_ENV?.trim()) problems.push('BILLING_FAKE_GATEWAY must not be set on Vercel (any VERCEL_ENV)');
// packages/billing/src/gateway.ts — gatewayMode
const fakeFlag = opts.allowFakeFlag !== false && env.BILLING_FAKE_GATEWAY === '1';
if (envName === 'demo' || envName === 'test' || env.NODE_ENV === 'test' || !!env.VITEST || fakeFlag) return 'fake';
```
- `gatewayFor` passes `opts` through; `completeOnboardingOnRelink` uses the same `fakeFlag`.
- Worker `createBillingJobs`: `gatewayFor(opts.env, opts.envName, { allowFakeFlag: false })`; at creation, if `opts.env.BILLING_FAKE_GATEWAY?.trim()` log `workerLog.warn('[billing-daily] BILLING_FAKE_GATEWAY is ignored by the worker')` (no value logged).
- Update the `GatewayEnv.BILLING_FAKE_GATEWAY` and `WebEnv.stripe` doc comments ("refused on any Vercel env; ignored by the worker"). Playwright (no `VERCEL_ENV`) unchanged.
- **Follow pattern:** `ASK_FAKE_AI` check in `parseWebEnv`; table test in `gateway.test.ts`.
**Tests (TDD):**
- `env.test.ts`: extend the R27 test — throws for `VERCEL_ENV` `production`, `preview`, `development`; passes with `VERCEL_ENV: ''`/unset.
- `gateway.test.ts` table: `['flag ignored when not allowed', { BILLING_FAKE_GATEWAY: '1' }, 'dev', 'none', { allowFakeFlag: false }]`, `['flag ignored, key set', { ...KEY, BILLING_FAKE_GATEWAY: '1' }, 'dev', 'real', { allowFakeFlag: false }]`, `['test env still fake', { BILLING_FAKE_GATEWAY: '1' }, 'test', 'fake', { allowFakeFlag: false }]`.
- `billing-daily.test.ts`: `ignores BILLING_FAKE_GATEWAY: no gateway and a warning` (env `{ BILLING_FAKE_GATEWAY: '1' }`, envName `dev` ⇒ log "billing not configured", warn spy called once).
**Done when:** `pnpm --filter @cs/billing exec vitest run gateway`, `pnpm --filter @cs/worker exec vitest run billing-daily`, `pnpm --filter @cs/web exec vitest run env`, `pnpm test:affected`, `pnpm --filter @cs/web e2e:affected` pass.

### Task 5: `max_redemptions` in `couponFor` and `redeem_discount_code`
**Goal:** An exhausted discount code is never attached by sign-up or by an agency admin.
**Files:** create `packages/billing/src/discount.ts`, `packages/billing/src/discount.test.ts`; modify `packages/billing/src/index.ts`, `packages/tools/src/tools/billing.ts` (+ `billing.test.ts`), `packages/tools/src/access/signup-complete.ts` (+ `signup-complete.test.ts`).
**Interfaces:**
```ts
// @cs/billing discount.ts
/** Agencies holding this coupon (`agency_billing.attached_coupon_id`), excluding `exceptAgencyId`. */
export async function discountRedemptions(db: Db | Tx, couponId: string, exceptAgencyId?: string): Promise<number>;
export const discountExhausted = (maxRedemptions: number | null, used: number): boolean => maxRedemptions !== null && used >= maxRedemptions;
```
**Behaviour:**
- `couponFor(tx, link, now)`: select the code `FOR UPDATE` (existing filters); if `discountExhausted(dc.maxRedemptions, await discountRedemptions(tx, dc.coupon))` return `undefined`. Sign-up continues (Decision 8).
- `redeem_discount_code` (full code — reservation under lock; Stripe after commit):
```ts
const valid = (d: DiscountCodeRow | undefined, used: number) => !!d && (!d.expiresAt || d.expiresAt.getTime() > Date.now())
  && (!d.restrictedAgencyIds || d.restrictedAgencyIds.includes(ctx.agencyId)) && !discountExhausted(d.maxRedemptions, used);
const byCode = and(sql`lower(${discountCode.code}) = lower(${code})`, isNull(discountCode.revokedAt));
// Cheap pre-check (no Stripe work for an invalid code).
const [pre] = await deps.service.select().from(discountCode).where(byCode);
if (!pre || !valid(pre, await discountRedemptions(deps.service, pre.stripeCouponId, ctx.agencyId))) throw new ToolError('invalid_code', INVALID_CODE_MESSAGE);
await ensureCustomer(deps, ctx.agencyId);
// Reserve the slot under the code's row lock (serialises the last slot).
const { dc, previous, subscriptionId } = await deps.service.transaction(async (tx) => {
  const [d] = await tx.select().from(discountCode).where(byCode).for('update');
  if (!d || !valid(d, await discountRedemptions(tx, d.stripeCouponId, ctx.agencyId))) throw new ToolError('invalid_code', INVALID_CODE_MESSAGE);
  const [b] = await tx.select({ coupon: agencyBilling.attachedCouponId, sub: agencyBilling.stripeSubscriptionId }).from(agencyBilling).where(eq(agencyBilling.agencyId, ctx.agencyId)).for('update');
  await tx.update(agencyBilling).set({ attachedCouponId: d.stripeCouponId, updatedAt: new Date() }).where(eq(agencyBilling.agencyId, ctx.agencyId));
  return { dc: d, previous: b?.coupon ?? null, subscriptionId: b?.sub ?? null };
});
if (subscriptionId) {
  try {
    await gw.attachSubscriptionDiscount({ subscriptionId, couponId: dc.stripeCouponId });
  } catch (e) {
    // Release the slot only if nobody changed it since (compare-and-set).
    await deps.service.update(agencyBilling).set({ attachedCouponId: previous, updatedAt: new Date() })
      .where(and(eq(agencyBilling.agencyId, ctx.agencyId), eq(agencyBilling.attachedCouponId, dc.stripeCouponId)));
    throw e;
  }
}
return { applied: true as const, appliesAtCheckout: !subscriptionId };
```
- Output and the single refusal message unchanged (no oracle: exhausted reads like any invalid code). Attach errors propagate as today.
- **Follow pattern:** existing `redeem_discount_code`; `FOR UPDATE` re-check style of `completePendingSignups`.
**Tests (TDD):**
- `discount.test.ts`: counts distinct agencies holding the coupon; excludes `exceptAgencyId`; `discountExhausted(null, 99)` false, `(2, 2)` true.
- `billing.test.ts` › `redeem_discount_code`: `refuses an exhausted code with the same invalid_code message`; `re-redeeming the agency's own code does not count against it`; `last slot under concurrency: one of two agencies wins` (`Promise.allSettled`, exactly one `invalid_code`); `an attach failure restores the previous coupon` (`gw.failNext()` with a subscription; `attachedCouponId` back to previous).
- `signup-complete.test.ts`: `invite trial: an exhausted discount code attaches no coupon` (next to the revoked/expired case); `max_redemptions null: unlimited`.
**Done when:** `pnpm --filter @cs/billing exec vitest run discount`, `pnpm --filter @cs/tools exec vitest run billing signup-complete`, `pnpm test:affected` pass.

### Task 6: Docs
**Goal:** Record the rulings; queue the backlog closures for `/rm-merge`.
**Files:** modify `packages/billing/CLAUDE.md`, `docs/DEPLOY.md`, `docs/work/phase-7b2.md`.
**Behaviour:**
- `packages/billing/CLAUDE.md` (≤ 12 KB, overwrite stale clauses, don't append): Gateway selection — flag refused on any `VERCEL_ENV`, `allowFakeFlag: false` in the worker; R11 clause — `checkout_completed` uses `isSubscribed` and a second live subscription queues `client-duplicate-subscription` (dedupe per subscription); R14 — `liftAutoPause` shared by webhook and daily reconcile; reconcile → `active` sets `last_paid_at` only when Stripe status is `active`, first payment queues `client-paid`; R27 disable re-check refuses `JUST_PAID_MESSAGE`; discount cap = local count of `attached_coupon_id`, Stripe final.
- `docs/DEPLOY.md` web env line: `BILLING_FAKE_GATEWAY` refused on any Vercel env, ignored by the worker.
- Work file "New backlog / closes" for `/rm-merge` (shared docs change only at merge): close BACKLOG Phase 9 › Soon R27, M3, M8, `BILLING_FAKE_GATEWAY`; strike the `redeem_discount_code` clause of the 9a ledger line; close phase-10 `couponFor` line. File new: "`attach_agency_discount` ignores `max_redemptions` (staff override, Decision 9) — owner call" (Phase 9 › Later). Owner verification steps: (1) sign off the M8 email copy; (2) on Vercel preview set the flag and confirm the deploy refuses to serve.
**Done when:** `git ls-files --eol | grep crlf` prints nothing; CLAUDE.md under its cap.
