# pricing-v2 — volume-tiered agency pricing, annual options, $249 direct, agency-plan fence

**Kind:** feature   **Worktree:** ../CompetitorSpy-wt/pricing-v2   **Base:** main @ 8e3b86a6
**Plan/spec:** `docs/superpowers/specs/2026-11-04-pricing-v2-design.md`, `docs/superpowers/plans/2026-11-04-pricing-v2.md`. Input: `docs/research/2026-11-04-pricing-feasibility.md` §5.

## Status (overwrite)
2026-11-05: SDD Tasks 0–9 done; final review next (then `test:affected` + `e2e:affected` once, one fix wave).

## Next (overwrite)
Final review; owner signs new copy in `pnpm copy:review`; owner verification (below); `/rm-merge` on go-ahead (amend CLAUDE.md "$229 incl. 3 seats, $99/seat" and 9a spec at merge).

## Interfaces this branch adds or changes
- Migration **0097**: `plan.seat_tiers` (jsonb, NOT NULL), `base_price_year_cents`, `stripe_base_price_year_id`, `stripe_seat_price_year_id`; `seat_price_cents` dropped; `agency_billing.billing_interval`; `pending_signup.website/clients_served`; `agency_onboarding.clients_served`.
- `@cs/billing` `pricing.ts` (only pricing maths): `seatCents`, `planCents`, `monthlyEquivalentCents`, `describeTiers`, `seatTiersSchema`, `STANDARD_V2`.
- Gateway: graduated + yearly prices (`createPrices`), `switchSubscriptionInterval`, `updateSeatQuantity` `invoiceNow`, `GatewaySubscription.interval`, `CheckoutSessionInput.interval`; fake gateway mirrors.
- Tools: `switch_billing_to_yearly` (new); `create_checkout_session.interval`; `create_plan_version.seatTiers/basePriceYearCents`; plan move `moveBlocked` / `no_yearly_price`; `get_signup_funnel.recent[]` with `check`, `website`, `clientsServed`; `get_billing_summary` adds `interval`, `tiers`.
- Email `PlanTerms.tiers`; site `PRICING.agency` tiers (`yearlyUsd`, `extraClientTiers`).
- Glossary `seat` text pinned by `packages/billing/src/glossary-pin.test.ts`.

## Assumes from other branches
- **site-story** merged first (`DEFAULT_CLIENT_PRICE_USD` 249, home/commercial read `PRICING`). **app-style**: no overlap.

## Decisions (owner-approved "just go" 2026-11-04; spec D1–D11)
- D1 one branch, two task groups. D2 graduated seat price on *extra* clients; base line and `syncSeats` rule unchanged. D3 standard v2: $229/mo or $2,290/yr, 3 included, clients 4–10 $79, 11+ $59, 30-day trial.
- D4 $49 tier = a later v3 the owner publishes (cost < $10/client). D5 existing agencies move to v2 via the 15c-3b tool; nobody grandfathered.
- D6 yearly = one subscription, seats yearly graduated at 12 × monthly; client adds on yearly prorate and invoice at once. D7 monthly → yearly self-serve; yearly → monthly via support at renewal.
- D8 $249 is the site's suggested price only; $2,490/yr not shown. D9 soft fence: terms clause, website + clients-served on sign-up, staff Check flag, never a block.
- D10 prices in copy come from data; help states no figures. D11 one pricing function; site keeps a pinned copy.
- P1 glossary is a literal, pinned by a `@cs/billing` test. P2 seed has v1 (history) and v2 (current); prod gets v2 via console + `billing:sync-plan` + move. P3 interval is read from Stripe by the webhook, never inferred.
- Rulings: T1 done-when = `@cs/db` tests + tsc only; repo-wide tsc green by end of T6. Each task fixes the `seatPriceCents` consumers it owns. T4 yearly plan move without a yearly price = per-agency `refused` row (`no_yearly_price`), not a throw. T4 preview keeps `monthlyNowCents/monthlyAfterCents` names (monthly equivalents). T5 email tier rows computed in `@cs/tools` `termsOf` via `describeTiers`. T7 extra strings (field errors, "Choose one", "Newest sign-ups", "Agency"/"Website"/"Clients today", "—") go to owner sign-off. T7 pending (agency-less) sign-ups stay out of the Check list.
- Final-fix rulings: yearly seat **decreases wait for renewal** (D6): `syncSeats` never lowers a yearly Stripe quantity mid-term (`'deferred'`, `seat_sync_pending` false, `billable_seats_synced` = paid Stripe quantity); re-adding up to it is free, above it prorates + invoices now; `runBillingDaily` lowers it (proration none) in the last 24 h before the period end or the first 24 h after renewal. Month → year switch uses `pending_if_incomplete`; a declined card refuses "Your card was declined, so you're still on monthly billing." and keeps the row monthly. Yearly MRR spreads the invoice discount over 12. An ended subscription resets the interval to month. Plan caps: tier ≤ $83,333.33, yearly base ≤ $999,999.99 (Stripe limit).

## New backlog (target → item)
- Later: yearly Connect client billing, then show $2,490/yr on the site.
- Later: self-serve yearly → monthly (scheduled switch at renewal).
- Owner action: publish v3 with the $49 tier (extra 23+) once cost per client < $10 (D4).
- Later: hard review gate on sign-ups.
- Soon: harden runbook E2E flake `apps/web/e2e/runbook.spec.ts:72` (wait for the agency save before navigating).
- Soon: plan-sync partial resync recreates all four prices.
- Soon: worker `billing-sync-plan` pending query checks monthly ids only.
- Soon: yearly seat-add notice where a client is activated/resumed (only the billing card shows it now).
- Soon: a declined month → year switch leaves Stripe's open invoice + `pending_update` (expires 23 h); if that invoice is later paid Stripe applies the switch and reconcile adopts `year` — no notice to the agency.

## Owner verification (after merge, staging Stripe test mode)
1. `/platform/billing`: create standard v2 (tiers 4–10 $79, 11+ $59, yearly $2,290), `billing:sync-plan`, check four prices in Stripe (two graduated).
2. A new trial agency checks out **yearly**, adds a 4th client → an immediate prorated invoice.
3. A monthly agency switches to yearly → prorated invoice; card shows "/yr".
4. Move an existing v1 agency with 5 clients → next invoice $229 + 2 × $79 = $387.
5. Sign up with "None yet" → Check chip on `/platform/billing` sign-ups.
6. `pnpm copy:review`: sign the new strings (sign-up labels, plan editor labels, "No yearly price", yearly seat-add notice, declined-switch refusal, site tier lines, terms clause, glossary `seat`, plan-change email); set Vercel `NEXT_PUBLIC_CLIENT_PRICE_USD=249`.

## Brief (trimmed)
Scope: graduated extra-client pricing in the versioned plan; agency annual ($2,290/yr); $249 direct on the site; agency-plan fence (terms, sign-up website + clients served, staff review); every $229/$99/$299 statement in site, app, help, emails, glossary, claims ledger follows. Reuse: `plan` table, `seed.ts`, `plan-sync.ts`, `stripe-gateway.ts` `createPrices`, `seats.ts` `syncSeats`, `/platform/billing`, `/agency/settings/billing`, Phase 10 sign-up, site `PRICING`. Binding: Stripe Billing platform → agency, Connect Standard fee 0 agency → client; 15c one `standard` plan, move at next billing; 17 claims from ledger/code only.
