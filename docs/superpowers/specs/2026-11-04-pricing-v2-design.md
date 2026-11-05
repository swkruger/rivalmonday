# pricing-v2 — design (new decisions and interfaces only)

**Input:** `docs/research/2026-11-04-pricing-feasibility.md` §5 (owner-approved 2026-11-04). Brief: `docs/work/pricing-v2.md`.
**Builds on:** 9a spec (`2026-10-12-phase-9a-platform-billing-design.md`) e3 plan versions, e6 seats; 15c-3b plan moves; Phase 10 sign-up.
**Owner said "just go"** (2026-11-04): every decision below is the brief's recommendation or Claude's call (marked *call*).

## Decisions

| # | Decision |
|---|---|
| D1 | **Split:** `pv2a` = plan tiers, yearly agency billing, plan v2 and the move (`packages/billing`, `db`, `tools`, web billing pages, emails). `pv2b` = agency-plan fence, site, help, glossary, claims (`apps/site`, sign-up, help). One branch, two task groups; pv2b starts after site-story merges. |
| D2 | **Graduated seat price.** A plan's extra-client price is a tier list, priced on *extra* clients (active − included). Stripe price = `billing_scheme: 'tiered'`, `tiers_mode: 'graduated'`. The base line, `syncSeats` quantity rule (`max(0, active − included)`) and the seat-line metadata (`rm_role=seat`) are unchanged. |
| D3 | **Standard v2** = $229/mo or $2,290/yr base, 3 included clients, tiers: extra 1–7 (clients 4–10) $79, extra 8+ (clients 11+) $59. 30-day trial, features ask+mcp. |
| D4 | **$49 gate = a later plan version** (v3 adds "extra 23+ (clients 26+) $49"). The owner publishes it when `/platform/costs` shows cost per client < $10 for a full month. No gate flag in the data. |
| D5 | **Existing agencies move to v2** with the 15c-3b move tool (next billing date, no proration). v1 stays in the table (history); nobody is grandfathered. Every agency with > 3 clients pays less. |
| D6 | **Yearly agency billing (*call*: option b, no Stripe preview features).** A plan version may carry a yearly base price; seats on a yearly subscription use a yearly graduated price whose tier amounts are 12 × the monthly ones (the discount is on the base only). One subscription, one interval. **Adding clients on yearly** is prorated and invoiced at once (`proration_behavior: 'always_invoice'`); removals take effect at renewal (as today). |
| D7 | **Interval changes (*call*).** The agency picks monthly or yearly at Checkout. Monthly → yearly is self-serve from the billing page: immediate, prorated, invoiced at once. Yearly → monthly is not self-serve: the billing page says to contact support, and staff do it at renewal (backlog: self-serve scheduled switch). |
| D8 | **Client-direct $249 is the site's suggested price only.** The app still prices no direct client: pool clients go to an agency, which sets its own Connect price. **$2,490/yr is not shown anywhere (*call*)**: Connect billing is monthly only, so the site would promise something nobody can buy. Backlog: yearly Connect client billing; then show it. |
| D9 | **Fence (soft).** (1) Terms clause: the agency plan is for businesses that provide marketing services to other businesses. (2) Sign-up asks *agency website* (optional URL) and *clients you serve today* (required: `0`, `1–5`, `6–20`, `21+`). (3) `/platform/billing` sign-ups get a **Check** flag, never a block: clients served = `0`, **or** the agency's first client's website host equals the agency website host. Staff read it; nothing else changes. |
| D10 | **Prices in copy come from data.** App copy reads the plan (`get_billing_summary`); site copy reads `PRICING`; help guides state no figures; the glossary `seat` entry is built from the seed plan. Every changed string is re-signed in `pnpm copy:review`; claims-ledger row `cap-publicPricing` updated. |
| D11 | **One pricing function.** `@cs/billing` exports the only implementation of seat and plan totals; every consumer of the old linear formula calls it. The site (no `@cs/*` billing import) keeps its own copy in `content/pricing.ts`, pinned by a test against the seed values. |

## Data (migration: next free number, 0097 at kickoff)

```sql
ALTER TABLE plan
  ADD COLUMN seat_tiers jsonb,
  ADD COLUMN base_price_year_cents integer CHECK (base_price_year_cents IS NULL OR base_price_year_cents >= 0),
  ADD COLUMN stripe_base_price_year_id text,
  ADD COLUMN stripe_seat_price_year_id text;
UPDATE plan SET seat_tiers = jsonb_build_array(jsonb_build_object('upTo', NULL, 'unitCents', seat_price_cents));
ALTER TABLE plan ALTER COLUMN seat_tiers SET NOT NULL,
  ADD CONSTRAINT plan_seat_tiers_check CHECK (jsonb_typeof(seat_tiers) = 'array' AND jsonb_array_length(seat_tiers) BETWEEN 1 AND 5);
ALTER TABLE plan DROP COLUMN seat_price_cents;

ALTER TABLE agency_billing
  ADD COLUMN billing_interval text NOT NULL DEFAULT 'month' CHECK (billing_interval IN ('month', 'year'));

ALTER TABLE pending_signup
  ADD COLUMN website text,
  ADD COLUMN clients_served text CHECK (clients_served IS NULL OR clients_served IN ('0', '1-5', '6-20', '21+'));
ALTER TABLE agency_onboarding
  ADD COLUMN clients_served text CHECK (clients_served IS NULL OR clients_served IN ('0', '1-5', '6-20', '21+'));
```
- Existing v1 Stripe seat prices stay per-unit; a one-tier list prices identically, so v1 needs no re-sync. `plan_seat_price_cents_check` goes with the column.
- `pending_signup.website` is copied to `agency_profile.website` (when empty) and `clients_served` to `agency_onboarding` by `completePendingSignups`.
- No new table ⇒ no `TABLE_CLASS` change; the new columns join existing world rows.

## Interfaces

```ts
// @cs/billing pricing.ts — the only pricing maths (D11)
export interface SeatTier { upTo: number | null; unitCents: number } // upTo = cumulative EXTRA clients; last tier null
export const seatTiersSchema: z.ZodType<SeatTier[]>; // 1–5 tiers, ascending upTo, only the last null, unitCents 0..10_000_000
export type BillingInterval = 'month' | 'year';
export function seatCents(tiers: SeatTier[], extraSeats: number): number;           // graduated sum, monthly
export function planCents(p: { basePriceCents: number; basePriceYearCents: number | null; includedSeats: number; seatTiers: SeatTier[] },
  activeClients: number, interval: BillingInterval): number;                        // year: yearly base + 12 × seatCents
export function monthlyEquivalentCents(cents: number, interval: BillingInterval): number; // MRR: year → round(/12)
export function describeTiers(includedSeats: number, tiers: SeatTier[]): { fromClient: number; toClient: number | null; unitCents: number }[];
```
- `PlanPriceInput`: `seatPriceCents` → `seatTiers: SeatTier[]`; add `basePriceYearCents: number | null`. `CreatedPrices` adds `basePriceYearId`, `seatPriceYearId` (null when no yearly base).
- `createPrices`: seat prices are graduated (`tiers: [{ up_to, unit_amount }]`, last `up_to: 'inf'`); yearly prices use `recurring.interval: 'year'` and `unit_amount × 12` per tier. Metadata adds `interval`.
- `CheckoutSessionInput` adds `interval: BillingInterval` (callers pass the matching price ids). `swapSubscriptionPlan` input unchanged (callers pick the ids for the agency's interval). New `switchSubscriptionInterval(subscriptionId, { basePriceId, seatPriceId, seatQuantity }): Promise<{ currentPeriodEnd: Date | null }>` = swap with `proration_behavior: 'always_invoice'`. `updateSeatQuantity` opts add `invoiceNow?: boolean` (→ `always_invoice` when prorating).
- Fake gateway mirrors all of it (tiers stored, interval on subscriptions).
- Tools (Zod in/out; `runTool` for writes):
  - `create_plan_version` (platform): `seatPriceCents` → `seatTiers` (`seatTiersSchema`), add `basePriceYearCents` (nullable).
  - `get_billing_summary`, `list_plans`, `get_client_revenue`, plan-move preview: replace `seatPriceCents` with `seatTiers` + `basePriceYearCents`; summary adds `interval` and `tiers: describeTiers(...)`.
  - `start_agency_checkout` (existing checkout tool): add `interval` (default `'month'`; `'year'` refused `conflict` "Yearly billing isn't available on this plan." when the plan has no yearly base).
  - New `switch_billing_to_yearly` (agency admin, write): refuses unless state `active` and interval `month` and the plan has a yearly base; refuses under `ctx.support`. Sets `billing_interval = 'year'` after Stripe succeeds.
  - Sign-up action: add `website` (optional, http(s) URL, ≤ 200) and `clientsServed` (enum) to its Zod input.
  - `get_signup_funnel` / sign-ups panel rows add `clientsServed`, `website`, `check: boolean` (D9 rule; host compare = lowercase host without `www.`).
- `daily.ts` MRR = `monthlyEquivalentCents(planCents(...), interval)` minus discount; `seats.ts` passes `invoiceNow: interval === 'year'` on increases.
- Web: plan editor = tier rows (from client N to M, price) + optional yearly base; agency billing card shows "$229/mo (or $2,290/yr) · 3 clients included · clients 4–10 $79 each · 11+ $59 each" from `describeTiers`; Checkout gets a Monthly / Yearly choice when the plan has a yearly base; "Switch to yearly" button (confirm dialog shows the prorated amount from `upcomingInvoice` is *not* required — copy says "You'll be charged the prorated difference today").
- Email `agency-plan-change`: price lines from `describeTiers`.
- Site `PRICING.agency`: `{ pilot, monthlyUsd: 229, yearlyUsd: 2290, seatsIncluded: 3, extraClientTiers: [{ toClient: 10, usd: 79 }, { toClient: null, usd: 59 }], trialDays: 30 }`; `partnerExample` uses a graduated sum; `breakEvenClients` unchanged in shape.

## Copy (owner signs in `copy:review`; draft)
- Agency billing card: "{base}/mo · {included} clients included · clients {from}–{to}: {price} each · clients {from}+: {price} each". Yearly: "{yearBase}/yr" replaces the first part.
- Checkout choice: "Monthly — $229/mo" / "Yearly — $2,290/yr (2 months free)". The "(2 months free)" part shows only when yearly base ≤ 10 × monthly base.
- Switch: button "Switch to yearly"; confirm title "Switch to yearly billing?"; body "You'll pay {yearBase} for the year, less what's left of this month, today. Extra clients are billed yearly too." Yearly → monthly hint: "To go back to monthly billing, contact support before your renewal date."
- Yearly seat add: existing seat-limit/adding-client copy plus "On yearly billing, a new client is charged for the rest of your year today."
- Sign-up: "Your agency's website (optional)"; "How many clients do you look after today?" options "None yet", "1–5", "6–20", "21 or more"; fine print "Rival Monday's agency plan is for businesses that market other businesses."
- Terms (`apps/site/legal/terms.md`, new clause): "The agency plan is for businesses that provide marketing or related services to other businesses. A business that wants Rival Monday for itself should use a client plan through an agency or our own sign-up."
- Platform sign-ups: column "Check"; tooltip "No clients yet, or the agency's first client shares its website."

## Not in scope (backlog on merge)
- Yearly Connect client billing (and then $2,490/yr on the site).
- Self-serve yearly → monthly (scheduled switch at renewal).
- Publishing v3 with the $49 tier (owner action, D4).
- Hard review gate on sign-ups.

## Review focus
1. Every old `seatPriceCents` consumer now calls `@cs/billing` pricing (grep is empty after pv2a).
2. Yearly prices: 12 × each tier, interval metadata, `always_invoice` only on increases and interval switch.
3. MRR and revenue reads for yearly agencies (÷ 12), discount handling unchanged.
4. Plan move picks the price ids that match the agency's interval; no proration.
5. Sign-up fields validated server-side; `check` never blocks anything; no new data reaches client roles.
