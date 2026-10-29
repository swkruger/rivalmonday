# Phase 17c claim check (2026-10-29)

What 17c pages may say about Rival Monday, read from the code at `21622051`. Ids are binding. `gated` = owner checks or switches it before publishing; `not built` = never claim. Never name data vendors.

## Capabilities (`cap-<CapabilityKey>`)

| id | claim | code path(s) | status | allowed wording |
|---|---|---|---|---|
| cap-websites | Snapshots of rivals' key pages, changes flagged | packages/collectors/src/capture/capture-page.ts, apps/web/src/server/env.ts | gated: WEB_MONITORING_ENABLED (unset in prod) | "We snapshot rivals' key pages and flag changes" once on; until then `partial` "Switching on soon" |
| cap-reviews | Rivals' Google reviews | packages/collectors/src/reviews/post.ts | shipped | "Rivals' new Google reviews, weekly." |
| cap-ads | Meta and Google ads | packages/collectors/src/ads/meta.ts, packages/collectors/src/ads/google.ts | shipped | "Rivals' ads on Meta and Google." |
| cap-gbp | Google Business Profile changes | packages/collectors/src/gbp/collect-gbp.ts | shipped | "Changes to rivals' Google Business Profiles." |
| cap-rankings | Weekly map rankings on a grid | packages/collectors/src/rankings/scan.ts, apps/worker/src/jobs/vendor.ts | shipped | "Weekly map rankings across the service area." |
| cap-social | Competitor social | packages/collectors/src/sources/kinds.ts (no social kind) | not built | none; cell `no` |
| cap-weeklyBrief | Monday brief (client-local); agency may review first | packages/engine/src/briefs/schedule.ts, packages/engine/src/briefs/review.ts | shipped | "A brief every Monday; your team can edit or approve it first." |
| cap-evidenceLinks | Claims link to stored evidence; unbacked claims dropped | packages/ui/src/components/citation-pill.tsx, packages/engine/src/briefs/support.ts | shipped | "Every claim links to its evidence." |
| cap-assistant | Friday (Ask), renamable | packages/ask/src/turn.ts, packages/core/src/access.ts | shipped (plan feature `ask`) | "Friday answers with its sources, under the name you choose." |
| cap-mcp | Remote MCP server | packages/mcp/src/server.ts, apps/web/src/app/mcp/route.ts | shipped (plan feature `mcp`) | "AI tools that support MCP can read your clients' data." |
| cap-api | Public REST API | apps/web/src/app/api (internal routes only) | not built | none; cell `no` |
| cap-whiteLabel | Name, logo, colours, sender name, sign-off, assistant name; no product name on client pages | packages/email/src/branding.ts, apps/web/src/app/white-label-leak.test.tsx | shipped, partial (own domain not built, 13a) | P15 wording; cell `partial` |
| cap-reseller | Bill clients in your name (Connect Standard, direct charges) | packages/tools/src/tools/client-billing.ts | shipped | "Bill clients through your own Stripe account." |
| cap-publicPricing | $229/mo incl. 3 seats, $99/seat, 30-day trial | apps/site/content/pricing.ts, packages/billing/src/seed.ts | shipped | figures from `PRICING` only |
| cap-trial | 30-day trial, 1 active client until a card is added | packages/billing/src/access.ts | shipped | "30-day free trial; one active client until you add a card." |

## Sources (`src-<slug>`)

| id | claim | code path(s) | status | cadence |
|---|---|---|---|---|
| src-competitor-websites | Named bot, robots.txt, ≥ 3 s per host | packages/collectors/src/web/robots.ts, packages/collectors/src/web/rate-limit.ts, packages/collectors/src/schedule/due-pages.ts | gated: WEB_MONITORING_ENABLED | "Daily or weekly per page" (weekly on the trial allowance) |
| src-google-reviews | Google reviews; names pseudonymised, contact details removed | packages/collectors/src/reviews/upsert.ts, packages/collectors/src/sources/due.ts | shipped | "Weekly" |
| src-google-business-profile | Listing fields (categories, hours, rating) | packages/collectors/src/gbp/collect-gbp.ts | shipped | "Weekly" |
| src-ads | Meta Ad Library + Google Ads Transparency Center (text only) | packages/collectors/src/ads/meta.ts, packages/collectors/src/ads/google.ts | shipped | "Weekly" |
| src-local-map-rankings | Grid scan, ≤ 5 keywords | packages/collectors/src/rankings/settings.ts | shipped | "Weekly (Sunday)"; "Scan now" once a week |
| src-job-postings | Google job listings matched to the rival | packages/collectors/src/jobs/post.ts, packages/collectors/src/jobs/collect.ts | shipped | "Weekly" |

## Integrations (`int-<slug>`)

| id | claim | code path(s) | status | allowed wording |
|---|---|---|---|---|
| int-openrouter | Briefs, alerts, Friday, embeddings (an OpenAI model), Jev claim checks; ZDR, no data collection | packages/ai/config/ai.yaml | shipped | "Routes our AI calls." |
| int-anthropic | Claude models via OpenRouter + direct Message Batches API (topic discovery) | packages/ai/src/anthropic-batch.ts | shipped | plan example; never "all our AI is Claude" |
| int-neon | Postgres, row-level security per agency | packages/db/src/tenant.ts, packages/db/migrations/0001_rls.sql | shipped | "Row-level security walls off each agency." |
| int-vercel | Hosts the app, API, MCP endpoint, this site | docs/DEPLOY.md | shipped | no "cron" (schedules run in the worker) |
| int-railway | Runs the worker (collection, schedules) | apps/worker/railway.json | shipped | as claim |
| int-cloudflare | R2 evidence store; Turnstile on join, sign-up, intake | packages/storage/src/r2.ts, apps/web/src/server/turnstile.ts, apps/web/src/app/api/waitlist/route.ts | shipped | plan example |
| int-postmark | Briefs, alerts, invites, sign-in mail; bounce webhook | packages/email/src/transport.ts, apps/web/src/app/api/postmark/webhook/route.ts | shipped | as claim |
| int-stripe | Billing (platform → agency) + Connect Standard (agency → client) | packages/billing/src/stripe-gateway.ts, packages/billing/src/connect-fee.ts | shipped; "no platform fee" gated: connect_application_fee_percent = 0 | Only while the global value and every `agency_connect.application_fee_percent` are 0. **Owner check** `/platform/billing` |
| int-sentry | Errors from web, worker, site; scrubbed (`redactForLog`) | apps/worker/src/sentry.ts, apps/site/src/lib/sentry-options.ts, packages/core/src/server/log.ts | shipped | as claim |

## Pricing feature rows (`feat-<slug>`)

Client users get the dashboard, Friday and MCP only when the agency switches them on per client (`client.features` default `[]`; `hasChannel` also needs the plan feature).

| id | claim (all shipped) | code path | agency · business |
|---|---|---|---|
| feat-weekly-brief | Monday brief | packages/engine/src/briefs/deliver.ts | yes · yes |
| feat-alerts | Alerts on big moves | packages/engine/src/alerts/create.ts | yes · yes |
| feat-dashboard | Client dashboard | apps/web/src/app/(app)/c/[clientId]/page.tsx | yes · set by agency |
| feat-evidence-links | Evidence links | apps/web/src/app/files/evidence | yes · yes |
| feat-friday | Friday | packages/ask/src/turn.ts | yes · set by agency |
| feat-mcp | MCP | packages/mcp/src/server.ts | yes · set by agency |
| feat-branding | Your branding | packages/email/src/branding.ts | yes · no |
| feat-competitor-discovery | Competitor discovery (auto once, then on request) | packages/collectors/src/rivals/run.ts | yes · yes |
| feat-map-rankings | Weekly map rankings | packages/collectors/src/rankings/scan.ts | yes · yes |
| feat-client-billing | Client billing in your name | packages/tools/src/tools/client-billing.ts | yes · no |

`standard` versions default to `["ask","mcp"]` (packages/db/src/schema/billing.ts); staff can drop them. **Owner check:** prod has both.

## FAQ (`faq-<topic>`)

| id | claim | code path(s) | status | allowed wording |
|---|---|---|---|---|
| faq-white-label | As cap-whiteLabel. Still ours: app host (`APP_URL` rivalmonday.app: logins, links, MCP URL), sending address (`EMAIL_FROM`, default `briefs@<app host>`; display name = agency), privacy link on sign-up/intake | apps/web/src/server/env.ts, apps/web/src/lib/links.ts | shipped, partial | P15 wording + "your own web address is on the roadmap" |
| faq-data | Public information only; no logins; reviewers pseudonymised | packages/collectors/src/evidence/privacy.ts | shipped | "Public information only" + link `/sources` |
| faq-mcp | Connector URL `<app>/mcp`, OAuth permission | packages/mcp/src/auth.ts | shipped (plan feature `mcp`) | plan wording; "included in the plan" |
| faq-cancel | Agency: *Manage billing* → Stripe portal, ends at period end. Client: agency runs `disable_client_billing` (period end); client portal can't cancel | packages/billing/src/state.ts, packages/tools/src/tools/client-billing.ts | gated: Stripe portal cancel setting | "Cancel from Billing; access lasts to the end of the paid period." **Owner check:** the Stripe portal allows cancel |

## 17b claims checked

Shipped as written: listing lookup and rival tiers (packages/core/src/domain.ts), the verifier drop (packages/engine/src/briefs/verify.ts), robots.txt, the operator-approved real sample (packages/tools/src/tools/platform-waitlist.ts), privacy draft facts (7-day link, hashed IP, source: packages/tools/src/waitlist/public.ts).

### 17b copy to correct
1. `HERO.sub`, `HOW_STEPS[2]`, how-it-works § 1: websites gated in prod; keep once `WEB_MONITORING_ENABLED=true`.
2. how-it-works § 3 "When the verifier is unsure, a person decides": unsure = dropped (packages/engine/src/briefs/support.ts) → "…the claim is dropped. Your team can edit or approve each brief first."
3. `SECTIONS.friday` "…for AI tools that support MCP": MCP isn't Friday; it lets the client's own AI tools read the evidence. "Included" depends on plan + per-client switch.
4. `COUNTER_LABELS` "rival sites watched" counts tracked rivals (packages/tools/src/waitlist/site-status.ts) → "rivals watched".
5. Owner confirms: business price (`NEXT_PUBLIC_CLIENT_PRICE_USD`, default 99) is site config, not a code plan; real-sample "a limited number each month" isn't enforced.

## Research § 2 RM column corrections
- Ads: ✓ (Meta + Google), not "Meta".
- Social: no (not built).
- White-label: partial (no own domain, 13a).
- Public API: no (MCP only).
- Trial: 30 d, 1 active client until a card is added.
- Website changes: shipped, gated in prod (`WEB_MONITORING_ENABLED`).
