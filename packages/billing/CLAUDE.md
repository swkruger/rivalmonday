# @cs/billing — working notes
Platform to agency billing (Phase 9a): `BillingGateway`, Stripe + fake implementations, invite tokens. Later tasks add the state machine, apply/access/seats, webhook handler and daily job here.

## Gotchas
- **Fake gateway in DEMO/TEST.** `gatewayFor(env, envName)` returns `fakeGateway()` when `STRIPE_SECRET_KEY` is unset, `envName` (the active DB from `activeEnvName()`) is `demo`/`test`, or `NODE_ENV=test`/`VITEST`. Tests, DEMO and E2E must never reach Stripe. The fake accepts only webhook signature `fake-sig`; `failNext()` injects a one-shot failure.
- **Money is integer cents (USD)** everywhere in the gateway types.
- **No secrets in logs or errors:** never log the secret key, webhook secret, raw webhook bodies or Checkout URLs.
- **Seat line = price metadata `rm_role=seat`** (set by `createPrices`); `getSubscription`/`updateSeatQuantity` find it that way. Prices created outside `createPrices` have no seat line.
- **Stripe SDK is pinned exactly** (no `^`); bump deliberately. Checkout `discounts` and `allow_promotion_codes` are mutually exclusive; `automatic_tax` follows `STRIPE_TAX_ENABLED === 'true'`.
- New env vars (`STRIPE_*`) reach tasks only via `turbo.json` `globalPassThroughEnv` (already added).
