# Rival Monday: features compared with competitors

*Date: 2026-10-12 · Status: analysis for the owner · Builds on: [feasibility study](2026-09-29-competitor-intel-feasibility-study.md)*

> **Evidence note.**
> - **Rival Monday column.** Taken from a full read of the code on `main` at commit `98bec11` (Phases 1–5 done), checked against `docs/HANDOVER.md` and the roadmap.
> - **Competitor columns.** Taken from web searches on 2026-10-12. The sandbox could not open vendor websites, so every competitor fact comes from search summaries, review sites (Capterra, G2, CostBench and similar) or rivals' comparison pages. These sources often disagree. Check prices on each vendor's own page (±30%) before quoting them. Items marked *unverified* could not be confirmed.

---

## 1. Summary

**What Rival Monday has that nobody else does:**
- Competitor **"moves"** (expansion into new territory, price war, hiring push, and others) worked out across channels.
- Briefs where **every claim links to stored evidence**, checked by a verifier.
- Tracking of **prices and job postings**.
- Delivery through an **agency approval workflow**.

None of the roughly 40 products reviewed combines these. Two findings from this pass are new:
- No local-SEO tool tracks competitor prices or hiring.
- None turns competitor activity into named moves.

**The main risk is not the market but the gap between what is built and what is ready to ship:**

1. **Most of the core advantage has never seen live data.**
   - Web crawling is switched off (`WEB_MONITORING_ENABLED=false`) until the `rivalmonday.com/bot` page is published.
   - Without crawling, there is no live data for the pricing tracker, the numeric price-change layer, promo detection, or the *territory expansion* and *new service line* moves (both need pages from the website).
   - The parts that do run live today are reviews, GBP, ads, jobs and rankings. In those areas competitors are strong.
2. **The MCP server and Ask assistant (Phase 6) are no longer differentiators.** Since the feasibility study, these shipped MCP servers:
   - Local Falcon (37 tools)
   - BrightLocal
   - Semrush
   - Yext Scout
   - AgencyAnalytics (beta)
   - Crayon
   - Similarweb

   Vendasta has one on its H2-2026 roadmap. MCP is now expected. What still sets Rival Monday apart is what the MCP serves: moves, evidence and verified briefs.
3. **The white-label is too thin to sell to other agencies.** The model depends on selling wholesale to agencies, but today's white-label is:
   - a logo URL,
   - two colours,
   - an email from-name and sign-off.

   It has no custom domain, no agency sending domain, no font choice, no assistant rename or AI voice, and no billing. BrightLocal, AgencyAnalytics, GoHighLevel and Vendasta all go further.
4. **A new kind of visibility has become standard and Rival Monday has none of it: visibility in AI search.** Local Falcon, Yext Scout and BrightLocal's roadmap track how a business and its rivals appear in ChatGPT, Gemini and Google AI Overviews.

**Verdict:** the position is still valid, and arguably stronger, because no competitor has moved into "evidence-backed competitor moves". The window is still roughly 12–24 months. The order of work should change, as follows:
1. Turn on live web data.
2. Make the existing differentiators visible and trusted.
3. Bring white-label up to the minimum other agencies expect.
4. Then ship MCP and Ask, and pitch them as "your competitor evidence inside Claude or ChatGPT", not as "we have MCP".

---

## 2. What Rival Monday is today (built vs not built)

### 2.1 Built and tested (Phases 1–5; owner sign-off 2026-10-11)

| Area | What is built | Maturity |
|---|---|---|
| **Website monitoring** | Playwright capture, robots.txt (RFC 9309), ≥3 s per host plus Crawl-delay, honest `RivalMondayBot` user agent, block detection, page discovery (sitemap + navigation, AI-classified, about 25 pages per competitor), main-content extraction, learned masks for noisy regions, block alignment, semantic diff (embeddings at 0.95) + numeric fact layer + churn guard | Code done, **switched off for real sites** |
| **Google Business Profile** | DataForSEO `my_business_info`, field diffs | Live-verified |
| **Google reviews** | DataForSEO async; reviewer names pseudonymised; themes and sentiment per review; competitor vs the client's own benchmark; complaint-spike events; theme discovery with approval | Live-verified |
| **Google Ads** | DataForSEO Ads Transparency, pinned advertiser IDs, first/last-seen spans | Live-verified |
| **Meta ads (US)** | Apify actor, with ScrapeCreators fallback (fallback never run live) | Live-verified (Apify only) |
| **Jobs** | Google Jobs via DataForSEO | Live-verified |
| **Local rankings** | DataForSEO Maps geo-grid, monthly + on demand, share of voice (top-3 local pack) | Live-verified |
| **Competitor discovery** | Maps-based suggestions → accept/dismiss | Live-verified |
| **Engine** | Tagging (14 types) through the Jev→LLM→human confidence cascade, scoring `100 × type_weight × size × relevance × novelty`, routing (alert ≥70 / brief ≥40), cross-channel merge, **7 move templates**, rules-only price normalisation (`price_point` spans), event retraction | Built; unit- and fixture-tested |
| **Briefs** | Gather → select → write → **two-layer verifier** (deterministic rules + Jev support check) → AM edit/drop/reorder/rate → approve / auto-send Monday 07:00 local → email + PDF; quiet-week trend; recommendations from playbooks | Built |
| **Alerts** | Score ≥70, 72-hour duplicate merge, max 3 per client per day, digest; client modes direct / after AM check / digest only; LLM-written with a template fallback if verification fails | Built |
| **Delivery** | In-app, email (Postmark, React Email), Slack and Teams webhooks, signed deep links, quiet hours | Built (Postmark still on a sandbox token) |
| **Reports** | Quarterly trend report (deterministic) + PDF | Built |
| **Prospecting** | Prospect snapshot / landscape report → convert to client | Built |
| **Agency UI** | Portfolio, brief approvals, alert review, prospects, usage & caps, playbooks editor, team & invitations, branding, Slack/Teams | Built; responsive |
| **Client UI** | Overview, competitors, competitor profile, changes feed + evidence viewer (before/after screenshot + diff), pricing, ads, reviews heatmap, geo-grid, moves, recommendations board, settings | Built; responsive (390 px) |
| **Platform** | 79-tool registry with role checks + audit on every call, Postgres RLS (39 migrations), cost ledger on every AI or vendor call, shadow evaluation, PII redaction before model calls, immutable evidence | Built |
| **Verticals** | `hvac_plumbing`, `dental` | Built |
| **Tests** | About 300 unit/integration test files, Playwright E2E 28/28 | Good |

### 2.2 Not built

| Gap | Planned for | Note |
|---|---|---|
| MCP server, OAuth 2.1, personal access tokens | Phase 6 | `/settings/ai` is a "Coming in the next release" placeholder |
| Ask assistant ("Friday") | Phase 6 | `ask_assistant` task is configured but unused |
| Budget caps enforced | Phase 7 | Warning at 80% only |
| Deployment, least-privilege worker role, shared rate limiter, tenant-isolation test suite, eval sets in CI, observability | Phase 7 | |
| Custom domain, agency sending domain (DKIM), fonts, logo upload, AI voice, assistant rename | "Phase 2 wholesale" | Required to sell to other agencies |
| Billing (Stripe) | Phase 2 wholesale | |
| SMS (Twilio), generic outbound webhook, public REST API | Unscheduled | SMS is only an enum value |
| Instagram / Facebook posts / any social | Deferred | Needs Meta app review |
| AI-search visibility (ChatGPT, Gemini, AI Overviews) | **Not on the roadmap** | New table stake (see §5) |
| CSV export, integrations (GHL, Vendasta, Looker, Zapier) | Not on the roadmap | |
| Ad creative images (text cards + outbound link only) | Not on the roadmap | |
| Custom verticals | Owner backlog | Only two verticals ship |

---

## 3. The competitive field

There are five groups, each with a different overlap:

1. **Direct-to-SMB competitor watchers.** RivalMappd, RivalTracker, Competitors.app. They sell the same idea to the business owner, with no agency channel.
2. **Local SEO and rank platforms with a competitor tab.** Local Falcon, BrightLocal, Localo, Semrush Local, Whitespark, GMB Everywhere / Grid My Business, Paige. Same buyer (local agencies). They cover rankings, GBP and reviews, not web, prices, jobs or moves.
3. **Reputation and engagement suites.** Birdeye (Competitors AI), Podium. Review and social benchmarking. Expensive per location. Sold to the business directly, not through agencies.
4. **Agency white-label platforms.** GoHighLevel, Vendasta, AgencyAnalytics, Synup. They own the agency relationship and white-label well, but have little or no competitor intelligence. They are possible **channels or partners** more than rivals.
5. **Horizontal and enterprise competitive intelligence.** Visualping, Crayon, Klue, Kompyte (now Adobe/Semrush), Yext Scout, SpyFu, Similarweb, Owler. Capable and expensive ($3k–100k a year), or narrow (SpyFu: search ads), and not set up for local businesses.

### Market changes since the 2026-09-29 study
- **Adobe completed its acquisition of Semrush** (2026-04-28). Kompyte is now inside Adobe/Semrush, so a much larger company owns both local tools and competitive intelligence.
- **Yext Scout** reached paying customers in June 2026 and launched an **MCP server and a white-label API** (May 2026). That makes it a possible upstream for agencies.
- **Agentic GBP managers are everywhere:** Local Falcon's Falcon Agent (Dec 2025), Semrush's GBP AI Agent, Localo's AI Agent, Paige, Birdeye's "agentic marketing", Podium's AI Employee. All of them act on the business's **own** profile (posts, review replies). None reports competitor moves.
- **Gartner published its first Magic Quadrant for Competitive & Marketing Intelligence** (April 2026; Crayon a Leader, per a secondary source). The category is getting buyer attention, but at the enterprise end.
- **MCP has become standard** among local-SEO tools (see §1).

---

## 4. Feature matrix

Key: ✅ yes · ◐ partial or limited · ❌ no · ? unverified · **RM\*** = built but no live data yet.

### 4.1 Intelligence and data channels

| Capability | **Rival Monday** | RivalMappd | Birdeye Comp. AI | Local Falcon | BrightLocal | Localo | Semrush Local | Visualping | Competitors.app | GoHighLevel |
|---|---|---|---|---|---|---|---|---|---|---|
| Competitor website change monitoring | **RM\*** ✅ (evidence-grade) | ? | ❌ | ❌ | ❌ | ❌ | ◐ (SEO only) | ✅ | ✅ | ❌ |
| Noise suppression (masks for noisy regions, semantic + numeric diff) | ✅ | n/a | n/a | n/a | n/a | n/a | n/a | ◐ (AI summary) | ? | n/a |
| Competitor **price** tracking (price matrix + history) | **RM\*** ✅ | ? | ❌ | ❌ | ❌ | ❌ | ❌ | ◐ (page diffs only) | ❌ | ❌ |
| Competitor promo detection | **RM\*** ✅ | ? | ❌ | ❌ | ❌ | ❌ | ❌ | ◐ | ◐ | ❌ |
| Competitor GBP change tracking | ✅ | ✅ | ◐ | ◐ | ◐ | ✅ (Action Tracker) | ◐ | ❌ | ❌ | ❌ |
| Competitor review benchmark (rating, velocity) | ✅ | ✅ | ✅ | ◐ (via agent) | ✅ | ◐ | ✅ (up to 5, monthly) | ❌ | ✅ | ✅ |
| Review **theme** / complaint analysis vs the client | ✅ (seeded per vertical + discovered themes) | ? | ✅ | ❌ | ❌ | ❌ | ◐ | ❌ | ❌ | ❌ |
| Geo-grid rank vs competitors | ✅ (monthly, plain grid) | ✅ | ◐ | ✅ (best in class, up to 100 competitors per keyword) | ✅ | ✅ | ✅ | ❌ | ❌ | ◐ |
| Google Ads archive (first/last seen) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ◐ (paid search, not local ads) | ❌ | ✅ | ❌ |
| Meta ads archive (US) | ✅ (text, no images) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Competitor **hiring / jobs** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ◐ (careers page) | ❌ | ❌ |
| Social (IG / FB posts, engagement) | ❌ | ? | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **AI-search visibility** (ChatGPT / Gemini / AIO) | ❌ | ❌ | ✅ (Search AI) | ✅ | ◐ (roadmap) | ? | ◐ (Semrush AI toolkit) | ❌ | ❌ | ❌ |
| Citations / listings audit | ❌ | ❌ | ✅ | ❌ | ✅ | ◐ | ✅ | ❌ | ❌ | ✅ |
| **Cross-channel "moves"** (named patterns over 90 days) | ✅ (7 templates) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Cross-channel merge (same offer seen on site, ads and GBP becomes one event) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Scored relevance to the client (service × territory × novelty) | ✅ (factor breakdown stored) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Immutable, hashed evidence for each claim | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ◐ (snapshots) | ◐ | ❌ |

### 4.2 AI, delivery and workflow

| Capability | **Rival Monday** | RivalMappd | RivalTracker | Birdeye | Local Falcon | BrightLocal | Yext Scout | Crayon / Klue |
|---|---|---|---|---|---|---|---|---|
| AI brief / report | ✅ weekly, 3–5 items | ✅ monthly | ✅ weekly | ✅ Reports AI | ✅ Falcon AI | ◐ | ✅ recommendations | ✅ |
| Claim verifier ("no evidence, no claim") | ✅ two-layer | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Agency approval of the brief before the client sees it | ✅ (edit / drop / reorder / rate / auto-send) | n/a | n/a | ❌ | ❌ | ◐ (scheduled reports) | ❌ | ◐ |
| Instant alerts with throttling and digest | ✅ (in-app, email, Slack, Teams) | ? | ? | ✅ | ◐ | ✅ | ? | ✅ |
| SMS alerts | ❌ | ? | ? | ✅ | ❌ | ❌ | ? | ❌ |
| Recommendations / playbooks with status tracking | ✅ (agency-editable playbooks) | ◐ (done-for-you) | ✅ "next step" | ✅ | ✅ agent tasks | ❌ | ✅ | ✅ battlecards |
| **Acts** on recommendations (posts, review replies) | ❌ (read-only by design) | ✅ (done-for-you) | ❌ | ✅ | ✅ Falcon Agent | ◐ | ✅ | ❌ |
| In-app AI assistant ("Ask") | ❌ (Phase 6) | ? | ? | ✅ | ✅ | ? | ✅ | ✅ |
| MCP server | ❌ (Phase 6) | ❌ | ❌ | ? | ✅ (37 tools) | ✅ (read-only) | ✅ | ✅ (Crayon) |
| Public REST API | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Prospecting / pitch report | ✅ (snapshot → convert) | ❌ | ❌ | ❌ | ◐ | ◐ | ✅ (sales use) | ❌ |
| Quarterly trend report (QBR) | ✅ | ? | ❌ | ✅ | ✅ | ✅ | ? | ✅ |
| PDF export | ✅ | ✅ | ? | ✅ | ✅ | ✅ | ? | ✅ |
| CSV / data export | ❌ | ? | ? | ✅ | ✅ | ✅ | ✅ | ✅ |

### 4.3 Agency white-label and commercial

| Capability | **Rival Monday** | BrightLocal | AgencyAnalytics | GoHighLevel | Vendasta | Local Falcon | Competitors.app | Birdeye |
|---|---|---|---|---|---|---|---|---|
| Logo + colours | ◐ (logo URL, 2 colours, fixed accent) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a |
| Custom domain | ❌ | ✅ | ✅ | ✅ | ✅ | ? | ? | n/a |
| Branded sending domain (SPF/DKIM) | ❌ (one shared sender) | ✅ | ✅ | ✅ | ✅ | ? | ? | n/a |
| No vendor fingerprints | ◐ | ✅ | ✅ | ✅ | ✅ | ? | ? | n/a |
| Rename modules / assistant, AI voice | ❌ | ❌ | ◐ | ✅ | ✅ | ❌ | ❌ | n/a |
| Client portal with role-based access | ✅ (4 roles + feature switches) | ✅ | ✅ | ✅ | ✅ | ◐ | ✅ | n/a |
| Billing for the agency, and rebilling | ❌ | ✅ | ✅ | ✅ (SaaS mode) | ✅ | ✅ | ✅ | n/a |
| Marketplace distribution | ❌ | n/a | n/a | ✅ (marketplace) | ✅ (marketplace) | ❌ | ❌ | ◐ resellers |
| Multi-tenant isolation enforced in the database | ✅ (RLS) | ? | ? | ? | ? | ? | ? | ? |

---

## 5. Price positioning

| Product | What a local agency or SMB pays | Model |
|---|---|---|
| **Rival Monday (plan)** | Agency $24–39 per client seat (+ $0–249 platform fee); suggested resale **$149/mo** | Wholesale per seat |
| RivalMappd | $299/mo (includes done-for-you content) | Direct to SMB |
| RivalTracker | £29–99/mo (study; current price unverified) | Direct to SMB |
| Birdeye | $299 / $349–399 / $449 per location per month | Direct, per location |
| Podium | $399–599+/mo | Direct |
| BrightLocal | ≈ $39–65 per location per month | Agency, per location |
| Semrush Local | $30 / $60 per location per month | Per location |
| Local Falcon | $24.99–199.99/mo in credits (1 credit per grid point) | Credits |
| Localo | ≈ $39–49 single business; ≈ $149 Pro (60 profiles) | Per profile |
| AgencyAnalytics | ≈ $20–25 per client per month | Agency, per client |
| Competitors.app | $9.90–19.90 per competitor per month | Per competitor |
| Visualping Business | ≈ $100–140/mo | Per account |
| Crayon / Klue | $15k–100k+/yr | Enterprise |

**Reading:**
- The **$24–39 seat** sits right in the range agencies already pay per location for BrightLocal or Semrush Local. Agencies treat that range as "just another tool line", which is the right place to be.
- The **$149 resale** is half of RivalMappd's $299 and a third of Birdeye's. It is credible as long as the agency can show **web, price and moves** content each week, which no $30–60 local tool offers.
- **Gross margins hold** (COGS of about $7 per client per month in the study; the code's ledger now measures it). Competitors.app's per-competitor pricing shows that SMBs will pay roughly **$10–20 per monitored competitor per month**. That suggests an "add more competitors" upsell above the 3–5 included.

---

## 6. Where Rival Monday wins (keep and promote)

1. **Cross-channel moves (7 templates).** No product reviewed goes beyond change lists to name a pattern, such as "expanding into your territory" or "price war on AC tune-ups". This is the headline feature.
2. **Evidence-grade trust.** Immutable hashed captures, a two-layer verifier, "possible signal" labelling, and agency approval before anything reaches a client. Agencies are wary of AI making things up in client reports. No competitor offers a guarantee that every claim is backed by evidence. This is both a sales point and the main legal defence (defamation).
3. **Price and hiring signals.** No local tool tracks competitor prices as a time series or competitor hiring. These are the signals a business owner understands at once ("they cut tune-ups to $79").
4. **Relevance scoring tied to the client.** Events are weighted by overlap with the client's services and territory, and by novelty. Competitors show everything. Visualping's noise is its best-known complaint.
5. **Agency workflow built in from the start.** Approval queue, alert review, playbooks, recommendations board, prospect snapshot → convert, and a quarterly report for client reviews. These fit how agencies actually sell and keep clients. Only Vendasta's Snapshot Report resembles the prospecting flow.
6. **Ad archive at SMB prices.** The US Meta and Google ads that the official APIs don't expose are kept with first/last-seen dates. Only Competitors.app (horizontal) and RivalMappd (direct) offer something similar for this buyer.
7. **Engineering quality that will matter at scale.** RLS isolation, a tool registry with audit and role checks on every call (79 tools, ready to serve over MCP), a cost ledger, a Jev→LLM→human cascade with shadow evaluation, PII redaction, and honest crawling. Most of this is invisible to buyers, but it reduces the cost of selling to other agencies and of counsel review.

## 7. Where Rival Monday is behind (gaps by severity)

### Critical (block the value proposition or wholesale sales)
| # | Gap | Why it matters | Who has it |
|---|---|---|---|
| G1 | **Web crawling switched off; no live price, promo or territory data** | Three of the six advantages above (prices, promos, two of the seven moves) exist only on fixtures. A pilot today would look like a review and rank tool, which is the most crowded area. | — (blocked only by the owner to-do: publish `/bot`) |
| G2 | **White-label below the minimum** (no custom domain, no agency sender, URL-only logo, fixed accent) | Wholesale is the business model (feasibility study §8.5). Agencies compare against BrightLocal and AgencyAnalytics, where these are included. | BrightLocal, AgencyAnalytics, GHL, Vendasta |
| G3 | **No billing** | No way to charge external agencies. | All agency platforms |
| G4 | **Not deployed** (Phase 7) | No pilot is possible yet. Remote-Neon page loads took 28–36 s in E2E. | — |

### High (expected by buyers in 2026)
| # | Gap | Who has it |
|---|---|---|
| G5 | **No AI-search visibility tracking** (how the client and rivals appear in ChatGPT, Gemini, AI Overviews). Agencies now sell this to local clients. | Local Falcon, Yext Scout, Birdeye Search AI, Semrush |
| G6 | **No Ask assistant or MCP** (Phase 6). No longer a differentiator, but its absence is now a gap. | Local Falcon, BrightLocal, Semrush, Yext, Crayon, AgencyAnalytics (beta) |
| G7 | **Geo-grid is monthly, plain and limited** (no map tiles, no per-point competitor list, top-3 share of voice only) | Local Falcon (up to 100 competitors per keyword, on demand), BrightLocal, Localo |
| G8 | **Ad archive has text only**, no creative images or video thumbnails | Competitors.app, Foreplay, the Meta Ad Library UI itself |
| G9 | **Budget caps not enforced** (cost risk once Ask ships) | — (internal) |
| G10 | **No API, CSV export or integrations** (GHL marketplace, Looker Studio, Zapier) | BrightLocal, Semrush, AgencyAnalytics, Local Falcon |

### Medium
| # | Gap | Note |
|---|---|---|
| G11 | No social monitoring (IG, FB posts, engagement) | Birdeye, Competitors.app. Low value for HVAC; higher for dental and med spa. |
| G12 | Two verticals only; agencies can't define their own | Most agencies have mixed books (roofing, legal, med spa). Owner backlog. |
| G13 | No SMS alerts | Owners of trade businesses live on SMS. Twilio is cheap. |
| G14 | Read-only: does not act (no GBP post or review-reply drafting) | Every local competitor now has an "agent". Intelligence-only is defensible, but "one click: draft the response post" closes the loop. |
| G15 | Single DataForSEO dependency for GBP, reviews, Google Ads, jobs and rankings (no fallback); Meta fallback untested | Vendor-risk item R3 in the study is still open. |
| G16 | No AI voice or tone per agency, no assistant rename | Spec items B11–B12, both MVP in the study; deferred in the code. |

---

## 8. Threats (updated)

| Threat | Likelihood (12 months) | Impact | Early signals in 2026 |
|---|---|---|---|
| **Local Falcon** adds website and price monitoring to Falcon Agent + MCP | Med | High | Already has the agency base, MCP, AI visibility and agent. Closest technically. |
| **Birdeye** extends Competitors AI to websites and ads | Med-High | High | Agentic suite, Search AI, social benchmarking already live. |
| **Adobe/Semrush** puts Kompyte (web, ads, jobs CI) into Semrush Local | Med | High | Same owner after April 2026. Kompyte already tracks websites, ads and jobs. |
| **Yext Scout API** used by white-label resellers | Med | Med | MCP plus a white-label API launched May 2026. Enterprise pricing limits SMB reach. |
| **GoHighLevel** marketplace app or native feature | Med | High | Native competitor analysis is reviews-only today; no marketplace CI app found. **Also the best distribution channel.** |
| **DIY**: agencies combine Visualping Reports + LLM, or MCP servers + Claude | Med | Med | With Local Falcon and BrightLocal MCP, a technical agency can ask Claude for a rough competitor summary. Evidence, scoring and moves are the defence. |
| **Data access** (Meta / Google scraping, vendor lawsuits) | Med | Med | Meta's API still excludes US commercial ads; Google's official API covers the EEA only. |

---

## 9. Recommendations (prioritised)

### Now (before or alongside Phase 6)
1. **Unblock live web data (G1).**
   - Publish `rivalmonday.com/bot`, set `WEB_MONITORING_ENABLED=true`, and crawl the pilot competitors.
   - This one owner task activates the price tracker, promo detection and two moves.
   - Without it, every demo competes on reviews and rankings, where Rival Monday is behind.
2. **Deploy (G4, part of Phase 7)** and fix the 28–36 s page loads (co-locate the region, pool connections) before any pilot client logs in.
3. **Re-scope Phase 6 around what sets Rival Monday apart:**
   - MCP tools that lead with `list_moves`, `get_move`, `get_price_history` and `get_evidence`. Each answer carries evidence links.
   - Ask answers that use the existing verifier.
   - Market it as "competitor evidence in Claude or ChatGPT", not "we have MCP".
   - Ship enforced budget caps and Ask quotas with it (G9), not after.

### Next (wholesale readiness, around months 2–4)
4. **Minimum white-label (G2, G16):**
   - custom domain via the Vercel Domains API;
   - agency sending domain (Postmark sender signatures + DKIM);
   - logo upload;
   - a changeable accent colour;
   - assistant rename and a simple voice setting (formal / friendly / blunt + banned phrases, already in the spec).
5. **Stripe Billing for wholesale seats (G3).** A platform fee + per-seat price, with an "extra competitor" add-on (≈ $5–10 per competitor per month; see the Competitors.app benchmark).
6. **AI-search visibility, light version (G5).** For each client keyword, ask 2–3 AI engines "best <service> in <town>" each month and record which businesses are named. Store the raw answer as evidence. This reuses the evidence vault and moves engine: add a move such as "competitor gaining in AI answers". It also gives the agency a 2026 sales story.
7. **A geo-grid good enough to show clients (G7).** Map-tile background, competitor ranks per point, and an "on demand" scan button for prospecting.

### Later (around months 4–9)
8. **GoHighLevel marketplace app** (and Vendasta): use these as distribution rather than competing with them. GHL has white-label and billing but no competitor intelligence, which complements Rival Monday.
9. **Close the action loop (G14).** Draft a GBP post, an ad-copy angle or a review-response theme from a recommendation; the agency approves, nothing auto-publishes. Keep the evidence rule.
10. **Ad creative images (G8), SMS (G13), CSV and REST API (G10), custom verticals (G12), second vendor for reviews and SERP (G15).**
11. **Social (G11)** only for verticals where it matters (dental, med spa).

### Positioning statement (proposed)
> *"The weekly competitor brief your clients actually read: what rivals changed in price, promos, ads, hiring, reviews and rankings; what it means; and what to do. Every claim links to proof. Under your brand, approved by you."*

Lead with **moves + prices + proof + agency control**. Don't lead with rankings, reviews or MCP, where competitors are equal or ahead.

---

## 10. Open items to verify
- RivalMappd's vendor site, white-label and website tracking (only Capterra was found). It is the closest direct match.
- Whether Birdeye Competitors AI is an add-on or bundled, and how often it refreshes.
- Plan gating for the BrightLocal and AgencyAnalytics MCP servers.
- Whether a GoHighLevel or Vendasta marketplace app now offers competitor intelligence (still open from the study, Appendix B).
- Local Falcon custom-domain white-label, and Falcon Agent plan eligibility.
- All competitor prices: check vendor pages directly. This pass relied on search summaries.
