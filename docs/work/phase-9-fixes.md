# phase-9-fixes — billing fixes found during the Phase 9 owner checks

**Kind:** fix   **Worktree:** ../CompetitorSpy-wt/phase-9-fixes   **Base:** main @ bf78e38
**Plan/spec:** this file (owner approved the two fixes in session, 2026-10-16)

## Status (overwrite)
F1 + F2 built (`ee8af41`, TDD: new tests red on old code). Typecheck clean; `test:affected` 6 packages green (web 75 files, tools 49); `e2e:affected` 72/72. Test DB `cs_phase_9_fixes_test`.

## Next (overwrite)
Owner: try it from this worktree (`pnpm dev` in `../CompetitorSpy-wt/phase-9-fixes`, DEV db) — Subscribe after the ended subscription; then `/rm-merge phase-9-fixes` on go-ahead (batch more Phase 9 findings here first if any).

## Fixes
**F1 — re-subscribe after a subscription ended.** `subscription_ended` → `past_due` and forgets `stripe_subscription_id` (R26), but `/agency/settings/billing` picks Checkout vs Portal from the *state* (`HAS_SUBSCRIPTION` includes `past_due`/`read_only`/`suspended`/`cancelled`), so it offers "Manage billing" (portal), which cannot start a new subscription. `create_checkout_session` already allows it (no live subscription; on the paused allow-list).
- `get_billing_summary` output gains `hasSubscription: boolean` (= stored `stripe_subscription_id` is not null).
- Page: `hasSubscription` → "Manage billing" (portal); none → Checkout, labelled "Add payment method" in `pilot`/`trialing`, **"Subscribe"** otherwise.
- `cancelled` with `cancel_at` still holds the subscription → portal (can un-cancel). Suspended admins already land on this page (`billingRedirectFor`).

**F2 — page goes stale after returning from Stripe.** Checkout/Portal return to `?done=1` (client Checkout: `/c/[id]/settings/billing?checkout=done`) usually before the webhook lands; the copy says "This page refreshes as soon as Stripe confirms" but nothing refreshes, and the shell's billing banner (layout) never re-renders on client navigation.
- New client component `RefreshUntilChanged({ watch: string })` (`apps/web/src/components/billing/refresh-until-changed.tsx`): `router.refresh()` every 2 s, at most 15 times; stops as soon as `watch` differs from its value at mount. Renders nothing.
- Agency page renders it when `done=1` with `watch = state + ':' + hasSubscription`; client page when `checkout=done` with `watch = state`.

## Interfaces this branch adds or changes
- `get_billing_summary` output + `hasSubscription` (additive). New web component `RefreshUntilChanged`.

## Assumes from other branches
- phase-10 / phase-11 (in flight) don't change `/agency/settings/billing` page or `get_billing_summary` — re-check at merge.

## Decisions (owner-approved)
1. Copy "Subscribe" for the Checkout button when no subscription is held outside pilot/trial (implementer wording; owner may change).

## New backlog (target → item)
- Polish → past_due/read_only banner says "Update payment method" even when the subscription ended (link still lands on Subscribe) — binding 9a copy, owner call.
- Polish → demo: fake checkout never completes (no webhook in DEMO), so trial banner/seat cap stay — only if the owner wants to demo the paying flow.

## Owner verification steps
- DEV, agency with an ended subscription: billing page shows **Subscribe** → Checkout 4242… → back on the page it flips to Active within a few seconds, banner gone, no manual reload.
