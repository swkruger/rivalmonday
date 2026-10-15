# @cs/billing — working notes
Platform to agency billing (Phase 9a): `BillingGateway`, Stripe + fake implementations, invite tokens. Later tasks add the state machine, apply/access/seats, webhook handler and daily job here.

## Gotchas
- **Gateway selection (R27).** `gatewayFor(env, envName)` returns `fakeGateway()` when `envName` (the active DB from `activeEnvName()`) is `demo`/`test`, `NODE_ENV=test`/`VITEST`, or `BILLING_FAKE_GATEWAY=1` (E2E only: the Playwright server runs `next start`); Stripe when `STRIPE_SECRET_KEY` is set; otherwise **`null`** (billing not configured: Stripe-backed tools refuse `conflict` "Billing is not configured.", reads degrade, the webhook 404s, the daily job skips Stripe steps). Fake ids carry a random suffix (`cus_fake_<8 hex>`). The fake accepts only webhook signature `fake-sig`; `failNext()` injects a one-shot failure; an unknown subscription throws `code: 'resource_missing'` like Stripe.
- **Money is integer cents (USD)** everywhere in the gateway types.
- **No secrets in logs or errors:** never log the secret key, webhook secret, raw webhook bodies or Checkout URLs.
- **Seat line = price metadata `rm_role=seat`** (set by `createPrices`); `getSubscription`/`updateSeatQuantity` find it that way. Prices created outside `createPrices` have no seat line. Checkout omits the seat line at quantity 0; `updateSeatQuantity` adds it (needs `seatPriceId`) when absent.
- **Ended subscriptions are forgotten (R26).** `subscription_ended` clears `stripe_subscription_id`, `billable_seats_synced` and `seat_sync_pending` in `applyBillingSignal`'s transaction (`FORGET_SUBSCRIPTION`); webhook `customer.subscription.*` events for another id than the stored one are ignored.
- **Stripe API 2026-08-26.dahlia:** no `coupon` on customer/subscription updates — use `attachSubscriptionDiscount` (`discounts: [{ coupon }]`); Checkout `trial_end` must be ≥ 48 h ahead (`trialEndUsable`); with Stripe Tax and an existing customer Checkout needs `customer_update`.
- **Stripe SDK is pinned exactly** (no `^`); bump deliberately. Checkout `discounts` and `allow_promotion_codes` are mutually exclusive; `automatic_tax` follows `STRIPE_TAX_ENABLED === 'true'`.
- New env vars (`STRIPE_*`) reach tasks only via `turbo.json` `globalPassThroughEnv` (already added).
