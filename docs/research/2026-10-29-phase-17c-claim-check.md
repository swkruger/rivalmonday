# Phase 17c claim check (2026-10-29)

What 17c pages may say about Rival Monday (code at `21622051`). Ids binding. `gated` = owner checks/switches before publishing; `not built` = never claim. Never name data vendors.

## Capabilities (`cap-<CapabilityKey>`)

| id | claim | code path(s) | status | allowed wording |
|---|---|---|---|---|
| cap-websites | Snapshots of rivals' key pages, changes flagged | packages/collectors/src/capture/capture-page.ts, apps/web/src/server/env.ts | gated: WEB_MONITORING_ENABLED | "We snapshot rivals' key pages and flag changes" once on; until then `partial` "Switching on soon" |
| cap-reviews | Rivals' Google reviews | packages/collectors/src/reviews/post.ts | shipped | "Rivals' new Google reviews, weekly." |
| cap-ads | Meta and Google ads | packages/collectors/src/ads/meta.ts, packages/collectors/src/ads/google.ts | shipped | "Rivals' ads on Meta and Google." |
| cap-gbp | Google Business Profile changes | packages/collectors/src/gbp/collect-gbp.ts | shipped | "Changes to rivals' Google Business Profiles." |
| cap-rankings | Weekly map rankings on a grid | apps/worker/src/jobs/vendor.ts | shipped | "Weekly map rankings across the service area." |
| cap-social | Competitor social | packages/collectors/src/sources/kinds.ts (no social kind) | not built | none; cell `no` |
| cap-weeklyBrief | Monday brief (client-local); agency may review | packages/engine/src/briefs/review.ts | shipped | "A brief every Monday; your team can edit or approve it first." |
| cap-evidenceLinks | Claims link to evidence; unbacked dropped | packages/ui/src/components/citation-pill.tsx, packages/engine/src/briefs/support.ts | shipped | "Every claim links to its evidence." |
| cap-assistant | Friday (Ask), renamable | packages/core/src/access.ts | shipped (plan feature `ask`) | "Friday answers with its sources, under the name you choose." |
| cap-mcp | Remote MCP server | packages/mcp/src/server.ts, apps/web/src/app/mcp/route.ts | shipped (plan feature `mcp`) | "AI tools that support MCP can read your clients' data." |
| cap-api | Public REST API | apps/web/src/app/api (internal routes only) | not built | none; cell `no` |
| cap-whiteLabel | Name, logo, colours, sender, sign-off, assistant name; no product name on client pages | packages/email/src/branding.ts, apps/web/src/app/white-label-leak.test.tsx | shipped, partial (own domain not built, 13a) | P15 wording; cell `partial` |
| cap-reseller | Bill clients in your name (Connect, direct charges) | packages/tools/src/tools/client-billing.ts | shipped | "Bill clients through your own Stripe account." |
| cap-publicPricing | $229/mo incl. 3 seats, $99/seat, 30-day trial | apps/site/content/pricing.ts, packages/billing/src/seed.ts | shipped | figures from `PRICING` only |
| cap-trial | 30-day trial; 1 active client until a card is added (open sign-ups only, not invites) | packages/billing/src/access.ts | shipped | "30-day free trial; one active client until you add a card." |

## Sources (`src-<slug>`)

| id | claim | code path(s) | status | cadence |
|---|---|---|---|---|
| src-competitor-websites | Named bot, robots.txt, ≥ 3 s per host | packages/collectors/src/web/robots.ts, packages/collectors/src/schedule/due-pages.ts | gated: WEB_MONITORING_ENABLED | "Daily or weekly per page" (weekly on the trial allowance) |
| src-google-reviews | Reviewer names pseudonymised, contacts removed | packages/collectors/src/reviews/upsert.ts, packages/collectors/src/sources/due.ts | shipped | "Weekly" |
| src-google-business-profile | Listing fields (categories, hours, rating) | packages/collectors/src/gbp/collect-gbp.ts | shipped | "Weekly" |
| src-ads | Meta Ad Library + Google Ads Transparency Center (named in text, no logos) | packages/collectors/src/ads/meta.ts, packages/collectors/src/ads/google.ts | shipped | "Weekly" |
| src-local-map-rankings | Grid, ≤ 5 keywords | packages/collectors/src/rankings/settings.ts | shipped | "Weekly (Sunday)"; "Scan now" once a week |
| src-job-postings | Google job listings matched to the rival | packages/collectors/src/jobs/post.ts, packages/collectors/src/jobs/collect.ts | shipped | "Weekly" |

## Integrations (`int-<slug>`)

| id | claim | code path(s) | status | allowed wording |
|---|---|---|---|---|
| int-openrouter | Writing, Friday, embeddings, Jev checks; ZDR | packages/ai/config/ai.yaml | shipped | "Routes our AI calls." |
| int-anthropic | Claude via OpenRouter + direct Batches API (topics) | packages/ai/src/anthropic-batch.ts | shipped | plan example; never "all our AI is Claude" |
| int-neon | Postgres, row-level security per agency | packages/db/src/tenant.ts, packages/db/migrations/0001_rls.sql | shipped | "Row-level security walls off each agency." |
| int-vercel | Hosts app, API, MCP endpoint, this site | docs/DEPLOY.md | shipped | no "cron" (worker schedules) |
| int-railway | The worker (collection, schedules) | apps/worker/railway.json | shipped | as claim |
| int-cloudflare | R2 evidence store; Turnstile on join, sign-up, intake | packages/storage/src/r2.ts, apps/web/src/server/turnstile.ts, apps/web/src/app/api/waitlist/route.ts | shipped | plan example |
| int-postmark | Briefs, alerts, invites, sign-in mail; bounces | packages/email/src/transport.ts, apps/web/src/app/api/postmark/webhook/route.ts | shipped | as claim |
| int-stripe | Billing (agencies), Connect Standard (clients) | packages/billing/src/stripe-gateway.ts, packages/billing/src/connect-fee.ts | shipped; "no platform fee" gated: connect_application_fee_percent = 0 | Only while global + every per-agency fee = 0. **Owner check** `/platform/billing` |
| int-sentry | Errors from web, worker, site; scrubbed (`redactForLog`) | apps/worker/src/sentry.ts, apps/site/src/lib/sentry-options.ts, packages/core/src/server/log.ts | shipped | as claim |
| int-data-stored | Home integrations body: data stored in our DB + evidence store; redacted model input reaches AI providers, errors Sentry | packages/storage/src/r2.ts, packages/collectors/src/evidence/model-privacy.ts | shipped | "is stored in our database and evidence store"; never "stays" |

## Pricing feature rows (`feat-<slug>`)

Client users get dashboard, Friday, MCP only if the agency switches them on (`client.features` default `[]`; `hasChannel` needs the plan too).

| id | claim (all shipped) | code path | agency · business |
|---|---|---|---|
| feat-weekly-brief | Monday brief | packages/engine/src/briefs/deliver.ts | yes · yes |
| feat-alerts | Alerts on big moves | packages/engine/src/alerts/create.ts | yes · yes |
| feat-dashboard | Client dashboard | apps/web/src/app/(app)/c/[clientId]/page.tsx | yes · set by agency |
| feat-evidence-links | Evidence links | apps/web/src/app/files/evidence | yes · yes |
| feat-friday | Friday | packages/ask/src/turn.ts | yes · set by agency |
| feat-mcp | MCP | packages/mcp/src/server.ts | yes · set by agency |
| feat-branding | Your branding | packages/email/src/branding.ts | yes · no |
| feat-competitor-discovery | Competitor discovery | packages/collectors/src/rivals/run.ts | yes · yes (auto once; then on request through your agency) |
| feat-map-rankings | Weekly map rankings | packages/collectors/src/rankings/scan.ts | yes · yes |
| feat-client-billing | Client billing in your name | packages/tools/src/tools/client-billing.ts | yes · no |

`standard` versions default to `["ask","mcp"]` (packages/db/src/schema/billing.ts). **Owner check:** prod has both.

## FAQ (`faq-<topic>`)

| id | claim | code path(s) | status | allowed wording |
|---|---|---|---|---|
| faq-white-label | As cap-whiteLabel. Still ours: app host (`APP_URL`: logins, links, MCP URL), sending address (`EMAIL_FROM`; display name = agency), privacy link | apps/web/src/server/env.ts, apps/web/src/lib/links.ts | shipped, partial | P15 wording + "your own web address is on the roadmap" |
| faq-data | Public information only; no logins; reviewers pseudonymised | packages/collectors/src/evidence/privacy.ts | shipped | "Public information only" + link `/sources` |
| faq-mcp | Connector URL `<app>/mcp`, OAuth permission | packages/mcp/src/auth.ts | shipped (plan feature `mcp`) | plan wording; "included in the plan" |
| faq-cancel | Agency: *Manage billing* → Stripe portal, period end. Client: agency runs `disable_client_billing`; client portal can't cancel | packages/billing/src/state.ts, packages/tools/src/tools/client-billing.ts | gated: Stripe portal cancel setting | "Cancel from Billing; access lasts to the end of the paid period." **Owner check:** the Stripe portal allows cancel |

## 17b claims checked

Shipped as written: listing lookup, rival tiers (packages/core/src/domain.ts), verifier drop (packages/engine/src/briefs/verify.ts), robots.txt, approved real sample (packages/tools/src/tools/platform-waitlist.ts), privacy facts (packages/tools/src/waitlist/public.ts).

### 17b copy to correct
1. Website/snapshot claims (gated; keep once `WEB_MONITORING_ENABLED=true`): `HERO.sub`, `HOW_STEPS[2]`, how-it-works § 1 and § 4 ("see the snapshot"), `SECTIONS.checks.body` ("a page snapshot"), `checks-hub.tsx` "Competitor websites" (also lists only Meta ads); fictional: `SECTIONS.sample.body`, sample Friday question.
2. how-it-works § 3 "unsure, a person decides": unsure = dropped (packages/engine/src/briefs/support.ts); teams can edit or approve each brief.
3. `SECTIONS.friday` "…for AI tools that support MCP": MCP isn't Friday; clients' own AI tools read the evidence. "Included" = plan + per-client switch.
4. `COUNTER_LABELS` (packages/tools/src/waitlist/site-status.ts): "rival sites watched" counts tracked rivals → "rivals watched"; "snapshots taken" counts all `capture` rows (mostly vendor captures while web is off) → "evidence captures" or hide while gated.
5. `HERO.eyebrow` "White-label…", "under your brand" rest on cap-whiteLabel `partial`: owner decides.
6. Owner confirms: business price (`NEXT_PUBLIC_CLIENT_PRICE_USD`) is site config; real-sample "a limited number each month" isn't enforced.

## Research § 2 RM column corrections
Ads Meta + Google; social no; white-label partial (no own domain, 13a); public API no (MCP only); trial 30 d, 1 active client until a card; website changes gated in prod.

## Industries (`ind-<topic>`)

| id | claim | code path(s) | status | allowed wording |
|---|---|---|---|---|
| ind-any | Any local business can be added; collection isn't tied to a trade | packages/tools/src/tools/verticals.ts | shipped; dedicated plays only for trades with a runbook (Phase 14) | "Works well with any industry." "Any local business works the same way: we search its area, suggest the rivals that matter and watch them every week." |
