# Phase 7a — Deploy & Observability Implementation Plan

> **PARKED DRAFT (2026-10-12, predates Phases 8–15) — starting material only, NOT approved for execution.** Re-validated in `docs/work/phase-7.md` § Brief; superseded by the Phase 7a spec/plan once written.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. **Lean plan format** (root `CLAUDE.md`): Interfaces are binding; the implementer writes the code and tests from Behaviour + Tests.

**Goal:** First production deploy at `https://rivalmonday.app` with a gated migrate-then-deploy pipeline, a portable role-aware worker image, Sentry + structured logs + an operator health page, the public `/bot` page and the new email domain.

**Architecture:** No schema changes and no migrations. Worker gains job roles, `/healthz`, strict prod env, Sentry spans and a pino logger from `@cs/core`; it ships as one Docker image on Railway. Web gains Sentry, file tracing, a public `/bot` + `robots.ts`, and `/platform/health` backed by a new operator-only `platform_health` tool. CI gains Postgres 18, `drizzle-kit check`, an image smoke test and a `deploy` job.

**Tech stack:** Node 24, pnpm 10, Turborepo, Next.js 16 (`proxy.ts`), pg-boss 10, Playwright, pino, `@sentry/nextjs` + `@sentry/node` (current major at install time; read the installed package README before wiring), GitHub Actions, Vercel CLI, Railway CLI.

**Spec:** `docs/superpowers/specs/2026-10-12-phase-7a-deploy-observability-design.md` (read §2–§4 before any task). Core spec §10.2, §11.

## Global constraints
- No migrations, no schema changes, no new tables in 7a.
- Exactly **one** worker replica; `WORKER_ROLES` defaults to all roles.
- Sentry and pino redaction go through one function, `redactForLog` (`@cs/core`). Never send model prompts/outputs, review text, emails, tokens or cookies to Sentry or logs.
- Sentry is inert unless `SENTRY_DSN` is set (local dev, unit tests and E2E run without it).
- `WEB_MONITORING_ENABLED` stays unset locally and in E2E. Never crawl a real competitor.
- New env vars reach turbo tasks only via `turbo.json` `globalPassThroughEnv`. **Ask the owner before adding any var to `.env`.** Never print or stage `.env`.
- Web reads go through registered `@cs/tools` tools; refusals render 404.
- Brand: Rival Monday tokens (`docs/brand/`), Inter, content max-width 1560px; `/bot` is never white-labelled.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (subagents may name their own model). LF only.
- Test scope per root `CLAUDE.md` § Process 6 (focused → `pnpm test:affected` → `e2e:affected`; full suites only at `/rm-merge`).

## Decisions (plan-local; spec §2 decisions also bind)
1. AI timeout config uses snake_case YAML keys `timeout_ms` and `max_retries` (attempts = `max_retries + 1`), matching `ai.yaml` style; spec §3.8's `timeoutMs × maxAttempts ≤ 50 000` is checked as `timeout_ms × (max_retries + 1) ≤ 50 000` for `ask_assistant`.
2. `/healthz` counts the pg-boss start as the first "beat": healthy iff started and `now − max(startedAt, lastHeartbeatAt) ≤ 11 min` (otherwise Railway's deploy health check fails for the first 5 minutes).
3. `platform_health` reads pg-boss through an injected `ToolDeps.queueStats` function (same pattern as `jobStatus`), implemented in `apps/web/src/server/queue.ts`.
4. Web client Sentry init uses the SDK's current client-instrumentation file (`apps/web/instrumentation-client.ts` in recent `@sentry/nextjs`); the spec's `sentry.client.config.ts` name yields to whatever the installed SDK documents.
5. `WORKER_ROLES` tokens are trimmed and lower-cased; `all` may appear alone only.
6. Railway config-as-code lives in `apps/worker/railway.json` (Dockerfile path, health check, restart policy, 1 replica).

## File structure
- `apps/worker/src/{jobs.ts,roles.ts,boss.ts,main.ts,health.ts,env-check.ts,sentry.ts}`, `apps/worker/src/jobs/*.ts` (role tags), `apps/worker/Dockerfile`, `apps/worker/.dockerignore` (or root), `apps/worker/railway.json`, `apps/worker/scripts/image-smoke.ts`
- `packages/core/src/log.ts` (+ export from barrel; must not pull `node:crypto` into client bundles — export via a subpath `@cs/core/log` if the barrel is client-imported)
- `packages/ai/src/{config.ts,http.ts}`, `packages/ai/config/ai.yaml`
- `packages/tools/src/{deps.ts,platform-health.ts}`, `packages/tools/src/tools/all.ts`
- `apps/web/src/server/queue.ts`, `apps/web/src/server/tools.ts`, `apps/web/src/app/(app)/platform/health/page.tsx`, `apps/web/src/components/shell/nav-items.ts`, `apps/web/src/app/bot/page.tsx`, `apps/web/src/app/robots.ts`, `apps/web/src/proxy.ts`, `apps/web/instrumentation.ts`, `apps/web/instrumentation-client.ts`, `apps/web/sentry.server.config.ts`, `apps/web/next.config.ts`, `apps/web/scripts/e2e-affected-rules.ts`, `apps/web/e2e/ops.spec.ts`
- `packages/collectors/src/web/user-agent.ts`; `packages/engine/src/delivery/outbox.ts`; `packages/email/src/transport.ts`
- `.github/workflows/ci.yml`, `turbo.json`, `docs/DEPLOY.md`, live docs listed in Task 11

## Dependencies on in-flight work (re-check at pre-flight)
- **phase-6** (unmerged, `docs/work/phase-6.md`) may edit: `packages/ai/config/ai.yaml` (`ask_assistant`), `apps/web/src/proxy.ts` (`PUBLIC` for `/mcp`, OAuth routes), `apps/web/next.config.ts`, `packages/tools/src/deps.ts` + `tools/all.ts`, `nav-items.ts`, `turbo.json` env list, `.github/workflows/ci.yml`. Rebase on `main` first; if Phase 6 merged, merge both sides' edits (don't drop theirs).
- If Phase 6 placed `/mcp` in a separate `apps/mcp`, Task 12 adds a second Vercel deploy (same pattern) and Task 6's Sentry setup is mirrored there.
- If Phase 6 added a request-path AI task besides `ask_assistant`, Task 7's budget test covers it too.
- No migration numbers are claimed by 7a.

## Review focus
1. **Redaction misses** — an email inside an `Error.message`, a nested `{ headers: { Authorization } }`, an array of objects, or a circular object must be scrubbed without throwing (Task 2 tests).
2. **`/bot` exposure rules** — `/bot` and `/bot/` are public on any hostname signed-out; `/bots`, `/botx`, `/bot-admin` are **not** public (Task 10 tests the `PUBLIC` regex).
3. **Fresh worker health** — a just-started worker is healthy before its first heartbeat; one whose job loop died goes 503 after 11 min (Task 3 tests with a fake clock).
4. **Empty/partial data on the health page** — no heartbeat ever, no vendor calls, a client with `monthly_cap_usd` null or 0, archived-only jobs: nulls and statuses, never a crash or divide-by-zero (Task 8 tests).
5. **Deploy ordering** — deploy never runs on PRs, never before `test`, never after a failed migration, never overlaps (Task 12 workflow-shape test).

---

### Task 1: Worker job roles
**Goal:** Every job carries a `role`; a worker process only works the roles it owns, but registers every queue and schedule.
**Files:** modify `apps/worker/src/jobs.ts`, `apps/worker/src/boss.ts`, `apps/worker/src/main.ts`, every `apps/worker/src/jobs/*.ts` that calls `defineJob`; create `apps/worker/src/roles.ts`, `apps/worker/src/roles.test.ts`; extend `apps/worker/src/boss.test.ts`.
**Interfaces:**
```ts
export type WorkerRole = 'crawler' | 'collector' | 'ai';
export const WORKER_ROLES: readonly WorkerRole[] = ['crawler', 'collector', 'ai'];
export interface JobDefinition<T> { /* existing */ role: WorkerRole }           // required
export function parseWorkerRoles(raw: string | undefined): ReadonlySet<WorkerRole>;
export async function registerJobs(boss: PgBoss, jobs: JobDefinition<any>[],
  opts: { roles: ReadonlySet<WorkerRole>; pollingIntervalSeconds?: number }): Promise<void>;
```
**Behaviour:**
- Roles: `crawler` = `web.capture`, `web.discover`, `delivery.briefPdf`, `delivery.reportPdf` (PDF uses Chromium — `apps/worker/src/pdf.ts`); `collector` = `web.schedule`, all `vendor.*`, `prospects.snapshot`; `ai` = everything else incl. `system-heartbeat`.
- `parseWorkerRoles`: `undefined`/`''`/`'all'` ⇒ all three; comma list, tokens trimmed + lower-cased, duplicates fine; `all` mixed with others or any unknown token ⇒ throw `Error('WORKER_ROLES: unknown role "<x>"')`; an empty token list after trimming (`' , '`) ⇒ throw.
- `registerJobs`: `createQueue`/`updateQueue`/`schedule` for every job; `boss.work` only when `roles.has(job.role)`.
- `main.ts` reads `process.env.WORKER_ROLES`, logs the active roles once at start.
**Tests (TDD):**
- `roles.test.ts`: `parseWorkerRoles` — undefined/empty/all → 3 roles; `' Crawler, ai '` → {crawler, ai}; `'all,ai'` throws; `'gpu'` throws with the token; `' , '` throws.
- `boss.test.ts`: `registerJobs with roles={collector}` calls `work` only for collector jobs but `createQueue` + `schedule` for all (fake boss recording calls).
- `jobs-roles.test.ts`: imports the same job list `main.ts` registers (extract it to `apps/worker/src/job-list.ts` exporting `buildJobs(deps, boss)` if needed) and asserts every job has a role in `WORKER_ROLES` and the four crawler jobs are tagged `crawler`.
**Done when:** `pnpm --filter @cs/worker exec vitest run roles boss jobs-roles` and `pnpm --filter @cs/worker typecheck` pass.

### Task 2: Shared logger and redaction (`@cs/core`)
**Goal:** One pino-based logger and one `redactForLog` used by logs and Sentry.
**Files:** create `packages/core/src/log.ts`, `packages/core/src/log.test.ts`; modify `packages/core/package.json` (dep `pino`; devDep `pino-pretty`; add `exports["./log"]`), `packages/core/src/index.ts` only if the barrel is server-only.
**Interfaces:**
```ts
export interface LogContext { requestId?: string; job?: string; jobId?: string; agencyId?: string; clientId?: string; role?: string }
type LogFn = (o: object | string, msg?: string) => void;
export interface Logger { debug: LogFn; info: LogFn; warn: LogFn; error: LogFn; child(ctx: LogContext): Logger }
export function createLogger(opts?: { level?: string; pretty?: boolean; destination?: NodeJS.WritableStream }): Logger;
export function redactForLog(value: unknown): unknown;
```
**Behaviour:** `createLogger` defaults: level `LOG_LEVEL ?? 'info'`; JSON when `NODE_ENV=production`, pretty otherwise (pretty only if `pino-pretty` resolves; else JSON). Every logged object passes through `redactForLog` (pino `formatters.log` / serializer for `err`). Full redaction code (security-sensitive):
```ts
const SECRET_KEY = /token|secret|key|password|passwd|authorization|cookie|signature/i;
const EMAIL = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const DROP_KEYS = /^(prompt|messages|completion|output|body|text|reviewText|content)$/i;
export function redactForLog(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return value.replace(EMAIL, '$1***@$2');
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  if (value instanceof Error) {
    return { name: value.name, message: redactForLog(value.message, seen), stack: redactForLog(value.stack, seen),
             ...(value.cause !== undefined ? { cause: redactForLog(value.cause, seen) } : {}) };
  }
  if (Array.isArray(value)) return value.map((v) => redactForLog(v, seen));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (SECRET_KEY.test(k)) out[k] = '[redacted]';
    else if (DROP_KEYS.test(k)) out[k] = typeof v === 'string' ? `[dropped ${v.length} chars]` : '[dropped]';
    else out[k] = redactForLog(v, seen);
  }
  return out;
}
```
**Tests (TDD):** `redacts secret-like keys at any depth`; `masks emails in strings and Error messages/stacks`; `drops prompt/body/text with length only`; `handles arrays and circular refs without throwing`; `keeps ids (agencyId, jobId, uuid strings) intact`; `createLogger writes JSON with child context to the destination` (capture stream, parse line, assert `job`, `agencyId`, redacted field).
**Done when:** `pnpm --filter @cs/core exec vitest run log` and `pnpm --filter @cs/core typecheck` pass; `pnpm --filter @cs/web build` still succeeds if `@cs/core`'s barrel changed (client bundles must not import pino).

### Task 3: Worker `/healthz` and strict production env
**Goal:** Railway can health-check the worker; a misconfigured prod worker refuses to start.
**Files:** create `apps/worker/src/health.ts`, `apps/worker/src/health.test.ts`, `apps/worker/src/env-check.ts`, `apps/worker/src/env-check.test.ts`; modify `apps/worker/src/jobs/heartbeat.ts`, `apps/worker/src/main.ts`.
**Interfaces:**
```ts
export interface HealthState { startedAt: Date | null; lastHeartbeatAt: Date | null }
export const healthState: HealthState;                                   // module singleton
export function healthStatus(s: HealthState, now: Date): { ok: boolean; heartbeatAgeS: number | null };
export function startHealthServer(port: number, getNow?: () => Date): import('node:http').Server;  // GET /healthz only; else 404
export const REQUIRED_PROD_ENV: readonly string[];
export function missingProdEnv(env: NodeJS.ProcessEnv): string[];         // [] when NODE_ENV !== 'production'
```
**Behaviour:**
- `healthStatus`: `ok` iff `startedAt` set and `now − max(startedAt, lastHeartbeatAt) ≤ 660 s` (plan decision 2). `heartbeatAgeS` = seconds since that max, or null before start.
- `/healthz` responds `200 {"ok":true,"heartbeatAgeS":n}` or `503 {"ok":false,...}`; JSON, `cache-control: no-store`.
- Heartbeat handler sets `healthState.lastHeartbeatAt = new Date()`; `main.ts` sets `startedAt` after `boss.start()` and starts the server on `Number(process.env.PORT ?? 8080)`; the server closes in the shutdown handler.
- `REQUIRED_PROD_ENV`: `DATABASE_URL`, `APP_URL`, `LINK_SIGNING_SECRET`, `EMAIL_FROM`, `POSTMARK_SERVER_TOKEN`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `OPENROUTER_API_KEY`, `TYPESAFE_API_KEY`, `SENTRY_DSN`. **Pre-flight:** confirm the R2 var names against `packages/storage` and use those exact names. Empty/whitespace counts as missing.
- In `main.ts`, before `createBoss`: if `missingProdEnv(process.env).length`, print one line `[worker] missing required env: A, B` and `process.exit(1)`.
**Tests (TDD):** `healthy right after start before any heartbeat`; `unhealthy 11 min + 1 s after the last beat`; `a beat resets the age`; `not started → 503`; server test on an ephemeral port: `/healthz` 200 then 503 via injected clock, `/other` 404; `missingProdEnv` returns [] outside production, lists missing and blank vars in production.
**Done when:** `pnpm --filter @cs/worker exec vitest run health env-check` passes.

### Task 4: Worker Sentry + logger adoption
**Goal:** Every job runs inside a Sentry span with context; failures are captured; cron jobs send check-ins; worker logs are structured.
**Files:** create `apps/worker/src/sentry.ts`, `apps/worker/src/sentry.test.ts`; modify `apps/worker/src/boss.ts`, `apps/worker/src/main.ts`, `apps/worker/src/deps.ts`, `apps/worker/src/jobs/*.ts` and `apps/worker/src/cli/*.ts` (`console.*` → logger); `apps/worker/package.json` (dep `@sentry/node`).
**Interfaces:**
```ts
export function initWorkerSentry(env: NodeJS.ProcessEnv): boolean;   // true when SENTRY_DSN set; release = RAILWAY_GIT_COMMIT_SHA ?? 'dev'
export function runJob<T>(job: Pick<JobDefinition<T>, 'name' | 'role' | 'cron'>, jobId: string, data: T,
  handler: (data: T) => Promise<void>, log: Logger): Promise<void>;
export const workerLog: Logger;                                       // createLogger().child({ role: 'worker' })
```
**Behaviour:**
- `initWorkerSentry` is called first in `main.ts`; `beforeSend`/`beforeSendTransaction` pass the event through `redactForLog`; `sendDefaultPii: false`; `tracesSampleRate: 0.1`; environment `production` when `NODE_ENV=production`.
- `registerJobs` calls `runJob` per batch item (`item.id`). `runJob`: child logger `{ job, jobId, role, agencyId?, clientId? }` (ids read from `data` only if string fields named `agencyId`/`clientId` exist); `Sentry.startSpan({ name: 'job.<name>', op: 'queue.process' })` with those as attributes; on throw → `Sentry.captureException(err, { tags, contexts })`, `log.error({ err }, 'job failed')`, **rethrow** (pg-boss retry semantics unchanged). When `job.cron` is set, wrap in `Sentry.withMonitor(job.name, fn, { schedule: { type: 'crontab', value: job.cron }, checkinMargin: 5, maxRuntime: 30 })`.
- With Sentry disabled, `runJob` still logs and rethrows (Sentry calls are no-ops).
- Replace `console.*` in `apps/worker/src/**` with `workerLog`/child loggers; keep the human CLI table output in `cli/*` on `console.log` where it is the product (tables), but errors go through the logger. Shutdown: log `deps.close()` errors.
**Tests (TDD):** `runJob rethrows and captures with job tags` (mock `@sentry/node` via `vi.mock`); `runJob uses withMonitor only for cron jobs`; `runJob child logger carries agencyId/clientId from payload but never other payload fields`; `initWorkerSentry returns false without DSN`.
**Done when:** `pnpm --filter @cs/worker exec vitest run sentry boss` and `pnpm --filter @cs/worker typecheck` pass; `rg "console\.(log|warn|error)" apps/worker/src --glob '!**/cli/**' --glob '!*.test.ts'` prints nothing.

### Task 5: Worker Docker image, Railway config, image smoke
**Goal:** A reproducible worker image that runs anywhere and proves it can load config and launch Chromium.
**Files:** create `apps/worker/Dockerfile`, `.dockerignore` (repo root), `apps/worker/railway.json`, `apps/worker/scripts/image-smoke.ts`; modify `apps/worker/package.json` (script `smoke:image`).
**Interfaces:** `docker build -f apps/worker/Dockerfile -t rivalmonday-worker .` (context = repo root); `docker run --rm rivalmonday-worker pnpm --filter @cs/worker smoke:image` exits 0.
**Behaviour:**
- Stage `prune`: `node:24-bookworm-slim`, corepack pnpm 10, `npx turbo@<repo version> prune @cs/worker --docker`.
- Stage `runtime`: `node:24-bookworm-slim`; copy `out/json` + lockfile → `pnpm install --frozen-lockfile`; copy `out/full`; `pnpm --filter @cs/collectors exec playwright install --with-deps chromium` (uses the lockfile's Playwright); ensure `packages/ai/config/` and `packages/verticals/packs/` exist in the image (copy explicitly if prune omits non-TS files); `useradd -m worker` and `USER worker` with `PLAYWRIGHT_BROWSERS_PATH` set to a path the user can read (install browsers before switching user into that path); `ENV NODE_ENV=production PORT=8080`; `EXPOSE 8080`; `CMD ["pnpm","--filter","@cs/worker","start"]`.
- `.dockerignore`: `node_modules`, `**/node_modules`, `.env*`, `.git`, `.turbo`, `.next`, `.evidence`, `apps/web/.outbox`, `App/`, `.claude/`, `.superpowers/`, `docs/`.
- `image-smoke.ts`: loads the AI config via `@cs/ai`'s loader, loads both packs (`hvac_plumbing`, `dental`) via `@cs/verticals`/`createPackLoader`, `chromium.launch()` → `newPage()` → `setContent('<p>ok</p>')` → close; prints `image-smoke ok`; exits 1 on any failure. No network, no DB.
- `railway.json`: `build.builder = "DOCKERFILE"`, `build.dockerfilePath = "apps/worker/Dockerfile"`, `deploy.healthcheckPath = "/healthz"`, `deploy.healthcheckTimeout = 300`, `deploy.restartPolicyType = "ON_FAILURE"`, `deploy.numReplicas = 1`, `deploy.drainingSeconds = 40` (verify field names against Railway's config-as-code schema at implementation).
**Tests:** the smoke script is the test. If Docker is unavailable locally, run `pnpm --filter @cs/worker smoke:image` on the host (proves the script) and leave the image build to CI (Task 12); say so in the report.
**Done when:** host `smoke:image` passes; `docker build` + `docker run … smoke:image` pass where Docker exists.

### Task 6: Web Sentry, file tracing, Node-only runtime
**Goal:** Web errors and sampled traces reach Sentry with redaction; Vercel bundles carry `ai.yaml` and packs; nothing runs on Edge.
**Files:** create `apps/web/instrumentation.ts`, `apps/web/sentry.server.config.ts`, `apps/web/instrumentation-client.ts`, `apps/web/src/server/runtime.test.ts`; modify `apps/web/next.config.ts`, `apps/web/package.json` (dep `@sentry/nextjs`), `apps/web/scripts/check-no-dev-panel.ts` **only if** a shared build-scan helper makes the tracing check cheaper.
**Behaviour:**
- `instrumentation.ts` `register()` imports `sentry.server.config` when `process.env.NEXT_RUNTIME === 'nodejs'`; export `onRequestError = Sentry.captureRequestError`.
- Server + client init only when the DSN is set (`SENTRY_DSN` server, `NEXT_PUBLIC_SENTRY_DSN` client); `tracesSampleRate: 0.1`; replay integrations off; `sendDefaultPii: false`; `beforeSend` → `redactForLog` (server) and a client-safe copy for the browser (import `@cs/core/log` only if it is client-safe; otherwise inline the same three regexes in `instrumentation-client.ts` and unit-test parity).
- `next.config.ts`: wrap with `withSentryConfig` (silent; source-map upload only when `SENTRY_AUTH_TOKEN` is set; `hideSourceMaps`/delete after upload); add `outputFileTracingIncludes: { '/**': ['../../packages/ai/config/**', '../../packages/verticals/packs/**'] }` (paths relative to `apps/web`; verify with the build).
- `runtime.test.ts`: scans `apps/web/src/app/**/{page,route,layout}.tsx?` and fails if any exports `runtime = 'edge'` (string match on `export const runtime`).
- Tracing check: after `pnpm --filter @cs/web build`, a scripts test (`scripts/check-tracing.test.ts` or a step in `check-no-dev-panel`) asserts some `.next/server/**/*.nft.json` lists a path ending `packages/ai/config/ai.yaml` and one under `packages/verticals/packs/`.
**Tests (TDD):** `no route or page opts into the Edge runtime`; `client beforeSend masks emails like redactForLog` (if inlined); tracing check as above.
**Done when:** `pnpm --filter @cs/web exec vitest run runtime`, `pnpm --filter @cs/web build`, the tracing check and `pnpm --filter @cs/web typecheck` pass; `pnpm --filter @cs/web e2e:affected` passes (Sentry inert without DSN).

### Task 7: Per-task AI timeouts and request-path budget
**Goal:** Each AI task can set its own HTTP timeout and retry count; request-path tasks fit inside Vercel's `maxDuration`.
**Files:** modify `packages/ai/src/config.ts`, `packages/ai/src/config.test.ts`, `packages/ai/src/http.ts` callers (`openrouter.ts`, `ai.ts`, `embeddings.ts` — wherever `HttpDeps` is built), `packages/ai/config/ai.yaml`.
**Interfaces:** task schema gains `timeout_ms: z.number().int().positive().optional()` and `max_retries: z.number().int().min(0).max(5).optional()`; `export const REQUEST_PATH_TASKS = ['ask_assistant'] as const;` and `export const REQUEST_PATH_BUDGET_MS = 50_000;` in `config.ts`.
**Behaviour:** when a task sets them, the `HttpDeps` for its calls uses them; otherwise `defaultHttpDeps` (60 000 ms, 2 retries) — no behaviour change for existing tasks. Fallback models reuse the task's values. `ai.yaml`: `ask_assistant` gets `timeout_ms: 20000, max_retries: 1` (40 s worst case). Comment the budget rule in the YAML.
**Tests (TDD):** `parses timeout_ms/max_retries and leaves them undefined when absent`; `rejects max_retries > 5`; `every REQUEST_PATH_TASKS task fits timeout_ms × (max_retries + 1) ≤ REQUEST_PATH_BUDGET_MS in the bundled ai.yaml`; `postJson aborts at the task's timeout` (fake fetch honouring `signal`, injected short timeout).
**Done when:** `pnpm --filter @cs/ai exec vitest run config http` and typecheck pass.

### Task 8: `platform_health` tool + queue stats
**Goal:** An operator-only read tool that summarises worker, queues, vendors and spend.
**Files:** create `packages/tools/src/platform-health.ts`, `packages/tools/src/platform-health.test.ts`; modify `packages/tools/src/deps.ts`, `packages/tools/src/tools/all.ts` (register), `packages/tools/src/index.ts` (export types), `apps/web/src/server/queue.ts` (+ test), `apps/web/src/server/tools.ts` (inject `queueStats`).
**Interfaces:**
```ts
// deps.ts
export interface QueueStat { name: string; queued: number; active: number; failed24h: number; oldestQueuedAt: Date | null }
export type QueueStatsLookup = () => Promise<{ queues: QueueStat[]; lastHeartbeatAt: Date | null }>;
export interface ToolDeps { /* existing */ queueStats?: QueueStatsLookup }
// platform-health.ts — tool name 'platform_health', input z.object({}), output platformHealthOutput (spec §3.4, verbatim)
export function healthStatuses(now: Date, raw: RawHealth): z.infer<typeof platformHealthOutput>;  // pure
```
**Behaviour:**
- First line `requirePlatformOperator(deps, ctx)`. Missing `queueStats` → `ToolError('internal', 'Queue status is not configured')`.
- `queue.ts` `queueStatsFor(name)`: one SQL over `pgboss.job` (states `created`/`retry` = queued, `active`, `failed` with `completed_on > now() - 24h` = failed24h; `min(created_on)` of queued) grouped by `name`, plus latest `completed_on` for `name = 'system-heartbeat'` across `pgboss.job ∪ pgboss.archive`. Uses the same queue connection as `jobStatusFor`; refused in DEMO/TEST like enqueue (returns empty queues + null heartbeat).
- Vendors: from `vendor_call` (service role) grouped by vendor over 48 h: `lastOkAt`, `calls24h`, `errorRate24h` (non-ok / calls24h, 0 when calls24h = 0).
- Spend: `todayUsd`/`monthUsd` = sum of `llm_call.cost_usd` + `vendor_call.cost_usd` since UTC midnight / UTC month start; `topClients` = top 5 active clients by month spend with `capUsd` = `monthly_cap_usd` and `pctOfCap` = null when cap null or ≤ 0, else `monthUsd / capUsd`.
- Status thresholds exactly as spec §3.4.
**Tests (TDD):** `non-operator gets permission_denied`; `guest contact gets permission_denied`; `healthStatuses` table tests at each threshold edge (11 min, 30 min, 2 h, error rate 0.2/0.5, no ok call in 48 h); `empty database → worker down, queues [], vendors [], spend zeros`; `cap null and cap 0 → pctOfCap null`; `inactive clients excluded from topClients`; `queueStatsFor` against the test DB with seeded `pgboss.job`/`pgboss.archive` rows (skip with a clear message if the pgboss schema isn't installed in the test DB — pre-flight: check how `queue.ts` tests do it and mirror).
**Done when:** `pnpm --filter @cs/tools exec vitest run platform-health` and `pnpm --filter @cs/web exec vitest run queue` pass.

### Task 9: `/platform/health` page and nav
**Goal:** Operators see the health summary; everyone else gets 404.
**Files:** create `apps/web/src/app/(app)/platform/health/page.tsx` (+ small presentational components beside it), `apps/web/e2e/ops.spec.ts`; modify `nav-items.ts` (icon `'health'`, label `Health`, operator-only, beside Reviews/Themes), the sidebar icon map, `apps/web/scripts/e2e-affected-rules.ts` (route → `@platform`), `apps/web/e2e/seed.ts` only if an operator user is not already seeded.
**Behaviour:** server component calls `callTool(ctx, 'platform_health', {})`; sections Worker, Queues, Vendors, Spend as tables (no charts); status chips: ok = success token, warn = accent `#F5A524` with dark text `#3B2300`, down = destructive token; times as relative ("4 min ago") with absolute in `title`; money to 2 dp; `pctOfCap` as `%` or "—". Header line "Generated <time>". `export const dynamic = 'force-dynamic'`. Follow pattern: `apps/web/src/app/(app)/platform/reviews/page.tsx`.
**Tests (TDD):** E2E `@platform`: `an operator sees Worker, Queues, Vendors and Spend sections`; `an agency admin gets 404 at /platform/health`; nav unit test: `Health link only for platform operators`.
**Done when:** focused unit tests + `pnpm --filter @cs/web e2e:affected` pass.

### Task 10: Domain move, `/bot`, `robots.ts`
**Goal:** The crawler identifies with `rivalmonday.app`, the public bot page exists, and the app's own robots.txt is correct.
**Files:** modify `packages/collectors/src/web/user-agent.ts` (+ its test), `apps/web/src/proxy.ts`; create `apps/web/src/app/bot/page.tsx`, `apps/web/src/app/robots.ts`, `apps/web/src/proxy.test.ts` (if absent), add `/bot` tests to `apps/web/e2e/ops.spec.ts`; update `e2e-affected-rules.ts` (`bot/`, `robots.ts` → `@smoke`).
**Behaviour:**
- `BOT_USER_AGENT = 'Mozilla/5.0 (compatible; RivalMondayBot/1.0; +https://rivalmonday.app/bot)'` (`BOT_TOKEN` unchanged).
- `proxy.ts` `PUBLIC` gains exactly `/^\/bot\/?$/` and `/^\/robots\.txt$/`.
- `/bot`: outside `(app)`; static; uses the root layout but **no** agency theming lookup (default Rival Monday tokens), wordmark `rivalmonday`, max-width ~720px prose. Title `RivalMondayBot · Rival Monday`. Copy is decided — use spec §3.5 verbatim (headings bold as shown; the two robots lines in one `<pre>`; `bot@rivalmonday.app` as a `mailto:` link).
- `robots.ts` returns `{ rules: [{ userAgent: '*', allow: ['/bot'], disallow: ['/'] }] }`.
**Tests (TDD):** `user-agent.test.ts`: UA contains `+https://rivalmonday.app/bot`; `proxy.test.ts`: `/bot`, `/bot/`, `/robots.txt` public; `/bots`, `/botx`, `/bot-admin`, `/bot/x` not public; E2E `@smoke`: signed-out `/bot` shows heading `RivalMondayBot` and the exact UA string; `/robots.txt` contains `Disallow: /` and `Allow: /bot`.
**Done when:** focused tests + `pnpm --filter @cs/web e2e:affected` pass.

### Task 11: Email sender addresses + live-doc domain references
**Goal:** Alerts and briefs send from distinct `mail.rivalmonday.app` addresses with a reply-to; live docs say `rivalmonday.app`.
**Files:** modify `packages/engine/src/delivery/outbox.ts` (+ test), `packages/email/src/transport.ts` (+ test), the alert/brief send call sites that choose `fromAddress`, `apps/web/src/server/env.ts` (+ test, only the default), `turbo.json`; docs: `CLAUDE.md` (crawler bullet), `apps/worker/CLAUDE.md`, `docs/OPS.md`, `README.md`, `docs/brand/brand.md`, `apps/worker/src/cli/collect-once.ts` comment.
**Interfaces:** `DeliveryConfig` gains `alertsFromAddress: string; replyTo: string | null`; transport message gains optional `replyTo?: string` → Postmark `ReplyTo` (file outbox records it).
**Behaviour:** `fromAddress` default logic is **unchanged** (`EMAIL_FROM || briefs@<APP_URL host>`); production sets `EMAIL_FROM=Rival Monday <briefs@mail.rivalmonday.app>` explicitly (DEPLOY.md). `alertsFromAddress = EMAIL_ALERTS_FROM ||` `fromAddress` with its local part replaced by `alerts` (display name kept); `replyTo = EMAIL_REPLY_TO || null`. Instant alerts and alert digests use `alertsFromAddress`; briefs, reports, sign-in and invites use `fromAddress`. Add `EMAIL_ALERTS_FROM`, `EMAIL_REPLY_TO`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `WORKER_ROLES`, `LOG_LEVEL`, `PORT` to `turbo.json` `globalPassThroughEnv`. Docs: replace live `rivalmonday.com` references with `rivalmonday.app`; brand doc UA line and "domains" line updated (registered: `rivalmonday.app`, DNS at Namecheap). Don't edit historical plans/specs or `docs/archive/`.
**Tests (TDD):** `outbox: alertsFromAddress defaults to alerts@ on the same domain`; `explicit EMAIL_ALERTS_FROM wins`; `replyTo null when unset`; `postmark transport sends ReplyTo when given`; `alert dispatch uses alertsFromAddress` (existing delivery test extended).
**Done when:** `pnpm --filter @cs/engine exec vitest run outbox delivery`, `pnpm --filter @cs/email exec vitest run transport`, `rg -n "rivalmonday\.com" CLAUDE.md apps packages docs/OPS.md README.md docs/brand` prints nothing.

### Task 12: CI — Postgres 18, drizzle check, image smoke, deploy job
**Goal:** CI matches production Postgres, checks migrations, proves the image, and deploys `main` only after tests and a successful migration.
**Files:** modify `.github/workflows/ci.yml`, `turbo.json` (`"agentGuidance": false`); create `scripts/ci-workflow.test.mjs` (or a vitest under `apps/web/scripts` using the `yaml` package already in the tree) asserting the workflow shape.
**Behaviour (full YAML for the deploy job — secrets-sensitive):**
```yaml
  image:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker build -f apps/worker/Dockerfile -t rivalmonday-worker .
      - run: docker run --rm rivalmonday-worker pnpm --filter @cs/worker smoke:image

  deploy:
    needs: [test, image]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    environment: production
    concurrency: { group: production, cancel-in-progress: false }
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - name: Migrate production
        run: pnpm --filter @cs/db migrate
        env: { DATABASE_URL: "${{ secrets.PROD_DATABASE_URL }}" }
      - name: Deploy web (Vercel)
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
          SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
        run: |
          npx vercel@<pinned> pull --yes --environment=production --token="$VERCEL_TOKEN"
          npx vercel@<pinned> build --prod --token="$VERCEL_TOKEN"
          npx vercel@<pinned> deploy --prebuilt --prod --token="$VERCEL_TOKEN"
      - name: Deploy worker (Railway)
        env: { RAILWAY_TOKEN: "${{ secrets.RAILWAY_TOKEN }}" }
        run: npx @railway/cli@<pinned> up --ci --service rivalmonday-worker
```
- Pin `vercel` and `@railway/cli` to exact versions ≥ 2 weeks old at implementation time (replace `<pinned>`); confirm `pnpm --filter @cs/db migrate` reads `DATABASE_URL` (else pass the var it reads).
- `test` job: service image `pgvector/pgvector:pg18`; after `pnpm typecheck` add `pnpm --filter @cs/db exec drizzle-kit check`. Leave the rest unchanged.
- Workflow-shape test asserts: `deploy.needs ⊇ [test, image]`; `deploy.if` contains `refs/heads/main` and `push`; `deploy.concurrency.group == 'production'` and `cancel-in-progress == false`; step order migrate → Vercel → Railway; no step uses `continue-on-error`; `test.services.postgres.image` ends `pg18`.
**Done when:** the shape test passes; `npx --yes @action-validator/cli .github/workflows/ci.yml` (or `actionlint` if available) reports no errors; `pnpm --filter @cs/db exec drizzle-kit check` passes locally.

### Task 13: `docs/DEPLOY.md` runbook + docs touch-ups
**Goal:** The owner can do the first production deploy and every rollback from one document.
**Files:** create `docs/DEPLOY.md` (≤ 8 KB); modify `docs/gotchas-cross-cutting.md` (worker roles, strict prod env, Sentry inert without DSN, `/healthz`), `apps/worker/CLAUDE.md` (roles, Docker, `/healthz`), `docs/work/phase-7-planning.md` → the execution branch's work file (Owner verification steps = spec §5; New backlog entries).
**Behaviour:** DEPLOY.md sections in this order (spec §3.9): Prerequisites (accounts, owner gates) · Neon prod project (`us-east-1`, PG 18, pgvector, run `infra/db/init/01-roles.sql` with **new** passwords, pooled vs direct URLs) · R2 · Railway (connect repo, `apps/worker/railway.json`, env list = `REQUIRED_PROD_ENV` + `WORKER_ROLES=all`, auto-deploy off) · Vercel (root `apps/web`, region `iad1`, env list, domain `rivalmonday.app` + `www` redirect, auto-deploy off / "Ignored Build Step" = `exit 0`) · Namecheap records table (Vercel A/CNAME; Postmark DKIM + Return-Path CNAME for `mail.`; SPF `include:spf.mtasvcs.net` per Postmark; DMARC `v=DMARC1; p=none; rua=mailto:dmarc@rivalmonday.app`, tighten to `quarantine` after 2 clean weeks) · Postmark (sender signature/domain, approval, live token) · Sentry (two projects, DSNs, alert rules: new issue, regression, missed check-in → owner email) · GitHub `production` environment secrets list · First deploy (push to `main`, watch the jobs) · Bootstrap (`pnpm --filter @cs/web admin invite …` against prod with `PLATFORM_ADMIN_EMAILS` set) · Checklist (spec §5) · Turning on web monitoring (after `/bot` is live) · Rollback (Vercel "Promote previous deployment"; Railway redeploy previous; migrations are additive — never roll back schema) · Secrets rotation notes (`LINK_SIGNING_SECRET_PREVIOUS` pattern; never change `REVIEWER_HASH_SALT`).
- Record in the work file's New backlog: close "Flaky Neon connections in tests" (local test cluster); mark the `0025` and magic-link deploy notes "N/A — fresh prod DB"; carry any page > 3 s measured on prod.
**Tests:** none (docs). Reviewer checks every env var named in DEPLOY.md exists in code (`rg`) and every code-required prod var appears in DEPLOY.md.
**Done when:** `wc -c docs/DEPLOY.md` ≤ 8192; `git ls-files --eol | grep crlf` prints nothing.

---

## Final review (whole branch, most capable model)
Run `pnpm test:affected --base main` and `pnpm --filter @cs/web e2e:affected --base main`; check the five Review-focus items against the code; confirm no migration files changed; confirm `.env` untouched and unstaged.
