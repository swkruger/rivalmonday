# Core Platform (MVP) — Design Spec

*Date: 2026-09-29 · Status: awaiting review · Codename: CompetitorSpy (ship under a neutral brand)*
*Research basis: [docs/research/2026-09-29-competitor-intel-feasibility-study.md](../../research/2026-09-29-competitor-intel-feasibility-study.md)*

---

## 1. Intent

### 1.1 What we are building
An agency-owned SaaS that monitors the competitors of **local-service SMBs** (pilot verticals: **HVAC/plumbing** and **dental**) using **public information only**, and turns raw changes into evidence-backed intelligence delivered through:
- a **feature-rich dashboard** for agencies and their clients,
- a **fully featured remote MCP server** so every data point is queryable from Claude, ChatGPT and other MCP clients,
- an in-app **Ask assistant** where clients ask questions and get recommended next steps,
- weekly **briefs** and instant **alerts** (email/in-app/SMS/webhook).

### 1.2 Who it is for
| User | Job to be done |
|---|---|
| SMB owner / practice manager | "Tell me quickly if a competitor did something I should react to, and what to do." |
| Agency account manager (AM) | "Weekly value and upsell ammunition for every client without manual research." |
| Agency owner | "Reduce churn, add a high-margin line, win pitches." |

### 1.3 Business context (decided)
- **Conditional go** per the feasibility study; channel = **own agency clients first**, then **wholesale white-label to other agencies** (Phase 2). Direct self-serve SMB is out of scope.
- The first release is **full stack** (all layers below) rather than incremental slices; internal build order still applies.
- Lean budget posture.

### 1.4 Success criteria (8-week pilot, 10–15 own clients)
| Metric | Target |
|---|---|
| Brief items rated useful by AMs | ≥ 60% |
| AM review time per client per week | ≤ 5 min |
| Unsupported claims reaching clients | 0 |
| Recommendations marked done/in progress | ≥ 25% |
| Client attach at $149/mo | ≥ 25% |
| Weekly active dashboard/Ask use among enabled clients | ≥ 40% |
| Technical cost per client per month (pilot scale) | ≤ $15 |

### 1.5 Guiding rules
1. **No evidence, no claim** — applies to briefs, alerts, recommendations and Ask answers alike.
2. **Public data only, collected honestly** — honest User-Agent, robots.txt honoured, no logins, no anti-bot bypass; blocks are recorded, never circumvented.
3. **One capability registry** — dashboard, MCP, Ask and REST all use the same typed tools.
4. **Tenant isolation is enforced below the model** — by the tool layer and Postgres RLS, never by prompts.
5. **Model-agnostic** — every AI task is configured, not hard-coded.

---

## 2. Scope

### 2.1 In scope (MVP)
- Multi-tenant data model (Platform → Agency → Client → Competitors), roles and per-client feature permissions.
- Competitor discovery and page discovery.
- Collectors: websites, GBP profile fields, Google reviews, Google Ads Transparency, Meta Ad Library (US, third-party), jobs, monthly geo-grid rankings, Instagram (optional).
- Evidence vault with immutable, hashed captures and typed observations.
- Intelligence engine: change detection, tagging, scoring & routing, basic cross-channel merge, moves (rule templates), review themes & benchmark, price normalisation.
- Model layer: OpenRouter for generative tasks, Anthropic-direct option for batch, Jev for typed decisions behind a `DecisionProvider`, embeddings provider.
- Intelligence API / tool registry; remote MCP server with OAuth 2.1 + PATs.
- Dashboard: agency portfolio, approval queue, prospecting, branding/voice, users, usage; client workspace modules 1–11 (§5).
- Ask assistant with grounded citations; recommendations with status tracking and agency-editable playbooks.
- Weekly brief pipeline with verifier and AM approval; instant alerts; email; PDF export; quarterly trend report.
- Basic branding for the owning agency (logo, colours, fonts, AI voice, AM sign-off, agency sending domain).
- Usage metering, per-client budget caps, cost ledger.
- Vertical packs: HVAC/plumbing, dental.

### 2.2 Out of scope (later phases)
- **Phase 2 (wholesale):** custom domains per agency (Vercel Domains API), asset URLs on agency domains, vendor-fingerprint scrubbing, per-agency sending domains, agency onboarding flow, agency legal/DPA plumbing, support routing, Stripe Billing for wholesale seats.
- **Phase 3:** Stripe Connect rebilling, co-branding, renameable modules, public REST API GA, learned scoring weights, Facebook page posts, additional verticals and countries (UK/AU after legal review).
- **Never:** Yelp content, Healthgrades/Zocdoc, LinkedIn scraping, logged-in scraping, anti-bot circumvention, reviewer identity exposure.

---

## 3. Tenancy, roles and permissions

- Hierarchy: **Platform → Agency → Client (business) → Competitors.** Every tenant-owned row carries `agency_id` (+ `client_id` where applicable).
- Roles:

| Role | Scope | Capabilities |
|---|---|---|
| Agency Admin | All agency clients | Everything incl. branding/voice, users, usage, limits |
| Account Manager | Assigned clients | Approve/edit briefs; manage competitors, pages, alert rules; prospecting briefs; read client Ask threads |
| Client Owner | Own client | Per-client feature flags set by agency: `briefs_only` \| `dashboard`, `ask`, `mcp`, `manage_competitors`, `alert_rules` |
| Client Viewer | Own client | Read-only subset of Client Owner |

- Agency visibility of client Ask threads: **on by default, disclosed to the client in the Ask UI**, toggleable per client.

---

## 4. Data collection and evidence

### 4.1 Onboarding & discovery
1. AM enters client business, services (from vertical catalog), service area (ZIPs or radius).
2. **Competitor discovery:** DataForSEO Maps SERP for the client's core service keywords across the service-area grid; candidates ranked by service + territory overlap; AM confirms 3–5 (tier limit configurable).
3. **Page discovery:** sitemap + navigation crawl; `DecisionProvider` classifies page type (pricing, service, service-area, promo, careers, team, blog, other); AM can pin/unpin; cap ≈ 25 tracked pages per competitor.

### 4.2 Collectors
All collectors implement a common interface (`collect(target) → Capture[]`), with primary + fallback vendors where scraped.

| Source | Method | Cadence |
|---|---|---|
| Key pages (home, pricing, promos) | Self-hosted Playwright; HTML text hash first, screenshot only on change | Daily |
| All tracked pages | Same | Weekly |
| GBP fields (categories, services, hours, photos, posts) | DataForSEO Business Data | Weekly |
| Google reviews (client + competitors) | DataForSEO (fallback Apify); 24-month backfill at onboarding | Weekly |
| Google Ads | DataForSEO Ads Transparency (fallback SerpApi) | Weekly |
| Meta ads (US) | Apify (fallback ScrapeCreators), logged-off only | Weekly |
| Jobs | Careers pages (crawler) + Google Jobs via SERP API | Weekly |
| Local rankings | DataForSEO Maps with `location_coordinate`, 7×7 grid × ≤ 5 keywords | Monthly + on demand (prospecting) |
| Instagram | Graph API Business Discovery (business accounts only) | Weekly, optional per client |

Crawler conduct: User-Agent `<Brand>Bot/1.0 (+https://<brand>/bot; contact@<brand>)`, robots.txt honoured, ≤ 1 request per few seconds per host, never branded as an AI crawler; public bot information page.

### 4.3 Shared public data, private analysis
- `competitor` is a **global** entity keyed by domain and Google `place_id`, captured **once** regardless of how many clients track it.
- Global tables (public, neutral): `competitor`, `tracked_page` (union), `capture`, `evidence`, `observation`, `ad`, `review`, `rank_snapshot`.
- Tenant tables (private): `client_competitor`, `event_score`, `move`, `brief`, `recommendation`, `alert`, `ask_*`, `feedback`, etc. Clients reach global data only via `client_competitor`.

### 4.4 Evidence vault
- Every capture → `evidence` record: `id`, `source`, `url`, `captured_at`, `sha256`, `collector_version`, `status`, R2 object keys (html.gz, text, screenshot.webp, vendor JSON).
- **Immutable, append-only**; `legal_hold` flag blocks deletion.
- Collectors normalise into **typed observations** (price, service offered, ad creative, review, rank position, job posting, GBP field), each referencing an `evidence_id`.
- Capture status enum: `ok | unchanged | blocked | robots_disallowed | vendor_error | timeout`; surfaced in the dashboard ("site blocks monitoring").

### 4.5 Privacy
- Reviewer names → salted hash at ingest (dedupe only); identities never shown to clients or sent to models.
- PII and health details stripped before any model call.
- Retention: raw review text 24 months; aggregates indefinite; full screenshots 12 months; text/diffs indefinite; any evidence referenced by a delivered brief retained for the brief's lifetime.
- Deletion/objection request process; no sale of data.

---

## 5. Dashboard

### 5.1 Agency-only
- **Portfolio:** all clients with new alerts, briefs awaiting approval, competitive-pressure score, last activity.
- **Approval queue:** Friday brief drafts — edit inline, reorder, drop, approve, send now, per-client auto-send toggle.
- **Prospecting:** one-off brief on a prospect's competitors (discovery + one collection pass + brief).
- **Branding & voice:** logo, colours, fonts, favicon; voice (formal/friendly/blunt), preferred terms, banned phrases; AM sign-off and booking link.
- **Users, usage & limits:** seats, per-client spend vs cap, question quotas.
- **Playbooks:** view/edit vertical playbooks (agency overrides).

### 5.2 Client workspace (visible per permissions)
1. **Overview** — this week's brief, alerts, threat level per competitor, top moves, suggested Ask questions.
2. **Competitors** — profile per competitor: timeline of changes and moves, tracked pages, prices, ads, reviews, rankings, collection status.
3. **Changes feed** — all scored events, filterable (competitor, type, service, score, date); side-by-side **evidence viewer** (before/after screenshot, highlighted text diff, metadata, hash).
4. **Pricing tracker** — service × business price matrix with history charts.
5. **Ads** — Meta + Google creative archive, first/last seen, active-ad trend; "targeting not disclosed (US)" labelling.
6. **Reviews & reputation** — theme heatmap (client vs competitors), rating and review-velocity trends, sample reviews (pseudonymised).
7. **Local rankings** — geo-grid heatmaps per keyword, share of voice over time.
8. **Moves** — detected moves with status, confidence and evidence chain.
9. **Recommendations** — list/kanban by status; owner, effort, impact, due date, source; upsell tag visible to agency only.
10. **Ask** — chat with citations (§8).
11. **Settings** — services & service area, competitors & pages, alert rules, notification preferences, **AI connections** (MCP connector instructions, personal access tokens).

---

## 6. Intelligence engine

Stages communicate through the database; each stage is idempotent, keyed by `(capture_id, stage, stage_version)`, and re-runnable.

### 6.1 Change detection
- **Web:** main-content extraction (strip nav/footer/scripts/cookie banners); **volatile-region learning** (a block changing in ≥ 3 of the last 5 captures without semantic significance is masked); block chunking and alignment (DOM path + text similarity); semantic change = embedding cosine below threshold.
- **Numeric rule layer:** prices, percentages, dates, durations extracted as structured facts `(service?, value, unit, conditions)` via rules with LLM fallback; **any numeric change is always flagged**.
- **Structured sources:** set differences — new/stopped ad, new review, rank delta, new/removed job, GBP field change.

### 6.2 Tagging (via `DecisionProvider`)
- **Meaningful vs cosmetic** gate (Noul).
- **Type** (Choice) from: `price_change, promo, new_service, service_removed, service_area_change, new_location, hiring, ad_started, ad_stopped, review_spike, rating_change, content, cosmetic`.
- **Service mapping** (Choice) to the client vertical's service catalog.
- **Cross-channel merge** (Noul "same offer?"): same competitor + same service + same offer within 14 days → one event with multiple evidence items.

### 6.3 Scoring & routing (plain code, per event × client)
```
score = 100 × type_weight[vertical][type] × size × relevance × novelty     (each factor 0..1)
size       = f(type): % price change curve; count of new ads; rating/velocity z-score; rank delta
relevance  = service_overlap(event.service, client.services) × territory_overlap(competitor, client.area)
novelty    = 1 − max_similarity(event, same competitor's events in last 12 months)
route: score ≥ 70 → alert · 40–69 → weekly brief · < 40 → archive   (thresholds per client)
```
Weights and curves live in versioned vertical-pack YAML; every score stores its factor breakdown for explainability.

### 6.4 Moves (nightly, 90-day window per competitor × client)
| Move | Rule (initial) |
|---|---|
| Territory expansion | ≥ 2 of: new service-area page / GBP area / ads / jobs referencing client ZIPs or towns |
| Price war | ≥ 2 price cuts on overlapping services, or promo + ad burst |
| New service line | new service page + (GBP service added or ads for it) |
| Hiring push | ≥ N new postings in 30 days (N per vertical) |
| Promo blitz | promos in ≥ 2 channels concurrently |
| Reputation slump | rating drop ≥ threshold or complaint-theme spike |
| Ad surge | active ads ≥ 2× the competitor's 90-day baseline |

Each move has `status (emerging|active|fading)`, `confidence` (count and channel diversity of supporting events) and an evidence chain.

### 6.5 Review themes & benchmark
- Seed themes per vertical (HVAC: response time, price transparency, technician professionalism, upsell pressure, scheduling, fix quality; dental equivalents in pack).
- Per review: one Noul per theme + sentiment Score, in a single Jev call.
- Theme discovery: when "other" accumulates past a threshold, an LLM proposes a theme; AM approves.
- Benchmark: theme share and sentiment per business over rolling 90-day windows, client vs each competitor, with trend.

### 6.6 Price normalisation
Observed prices → service catalog entries → `price_point` time series powering the pricing tracker.

---

## 7. Model layer

### 7.1 Providers
- **OpenRouter** — default for all generative tasks (OpenAI-compatible chat + tool calling); per-task model and fallbacks; provider routing restricted to no-training / zero-retention providers.
- **Anthropic direct** — optional per task, for Batch API discounts on nightly jobs.
- **Jev (TypeSafe, System One)** — typed decisions (Choice / Score / Noul) with calibrated confidence; hosted, early access.
- **Embeddings** — separate provider config (Voyage or OpenAI).

### 7.2 Task configuration (illustrative)
```yaml
tasks:
  brief_writer:   { provider: openrouter, model: anthropic/claude-sonnet-5, fallbacks: [openai/gpt-5-mini] }
  ask_assistant:  { provider: openrouter, model: anthropic/claude-sonnet-5 }
  value_extract:  { provider: openrouter, model: anthropic/claude-haiku-4.5 }
  theme_discovery:{ provider: openrouter, model: anthropic/claude-sonnet-5 }
  decisions:      { provider: jev, escalate_to: llm_decisions, min_confidence: { default: 0.85 } }
  llm_decisions:  { provider: openrouter, model: anthropic/claude-haiku-4.5, mode: structured }
  embeddings:     { provider: voyage, model: voyage-3.5-lite }
```
Model identifiers are validated at implementation time against provider catalogs.

### 7.3 DecisionProvider
- Interface: `decide(state, questions[]) → answers[]` where each question is `choice(options ≤ 255) | score(rubric) | noul(statement)` and each answer carries `value`, `probabilities?`, `confidence`.
- Implementations: `JevDecisionProvider`, `LlmDecisionProvider` (structured output via OpenRouter).
- **Confidence cascade:** Jev → (confidence < τ) LLM → (still < τ) AM review queue. τ configurable per question type.
- **Shadow evaluation:** configurable sample rate runs both providers; results compared to gold labels; accuracy dashboard; config switch moves a decision type to the LLM without code changes.

### 7.4 Uses of DecisionProvider
Meaningful-change gate, change type, service mapping, page type, cross-channel merge, review themes + sentiment, **verifier support checks** (brief and Ask), Ask guardrails (out-of-scope, injection suspicion).

### 7.5 Cost ledger
Every model and vendor call writes `llm_call` / `vendor_call` rows: task, provider, model, tokens, cost, latency, agency, client. Feeds usage UI, budget caps and business-case metrics.

---

## 8. Intelligence API, MCP server and Ask

### 8.1 Tool registry (`packages/core`)
Each tool: `name`, `description`, `input` (Zod), `output` (Zod), `permission`, `handler(ctx, input)`. Served via: internal typed API (dashboard), MCP server, Ask tool calling, REST (Agency+; later GA).

**Access context** on every call: `agency_id, user_id, role, allowed_client_ids, feature_flags`. Handlers use scoped repositories only; Postgres RLS is the second barrier; every call is audit-logged (actor, tool, input hash, row count).

### 8.2 Tools
| Domain | Read | Write (role-gated) |
|---|---|---|
| Workspace | `list_clients`†, `get_client_profile` | `update_service_area`, `update_services` |
| Competitors | `list_competitors`, `get_competitor_profile`, `get_competitor_timeline` | `add_competitor`, `remove_competitor`, `pin_page`† |
| Changes & evidence | `search_events`, `get_event`, `get_evidence`, `compare_snapshots` | `submit_feedback` |
| Pricing | `get_price_matrix`, `get_price_history` | — |
| Ads | `list_ads`, `get_ad_activity` | — |
| Reviews | `get_theme_benchmark`, `search_reviews`, `get_rating_trend` | — |
| Rankings | `get_geogrid`, `get_share_of_voice` | — |
| Moves | `list_moves`, `get_move` | — |
| Briefs & actions | `list_briefs`, `get_brief`, `list_recommendations`, `list_alerts` | `update_recommendation_status`, `approve_brief`†, `set_alert_rules` |
| Search | `search` (semantic over evidence text), `fetch` (any item by id) | — |
| Agency | `get_usage`†, `run_prospecting_brief`† | — |

† agency roles only. Client write access governed by per-client flags.

All results include `evidence_ids` and dashboard deep links; list tools paginate and accept `detail=summary|full`.

### 8.3 MCP server (`apps/mcp`)
- Remote, **Streamable HTTP**, path `/mcp`; stateless containers; official MCP TypeScript SDK; JSON Schemas generated from Zod.
- **Auth:** OAuth 2.1 (PKCE, dynamic client registration) with a consent screen that selects the client workspace; scopes `read`, `feedback`, `manage`. **Personal access tokens** for Claude Desktop / Claude Code / scripts.
- **Resources:** `evidence://{id}` (text + screenshot image), `brief://{id}`.
- **Prompts:** `weekly_review`, `competitor_deep_dive`, `respond_to_price_change`, `prepare_client_meeting`.
- `search` / `fetch` shaped for ChatGPT connector and deep-research compatibility.
- White-label: server name and tool descriptions use the agency's product name.
- Gating: per tier and per client flag; per-token rate limits; usage metered.
- Errors: typed (`permission_denied`, `not_found`, `rate_limited`, `quota_exceeded`); never reveal existence of other tenants' data.

### 8.4 Ask assistant
- Chat per client workspace; threads persisted; streaming; Sonnet-class via OpenRouter; tools = registry filtered by the user's access context; write tools require explicit user confirmation in the UI.
- Suggested starter questions generated from the week's events.
- **Grounding:** factual sentences must cite evidence ids returned by tools in the current turn → post-generation check (citation present + Jev Noul support) → unsupported sentences removed or replaced with "I don't have evidence for that in the monitored data". Interpretations labelled "Possible reason", with confidence; no statements of competitor motive as fact. Citations render as chips opening the evidence viewer.
- **Prompt-injection defence:** tool outputs containing scraped content are wrapped as delimited data; instruction-like text sanitised; Jev guardrail flags suspected injection and out-of-scope requests; tenancy and write confirmation enforced by the tool layer, not the model.
- **Cost controls:** per-tier monthly question quota; prompt caching of system prompt + tool definitions; max ~8 tool steps per answer; summaries first. Estimated $0.02–0.10 per question.
- Brand voice from agency settings.

### 8.5 Recommendations
- Sources: brief items, move-triggered playbooks, Ask ("save as recommendation").
- **Playbook library** per vertical (trigger → response template), agency-editable; LLM personalises with evidence and client context. Examples: competitor price cut → bundle rather than match; competitor complaint theme where client is strong → ad messaging; territory expansion → GBP posts + LSA budget in affected ZIPs.
- Record: `title, rationale, evidence_ids, move_id?, effort (L/M/H), impact, owner (client|agency), status (todo|in_progress|done|dismissed), dismiss_reason?, due_at, source, upsell_tag (agency-only)`.
- Status changes and reasons are stored as feedback.

---

## 9. Briefs, alerts and delivery

### 9.1 Weekly brief (Thu night → Fri approval → Mon delivery)
1. **Gather:** events scoring 40–69, week's alerts, new/active moves, theme shifts, rank shifts.
2. **Select:** top 3–5 by score, ≤ 2 items per competitor.
3. **Write:** structured output `{summary, items[{headline, what_changed, why_it_matters, recommended_action, confidence, evidence_ids[], upsell_tag}]}`; each `recommended_action` becomes a recommendation record.
4. **Verify:**
   - Deterministic: quoted numbers/prices present in cited evidence text; dates consistent with capture times; geographic/targeting claims require geographic evidence; competitor names match monitored entities.
   - Jev Noul support check per sentence.
   - Unsupported sentences dropped; item dropped if its headline fails.
5. **Quiet week:** if nothing ≥ 40, send "No significant competitor moves this week" plus a trend snapshot. Never pad.
6. **Approval:** AM queue Friday; edits stored as feedback; optional per-client auto-send Monday 07:00 local if untouched.

### 9.2 Delivery
- Dashboard (canonical, archived); branded HTML email from the agency sending domain (SPF/DKIM/DMARC; reply-to AM) with **signed deep links** that authenticate into the evidence viewer; branded PDF with clean metadata; auto-generated **quarterly trend report**.

### 9.3 Alerts (score ≥ 70)
- AM notified immediately. Client mode per client: `direct | after_am_check (default) | digest_only`.
- Channels: in-app, email; optional SMS (Twilio); Slack/Teams webhooks for agencies.
- Throttle ≤ 3 alerts per client per day, overflow digested; near-duplicates merged; per-user channel preferences and quiet hours.

### 9.4 Email infrastructure
Postmark; MVP uses the owning agency's single sending domain; data model supports per-agency domains for Phase 2.

---

## 10. Architecture

### 10.1 Repository layout (pnpm + Turborepo, TypeScript)
```
apps/web        Next.js App Router — dashboard, auth, internal API, Ask UI
apps/mcp        Remote MCP server
apps/worker     pg-boss job runners — collectors, engine stages, briefs, alerts, email
packages/core        domain types, tool registry, permissions
packages/db          Drizzle schema, migrations, RLS policies, scoped repositories
packages/ai          OpenRouter / Anthropic / Jev / embeddings adapters, task config, DecisionProvider, cost ledger
packages/collectors  Playwright, DataForSEO, Apify/ScrapeCreators, Instagram, jobs, geo-grid
packages/engine      diff, tag, score, moves, themes, prices, brief writer, verifier
packages/verticals   vertical packs (YAML): catalogs, theme seeds, weights, thresholds, playbooks
packages/ui          design system, evidence viewer, geo-grid heatmap, charts
packages/email       React Email templates
```

### 10.2 Infrastructure
| Concern | Choice |
|---|---|
| Frontend | **React + Next.js (App Router) + Tailwind CSS + shadcn/ui** (Radix primitives, lucide icons). React Server Components read through the tool registry; Server Actions for writes; client components only where interactive. Brand tokens from `docs/brand/brand.md` as CSS variables in the Tailwind theme, **overridden per agency at the root layout** (white-label = swap variables, no rebuild). Charts: shadcn charts (Recharts). Tables: TanStack Table. Forms: react-hook-form + Zod (shared schemas with the tool registry). Ask streaming: Vercel AI SDK UI hooks against our own route handler (model calls still go through `@cs/ai`). Tests: Vitest + Testing Library, Playwright E2E. Design reference: `docs/brand/mockups/`. |
| Deployment model | **Hybrid:** Vercel for everything request-driven; one small always-on worker for queue and crawling |
| Web app, internal API, MCP server | **Vercel** (Next.js, Fluid compute; MCP via Vercel's MCP handler on Streamable HTTP) |
| Database | Postgres 16 + pgvector on **Neon** (Vercel Marketplace); pooled connection string for Vercel functions, direct string for migrations and the worker. Tenant settings are transaction-local, so they are safe behind the pooler. |
| Scheduling | **Vercel Cron** hits authenticated endpoints that enqueue pg-boss jobs |
| Queue / workers | pg-boss on an **always-on worker container** (Railway or Fly.io, ~$5–20/mo) |
| Browser crawling | Playwright on the same worker; per-host concurrency limits; Firecrawl overflow |
| Evidence storage | Cloudflare R2 (no egress fees), served via app-domain signed URLs |
| Domains & edge | Vercel domains, TLS and firewall; Phase 2 agency custom domains via the **Vercel Domains API** (multi-tenant, automatic SSL) |
| Auth | Better Auth (magic link, Google, organisations/roles, OAuth 2.1 provider for MCP) — fallback Auth.js + dedicated OAuth server if gaps found during planning |
| Email | Postmark |
| Observability | Sentry, OpenTelemetry, cost ledger, pg-boss job dashboards |

### 10.3 Multi-tenancy mechanics
- Each request/job opens a transaction setting `app.agency_id` and `app.client_ids`; RLS policies on all tenant tables enforce them.
- Global public-data tables have no tenant columns; access only via tenant-scoped join tables.
- Hostname → agency middleware (single host in MVP).

### 10.4 Core entities
`agency, user, membership, client, client_user, client_feature_flags, competitor, client_competitor, tracked_page, capture, evidence, observation, event, event_score, move, move_event, review, review_theme_tag, theme, price_point, rank_snapshot, ad, brief, brief_item, recommendation, playbook, alert, notification_pref, ask_thread, ask_message, feedback, api_token, oauth_client, audit_log, llm_call, vendor_call, budget`.

### 10.5 Vertical packs
Versioned YAML per vertical (service catalog, theme seeds, type weights, size curves, move thresholds, playbooks); per-agency overrides stored in DB. MVP packs: `hvac_plumbing`, `dental`.

### 10.6 Billing (MVP)
Usage metering and limits only. Stripe Billing arrives with Phase 2.

---

## 11. Error handling

- **Collectors:** exponential backoff → fallback vendor → dead-letter queue; status per competitor × source visible in UI; briefs disclose data gaps.
- **Engine:** idempotent, versioned stages; retries isolated per client.
- **AI:** timeouts + retries; OpenRouter fallbacks; Jev outage → LLM decisions; total model outage → brief postponed and AM notified (never send unverified).
- **Budgets:** per-client monthly AI+vendor cap (warn at 80%, pause Ask and non-essential jobs at 100%); per-vendor circuit breakers.
- **API/MCP:** typed errors; no cross-tenant existence leaks.

---

## 12. Testing and evaluation

- **Unit (TDD):** scoring, move rules, price extraction, verifier rules, permission policies.
- **Tenant-isolation suite:** every registry tool invoked with wrong agency / wrong client must refuse and return nothing; RLS tested directly in Postgres.
- **Golden diff fixtures:** recorded HTML pairs from real HVAC and dental sites with expected events (volatile regions, rewording, price changes, cookie churn).
- **AI eval sets (run in CI on prompt/model/config change):** ~300 labelled changes (Jev vs LLM accuracy and calibration), ~200 labelled reviews (themes), ~50 brief drafts (faithfulness — zero unsupported claims post-verifier), ~50 Ask questions (grounding, injection, cross-tenant probes).
- **E2E:** Playwright for onboarding, approval, evidence viewer, Ask.
- **MCP contract:** MCP Inspector and SDK client tests; OAuth flow; `search`/`fetch` compatibility.

---

## 13. Delivery plan (≈ 18–20 weeks, 1–2 devs with AI coding tools)

| Weeks | Workstream |
|---|---|
| 1–3 | Foundations: monorepo, DB + RLS, auth, tool registry, AI adapters, DecisionProvider, cost ledger |
| 3–8 | Collectors, evidence vault, engine stages, vertical packs |
| 7–12 | Dashboard modules |
| 10–14 | Brief pipeline + verifier, alerts, email, PDF |
| 12–16 | MCP server + OAuth, Ask assistant, recommendations/playbooks |
| 16–20 | Eval sets, hardening, pilot onboarding |

Phase 0 validation (marketplace check for GHL/Vendasta overlaps, external agency LOIs) runs in parallel with weeks 1–3.

---

## 14. Risks and open items

| Item | Handling |
|---|---|
| Jev is early access, hosted-only, vendor benchmarks | Behind `DecisionProvider`; LLM fallback; shadow evaluation; can be disabled by config |
| Better Auth coverage of OAuth 2.1 provider + DCR for MCP | Verify in planning; fallback Auth.js + dedicated OAuth server |
| OpenRouter lacks Anthropic Batch discount | Anthropic-direct provider option per task |
| Third-party scraping vendors (reviews, Meta ads) | Dual vendors; graceful degradation; vendor indemnities where possible |
| Prompt injection via scraped content | Data wrapping, sanitisation, Jev guardrail, tool-layer enforcement |
| Legal (defamation, privacy, data-broker laws) | Verifier + evidence rule, pseudonymisation, retention limits; US counsel sign-off before pilot clients see output |
| Full-stack scope (18–20 weeks) delays pilot learning | Phase 0 concierge/LOIs in parallel; track weekly against plan |
| Product brand name (used in bot User-Agent, bot info page, MCP server default name) | **Decided 2026-09-29: "Rival Monday"** (crawler `RivalMondayBot/1.0`), default AI assistant **"Friday"** (renameable per agency). Pending: trademark attorney knockout search (watch-out: monday.com marks), register rivalmonday.com + .ai |
| Open verifications from study | See feasibility study Appendix B |
