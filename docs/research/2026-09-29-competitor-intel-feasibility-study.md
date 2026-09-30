# Competitor Intelligence for Local-Service SMBs — Deep Dive, App Concept, Business Case & Feasibility Study

*Date: 2026-09-29 · Status: draft for review · Codename: CompetitorSpy*
*Owner context: agency-owned product; the agency primarily serves local-service businesses (HVAC, plumbing, dental, legal, home services).*

> **Evidence note.** Market, pricing and legal findings come from desk research on 2026-09-29. Vendor prices move often — treat them as ±30% and re-check before contracting. Figures marked **[E]** are estimates/model outputs; everything else is sourced (sources listed in Appendix A). Legal points are not legal advice — US counsel sign-off is a launch prerequisite.

---

## 0. Executive summary

**Verdict: CONDITIONAL GO.** Build it — technically cheap, legally manageable, and no one sells the exact product — but only as a *wholesale-to-agencies* business validated first on the owning agency's own clients. On its own book the agency cannot fund the product; the business case depends on selling to other agencies.

| Question | Answer |
|---|---|
| **Is it technically feasible?** | Yes. MVP ≈ 10–12 weeks for 1–2 devs with AI coding tools. All core data sources have a compliant or low-risk path; two "obvious" ones (Google Places API, Yelp API) are unusable and must be designed around. |
| **Is it economically viable?** | Unit economics are excellent: tech COGS ≈ **$3–13/client/month, ≈ $7 mid** at ~100 clients (AI ≈ $1–3 of that). Gross margin 70–90%+ at every price point. |
| **Is there a market gap?** | Yes. Closest rivals are direct-to-SMB (RivalMappd, $299–799/mo, monthly; RivalTracker, UK weekly brief) with **no white-label**; white-label platforms (GoHighLevel, Synup, AgencyAnalytics) have **no competitor intel**. Nobody combines cross-channel "moves", evidence-linked briefs, US ad history and deep white-label. |
| **What's the main risk?** | **Revenue scale, not margin.** A 60-client agency at 40% attach ≈ $3.6k MRR — not enough to maintain the product. Break-even needs ≈ **17 external agencies (~250 wholesale seats)** in the lean case. Second risk: incumbents (Birdeye, BrightLocal, GoHighLevel) adding the feature. |
| **Recommended channel** | **Phase 1:** own clients (pilot + upsell, and use briefs as an agency *sales/prospecting* weapon). **Phase 2 (month ~6–9):** wholesale white-label to other local-service agencies, distributed via GoHighLevel/Vendasta marketplaces + direct. **Direct self-serve SMB: not now** (CAC $300–800, 4–7% monthly churn). |
| **Investment** | Lean: ≈ $30k build + ≈ $2.5k/mo run; cumulative trough ≈ −$52k; EBITDA-positive ≈ month 16–18 **if** wholesale lands 3 agencies/month from month 13 **[E]**. |

---

## 1. Scope and method

1. **Deep dive** into the two systems described in the source context — (A) the five-stage intelligence engine and (B) the five-layer white-label platform — decomposed into discrete features.
2. **Market scan** of ~40 adjacent products (local SEO, reputation, change monitoring, CI, ad intel, agency white-label platforms, AI-native SMB competitor tools).
3. **Data-source feasibility**: API availability, ToS, legal risk and cost for each source.
4. **Market sizing & unit economics**: Census SUSB counts, agency demographics, LLM/infra pricing, SaaS benchmarks, 24-month P&L.
5. **Synthesis**: feature selection for SMB, app concept, business case, feasibility verdict, validation gates.

Why SMB local services over the other audiences named in the original brainstorm (content creators, enterprise):
- **Enterprise** is served by Crayon/Klue/Kompyte ($20–40k/yr) with long sales cycles; no fit for an agency-owned product.
- **Creators** care about content cadence, sponsorships and audience growth — different data (YouTube/TikTok, mostly API-restricted or scrape-only) and no agency channel we own.
- **Local-service SMBs** match the owner's existing client base and distribution, have concrete, monetisable competitor signals (price, promos, territory, reviews, ads), and are underserved by today's tools.

---

## 2. Deep dive — System A: the Intelligence Engine

The engine turns thousands of raw page changes into 3–5 actionable sentences. Decomposed into features:

### Stage 1 — Filter noise
| # | Feature | What it really takes |
|---|---|---|
| A1 | Snapshot capture | Headless browser (Playwright) → HTML, extracted text, full-page screenshot, SHA-256 hash, timestamp. |
| A2 | Boilerplate stripping | Remove nav, scripts, cookie banners, timestamps, rotating testimonials. Readability-style extraction + per-site learned "volatile region" masks (regions that change every crawl get auto-ignored). |
| A3 | Semantic diff | Chunk text, embed, compare chunk-to-chunk; only flag chunks whose *meaning* changed, plus a hard rule layer for numbers (prices, %, dates) so "$49 → $39" is always caught even if embeddings say "similar". |
| A4 | Cross-channel dedupe | Merge the same promo seen on site + ad + social into one *event* (entity/offer matching on normalised price + service + date window). |

### Stage 2 — Score & rank
| # | Feature | Notes |
|---|---|---|
| A5 | Type tagging (cheap LLM) | Taxonomy: price change, promo, new/removed service, service-area change, hiring, new location, ad launch, review spike, content/blog, cosmetic. |
| A6 | Deterministic scoring | `score = type_weight × size × relevance × novelty`, computed in plain code (auditable, testable, cheap). |
| A7 | Relevance | Overlap with the client's own services + service area (ZIPs/radius). |
| A8 | Novelty | Recurrence detection — "they run this promo every month" gets discounted. |
| A9 | Routing | High → instant alert; medium → weekly brief; low → archive for trends. |

### Stage 3 — Connect the dots
| # | Feature | Notes |
|---|---|---|
| A10 | "Moves" detection | Group a competitor's events over 30–90 days into named patterns (e.g., careers post + new service-area page + new ads = *expanding into your territory*). MVP: 4–6 rule-based move templates; later: learned. |
| A11 | Review theme clustering | Cluster competitor + client reviews into complaint/praise themes ("slow response", "hidden fees"). |
| A12 | Client benchmarking | Client vs each competitor per theme (share of reviews, rating trend). |

### Stage 4 — Write the brief
| # | Feature | Notes |
|---|---|---|
| A13 | Structured brief (strong LLM) | Headline, what changed, why it matters, recommended action, confidence, upsell tag. |
| A14 | **"No evidence, no claim"** | Every sentence references a stored evidence ID; a verifier pass checks quoted values actually appear in the referenced snapshot; unsupported sentences are dropped. |
| A15 | Brand voice | Per-tenant tone, preferred terms, banned phrases. |

### Stage 5 — Learn from feedback
| # | Feature | Notes |
|---|---|---|
| A16 | Feedback capture | Agency edit/delete/approve; client open/click. |
| A17 | Per-industry weight tuning | Shift type/size weights per vertical from feedback. |
| A18 | Cost controls | Cheap model for tagging, strong model only for writing (implicit in the design). |

**Deep-dive findings that change the original design:**
- **The sample brief overclaims.** "*Running in Facebook ads within 10 miles of you*" cannot be evidenced: Meta does not disclose targeting/geo-radius for US commercial ads. The brief must say "*running Facebook/Instagram ads (targeting not disclosed)*". This is precisely what A14 exists to catch — the verifier must treat geo-targeting claims as unsupported unless an evidence record contains them.
- **A14 is also the primary legal defence** (defamation/trade-libel on named competitors): truth is a complete defence, so claims must be quoted observations with timestamps + snapshot hashes, interpretations labelled "possible signal", never statements about motive.
- **A3 needs a numeric rule layer.** Pure embedding similarity misses small-but-crucial number changes; combine semantic diff with explicit price/number extraction.
- **A17 needs data volume** (hundreds of feedback events per vertical) that won't exist until ~50+ clients — defer the learning, but capture the feedback from day one.

---

## 3. Deep dive — System B: the White-Label Platform

| Layer | # | Feature |
|---|---|---|
| **1. Brand identity** | B1 | Logo, colours, fonts, favicon per agency |
| | B2 | Co-branding (client logo next to agency's) |
| | B3 | Renameable modules ("Market Pulse", "Rival Report") |
| | B4 | Agency-branded help docs and onboarding emails |
| **2. Domain & email** | B5 | Custom domain (e.g. intel.agency.com) with automatic SSL — login, portal, all links |
| | B6 | Branded email sender with SPF/DKIM/DMARC; replies route to account manager |
| | B7 | Asset URLs (screenshots, PDFs) on the agency's domain |
| **3. No vendor fingerprints** | B8 | No "powered by" anywhere (login, 404, error pages) |
| | B9 | Clean PDF metadata, filenames, page titles, script names |
| | B10 | Crawler still identifies honestly as the vendor (hidden from clients, not from monitored sites) |
| **4. AI voice** | B11 | Per-agency brand voice (formal/friendly/blunt, terms, banned phrases) |
| | B12 | Sign-offs with account manager name + booking link |
| **5. Business controls** | B13 | Rebilling via Stripe Connect (agency sets retail; vendor bills wholesale) |
| | B14 | Agency's own ToS/privacy in portal; DPA between vendor and agency |
| | B15 | Support routing to agency first, escalation to vendor |
| | B16 | Client access: magic link / Google sign-in, permissions (e.g. briefs-only) |
| **Pricing lever** | B17 | Starter (branded PDF/email) → Pro (+domain, portal, sender) → Agency+ (+rebilling, renaming, API, co-branding) |
| **Architecture** | B18 | Multi-tenant from day one: every setting keyed to an agency; hostname → agency routing |

**Deep-dive findings:**
- **White-label depth is partly commoditised.** BrightLocal, AgencyAnalytics and Synup already include logo + custom domain + branded email at low or no cost. B1/B5/B6 are *table stakes* for selling to agencies, not a differentiator. The differentiator is white-label **combined with** competitor intel, plus B11 (AI voice) and B13 (rebilling) — only GoHighLevel matches the latter.
- **B5/B7 are cheap to build**: Cloudflare for SaaS custom hostnames — first 100 free, then $0.10/hostname/month.
- **B13 (Stripe Connect)** costs ≈ $2/active account/month + 0.25% + 25¢ per payout — trivial, but it adds real product surface (disputes, tax, onboarding). Only worth it once external agencies exist.
- **B18 is the one non-negotiable day-one item**, even while the only tenant is the owning agency. Retro-fitting tenancy is a rewrite.

---

## 4. Market landscape (summary)

### 4.1 Closest competitors

| Product | What overlaps | What's missing | Price |
|---|---|---|---|
| **RivalMappd** | Same verticals (contractors, HVAC, dental, med spa, legal); GBP, reviews, rankings, Meta + Google ads; plain-English strategy brief | Monthly cadence; direct-to-SMB, **no white-label found**; bundled with content services; no website/promo snapshots | $299 / $549 / $799 mo |
| **RivalTracker** (UK) | **Weekly Monday AI brief**, website promo/price tracking, relevance ranking + next step | UK/EU hospitality skew; no ads/social; no agency channel | £29 / £59 / £99 mo |
| **Birdeye Competitors AI** | AI competitor benchmarking on reviews + social; theme extraction; **reseller programme** | No website/promo/service-area/ad tracking; no evidence-linked brief; $299+/location | $299–449/loc/mo |
| **Localo / Grid My Business** | AI summaries of competitor GBP changes, agency-oriented | GBP-only; shallow white-label | $24–149 mo |
| **Yext Scout** | Hyper-local benchmarking across listings/reviews/social/websites/AI answers | Enterprise pricing and complexity | ~$20k/yr |
| **Visualping Reports** (Mar 2026) | Scheduled AI briefing across monitored pages | Horizontal, no local/review/ad context, noisy; no white-label | ~$100–140/mo |

### 4.2 Table stakes vs differentiation

**Table stakes (must have, won't win deals alone):** geo-grid/rank tracking vs competitors; review count/rating benchmarking; AI summaries of website changes; basic white-label (logo, domain, branded email); competitor GBP change feeds.

**Differentiators (nobody combines these):**
1. **Cross-channel "moves"** — inference ("expanding into your territory") instead of per-channel change lists.
2. **Evidence-linked briefs** — every claim → snapshot. Addresses agencies' fear of AI hallucinations in client reports and the noise complaints about Visualping.
3. **Multi-factor noise scoring** tuned to local-service verticals (price, promo, service-area, careers pages as structured signals).
4. **US ad history** — Meta's API excludes US commercial ads and inactive US ads vanish from the library, so weekly snapshots create an archive nobody else offers at SMB prices.
5. **Deep white-label + competitor intel** in one product, with AI brand voice and rebilling.

### 4.3 Threats
1. **Birdeye** extends Competitors AI to websites/ads and pushes via resellers (high likelihood, high impact).
2. **BrightLocal** AI Insights (Apr 2026) adds competitor change alerts — not on its public roadmap yet.
3. **GoHighLevel** (or a GHL marketplace app) adds competitor briefs to its reputation module.
4. **DIY erosion**: Visualping Reports or Apify/ScrapeCreators + LLM templates let savvy agencies approximate a brief for tens of dollars.
5. **Data-access fragility**: Meta/Google blocking, vendor litigation (Google v. SerpApi dismissed Jul 2026; Reddit v. SerpApi survived dismissal Jul 2026).

**Pre-build check (unverified gap in research):** browse the GoHighLevel and Vendasta marketplaces for an app already doing this.

---

## 5. Data-source feasibility

| Source | Verdict | MVP path | Key constraint |
|---|---|---|---|
| Competitor websites + screenshots | 🟢 Green | Self-hosted Playwright; honest User-Agent with contact URL; honour robots.txt; ≤1 req/few sec/host | Cloudflare now blocks many bots by default — don't brand as an AI crawler; treat blocks as final (record "blocked"), never bypass anti-bot (DMCA §1201 exposure). Store internal evidence; show crops/diffs to clients, not full mirrors. |
| Google Business Profile + reviews | 🟡 Yellow | DataForSEO (≈$0.075/1k reviews) with Apify/Outscraper fallback, behind an abstraction | **Google Places API is unusable**: max 5 reviews/place; ToS bans storing content > 30 days and building derived datasets. Store only `place_id` from Google. Vendor-chain risk. |
| Google Ads Transparency Center | 🟢 Green | DataForSEO ads endpoints ($0.0006–0.002/request) or SerpApi | No official API; no spend/keywords/targeting outside EEA. |
| Meta Ad Library (US) | 🟡 Yellow | Third-party logged-off scraper (Apify, ScrapeCreators) weekly per competitor Page; store creatives + first/last seen | **API excludes US commercial ads**; targeting/geo not disclosed for US ads. |
| Instagram | 🟢 Green | Official Graph API Business Discovery | Only Business/Creator accounts (most local businesses). |
| Facebook Page posts | 🟡 Yellow | Defer; later Page Public Content Access (app review) or Apify | Slow/uncertain approval. |
| Jobs / hiring | 🟢 Green | Careers pages (crawler) + Google Jobs via SERP API | Don't scrape Indeed directly. |
| Local rankings / geo-grid | 🟢 Green | DataForSEO Maps SERP with coordinates (7×7 × 5 kw ≈ $0.15–0.50/mo) | One scan ranks client + all competitors. |
| Yelp | 🔴 Red | **Exclude.** At most link out | API ToS bans storage > 24h, third-party/commercial/analysis use and sending content to AI. |
| Healthgrades / Zocdoc | 🔴 Red | Exclude | ToS + health-data sensitivity. |
| Angi / Avvo / Nextdoor / TikTok | 🟡 Defer | — | Low value or unclear ToS. |
| LinkedIn | 🔴 Red | Exclude | Actively litigates scrapers. |

### 5.1 Legal & privacy summary
- **Crawling public sites (US):** low risk post-*Van Buren*/*hiQ*/*Meta v. Bright Data*, provided no logins, no fake accounts, no bot-protection bypass, polite rate limits. EU/UK: medium (GDPR on names/photos on team pages; contract-based scraping bans per *Ryanair*) — US-first is correct.
- **Reviewer PII:** pseudonymise reviewer names at ingest (salted hash for dedupe), never show reviewer identity to clients, strip PII/health details before LLM calls, retain raw review text 12–24 months, aggregates indefinitely. Watch state data-broker laws (California Delete Act) — do not sell reviewer-level data.
- **Defamation/trade libel:** the evidence rule (A14) is the mitigation. Add: quoted observations only, "possible signal" labelling for inferences, immutable hashed snapshots, correction/takedown channel, client terms forbidding public republication (Lanham Act/FTC exposure is theirs if they run comparative ads).
- **FTC Consumer Reviews Rule:** if the product ever drafts review requests/responses, no fake or suppressed reviews.
- **Branding:** "Spy" in a product name invites exactly the perception the product must avoid. Keep *CompetitorSpy* as internal codename; ship under a neutral name (agencies rebrand anyway).

---

## 6. Feature selection for the SMB app

Scoring: **Value** to a local-service owner/agency, **Effort**, **Risk**. Decision: **MVP** / **V2** (with wholesale launch) / **Later** / **Drop**.

### 6.1 Engine features (System A)

| Feature | Value | Effort | Decision | Rationale |
|---|---|---|---|---|
| A1 Snapshot capture | High | M | **MVP** | Foundation of evidence. |
| A2 Boilerplate stripping | High | M | **MVP** | Without it the product is Visualping (noisy). |
| A3 Semantic diff + numeric rule layer | High | M | **MVP** | Core noise filter. |
| A4 Cross-channel dedupe | Med | M | **V2** | Only matters once ads + social + site overlap in volume. |
| A5 Type tagging | High | S | **MVP** | Cheap model, taxonomy of ~10 types. |
| A6–A9 Scoring + routing | High | S | **MVP** | Plain code, config-driven weights per vertical. |
| A10 Moves detection | High | M | **MVP (rules)** | *The* differentiator. Start with 4–6 templates: territory expansion, price war, new service line, hiring push, promo blitz, reputation slump. |
| A11 Review themes | High | M | **MVP** | Owners act on "competitor customers complain about no-shows". |
| A12 Client benchmarking | High | S | **MVP** | Same pipeline run on the client's own reviews. |
| A13 Structured brief | High | M | **MVP** | Core deliverable. |
| A14 Evidence verifier | Critical | M | **MVP** | Trust + legal defence. Non-negotiable. |
| A15 Brand voice | Med | S | **MVP (basic)** | One agency voice at first; per-tenant config ready. |
| A16 Feedback capture | Med | S | **MVP** | Log approve/edit/delete + opens/clicks from day one. |
| A17 Weight learning | Med | L | **Later** | Needs volume. Manual weight tuning per vertical until then. |

### 6.2 White-label features (System B)

| Feature | Decision | Rationale |
|---|---|---|
| B18 Multi-tenant data model + hostname routing | **MVP** | Rewrite-avoidance; one tenant at first. |
| B1 Logo/colours/fonts | **MVP** | Needed even for own agency brand. |
| B6 Branded email sender (SPF/DKIM/DMARC) | **MVP** | Briefs are emailed; deliverability matters. |
| B11–B12 AI voice + AM sign-off | **MVP** | Cheap; improves own-client pilot. |
| B16 Client access (magic link, briefs-only permission) | **MVP** | Simple portal to view evidence. |
| B5 Custom domain + B7 asset URLs | **V2** | Required to sell to other agencies (table stakes). |
| B8–B9 Fingerprint scrubbing | **V2** | Same. |
| B14 Legal/DPA plumbing, B15 support routing | **V2** | Required for external agencies. |
| B2 Co-branding, B3 renameable modules, B4 branded help docs | **Later** | Agency+ tier sweeteners. |
| B13 Stripe Connect rebilling | **Later** | Agencies already bill clients via retainers; build when a paying agency asks. Billing agencies wholesale via plain Stripe Billing in V2. |
| B10 Honest crawler identity | **MVP** | Legal/ethical baseline. |

### 6.3 Additions not in the source context (from research)
- **Prospecting brief (MVP-lite):** run a one-off brief for a *prospect's* competitors — an agency sales weapon (Yext markets Scout this way). For an agency-owned product this creates value *before* any client pays and is the strongest internal ROI lever.
- **Geo-grid snapshot (MVP, monthly):** cheap via DataForSEO; adds the table-stakes ranking view and feeds "moves" (competitor climbing in your ZIPs).
- **Ad archive view (MVP):** US Meta + Google ad creatives with first/last-seen dates — unique at SMB price.
- **Blocked-source transparency:** show "site blocks monitoring" instead of silently failing.

---

## 7. App concept

### 7.1 One-liner
**A weekly, evidence-backed competitor brief for local-service businesses — delivered under the agency's brand.** "What your competitors changed this week, why it matters, and what to do — every claim linked to proof."

### 7.2 Users & jobs-to-be-done
| User | Job |
|---|---|
| **SMB owner** (HVAC owner, practice manager) | "Tell me in 2 minutes if a competitor did something I need to react to." |
| **Agency account manager** | "Give me something valuable to talk about every week, and upsell ammunition, without manual research." |
| **Agency owner** | "Reduce churn, add a high-margin line item, win pitches." |

### 7.3 Core experience
1. **Onboarding (agency, ~10 min/client):** enter client business + services + service area (ZIPs/radius). The system suggests competitors from local search (geo-grid/Maps results); AM confirms 3–5 and their key pages (pricing, services, service areas, careers) are auto-discovered.
2. **Monitoring (automatic):** daily key-page checks, weekly full crawl, weekly reviews/ads/jobs, monthly geo-grid.
3. **Instant alert:** high-score events (e.g., competitor price cut ≥15% on a service the client sells) → email/SMS to AM (and optionally client).
4. **Weekly brief (Monday):** 3–5 items. AM gets a draft Friday to approve/edit (agency-in-the-loop by default; auto-send optional). Each item: headline, what changed, why it matters, recommended action, confidence, evidence links.
5. **Portal:** brief archive, evidence viewer (before/after snapshot, diff highlight, ad creatives), review-theme benchmark, competitor timeline of "moves".
6. **Quarterly:** trend report (price history, ad activity, review themes over time) — natural QBR artefact for the agency.

**Corrected sample brief item:**
> **Smith HVAC cut its tune-up price to $79 (was $99).** Changed on their pricing page on Tue 22 Sep and now running in 3 Facebook/Instagram ads started the same day (targeting not disclosed). Two of their reviews this month mention the discount. *Suggested:* match with a $79 tune-up + filter bundle rather than a straight price cut. Confidence: high. [Snapshot 22 Sep] [Ad 1] [Ad 2] [Reviews]

### 7.4 High-level architecture
```
            ┌──────────────┐   ┌─────────────────┐   ┌───────────────────┐
Schedules → │  Collectors   │ → │ Normalize+Diff  │ → │ Event store        │
            │ web (Playwright)│ │ strip, chunk,   │   │ (typed, scored,    │
            │ reviews (DFS)  │  │ embed, numeric  │   │ evidence-linked)   │
            │ ads (DFS/Apify)│  │ rule layer      │   └─────────┬─────────┘
            │ SERP/jobs/grid │  └─────────────────┘             │
            └───────┬──────┘                        ┌───────────▼──────────┐
                    │ raw HTML/PNG/JSON (R2, hashed)│ Tag (Haiku-class) →   │
                    ▼                               │ Score (code) → Route  │
            ┌──────────────┐                        │ Moves (rules), Review │
            │ Evidence vault│◄───── evidence IDs ───│ themes (clustering)   │
            └──────────────┘                        └───────────┬──────────┘
                                                                │
                              ┌─────────────────────────────────▼───────┐
                              │ Brief writer (Sonnet-class, structured) │
                              │ → Evidence verifier (drop unsupported)  │
                              │ → Brand voice → AM approval → Send      │
                              └─────────────────────────────────────────┘
Multi-tenant app (agency → client → competitor), hostname routing, portal, email, billing
```
Suggested stack **[E]**: TypeScript/Node or Python workers on a job queue; Postgres (+pgvector); Cloudflare R2 for evidence; Playwright workers on cheap VMs; Cloudflare for SaaS (V2 domains); Postmark/SES for email; Stripe Billing. Final choices belong in the spec.

---

## 8. Business case

### 8.1 Market size
- **US target universe:** ≈ **627k employer firms** across HVAC/plumbing, electrical, roofing, dental, legal, landscaping, pest control, med spa (Census SUSB 2022 + AmSpa); ≈ **298k** in the $0.5M–$20M receipts buyer band. UK/CA/AU add ≈ 400–500k (mixed definitions).
- **Agencies:** ≈ 30–40k US agencies with a meaningful local-SMB book **[E]**; ≈ 10k realistic white-label SaaS buyers (already pay for per-client tools such as AgencyAnalytics, BrightLocal, GoHighLevel) **[E]**. 94% of surveyed SEO agencies serve local/small businesses; 60% of SMBs use a marketing partner.
- **Typical local-agency revenue per client:** $799/mo (yr 1) → $1,569/mo (yr 2–3). A $149 add-on is ≈ 10–15% of retainer — a credible upsell.

| Channel | TAM | SAM | SOM (24–36 mo) **[E]** |
|---|---|---|---|
| Own clients (60-client agency) | ≈ $107k/yr | ≈ $75k/yr (target verticals) | 18–24 subs → **$32–43k ARR** |
| Wholesale to agencies | ≈ $131M/yr wholesale | ≈ $42M/yr | 30–100 agencies, 360–1,500 seats → **$125–520k ARR** |
| Direct SMB self-serve | ≈ $745M/yr (US) | ≈ $107M/yr | 300–1,000 customers → $0.36–1.2M ARR, *requires paid CAC* |

### 8.2 Pricing (recommended)
Aligned to the white-label ladder in the source context, adjusted for research:

| Tier (agency pays) | Platform fee | Per client seat | Includes |
|---|---|---|---|
| **Starter** | $0 | $39 | Branded PDF + email briefs (agency logo/colours, agency sender), alerts, portal on vendor-neutral domain |
| **Pro** | $99/mo | $29 | + custom domain, fully white-labelled portal & assets, AM approval workflow, AI voice |
| **Agency+** | $249/mo | $24 | + co-branding, renameable modules, API, Stripe Connect rebilling, prospecting briefs at volume |

- **Suggested agency resale:** $149/mo (band $129–199), or bundled into a "growth" retainer tier.
- **Benchmarks:** AgencyAnalytics $20/client; Semrush Local $30–60/loc; Birdeye wholesale ≈ $75–200/loc; RivalMappd retail $299+. Our seat price leaves a 4–6× agency markup and undercuts every direct rival at retail.
- **Own agency:** internal cost ≈ $7–10/client **[E]**; sells at $149.
- **Direct SMB (future option only):** $99/mo, $79 lite.

### 8.3 Unit economics **[E, at ~100 clients]**
| COGS line / client / month | Low | Mid | High |
|---|---|---|---|
| AI (Haiku-class tagging, Sonnet-class brief; batch where possible) | $0.70 | $2.15 | $2.70 |
| Crawling (self-hosted + occasional proxy) | $0.40 | $1.00 | $3.75 |
| Data APIs (reviews, SERP/ads, Meta ads, geo-grid) | $1.20 | $1.80 | $4.00 |
| DB, storage, email | $0.45 | $0.80 | $1.20 |
| Hosting/monitoring (amortised) | $0.50 | $1.00 | $1.50 |
| **Total tech COGS** | **$3.25** | **$6.75** | **$13.15** |

Plus fixed vendor minimums ≈ $100–250/mo (SerpApi/Apify/DataForSEO prepay/VMs), which dominate at < 30 clients (≈ $8–25/client at 20 clients).

| Price point | Gross margin (mid COGS) |
|---|---|
| Own client at $149 | ≈ 85% after ~$10–15 AM review time |
| Wholesale Starter $39 | ≈ 80% |
| Wholesale Pro $29 (+ platform fee) | ≈ 75% seat-level, higher with fee |
| Wholesale Agency+ $24 | ≈ 70% |
| Direct $99 | ≈ 89% |

AI model choice (verified 2026-09 list prices): Claude Haiku 4.5 $1/$5 per M tokens; Claude Sonnet 5 $2/$10; batch −50%, cache reads 0.1×. Classification of changed chunks — not the brief — is 50–70% of AI spend; pre-filtering cosmetic diffs and batching chunks cuts it by 50–70%. **AI cost is not a business risk.**

### 8.4 SaaS benchmarks applied
| Channel | Monthly churn | CAC | Payback | LTV:CAC |
|---|---|---|---|---|
| Own clients | 1.5–2.5% (inherits retainer stickiness) | ≈ $50–150 | < 1 mo | > 20:1 |
| Wholesale via agencies | seats 2–3%, agency logos 2–4% | $1.5–5k per agency ≈ $100–400/seat | 5–18 mo per seat | 3–8:1 |
| Direct SMB | 4–7% | $300–800 | 3.5–9 mo | ≈ 2.5–5:1 |

### 8.5 24-month P&L sketch **[E]**
Assumptions: 60-client agency; own attach 15% → 30% → 40% (m6/m12/m18) at $149; wholesale from month 13 at ≈ $29 blended seat, 15 seats/agency, 3% agency churn. **Lean case:** $10k/mo build m1–3, $2.5k/mo run, rising to $5k run + $1.5k S&M from m13, 3 new agencies/month. **Full case:** $25k/mo build, $5k→$10k run + $3k S&M, 2 agencies/month.

| Quarter | Own subs | Wholesale seats (lean / full) | Revenue (lean) | EBITDA (lean) | Cumulative (lean) | Cumulative (full) |
|---|---|---|---|---|---|---|
| Q1 | 0 | 0 | $0 | −$31.4k | −$31.4k | −$76.4k |
| Q2 | 9 | 0 | $2.7k | −$6.5k | −$37.8k | −$90.4k |
| Q3 | 14 | 0 | $5.4k | −$4.1k | −$41.9k | −$102.2k |
| Q4 | 18 | 0 | $7.3k | −$2.4k | −$44.3k | −$112.3k |
| Q5 | 21 | 131 / 81 | $16.6k | −$8.2k | −$52.5k | −$142.1k |
| Q6 | 24 | 251 / 144 | $28.7k | +$0.7k | −$51.7k | −$166.7k |
| Q7 | 24 | 360 / 201 | $38.9k | +$8.2k | −$43.5k | −$187.3k |
| Q8 | 24 | 459 / 254 | $47.9k | +$14.6k | −$28.9k | −$204.4k |

**Readings:**
- Own clients alone ≈ $3k/mo contribution — covers lean maintenance only. **The product exists to be sold to other agencies.**
- Lean case turns EBITDA-positive at ≈ 250 wholesale seats (≈ 17 agencies); full-cost case needs ≈ 650+ seats (≈ 45–55 agencies).
- **Sensitivity (highest → lowest):** agencies acquired/month and seats per agency ≫ dev burn ≫ own-client attach ≫ COGS.
- **Hidden upside not modelled:** prospecting briefs raising the agency's own win rate and reduced retainer churn. One extra retained $1,200/mo client per quarter is worth more than the whole own-client subscription line.
- **Accelerator:** pulling wholesale forward from month 13 to month 7–9 (after an 8-week pilot proves the brief) cuts the trough materially.

---

## 9. Feasibility assessment

| Dimension | Rating | Summary |
|---|---|---|
| **Technical** | 🟢 High | Proven components (Playwright, embeddings, LLM structured output, Postgres/pgvector). Hardest parts: boilerplate/volatile-region suppression (A2) and the evidence verifier (A14) — both tractable, both need eval sets. |
| **Data access** | 🟡 Medium | Websites, Google ads, geo-grid, jobs, Instagram are clean. Reviews and US Meta ads depend on third-party scrapers → dual-vendor abstraction required. Yelp/health platforms excluded. |
| **Legal** | 🟡 Medium-low (US) | Public-data crawling defensible if polite and honest; defamation mitigated by evidence rule; reviewer PII pseudonymised. Counsel review before launch; EU/UK later with LIA/DPIA. |
| **Economic** | 🟢 High margin / 🟡 scale | COGS trivial; the constraint is distribution volume. |
| **Market** | 🟢 Gap exists / 🟡 window | No exact competitor; direct-to-SMB rivals validate demand. Window ~12–24 months before Birdeye/BrightLocal/GHL close it. |
| **Operational** | 🟡 Medium | Scraper maintenance, source breakage, and brief QA are ongoing costs; AM approval step keeps quality high but must stay < 5 min/client/week. |
| **Team** | 🟡 Depends | 1–2 devs with AI tools for MVP; needs someone owning agency sales from month ~6. |

### 9.1 Risk register
| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Wholesale demand slower than modelled | Med | High | Pre-sell: 5 LOIs from external agencies before V2 build; list on GHL/Vendasta marketplaces; founding-agency pricing. |
| R2 | Incumbent ships the feature (Birdeye/BrightLocal/GHL) | Med-High | High | Differentiate on moves + evidence + ad archive; speed; consider integrating *with* them (companion app) rather than against. |
| R3 | Scraper vendor loss / Meta blocking | Med | Med | Two vendors per scraped source; degrade gracefully ("ads data unavailable this week"). |
| R4 | Brief quality/noise disappoints owners | Med | High | AM approval loop; eval set from pilot; tune weights per vertical; track useful-item rate. |
| R5 | Defamation/false-claim incident | Low | High | Evidence verifier, quoted observations, "possible signal" labels, correction channel, client ToS. |
| R6 | Privacy/data-broker exposure | Low | Med | Pseudonymise reviewers, no reviewer-level data to clients, retention limits, counsel review. |
| R7 | Crawler blocked by Cloudflare-hosted sites | Med | Low-Med | Honest UA, verified-bot registration, show "blocked" transparently; rely on ads/reviews for those competitors. |
| R8 | "Spy" perception harms brand | Low | Med | Neutral product name; public bot page explaining conduct. |

---

## 10. Recommendation & roadmap

### Phase 0 — Validate before building (2–3 weeks, ≈ $0–2k)
- Check GHL and Vendasta marketplaces for an existing equivalent.
- **Concierge test:** for 5 own clients, produce 2 weekly briefs semi-manually (scripts + LLM + human). Measure: owner reads it, ≥ 1 action taken, would they pay $149?
- Show the concierge brief to 10 friendly agency owners; target **5 LOIs** at founding price.
- **Gate:** ≥ 3/5 clients find it useful and ≥ 3 agencies express paid intent → build.

### Phase 1 — MVP for own agency (≈ weeks 1–12)
Engine: A1–A3, A5–A16 (moves as rules). Sources: websites, Google reviews (DataForSEO), Google Ads Transparency, Meta ads (third-party), jobs, monthly geo-grid. White-label: B1, B6, B10–B12, B16, B18. Plus prospecting brief. Pilot with 10–15 own clients.
- **Gate (end of week 8 of pilot):** ≥ 60% of brief items rated useful by AMs; ≤ 5 min AM review per client per week; ≥ 25% attach at $149; zero unsupported-claim incidents.

### Phase 2 — Wholesale launch (≈ months 6–9)
B5, B7–B9, B14–B15; agency onboarding; Stripe Billing for wholesale; A4 dedupe; Starter/Pro tiers; marketplace listings; 5 founding agencies.
- **Gate:** 10 paying agencies / 150 seats by month 12 → continue investing; < 5 agencies → reassess (fallback: keep as internal retention/sales tool at lean run cost).

### Phase 3 — Scale (month 12+)
Agency+ tier (B2, B3, B13 rebilling, API), A17 weight learning, Facebook posts, additional verticals' vertical-specific move templates, UK/AU after legal review. Revisit direct self-serve only if agency channel stalls and paid CAC tests < $500.

### Decisions needed from you
1. Accept the **conditional-go** and the **own-clients → wholesale** channel recommendation (direct SMB parked)?
2. Run **Phase 0 validation** before the MVP build, or go straight to MVP?
3. Budget posture: **lean** (≈ $30k build) or **full** (≈ $75k)?
4. Initial verticals for the pilot (suggest HVAC/plumbing + dental — clearest price/promo signals and highest counts)?

---

## Addendum (2026-09-29) — Scope changes from the design session

The design session ([core platform spec](../superpowers/specs/2026-09-29-core-platform-design.md)) changed the MVP relative to §6 and §10 of this study:

| Change | Effect on this study |
|---|---|
| **Full-stack MVP**: complete agency + client dashboard, remote **MCP server** (Claude/ChatGPT access to all data), in-app **Ask assistant** with recommendations | MVP build grows from ≈ 10–12 to **≈ 18–20 weeks**; lean build cost rises to ≈ $45–55k **[E]**; first pilot feedback later (mitigated by running Phase 0 in parallel) |
| Basic cross-channel merge (A4) moved into MVP | Minor effort |
| **Jev (System One) decision model** for classification/tagging/verification behind a provider interface | Classification cost ≈ 20× cheaper per token; AI cost ≈ $1.00–1.30 per client per month excluding Ask **[E]** |
| **OpenRouter** as default generative provider | Adds a small platform fee; Anthropic-direct retained for batch discounts |
| Ask assistant usage | ≈ $0.02–0.10 per question **[E]** → tier quotas needed (e.g., Starter 50, Pro 200, Agency+ 500 questions per client per month); at 100 questions/month ≈ $2–10 per client, still within the ≤ $15 pilot COGS target |
| MCP + Ask as differentiators | Strengthens §4.2 differentiation: no competitor found offers competitor-intel data via MCP to Claude/ChatGPT; supports Pro/Agency+ tier pricing |

| **Added competitor: Paige by Merchynt** (localmarketingmanager.com) | White-label AI local-SEO assistant for agencies: GBP/review management, AI review replies with per-star automation modes (template / AI with approval / fully automated), citations, reports; agency name, renameable assistant, logo, colours, custom URL. **No competitor-intelligence features observed.** Same buyer (local-SEO agencies) → both a threat (could add competitor monitoring) and a partnership/integration candidate. UI patterns adopted as design reference. |
| **Deployment on Vercel** (hybrid) | Web/API/MCP on Vercel, pg-boss + Playwright on a ~$5–20/mo worker container; Neon Postgres. Vercel Domains API replaces Cloudflare for SaaS for agency custom domains. COGS estimates unchanged. |

Break-even logic (§8.5) is unchanged in shape — wholesale agency volume remains the driver — but the trough deepens by roughly the added build cost.

## Appendix A — Key sources
- Census SUSB 2022 6-digit NAICS by receipts: https://www2.census.gov/programs-surveys/susb/tables/2022/us_6digitnaics_rcptsize_2022.xlsx
- AmSpa med spa report: https://www.americanmedspa.org/blog/2024-medical-spa-state-of-the-industry-executive-report-recap
- BrightLocal Local SEO industry survey: https://www.brightlocal.com/research/local-seo-industry-survey/
- SE Ranking SEO pricing survey: https://seranking.com/blog/seo-pricing/
- LocalIQ SMB marketing trends 2025: https://localiq.com/blog/small-business-marketing-trends-report/
- Databox agency–client collaboration: https://databox.com/state-of-agency-client-collaboration
- Anthropic pricing: https://platform.claude.com/docs/en/about-claude/pricing
- Google Maps Platform pricing: https://developers.google.com/maps/billing-and-pricing/pricing
- Meta Ad Library API docs: https://developers.facebook.com/docs/graph-api/reference/ads_archive/
- Yelp API Terms: https://terms.yelp.com/developers/api_terms/
- DataForSEO Google Reviews / SERP pricing: https://dataforseo.com/pricing/business-data/google-reviews-api
- Cloudflare for SaaS plans: https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/
- Stripe Connect pricing: https://stripe.com/connect/pricing
- Meta v. Bright Data analysis: https://www.fbm.com/technology/publications/major-decision-affects-law-of-scraping-and-online-data-collection-meta-platforms-v-bright-data/
- Google v. SerpApi dismissal: https://seroundtable.com/google-lawsuit-serpapi-dismissed-41731.html
- Birdeye Competitors AI: https://birdeye.com/competitors-ai/
- RivalMappd (Capterra): https://www.capterra.com/p/10046168/RivalMappd/
- RivalTracker: https://rivaltracker.io/
- Visualping Reports launch: https://www.barchart.com/story/news/727683/new-ai-feature-turns-hundreds-of-website-alerts-into-one-briefing
- Yext Scout: https://www.yext.com/blog/how-yext-scout-helps-brands-outperform-competitors-across-ai-and-search
- AgencyAnalytics pricing: https://agencyanalytics.com/pricing
- Vendasta pricing: https://vendasta.com/pricing

## Appendix B — Open items to verify
- GoHighLevel / Vendasta marketplace apps overlapping this concept.
- RivalMappd agency/white-label offering (only seen via Capterra).
- BrightLocal current prices (now "on request"); Birdeye/Synup wholesale rates.
- Whether UK commercial ads appear in Meta Ad Library API; US special-category ad retention.
- ScrapeCreators / SearchAPI per-endpoint pricing; current SerpApi tiers.
- Washington My Health My Data Act applicability to scraped dental/med-spa review text.
- California Delete Act / data-broker registration applicability.
- Real LLM token volumes — replace estimates with measured `usage` from the pilot.
