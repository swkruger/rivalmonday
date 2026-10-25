# phase-7b2 — billing correctness (Phase 9 leftovers: R27, M3, M8, fake gateway, max_redemptions)

**Kind:** implementation   **Worktree:** ../CompetitorSpy-wt/phase-7b2   **Base:** 015a948c
**Plan/spec:** [plan](../superpowers/plans/2026-10-23-phase-7b2-billing-correctness.md) · [spec](../superpowers/specs/2026-10-22-phase-7b-money-design.md) — owner-approved 2026-10-23 (planned on `phase-7-planning`).

## Status (overwrite)
Tasks 1–6 done 2026-10-25; final whole-branch review next. No migration, no new env vars. Task 0: 15c-3 assumptions hold (held agencies skip runConnectDaily; hold => `service_paused`, swallowed by liftAutoPause; guard allow-list unchanged).

## Next (overwrite)
Final review + fix wave; then `/rm-merge` with owner go-ahead.

## Interfaces this branch adds or changes
- `liftAutoPause(tx, clientId, actor)` (`client-pause.ts`): shared by webhook R14 and daily reconcile; swallows `billing_seat_limit` + `service_paused` -> 'refused'. `ConnectDailyResult.resumed`.
- `discountRedemptions`/`discountExhausted` (`@cs/billing` `discount.ts`).
- `gatewayFor/gatewayMode(…, { allowFakeFlag })`; web `parseWebEnv` refuses `BILLING_FAKE_GATEWAY` on any non-empty `VERCEL_ENV`.
- Notice kind `client-duplicate-subscription` (agency audience, dedupe `…:<clientId>:<subscriptionId>`).
- R27: `disable_client_billing` re-checks FOR UPDATE, refuses `conflict`/`JUST_PAID_MESSAGE`.

## Assumes from other branches
15c-3 agency suspension (billingAccess, daily.ts, BillingGateway.pauseCollection) — see plan § Dependencies; 7b1 notice kind `client_spend_paused`.

## Decisions (owner-approved)
Spec decisions + plan "Decisions"; owner decisions 2026-10-22/23 summarised in `git show phase-7-planning:docs/work/phase-7-planning.md` (folded into STATE/BACKLOG at merge).

## New backlog / closes (for /rm-merge)
Close in BACKLOG Phase 9 › Soon: R27, M3, M8, `BILLING_FAKE_GATEWAY`. Strike the `redeem_discount_code` clause of the 9a ledger line. Close the phase-10 `couponFor` line. File new (Phase 9 › Later):
- `attach_agency_discount` ignores `max_redemptions` (staff override, Decision 9) — owner call.
- Discount cap locks per `discount_code` row but counts per `stripe_coupon_id`; two codes sharing a coupon aren't serialised (make `stripe_coupon_id` unique per code or lock on the coupon).
- Discount cap counts current holders; an agency that swaps coupon frees its slot (Decision 7) — owner call if lifetime redemptions are wanted.

## Owner verification steps
1. Sign off the M8 email copy (agency notice `client-duplicate-subscription`).
2. On a Vercel preview set `BILLING_FAKE_GATEWAY` and confirm the deploy refuses to serve.
3. Confirm the M8 copy is the plan's text: subject `${clientName} may be paying twice`, body as in the plan (Task 3).
