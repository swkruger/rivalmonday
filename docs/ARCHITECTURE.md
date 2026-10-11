# Rival Monday — Architecture (what is built and where)

Status: Phases 0–5 and the demo tool are complete and owner-verified (2026-10-11). Plans: `docs/superpowers/plans/`. Runbook for the live dev environment: [OPS.md](OPS.md). Migrations run through `0037`.

## Package / app map

| Path | Responsibility · key entry points |
|---|---|
| `apps/web` | Next.js App Router app (agency + client UI, `/l/<token>`, `/go/<target>/<id>`, `/files/...`). `src/server/` (auth, `current-viewer.ts`, `run-tool.ts`, `files.ts`, `nav.ts`, `search-params.ts`), `src/dev-panel/`, `scripts/dev.ts` (dev launcher), `scripts/admin.ts` (admin bootstrap/link CLI), `scripts/check-no-dev-panel.ts`, `e2e/` |
| `apps/worker` | pg-boss worker: `src/main.ts`, `src/jobs/*` (web, vendor, engine, moves, reviews, briefs, delivery, model-ops, prospects), CLIs in `src/cli/` (`collect-once`, `engine-once`, `brief-once`, `deliver-once`, `decisions`) |
| `packages/core` | `@cs/core`: access context, tool registry types, signed deep links (`links.ts`), platform-operator helpers (`platform.ts`) |
| `packages/db` | `@cs/db`: Drizzle schema + migrations, RLS tenancy (`tenant.ts` / `withTenant`), ledgers, audit, per-environment DBs (`environments.ts`) |
| `packages/ai` | `@cs/ai`: OpenRouter chat/embeddings, Jev `DecisionProvider` + cascade, shadow sampling, Anthropic Message Batches; routing in `config/ai.yaml` |
| `packages/verticals` | `@cs/verticals`: vertical packs (`packs/`: services, themes, playbooks, score thresholds) + loader |
| `packages/storage` | `@cs/storage`: object store (memory / fs / R2) |
| `packages/collectors` | `@cs/collectors`: web capture (robots, rate limit, Playwright, evidence recorder, discovery), vendor sources (DataForSEO, Apify, ScrapeCreators), `local/` (suggest/accept/self), `sources/due.ts`, `schedule/due-pages.ts`, `prospect/`, `redactForModel` |
| `packages/engine` | `@cs/engine`: diff → tag → score stages (`sweep.ts`, `stage.ts`), `structured/`, `merge/`, `moves/`, `reviews/`, `prices/`, `model-ops/`, `briefs/`, `alerts/`, `delivery/`, `reports/` |
| `packages/email` | `@cs/email`: React Email templates (`react-email@6.11.0`), branding, Postmark + file-outbox transports |
| `packages/tools` | `@cs/tools`: role-checked service functions + registered tools (`src/tools/*`, `registry.ts`, `deps.ts`, `workspace/`), shared with Phase 6 MCP/Ask |
| `packages/ui` | `@cs/ui`: Tailwind 4 + shadcn/ui components, per-agency CSS-variable theming (`theme.ts`) |
| `packages/demo` | `@cs/demo`: deterministic `cs_demo` seed, screen coverage list (`coverage.ts`), snapshot/restore CLIs (`src/cli/`) |
| `tools/decision-labeler.html` | Local page for gold-labelling exported decision CSVs |

## Capabilities by phase

- **1 — Foundations** ([plan](superpowers/plans/2026-09-29-phase-1-foundations.md)). Access context + tool registry (`@cs/core`), Drizzle + RLS tenancy (`@cs/db`), OpenRouter + Jev (`@cs/ai`, score maps to argmax level), vertical packs, pg-boss worker.
- **2a — Evidence & web** ([plan](superpowers/plans/2026-09-30-phase-2a-evidence-and-web.md)). Object store; honest-UA crawler with RFC 9309 robots, per-host rate limit, Playwright block detection, hash-first immutable evidence, page discovery (nav + sitemaps), exactly-once due-page claiming. Tables `tracked_page`, `capture`, `evidence`.
- **2b — Vendor sources** ([plan](superpowers/plans/2026-09-30-phase-2b-vendor-sources.md)). DataForSEO client with `vendor_call` ledger; reviewer privacy (HMAC pseudonyms, PII stripped from rows and evidence); local-search competitor suggestions; GBP, Google reviews, Google ads, Meta ads (Apify, ScrapeCreators fallback), Google Jobs, monthly geo-grid rank scans; `competitor_source` scheduling.
- **3a — Web changes → scored events** ([plan](superpowers/plans/2026-10-01-phase-3a-web-changes-to-scored-events.md)). `@cs/engine`: main-content extraction + volatile masking, embedding diff, numeric rules with LLM fallback, tagging via the Jev → LLM → `decision_review` cascade, per-client scoring with stored factors, versioned idempotent stages (`stage_run`).
- **3b — Structured sources, merge & moves** ([plan](superpowers/plans/2026-10-01-phase-3b-structured-sources-merge-moves.md)). Differs for ads, GBP, reviews, jobs, rank scans; cross-channel merge; seven move rules with a nightly `emerging → active → fading → closed` lifecycle (`moves-nightly`/`moves-client`); Google advertiser-id pinning; multiple Meta pages; `review_revision` history.
- **3c — Reviews & prices** ([plan](superpowers/plans/2026-10-02-phase-3c-reviews-and-prices.md)). `redactForModel`; client's own business as a "self" competitor (`client.self_competitor_id`); `review_themes` stage + nightly review insights (`review_spike`, `theme_proposal`); `price_extract` stage (`prices/observe.ts`) → `price_point`; pricing read model (`prices/tracker.ts`).
- **3d — Model ops & hardening** ([plan](superpowers/plans/2026-10-02-phase-3d-model-ops-and-hardening.md)). One `ai.yaml` task per decision use; Jev-vs-LLM shadow sampling into `decision_sample`; human gold labels (`decisions` CLI, `resolveDecisionReview`) and accuracy/ECE report (`model-ops/`); event soft retraction; Anthropic batch theme discovery (`model-batch-poll`).
- **4a — Briefs, verifier & recommendations** ([plan](superpowers/plans/2026-10-03-phase-4a-briefs-and-recommendations.md)). `engine/src/briefs/`: Thursday-night scheduler, `brief_writer`, two-layer sentence verifier (rules + `verifier_decisions` at τ 0.85), quiet briefs, AM edit/approve functions recording `feedback`, recommendations + playbook overrides. Jobs `briefs-schedule`, `brief-client`.
- **4b — Alerts & delivery** ([plan](superpowers/plans/2026-10-03-phase-4b-alerts-and-delivery.md)). Contacts, preferences, webhooks, `notification` outbox; alert sweep with 72 h merge, `alert_writer` with template fallback, alert modes + throttle + digest; Monday 07:00 brief delivery; `@cs/email`; Slack/Teams webhooks with SSRF allowlist; Playwright PDFs; quarterly `trend_report`; signed deep links. CLI `deliver-once`.
- **5a — App foundation & auth** ([plan](superpowers/plans/2026-10-04-phase-5a-app-foundation-and-auth.md)). `apps/web`, `@cs/ui`, `@cs/tools`; self-hosted Better Auth (schema `auth`), invitation-only magic link + Google; own `membership`/`invitation` tables; guest link sessions; themed shell; brief/alert/report pages, inbox, team/branding/webhook/recipient/notification settings; on-demand PDFs at `/files/brief|report/<id>`.
- **5b-1 — Agency workflow** ([plan](superpowers/plans/2026-10-05-phase-5b1-agency-workflow.md)). Tools + screens for client onboarding/profile, competitors (suggest/accept/add/remove, `get_competitor_search_status`), tracked pages, portfolio with pressure score (`tools/src/pressure.ts`), brief approval queue, alert review, recommendations board.
- **5b-2 — Agency operations** ([plan](superpowers/plans/2026-10-07-phase-5b2-agency-operations.md)). Usage & per-client caps/limits, playbook editor, platform-operator queues (decision reviews, theme proposals), prospects (`client.status`, `prospect-snapshot` job, deterministic report, convert), 5a settings writes as audited tools, auth hardening.
- **5c-1 — Client workspace core** ([plan](superpowers/plans/2026-10-08-phase-5c1-client-workspace-core.md)). Overview, Changes feed + evidence viewer (`/files/evidence/<clientId>/<evidenceId>`), Moves, competitor profile & timeline, alert rules, read-only services & area, AI-connections placeholder; client-owner competitor self-service; `workspace/scope.ts`, `EvidenceChips`, SVG `LineChart`.
- **5c-2 — Data views** ([plan](superpowers/plans/2026-10-08-phase-5c2-data-views.md)). Pricing, Ads, Reviews & reputation (`ThemeHeatmap`), Local rankings (`GeoGrid`, share of voice); `foldSeries` aggregate modes; `Sheet` in `@cs/ui`; responsive shell (drawer below 1024 px).
- **Demo data, dev panel & snapshots** ([plan](superpowers/plans/2026-10-09-demo-data-and-snapshots.md)). Local-only. `cs_demo` seed (`@cs/demo`), dev panel (`apps/web/src/dev-panel/`, per-environment `perEnv` factories, production build check), `cs_dev` snapshot/restore.

## Conventions a new feature must follow

- **Every web read and write is a registered `@cs/tools` tool**, audit-logged; server actions don't pre-check roles — the tools decide. Permission tiers `admin` (agency admin) and `operator` (email in `PLATFORM_ADMIN_EMAILS`, checked by `requirePlatformOperator` per call; the sidebar section is cosmetic).
- `AccessContext` is rebuilt from the database on every request, so revocation is immediate.
- Tenancy: tenant writes/reads through `withTenant`; service-role inserts only where needed (e.g. `create_client`). Rank data (`rank_scan`/`rank_snapshot`) is tenant-private and read only through `withTenant`. `self_competitor_id`/`agency_id` on `client` are service-role only.
- Every reader excludes retracted events (`event.retracted_at`); workspace reads use `workspace/scope.ts` (tracked competitor, live events only).
- Prospects get no recurring work: any new client- or competitor-picking path filters `client.status = 'active'`.
- Text sent to a model goes through `redactForModel`. Gold labels come from humans only.
- Notifications are written to the outbox in the same transaction as the state change that causes them.
- Engine queues use `retryLimit: 0`; the sweep is the only retry path. Web crawling stays behind `WEB_MONITORING_ENABLED` (off by default).
- Background jobs are refused in DEMO/TEST environments.
- **Any new screen must be registered in `packages/demo/src/coverage.ts`** (`pnpm --filter @cs/demo test` fails otherwise).
- Client modules go in the sidebar's `client` nav group.
- Action feedback uses the `useActionState` pattern, with the state hoisted into a component that stays mounted (see `AlertList`, `useQueueAction`).
- Charts are hand-written inline SVG; reuse `LineChart` (at most 5 series; "Other" via `foldSeries` with the right `aggregate` — never sum non-additive series).
- Every `.tsx` file in `packages/email` carries the JSX pragma (`jsx-pragma.test.ts` enforces it).
