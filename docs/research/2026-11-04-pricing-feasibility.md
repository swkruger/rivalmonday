# Pricing feasibility — agency $229 vs client-direct $299 (2026-11-04)

**Question.** Is $229/mo per agency (3 active clients included, $99 per extra client) plus a $299/mo client-direct price viable against competitors, with a healthy margin and a reserve for emergencies? Why wouldn't a business just sign up as an "agency" for $229?

Note: in our product, a **seat = one active client**, not a user login. Users are unlimited.

## 1. What it costs us

### 1.1 Measured costs (cs_dev, October 2026, `llm_call` + `vendor_call`)
| Line | Oct 2026 | Notes |
|---|---|---|
| AI (OpenRouter + Jev) | ≈ $5.2 | $3.4 of it is `llm_decisions` from a one-off re-ask wave/backfill; briefs ≈ $0.004–0.04 each; Ask ≈ $0.014 per answer |
| Vendors (DataForSEO, ScrapeCreators, Stadia, Postmark) | ≈ $10.3 | Maps live $5.5 (rank scans + discovery), reviews $2.5, ads library $0.9, GBP $0.5 |
| **Total** | **≈ $15.5** | about 5 active clients with rivals, plus testing → **≈ $3 per client per month** |

### 1.2 Planning figures per active client per month
| Line | Typical | High | Basis |
|---|---|---|---|
| Weekly rank scan (7×7 grid × 5 keywords = $0.49) | $2.10 | $4.20 | `rankings/scan.ts`; high = Scan now used weekly |
| Rival data (GBP, reviews, ads, jobs, 5 rivals) | $1.00 | $2.00 | measured rates in `2026-09-30-phase-2-vendor-apis.md` |
| Discovery (≤ $3/run; monthly refresh + 1 manual/week) | $1.00 | $6.00 | spec decision |
| AI (briefs, alerts, Ask, decisions) | $1.50 | $5.00 | measured + heavy Ask use |
| Email, evidence storage | $0.20 | $0.50 | |
| **Total** | **≈ $6–8** | **≈ $15–18** | **hard ceiling = spend guard: $15 limit, auto-pause at 130 % = $19.50** |

The spend guard makes the worst case **bounded**: a client cannot cost more than about $19.50 a month without staff raising the limit.

### 1.3 Fixed platform costs per month (estimates; check the first invoices)
| Item | Estimate |
|---|---|
| Vercel Pro + usage | $20–50 |
| Railway worker (1 replica, Playwright, always on) | $30–60 |
| Neon production (always-on compute from the worker) | $25–80 |
| Postmark | $15–20 |
| Sentry, Stadia, R2, domains | $5–50 |
| **Total** | **≈ $100–260; plan with $300** |

Payments: Stripe card 2.9 % + $0.30 plus Billing 0.7 % ≈ **3.6 % + $0.30** per invoice.

## 2. Unit economics at today's prices

Agency price = $229 + $99 × (clients − 3). COGS at $8 typical and $19.50 ceiling per client.

| Active clients | Agency pays | Per client | Margin (typical) | Margin (ceiling) |
|---|---|---|---|---|
| 1 | $229 | $229 | $212 (93 %) | $201 (88 %) |
| 3 | $229 | $76 | $197 (86 %) | $163 (71 %) |
| 5 | $427 | $85 | $372 (87 %) | $314 (74 %) |
| 10 | $922 | $92 | $809 (88 %) | $694 (75 %) |

Client-direct at $299: about $280 (94 %) typical and $268 (90 %) at the ceiling.
Fixed costs ($300) are covered by **2 paying agencies**.

**Pilot (≤ 20 agencies × ≤ 3 clients), all paying:** $4,580 MRR − COGS $480 − Stripe $171 − fixed $300 ≈ **$3,630/mo (79 %)**. At the spend-guard ceiling for every client: ≈ $2,940 (64 %).

**Conclusion: margin is not the problem.** Costs are small, measured, and capped. The real risks are market fit at the price and how the plans are structured.

## 3. Where we sit against the market (sourced scan, 2026-11-04; [3P] = third-party, unverified)

| Group | Price points |
|---|---|
| Per-location tools agencies compare against | AgencyAnalytics $20/client; Semrush Local $30–60/loc; BrightLocal $41–65/loc; Moz Local $20–40 [3P]; Synup $18–30/loc at volume |
| Flat-fee agency platforms | DashClicks $199; HighLevel $97 (3 sub-accounts) / $297 / $497; Synup Premium $299 (≤ 10 loc); Search Atlas $99–999 |
| **Cheap "AI competitor brief" niche (closest format)** | LocalSpy AI Pro $29 / Agency $79 (5 workspaces, white-label, "Monday Morning Alerts"); MyLocalOS $49 / $99 / $199 (25 businesses, Monday AI briefing); Competely $39–99 (cited weekly briefs, not local) |
| Direct-to-SMB premium | RivalMappd $299 / $549 / $799 (includes done-for-you content); Birdeye ≈ $299–499/loc [3P]; Podium $399+ [3P] |
| What agencies charge SMBs | Local SEO retainers commonly $500–1,000/mo; average ≈ $799 (year 1) → $1,569 (years 2–3). Resale markup rule of thumb 2–3× (unverified as a norm) |

What this means:
1. **The $229 platform fee is fine.** It sits with DashClicks, HighLevel and Synup, and white-label is included (others gate it at $299–499).
2. **$99 per extra client is the weak point.** Per-client cost *rises* with volume ($76 → $92), while the market gives volume discounts. LocalSpy and MyLocalOS make "weekly AI rival brief for 5–25 businesses at $79–199" look cheap next to ours. We win on depth (evidence store, geo-grid, ads, Friday, MCP, "no evidence, no claim"), but $99 for every extra client is hard to defend once an agency has 10 or more.
3. **$299 direct is top of the SMB self-serve band.** It matches RivalMappd Starter and Birdeye, but RivalMappd includes done-for-you work. It is defensible only as "analyst-grade competitor intelligence", not as a tracker.

## 4. The "why not just start an agency?" problem

What the leak looks like: a business self-signs up as an agency (an open trial is allowed) and pays $229 instead of $299, saving $70 a month. Three businesses could also share one plan ($76 each).

How big it is:
- **Economically small.** We still keep about 93 % on that account. It is a revenue leak, not a loss.
- **Friction is real.** A fake agency has to set up branding, Stripe Connect and invites, and gets an agency-shaped product. For $70 a month, few owners will bother. Buying clubs of three are rare and visible (three unrelated businesses, one payer).
- **During the pilot it can't happen**: agencies are invited.

Ways to close it, cheapest first:
1. **Shrink the gap.** Price direct at **$249** (the site already supports `NEXT_PUBLIC_CLIENT_PRICE_USD=249`). A $20 saving is not worth the agency setup work.
2. **Fence the agency plan.** Terms: the plan is for businesses that provide marketing services to others. During verify-then-create, ask for the agency's website and "how many clients do you serve". Staff can review sign-ups where the agency's own business is also its only client.
3. **Do not drop direct below agency resale.** Agencies are the main channel. The partners page shows an example resale of $199, and a direct price under what agencies charge would undercut them. Keep the direct price at or above the suggested agency retail price (an MSRP).

## 5. Recommendation

| Item | Today | Proposed |
|---|---|---|
| Agency platform fee | $229 incl. 3 clients | **keep $229 incl. 3 clients** |
| Extra clients | $99 each | **Volume tiers: clients 4–10 at $79, 11–25 at $59, 26+ at $49** |
| Client-direct | $299 | **$249/mo** (or $2,490/yr); suggested agency retail band $199–299 |
| Annual agency option | none | $2,290/yr (2 months free); improves cash and the reserve |

Margins under the proposal (COGS $8 typical / $19.50 ceiling, Stripe included):
- $79 extra client: 86 % / 72 %
- $59 extra client: 83 % / 63 %
- $49 extra client: 80 % / 57 %. Only offer this tier once measured cost per client stays under $10.
- Example: an agency with 10 clients pays $229 + 7 × $79 = $782 ($78/client, was $92). An agency with 25 clients pays $1,667 ($67/client, was $2,407 = $96/client).
- Direct at $249: ≈ 93 % / 88 %.

**Margin policy (for income plus emergencies):**
- Price to keep **≥ 80 % gross margin at typical cost and ≥ 60 % at the spend-guard ceiling**. Every tier above meets this, except $49, which is gated on measured cost.
- **Reserve:** move 10 % of monthly revenue into a separate account until it holds **3 months of fixed costs plus one worst-case month** (every client at $19.50). At pilot scale that is ≈ 3 × $300 + 60 × $19.50 ≈ **$2,100**.
- Keep the spend guard's $15 default. Raise a client's limit only when its price covers it.
- **Review prices after the pilot** using `/platform/costs` (real cost per client) and seat counts per agency.

## 6. Caveats
- The fixed-cost figures are estimates. Replace them with the first month of prod invoices.
- Third-party ([3P]) competitor prices must be verified before any marketing use (claims ledger; vendors are never named on the site).
- Changing the seat price is a new plan version (Phase 15c: agencies move to it at next billing). Volume tiers would need graduated pricing in Stripe and a change to the plan model (today: one `seat_price_cents`).
