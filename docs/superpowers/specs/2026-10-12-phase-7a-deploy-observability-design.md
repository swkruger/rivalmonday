# Phase 7a — Deploy & observability (design)

> **SUPERSEDED** by [2026-10-19-phase-7a-launch-production-security-design.md](2026-10-19-phase-7a-launch-production-security-design.md); sections it cites as "parked §x" stay binding.

**Date:** 2026-10-12 · **Branch:** `phase-7-planning` (planning) · **Core spec:** §10.2, §11, §1.4 · **Roadmap:** Phase 7, sub-phase a of 3.
New decisions and interfaces only; everything else follows the core spec and root `CLAUDE.md`.

## 1. Goal
First production deploy of Rival Monday at `https://rivalmonday.app`, with a repeatable gated pipeline, a portable worker image, and enough observability that failures reach the operator before a pilot user notices. No tenant-facing feature changes.

## 2. Decisions
1. **Sub-phases.** 7a deploy + observability (independent of Phase 6); 7b guardrails (caps, breakers, DB-backed rate limits, least-privilege roles, security/perf backlog); 7c isolation suite, evals, E2E/MCP contract, pilot onboarding (after Phase 6).
2. **Hosting.** Vercel (web, internal API, MCP when Phase 6 lands) in `iad1`; worker on **Railway** (US East), **exactly one replica** in 7a; **separate Neon project `rivalmonday-prod`** (`us-east-1`, Postgres 18 + pgvector); evidence in Cloudflare R2. Cloudflare is not used for the worker (Containers sleep and cost ~5–10× always-on; Browser Rendering clashes with our crawler conduct). ECS/Cloud Run only when queue-depth autoscaling or compliance demands it.
3. **Scheduling stays in pg-boss** (`JobDefinition.cron`, registered by the worker). No Vercel Cron — supersedes that row of §10.2.
4. **Domain** `rivalmonday.app`, DNS at Namecheap (replaces `rm.nofingers.ai` and the unregistered `rivalmonday.com`). `.app` is HSTS-preloaded; Vercel issues TLS.
5. **Email** from subdomain `mail.rivalmonday.app`: briefs `briefs@`, alerts `alerts@`, reply-to `support@rivalmonday.app`; crawler contact `bot@rivalmonday.app`. Per-agency sending domains are a later phase.
6. **Environments (for now):** production + local dev only. No staging, no Vercel previews.
7. **Pipeline:** push to `main` → `test` job → `deploy` job: migrate prod → deploy Vercel → deploy Railway. Vercel/Railway git auto-deploy **off**. Migration failure ⇒ nothing deploys. Rollback = redeploy the previous commit (migrations are additive; never edited).
8. **Observability:** Sentry (errors + sampled tracing, web + worker) + structured JSON logs (pino) + operator health page. No self-run OTel collector/Grafana.
9. **Worker roles** exist in 7a (tagging + filtering) but all run in one process (`WORKER_ROLES=all`). Multi-replica waits for 7b's DB-backed per-host leases and per-vendor token buckets.
10. **Fresh prod DB.** Backlog deploy notes on migration `0025`'s check and the hashed magic-link cutover are N/A.
11. **`WEB_MONITORING_ENABLED=true` in production only**, set by the owner after `/bot` is live and the DEPLOY checklist passes; it stays unset locally and in E2E.

## 3. Interfaces

### 3.1 Worker (`apps/worker`)
```ts
// apps/worker/src/jobs.ts
export type WorkerRole = 'crawler' | 'collector' | 'ai';
export interface JobDefinition<T> { /* existing fields */ role: WorkerRole; }  // required

// apps/worker/src/roles.ts
export function parseWorkerRoles(raw: string | undefined): ReadonlySet<WorkerRole>; // undefined | '' | 'all' ⇒ all three; unknown token ⇒ throw
// registerJobs(boss, jobs, { roles, pollingIntervalSeconds? }): createQueue/updateQueue/schedule for EVERY job;
// boss.work() only for jobs whose role ∈ roles.
```
- Role assignment: `crawler` = `web.capture`, `web.discover`, and PDF jobs iff `pdf.ts` launches Chromium; `collector` = `vendor.*`, `prospects.snapshot`, `web.schedule`; `ai` = `engine.*`, `reviews.*`, `moves.*`, `modelOps.*`, `briefs.*`, remaining `delivery.*`, `system-heartbeat`. The plan's pre-flight confirms PDF rendering.
- **`/healthz`** (`apps/worker/src/health.ts`): `node:http` server on `PORT` (default 8080). `200 {"ok":true,"heartbeatAgeS":n}` iff pg-boss started and this process's last `system-heartbeat` handler ran ≤ 11 min ago (two 5-min ticks + slack); else `503`. The heartbeat handler records `lastHeartbeatAt` in process memory.
- **Strict env:** when `NODE_ENV=production`, start fails (exit 1, one line naming each missing var) unless `DATABASE_URL`, `APP_URL`, `R2_*` (bucket, account, key id, secret), `POSTMARK_SERVER_TOKEN`, `EMAIL_FROM`, `SENTRY_DSN` and the AI keys are set. Otherwise today's warn-and-continue behaviour stays.
- **Dockerfile** `apps/worker/Dockerfile` (build context = repo root): stage 1 `turbo prune @cs/worker --docker`; stage 2 `node:24-bookworm-slim`, pnpm 10 via corepack, `pnpm install --frozen-lockfile`, `pnpm --filter @cs/collectors exec playwright install --with-deps chromium`; copy `packages/ai/config/` and `packages/verticals/packs/`; non-root user; `CMD ["pnpm","--filter","@cs/worker","start"]`; `EXPOSE 8080`. `apps/worker/scripts/image-smoke.ts` loads `ai.yaml`, both packs, and launches + closes Chromium; CI builds the image and runs it.
- Railway: health check `/healthz`, restart on failure, drain/termination timeout 40 s (graceful stop drains 30 s), replicas = 1.

### 3.2 Logging (`@cs/core`)
```ts
// packages/core/src/log.ts
export interface LogContext { requestId?: string; job?: string; jobId?: string; agencyId?: string; clientId?: string; role?: string }  // 'crawler' | 'collector' | 'ai' | 'web' (core doesn't import worker types)
type LogFn = (o: object | string, msg?: string) => void;
export interface Logger { debug: LogFn; info: LogFn; warn: LogFn; error: LogFn; child(ctx: LogContext): Logger }
export function createLogger(opts?: { level?: string; pretty?: boolean }): Logger;  // pino; JSON when NODE_ENV=production
export function redactForLog(value: unknown): unknown;                            // shared with Sentry beforeSend
```
- Redaction: drop keys matching `/token|secret|key|password|authorization|cookie/i`; mask email addresses (`a***@domain`); never log model prompts/outputs or raw review text (log ids and lengths).
- 7a converts `apps/worker/src/**` and the job modules they call to the logger; other packages' `console.*` may remain (no new ones).

### 3.3 Sentry
- Web: `@sentry/nextjs` via `apps/web/instrumentation.ts` + `sentry.client.config.ts`; enabled only when `SENTRY_DSN` is set; `tracesSampleRate: 0.1`, replay off, `sendDefaultPii: false`, `beforeSend` → `redactForLog`. Source maps uploaded in the `deploy` job (`SENTRY_AUTH_TOKEN`).
- Worker: `@sentry/node`; `registerJobs` wraps each handler in a span `job.<name>` tagged `role`, `jobId`, and `agencyId`/`clientId` when present in the payload; exceptions captured with that context then rethrown (pg-boss retry semantics unchanged). Cron jobs report Sentry **cron check-ins** (monitor slug = job name, schedule = `job.cron`).
- Alerting: Sentry alert rules (new issue, regression, missed check-in) email the owner. Only alert channel in 7a.

### 3.4 Health page
- Tool `platform_health` in `packages/tools/src/platform.ts` (registered, read-only), first line `requirePlatformOperator`. Non-operators → `permission_denied` → page 404.
```ts
export const platformHealthOutput = z.object({
  generatedAt: z.string(),
  worker: z.object({ lastHeartbeatAt: z.string().nullable(), ageS: z.number().nullable(), status: z.enum(['ok','warn','down']) }),
  queues: z.array(z.object({ name: z.string(), queued: z.number(), active: z.number(), failed24h: z.number(),
                             oldestQueuedAgeS: z.number().nullable(), status: z.enum(['ok','warn','down']) })),
  vendors: z.array(z.object({ vendor: z.string(), lastOkAt: z.string().nullable(), calls24h: z.number(), errorRate24h: z.number(),
                              status: z.enum(['ok','warn','down']) })),
  spend: z.object({ todayUsd: z.number(), monthUsd: z.number(),
                    topClients: z.array(z.object({ clientId: z.string(), clientName: z.string(), agencyName: z.string(),
                                                   monthUsd: z.number(), capUsd: z.number().nullable(), pctOfCap: z.number().nullable() })).max(5) }),
});
```
- Sources: queues/heartbeat from `pgboss.job` ∪ `pgboss.archive` through the existing queue connection (`apps/web/src/server/queue.ts` pattern; least-privilege is 7b); vendors from `vendor_call`; spend from `llm_call` + `vendor_call` and `client.monthly_cap_usd` (service role). Only `client.status = 'active'` in `topClients`.
- Status rules: worker `warn` > 11 min, `down` > 30 min or never. Queue `warn` if oldest queued > 30 min or failed24h > 0; `down` if oldest queued > 2 h. Vendor `warn` if errorRate24h ≥ 0.2; `down` if ≥ 0.5 or no ok call in 48 h while calls24h > 0.
- Page `apps/web/src/app/(app)/platform/health/page.tsx`: server-rendered tables with status chips (brand tokens; no charts); nav entry beside Reviews/Themes for operators. 7b adds a Breakers panel.

### 3.5 Domain, `/bot`, robots
- `packages/collectors/src/web/user-agent.ts`: `BOT_USER_AGENT = 'Mozilla/5.0 (compatible; RivalMondayBot/1.0; +https://rivalmonday.app/bot)'`. All live docs (`CLAUDE.md`, `apps/worker/CLAUDE.md`, `docs/OPS.md`, `README.md`, `docs/brand/brand.md`, the `collect-once.ts` comment) switch `rivalmonday.com` → `rivalmonday.app`. Historical plans/specs are not edited.
- `apps/web/src/app/bot/page.tsx`: public (outside the `(app)` group; middleware/auth allow it signed-out), Rival Monday branding regardless of hostname, static. Copy (decided):

> **RivalMondayBot**
> RivalMondayBot is the web crawler for Rival Monday, a service that helps local businesses keep track of what's publicly visible about their market — prices, offers and services posted on public websites.
> **How to recognise it.** Our requests send the user agent `Mozilla/5.0 (compatible; RivalMondayBot/1.0; +https://rivalmonday.app/bot)`. The robots.txt token is `RivalMondayBot`.
> **What it does.** It visits a small number of public pages per site, about once a week. It never logs in, submits forms, or tries to get past paywalls, CAPTCHAs or bot protection.
> **How it behaves.** It follows robots.txt (RFC 9309), including `Crawl-delay`. If your robots.txt can't be fetched because of a server error, it doesn't crawl. It waits at least 3 seconds between requests to the same site.
> **How to opt out.** Add this to your robots.txt and we'll stop visiting:
> `User-agent: RivalMondayBot`
> `Disallow: /`
> **Contact.** Questions or problems: bot@rivalmonday.app.

- `apps/web/src/app/robots.ts`: `Allow: /bot`, `Disallow: /` for everything else.

### 3.6 Email
- `EMAIL_FROM` default `Rival Monday <briefs@mail.rivalmonday.app>`; new optional `EMAIL_ALERTS_FROM` (default `Rival Monday <alerts@mail.rivalmonday.app>`) and `EMAIL_REPLY_TO` (default `support@rivalmonday.app`), passed through `turbo.json` `globalPassThroughEnv`. Owner approves before `.env` changes.

### 3.7 Pipeline (`.github/workflows/ci.yml`)
- `test` job: Postgres service image → `pgvector/pgvector:pg18`; add `pnpm --filter @cs/db exec drizzle-kit check`; add worker image build + `image-smoke`.
- `deploy` job: `needs: test`, `if: github.ref == 'refs/heads/main' && github.event_name == 'push'`, `environment: production`, `concurrency: { group: production, cancel-in-progress: false }`. Steps: `pnpm --filter @cs/db migrate` with `DATABASE_URL=${{ secrets.PROD_DATABASE_URL }}` (direct owner URL) → `vercel pull/build/deploy --prebuilt --prod` (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`) + Sentry source maps → `railway up --service rivalmonday-worker --ci` (`RAILWAY_TOKEN`). Any failed step stops later steps.

### 3.8 Vercel runtime
- `apps/web/next.config.ts`: `outputFileTracingIncludes` for `packages/ai/config/**` and `packages/verticals/packs/**` on all server routes. A unit test fails if any `route.ts`/`page.tsx` exports `runtime = 'edge'`.
- AI timeouts: `ai.yaml` tasks gain optional `timeoutMs` (default 60 000) and `maxAttempts`; `packages/ai/src/http.ts` uses them. Any request-path task (Ask, inline generation on Vercel) must satisfy `timeoutMs × maxAttempts ≤ 50 000`, asserted by a config test; those routes set `export const maxDuration = 60`.
- `turbo.json`: `"agentGuidance": false`.

### 3.9 `docs/DEPLOY.md` (new runbook)
First-time setup in order: Neon prod project + `infra/db/init/01-roles.sql` with prod passwords; R2 bucket + keys; Railway service (Dockerfile, env, health check, 1 replica, auto-deploy off); Vercel project (env, domain, auto-deploy off); Namecheap records (Vercel A/CNAME; Postmark DKIM + Return-Path for `mail.`; SPF; DMARC `p=none` → `quarantine` after 2 clean weeks); Postmark account approval + live token; Sentry projects + alert rules; GitHub `production` environment secrets; first deploy; `apps/web/scripts/admin.ts` to create the first agency + platform admin; checklist; rollback procedure.

## 4. Tests
- Unit: every registered job has a role; `parseWorkerRoles` (all/empty/list/unknown throws); `registerJobs` works only owned roles but schedules all; `/healthz` 200/503 by heartbeat age; strict env lists missing vars; `redactForLog` (keys, emails, nested); Sentry `beforeSend` uses it; `platform_health` denies non-operators, computes statuses at thresholds, excludes inactive clients; no-edge-runtime check; request-path AI timeout budget.
- E2E: `/bot` renders signed-out with the UA string; `/platform/health` renders for an operator and 404s for an agency admin.
- CI: worker image builds and `image-smoke` passes.

## 5. Owner verification
First deploy via DEPLOY.md; `https://rivalmonday.app` serves with TLS; magic-link sign-in works from `briefs@mail.rivalmonday.app`; a Sentry test event arrives from web and worker; `/platform/health` all green after one hour; mail-tester score ≥ 9/10; measure the slowest pages on prod (backlog item if > 3 s); then set `WEB_MONITORING_ENABLED=true`.

## 6. Out of scope (→ 7b/7c)
7b: caps enforcement + shared-cost allocation, prospect cooldown, circuit breakers, DB-backed rate limits + multi-replica, `cs_worker`/`cs_web` roles, `numeric` cost, soft-delete, retention of evidence ids, Postmark bounce webhooks, object-store no-overwrite, `listBriefDueClients`. 7c: isolation suite, golden fixtures, AI evals, E2E incl. Ask, MCP contract, Jev live test, `/link-other-account` live, pilot runbook, rename dev agency.
