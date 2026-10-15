# phase-9 — Billing (platform → agency subscriptions; agency → client billing TBD)

**Kind:** feature   **Worktree:** ../CompetitorSpy-wt/phase-9   **Base:** main @ c84ca97
**Plan/spec:** 9a spec `docs/superpowers/specs/2026-10-12-phase-9a-platform-billing-design.md` (e1–e16); 9a plan `docs/superpowers/plans/2026-10-12-phase-9a-platform-billing.md` (P1–P5, Tasks 0–12). 9b spec `docs/superpowers/specs/2026-10-12-phase-9b-client-billing-connect-design.md` (f1–f13); 9b plan `docs/superpowers/plans/2026-10-12-phase-9b-client-billing-connect.md` (Q1–Q4, Tasks 0–12). **9b runs next on this same branch** (owner, 2026-10-14).

## Status (overwrite)
**9a built 2026-10-14, not merged** — Tasks 0–12 done (subagent-driven; per-task reviews, final Opus review + one fix wave). 39 commits on `main@c84ca97`, nothing uncommitted. `test:affected` 16/16 and `e2e:affected` 61/61 green at `d362dc6`. **One residual open: R29** (see Next 1). **9b not started.** Test DB `cs_phase_9_test`. 9a SDD ledger (rulings R1–R29, ~60 deferred minors triaged must-fix/backlog): `.superpowers/sdd/2026-10-12-phase-9a-platform-billing/progress.md` (gitignored, local only — keep until merge).

## Next (overwrite)
1. **Fix R29 first** (small, `packages/billing/src/webhook.ts` dispatch): events for an untracked/forgotten subscription still change state — a delayed `customer.subscription.deleted`/`updated(canceled)` after `grant_pilot` demotes the pilot; `invoice.paid` for a forgotten (canceled) sub makes the agency `active` with nothing billing it. Fix: subscription events with no stored id and non-live status → `ignored`; `invoice.*` whose subscription (`obj.parent.subscription_details.subscription`, fallback `obj.subscription`) ≠ stored id → `ignored`; tests for both; `pnpm test:affected`.
2. **Start 9b** on this branch: `superpowers:subagent-driven-development` with plan `docs/superpowers/plans/2026-10-12-phase-9b-client-billing-connect.md` (own SDD workspace). Task 0 deviations (owner decision D1): no pilot-feedback gate, no `git rebase main` — 9a is on this branch, not `main`; re-check the plan's 9a dependencies against the real 9a code (R8 two products, R26 forgotten subscriptions, R27 null gateway, `assertCanActivateClient(tx, agencyId, { role, now })`, `BILLING_FAKE_GATEWAY`) and record drift here. Next free migration **0055**. Owner: Connect + `STRIPE_CONNECT_WEBHOOK_SECRET` (fake gateway meanwhile).
3. After 9b: final whole-branch review over all of phase 9, owner Stripe verification, then `/rm-merge phase-9` (fold both ledgers' backlog minors into `BACKLOG`).

## Interfaces this branch adds or changes
- New package `@cs/billing` (gateway `BillingGateway`/`gatewayFor(env, envName)` → real | fake | null; state machine; `applyBillingSignal`; `billingAccess`/`assertCanActivateClient`; `syncSeats`; `startAgencyTrial` (for Phase 10); `handleStripeEvent`; `runBillingDaily`; `syncPlanToStripe`; `noticeEmailFor`; invite tokens).
- Migrations 0052 `billing` (plan, agency_billing, agency_billing_event, stripe_event, discount_code, agency_invite_link, billing_notice; agency_daily_stat mrr/paid_seats/billing_state), 0053 RLS + seed + pilot backfill, 0054 `plan.stripe_seat_product_id`. `@cs/db` `agencyServiceable`, `resolveActiveEnvName`.
- Core `ToolRegistry` `writeGuard` hook; `ToolErrorCode` + `billing_seat_limit`, `service_paused`, `invalid_code`.
- Tools: agency `get_billing_summary`, `create_checkout_session`, `create_portal_session`, `redeem_discount_code`, `get_seat_report`; 15 platform billing tools; `list_platform_agencies` + `billingState`.
- Web: `POST /api/stripe/webhook`, `/agency/settings/billing` (+ `seats.csv`), `/paused`, billing banner, suspended routing in `requireContext` + file/link routes, `/platform/billing`, agency billing panel. Worker jobs `billing-daily` (02:30), `billing-notices` (*/5), CLI `billing:sync-plan`. E2E flag `BILLING_FAKE_GATEWAY` (playwright only).
- New env (owner adds): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_TAX_ENABLED`.

## Assumes from other branches
- phase-6 and phase-8 are on `main` (base `c84ca97`). No other in-flight branch touches billing; `phase-10` (in flight) will consume `startAgencyTrial` + invite links — tell it the 9a interfaces above.


## Decisions (owner-approved)
- **D1 (2026-10-14)** 9b starts now, on the same `phase-9` branch/worktree, without waiting for pilot feedback; **no merge to `main` until all of phase 9 (9a + 9b) is done**.
- **D2 (taken on owner's behalf, R26 — confirm)** `grant_pilot`/`extend_trial` refuse while the agency has a live Stripe subscription (staff cancel it in Stripe first).

## New backlog (target → item)
- [ ] **Later (9b follow-up)** → Review annual billing option for agency → client subscriptions (9b ships monthly only) — *from 9b brainstorm 2026-10-12*

## Owner verification steps
Owner setup: Stripe test-mode account; add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_TAX_ENABLED` to `.env`; `pnpm --filter @cs/worker billing:sync-plan`. After R29, with `stripe listen --forward-to localhost:3000/api/stripe/webhook`: checkout with 4242… → `active`; 4th client → prorated seat line; card 4000 0000 0000 0341 → `past_due` + email; Portal cancel → `cancelled`; agency-restricted code redeemed by another agency → refused. After merge to prod: `set_seat_cap_exempt` for the owner's agency if it has > 3 active clients (backfill makes every agency a capped pilot).
