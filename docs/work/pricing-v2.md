# pricing-v2 — volume-tiered agency pricing, annual options, $249 direct, agency-plan fence

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/pricing-v2   **Base:** main @ 8e3b86a6
**Plan/spec:** none yet. Input: `docs/research/2026-11-04-pricing-feasibility.md` §5 (owner-approved direction 2026-11-04)

## Status (overwrite)
Kicked off 2026-11-04; brief written, nothing brainstormed.

## Next (overwrite)
Owner answers Brief §6; then `superpowers:brainstorming`, spec, lean plan.

## Interfaces this branch adds or changes
None yet. Likely: `plan` tier columns (migration **0097**), shared `planMonthlyCents(plan, activeClients)`, `pending_signup` website/clients-served, `PRICING` shape in `apps/site/content/pricing.ts`.

## Assumes from other branches
- **site-story** (merge first): `DEFAULT_CLIENT_PRICE_USD` 99 → 249 (`apps/site/src/lib/env.ts`); `content/home.ts` `PRICING_LINES*`/`COMMERCIAL`/opportunity example (20 × $199 = $1,912 cost, via `partnerExample`) and `components/home/commercial.tsx` read `PRICING.agency.extraSeatUsd`; rebase after it lands, then re-derive the strip and re-sign.
- **app-style**: no overlap.

## Decisions (owner-approved)
Direction only (research §5, summarised in the title + §1); details per §6.

## New backlog (target → item)
None yet.

## Owner verification steps
TBD.

## Brief

### 1. Scope
- **Graduated extra-client pricing** in the versioned plan (9a spec e3 versions, e6 seats; core spec §2.2 lists "Stripe Billing for wholesale seats", §10.6 MVP billing is superseded by 9a). Every consumer of the linear `base + extra × seatPrice` formula follows.
- **Annual**: agency $2,290/yr (9a spec Out of scope → in); direct $2,490/yr (9b spec f3: monthly only).
- **$249 direct client price** (site; app has no direct-billing path, see §2).
- **Agency-plan fence**: terms clause, sign-up asks website + number of clients served (Phase 10 sign-up), staff review of self-serving sign-ups.
- **Copy**: every $229/$99/$299 statement in site, app, help, emails, glossary, claims ledger.

### 2. Already built — reuse, don't rebuild
- `packages/db/src/schema/billing.ts` `plan` (code, version, `base_price_cents`, `included_seats`, `seat_price_cents`, trial, `stripe_{product,seat_product,base_price,seat_price}_id`, `is_current`, `features`); one current per code.
- `packages/billing/src/seed.ts`: standard v1 = 22900 / 3 / 9900 / 30 d.
- `plan-sync.ts` + `stripe-gateway.ts` `createPrices`: **two flat per-unit prices** (base qty 1, seat qty = extra), `recurring: { interval: 'month' }` hard-coded (l.147); Connect client prices also month-only (l.200). **No annual interval or tiers anywhere.** CLI `apps/worker/src/cli/billing-sync-plan.ts` (`billing:sync-plan`).
- `seats.ts` `syncSeats`: qty = max(0, active − included); up prorates, down at renewal. `access.ts` `billingAccess`/`seatLimitMessage`/reduced trial.
- Linear-formula consumers: `daily.ts:80` (MRR, drift l.62), `tools/billing.ts` `get_billing_summary`, `client-billing.ts` `get_client_revenue`, `platform-plan-move.ts` (now/after, `swapSubscriptionPlan`), `platform-billing.ts` `create_plan_version`, `agency-plan-change.tsx` email, `fake-gateway.ts`.
- Web: `/platform/billing` (`plan-editor`, `plan-agencies`, `signups-panel`); `/agency/settings/billing` (plan card) + `client-billing/` (agency sets Connect `default_price_cents`).
- Phase 10: `/sign-up` (`sign-up-form.tsx`: email, agency name, contact), `pending_signup` → `completePendingSignups`; `agency_profile.website` exists (wizard step 1, `save_agency_basics`); `get_signup_funnel`, `set_signups_paused`.
- Direct/pool clients: `/start` pool leads are assigned to an agency (`platform-leads.ts`) and billed by that agency via Connect. **The app prices no direct client**; $249 lives only in the site (`PRICING.business.monthlyUsd = siteEnv.clientPriceUsd`).
- Site: `content/pricing.ts` `PRICING` (single source), `pricing-page.ts`, `partners.ts` (`partnerExample`, `breakEvenClients`, linear), `home.ts`, `compare.ts:167`, `src/lib/json-ld.ts:37`, `legal/terms.md`.
- Copy: glossary `seat` (`packages/core/src/help/glossary.ts:124-129`, states $229/$99); help `docs/help/pages/{agency.settings.billing.agency,platform.billing.operator,...}.md`; claims ledger row `cap-publicPricing` (`docs/research/2026-10-29-phase-17c-claim-check.md:22`).

### 3. Binding decisions (flags = collision)
- **Billing 9:** Stripe Billing platform → agency; Connect Standard, direct charges, fee 0; nothing client-facing names Rival Monday. **Flag:** "$249 direct" has no billing owner unless the platform sells directly (contradicts "agency → client only").
- **CLAUDE.md/9a "$229 incl. 3 seats, $99/seat"** → amend at merge.
- **15c:** one `standard` plan; versions carry Ask/MCP; agencies move to current version at next billing (15c-3b move tool). **Flag:** grandfathering vs move; annual subscribers can't move "at next billing" monthly.
- **9a e3/e6:** prices versioned + synced to Stripe; adds prorate, removals at renewal.
- **Phase 10:** open self-sign-up, verify-then-create, wizard skippable. **Flag:** a hard review gate would break open trial; questions must stay light.
- **17:** claims only from ledger/code; vendors never named; copy sign-off via `pnpm copy:review`, ledger `docs/copy/signoff.json`.
- **7b:** spend guard default $15/client; the $49 gate uses measured cost (`/platform/costs`).

### 4. Backlog to fold in
- [ ] Review an annual billing option for agency → client subscriptions (9b ships monthly only) — *9b brainstorm*
- [ ] Soon (15c-3b plan moves): `syncSeats` takes no lock, a move racing it can leave the old seat qty on the new seat price … — *phase-15c3b* (same as 9a ledger `syncSeats` unlocked)
- [ ] 15c-3b: move `billing/plan-move-parts.tsx` to `platform/_components/`; web hard-codes `['ask','mcp']` instead of `PLAN_FEATURES` — *phase-15c3b*
- [ ] … sign-up email subject echoes the typed agency name (strip URL-like text?) — *phase-10*

### 5. In-flight workstreams
- **site-story** (61 files, apps/site/docs/design-lint): see Assumes; also `partners/page.tsx`.
- **app-style**: work file only.
- Next free migration: **0097**.

### 6. Open questions for the owner (design impact first)
1. **Stripe model for tiers.** (a) one graduated seat price, qty = extra clients (tiers 1–7 $79, 8–22 $59, 23+ $49), plan stores a tier array; (b) qty = all active clients with a $0 first tier of 3; (c) keep per-unit and pick the unit price ourselves. **Rec (a)**: base line untouched, `syncSeats` unchanged.
2. **$49 gate.** (a) current version has tiers $79/$59 only; a later version adds $49 once cost < $10 (owner publishes); (b) store $49 tier with `gated` flag, Stripe price created on unlock; (c) per-agency override. **Rec (a)**: versions already exist.
3. **Existing agencies.** (a) new v2, moved at next billing via 15c-3b tool (cheaper for all with > 3 clients); (b) grandfather v1. **Rec (a)**.
4. **Agency annual.** (a) $2,290/yr base + monthly graduated seats (mixed intervals: verify Stripe support, else two subscriptions); (b) annual base + annual seats billed yearly with proration; (c) defer. **Rec (a)** if Stripe allows, else (c).
5. **Client-direct $249/$2,490.** Agencies set Connect prices. (a) $249 is site-only (pool clients go to an agency, which sets its price; $249 = suggested retail/MSRP); (b) a platform "house" agency bills direct clients at $249/$2,490 (new Connect/annual work); (c) add annual to Connect for all agencies. **Rec (a)** now, annual Connect as backlog.
6. **Split.** (a) one phase; (b) pv2a = plan tiers + annual + migration + plan move, pv2b = fence + site/help/copy. **Rec (b)**.
7. **Fence strictness.** (a) terms clause + two sign-up fields only; (b) + staff review flag on `/platform/billing` sign-ups (only client's domain = agency website), no blocking; (c) block activation until reviewed. **Rec (b)**.
8. **Copy path.** (a) all copy reads plan/`PRICING` (help states no numbers except glossary from seed), re-sign via `copy:review`, update ledger row; (b) hand-edit strings. **Rec (a)**.
