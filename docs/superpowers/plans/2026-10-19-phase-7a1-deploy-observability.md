# Phase 7a1 — Deploy & observability (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. **Lean plan format** (root `CLAUDE.md`): Interfaces are binding; implementers write code + tests from Behaviour + Tests. Full code appears only for SQL/grants, security-sensitive logic and decided copy.

**Goal:** First gated production deploy at `https://rivalmonday.app` — Edge-safe core, bounded request-path AI, CI on PG18, measured page latency, Sentry + pino + `/platform/health`, least-privilege runtime DB roles, the `/bot` page and a migrate-then-deploy GitHub Actions pipeline. The live deploy (Task 12) runs only once the owner's accounts exist (O17).

**Spec:** `docs/superpowers/specs/2026-10-19-phase-7a-launch-production-security-design.md` §2–§3, §5–§9 (binding), and the parked `2026-10-12-phase-7a-deploy-observability-design.md` §3.1 (worker health/env/Dockerfile, minus roles), §3.2 (logging), §3.3 (Sentry), §3.4 (thresholds), §3.5 (`/bot` copy), §3.7 (pipeline), §3.9 (`DEPLOY.md`). "O*n*" = owner decision *n* in `docs/work/phase-7.md`.

## Global constraints
- Root `CLAUDE.md` Essentials + `docs/gotchas-cross-cutting.md` + each touched package's `CLAUDE.md`. Never print/stage `.env`; ask the owner before adding vars to it (the code must run with every new var unset).
- One worker replica; no `WORKER_ROLES` (spec D2). Crons stay in pg-boss.
- Sentry is inert unless `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` is set (local, unit tests, E2E run without it). Sentry and pino redact through one `redactForLog`. Never send prompts/outputs, review text, emails, tokens or cookies.
- `WEB_MONITORING_ENABLED` stays unset locally and in E2E. Never crawl a real competitor.
- New env vars → `turbo.json` `globalPassThroughEnv`. Never edit applied migrations. Web reads via registered tools; refusals 404.
- **No sender/auth-host/error-page code** (13a owns it, spec §6). 7a1's only `proxy.ts` edit is the `PUBLIC` hunk in Task 8.
- Commits end `Co-Authored-By: <model> <noreply@anthropic.com>`; LF only. Test scope: root `CLAUDE.md` § Process 6.

## Decisions (plan-local; spec §2 binds)
1. **Registry hashing is injected:** `ToolRegistryOptions.hashInput` (required); `createToolRegistry` passes `hashInput` from `@cs/core/server`. The core main entry keeps `ToolRegistry`, `isVisible`, types and pure helpers.
2. **AI timing flows per call:** a `CallTiming { timeoutMs; maxAttempts }` resolved from the task reaches the provider call (`maxRetries = maxAttempts − 1`). A Jev task's escalation call uses the **calling** task's timing, so a `request_path` Jev task is budgeted as `2 × timeout_ms × max_attempts ≤ 45 000` (both stages).
3. **Worker health** counts `boss.start()` as the first beat (Railway health checks pass before the first 5-min heartbeat); ok iff `now − max(startedAt, lastHeartbeatAt) ≤ 660 s`.
4. **Strict prod env** = parked list + `SERVICE_DATABASE_URL`, `LINK_SIGNING_SECRET` (the worker needs both): `DATABASE_URL`, `SERVICE_DATABASE_URL`, `APP_URL`, `LINK_SIGNING_SECRET`, `EMAIL_FROM`, `POSTMARK_SERVER_TOKEN`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `OPENROUTER_API_KEY`, `TYPESAFE_API_KEY`, `SENTRY_DSN`.
5. **"Lint" = a guard test.** The repo has no ESLint; `apps/web/src/no-console.test.ts` scans `apps/**/src` (not tests): zero `console.*` in `apps/worker/src` outside `cli/**` (human CLI output); `apps/web/src` may not exceed a checked-in per-file baseline (`apps/web/src/console-baseline.json`).
6. **pg-boss grants on a fresh DB:** pg-boss creates `pgboss.job` only when the worker first starts, after the deploy job's migration. So the migration grants what exists, and the worker runs `ensureQueueGrants()` after `boss.start()` (as owner `cs_worker`, idempotent). Pre-flight may add statements (spec §3 "whatever pre-flight proves").
7. **Health page** drops the parked "spend" panel (8c `/platform/costs` owns spend). `sources[]` kinds are `vendor_call` and `capture`: `warn` when the last ok row is > 26 h old, `down` when > 72 h or never. Vendor `errorRate = errors24h / calls24h` (0 when no calls) feeds the parked thresholds. Queue stats reach the tool via injected `ToolDeps.queueStats` (pattern: `jobStatus`).
8. **Browser Sentry init** uses the file the installed `@sentry/nextjs` documents for Next 16 (`instrumentation-client.ts` if so); spec's `sentry.client.config.ts` name yields.
9. **Worker release id:** the deploy job writes `apps/worker/.release` (= `GITHUB_SHA`) before `railway up`; Sentry release = `SENTRY_RELEASE ?? <.release> ?? 'dev'`.
10. **`/robots.txt` joins `PUBLIC`** in the same `proxy.ts` hunk (else signed-out crawlers get a sign-in redirect and `robots.ts` is moot).

## File structure
- `packages/core/src/server/{index,links,tokens,hash,log}.ts`, `packages/core/src/edge-safe.test.ts`, `packages/core/package.json`
- `packages/ai/src/{config,ai,http,openrouter,embeddings,chat}.ts`, `packages/ai/src/decisions/{jev,llm}.ts`, `packages/ai/config/ai.yaml`
- `apps/web/{instrumentation.ts,instrumentation-client.ts,sentry.server.config.ts,next.config.ts}`, `apps/web/src/server/{env,request-id,queue,tools}.ts`, `apps/web/src/runtime.test.ts`, `apps/web/src/no-console.test.ts`
- `apps/worker/src/{health,env,sentry,log,main,boss}.ts`, `apps/worker/src/jobs/heartbeat.ts`, `apps/worker/Dockerfile`, `apps/worker/railway.json`, `apps/worker/scripts/image-smoke.ts`, `.dockerignore`
- `packages/db/src/cli/predeploy-check.ts`, `packages/db/migrations/<next>_runtime_roles.sql`, `infra/db/init/01-roles.sql`, `scripts/local-test-db.sh`
- `packages/tools/src/{deps.ts,platform/system-health.ts,tools/platform-health.ts,tools/all.ts}`, `apps/web/src/app/(platform)/platform/health/page.tsx`
- `packages/collectors/src/web/user-agent.ts`, `apps/web/src/app/{bot/page.tsx,robots.ts}`, `apps/web/src/proxy.ts`
- `apps/web/scripts/profile-pages.ts`, `.github/workflows/ci.yml`, `docker-compose.yml`, `turbo.json`, `docs/DEPLOY.md`, `apps/web/e2e/ops.spec.ts`

## Dependencies on in-flight work (re-check in Task 0)
- **phase-14b** (unmerged; migrations `0077`–`0079`; `packages/db/src/schema/ledger.ts` `llm_call.vertical_id`; `ai.yaml` `runbook_tailor`; worker `main.ts` new jobs; packs become seed + fixtures). If merged: its new jobs get logger/Sentry for free via `registerJobs`; its new AI tasks are worker-only unless web-reachable; drop `packages/verticals/packs/**` from tracing + image if nothing loads packs at runtime.
- **13a** (plan on `main`, not started): owns `proxy.ts` beyond `PUBLIC`, auth host, sender, `turbo.json` env additions (merge both sides). Whichever lands second rebases the `PUBLIC` hunk.
- **phase-15b** (planning; may claim a migration after 14b). Migration number = next free at execution (assumed `0080`).

## Review focus
1. **Redaction misses** — an email inside `Error.message`/`stack`, nested `{ headers: { Authorization } }`, arrays of objects, `cause` chains and circular objects are scrubbed without throwing (Task 1 tests).
2. **Ask hanging past `maxDuration`** — every web-reachable AI task, incl. a Jev task plus its escalation, fits 45 s; a slow provider aborts at the task's timeout, not 60 s (Task 2 tests).
3. **Role grants** — `cs_web` can enqueue and read job status but cannot UPDATE/DELETE `pgboss.job` or read any `public` table; `cs_worker` reads no `public` table; a fresh DB (no `pgboss.job` at migrate time) still ends with working enqueue after the worker starts (Task 6 tests).
4. **Fresh/dead worker health** — healthy right after start, 503 eleven minutes after the job loop dies; missing/blank prod env exits 1 naming every var (Task 4 tests).
5. **Deploy ordering** — nothing deploys on PRs, before `test`/`image`, after a failed pre-check or migration, or concurrently; the 0025 pre-check fails closed on a malformed row and passes on a fresh DB (Tasks 5, 10 tests).

---

### Task 0: Pre-flight
**Goal:** Prove assumptions before code; fix the plan inline where they fail.
**Steps:**
- `git fetch && git rebase main`; `pnpm install`; own test DB (`/rm-kickoff` § test DB; `boss.test.ts` once for `pgboss`).
- Re-check **Dependencies**: `git branch --no-merged main`; if 14b merged, list its jobs/AI tasks/tools and whether `packages/verticals/packs/**` is still read at runtime (`rg "PACKS_DIR|createPackLoader" apps packages --glob '!*.test.ts'`). Claim the next free migration number; note it in the work file.
- **Prove pg-boss 10 grants on PG18** on the local cluster, simulating Neon (non-superuser owner): `CREATE ROLE sim_owner LOGIN CREATEROLE PASSWORD 'sim_owner'`; DB owned by it; as `sim_owner` create `cs_worker`/`cs_web`, run all migrations incl. Task 6's SQL, start pg-boss as `cs_worker` (`migrate: true`), run `ensureQueueGrants`, then as `cs_web` `start()` (`migrate/supervise/schedule: false`) + `send()` + the `jobStatus` SELECT. Record exactly which statements were needed (role membership `GRANT cs_worker TO <owner>`, `CREATE` on the database, `EXECUTE` on functions) → Task 6 SQL / `01-roles.sql` / `DEPLOY.md` § Roles. Also confirm the owner (dev `.env`, unchanged) can still run the dev worker and enqueue after the migration.
- `rg "envUrls\('dev'\)\.owner|DATABASE_URL" apps/web/src --glob '!*.test.*'` — only `server/queue.ts` + `env.ts` may use the owner URL.
- Read the installed `@sentry/nextjs`/`@sentry/node` READMEs (Next 16 file names, `withMonitor`, `captureRequestError`) and Turborepo's bundled docs (AGENTS.md) before touching `turbo.json`.
- Conflict-scan every task's Files against `main`.
**Done when:** findings + migration number recorded in `docs/work/phase-7.md`; plan edited where an assumption failed.

### Task 1: `@cs/core/server` — Edge-safe split, logger, redaction
**Goal:** `@cs/core`'s main entry imports no `node:*`; crypto and the pino logger live in `@cs/core/server`.
**Files:** create `packages/core/src/server/{index,links,tokens,hash,log}.ts` (+ `log.test.ts`), `packages/core/src/edge-safe.test.ts`; modify `links.ts`, `tokens.ts`, `tools.ts`, `index.ts`, `package.json` (`exports["./server"]`, deps `pino`; dev `pino-pretty`), `packages/tools/src/registry.ts`, every caller found by `rg "signLink|verifyLink|generatePat|hashPat|hashInput"` (≈21 files), the 9 `new ToolRegistry(` sites.
**Interfaces:**
```ts
// @cs/core/server
export { signLink, verifyLink } from './links';          // moved verbatim; LINK_TARGETS/appPath/appLinkFor stay in main
export { generatePat, hashPat } from './tokens';          // TOKEN_SCOPES/grantableScopes/effectiveScope/isPatFormat stay
export { hashInput } from './hash';                       // sha256(JSON.stringify(v ?? null)), unchanged output
export interface LogContext { requestId?: string; job?: string; jobId?: string; agencyId?: string; clientId?: string; role?: string }
type LogFn = (o: object | string, msg?: string) => void;
export interface Logger { debug: LogFn; info: LogFn; warn: LogFn; error: LogFn; child(ctx: LogContext): Logger }
export function createLogger(opts?: { level?: string; pretty?: boolean; destination?: NodeJS.WritableStream }): Logger;
export function redactForLog(value: unknown): unknown;
// @cs/core (main)
export interface ToolRegistryOptions { writeGuard?: WriteGuard; hashInput: (value: unknown) => string }
// ToolRegistry constructor: options param becomes required
```
**Behaviour:**
- `createLogger`: level `LOG_LEVEL ?? 'info'`; JSON when `NODE_ENV=production`, pretty only if `pino-pretty` resolves; every object and `err` passes `redactForLog`. Redaction (security-sensitive, use as written):
```ts
const SECRET_KEY = /token|secret|key|password|passwd|authorization|cookie|signature/i;
const EMAIL = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const DROP_KEYS = /^(prompt|messages|completion|output|body|text|reviewText|content|html)$/i;
export function redactForLog(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return value.replace(EMAIL, '$1***@$2');
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  if (value instanceof Error) return { name: value.name, message: redactForLog(value.message, seen), stack: redactForLog(value.stack, seen),
    ...(value.cause !== undefined ? { cause: redactForLog(value.cause, seen) } : {}) };
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
- `edge-safe.test.ts` walks relative imports from `src/index.ts` (and `./invite-offer`) and fails on any `node:*`/Node builtin, `pino`, or `./server` import.
**Tests (TDD):** `log.test.ts`: `redacts secret-like keys at any depth`; `masks emails in strings, Error message/stack and cause`; `drops prompt/body/text with length only`; `arrays and circular refs never throw`; `keeps ids and uuids intact`; `createLogger writes one JSON line with child context` (capture `destination`). `edge-safe.test.ts`: `main entry has no node builtins`. `hash`: `hashInput output unchanged for a fixture` (literal hex).
**Done when:** `pnpm --filter @cs/core exec vitest run`, `pnpm typecheck`, `pnpm test:affected` pass.

### Task 2: Per-task AI timeouts
**Goal:** Every AI task can set its timeout/attempts; web-reachable tasks fit inside Vercel's budget.
**Files:** modify `packages/ai/src/{config,ai,http,chat,openrouter,embeddings}.ts`, `packages/ai/src/decisions/{jev,llm}.ts`, their tests, `packages/ai/config/ai.yaml`, `packages/ai/src/config.test.ts`.
**Interfaces:**
```ts
// config.ts — every task variant gains (snake_case like the YAML):
timeout_ms: z.number().int().positive().default(60_000),
max_attempts: z.number().int().min(1).max(3).default(3),
request_path: z.boolean().default(false),
export const REQUEST_PATH_BUDGET_MS = 45_000;
export interface CallTiming { timeoutMs: number; maxAttempts: number }
export function timingOf(task: TaskConfig): CallTiming;
// chat.ts: ChatRequest gains `timing?: CallTiming`; EmbeddingRequest gains `timing?: CallTiming`
// AiDeps.jev: ((model: string, timing?: CallTiming) => DecisionProvider) | null
// createLlmDecisionProvider(chat, { model, fallbacks?, timing? })
```
**Behaviour:**
- Providers merge `timing` per call over their construction-time `HttpDeps` (`timeoutMs`, `maxRetries = maxAttempts − 1`); absent ⇒ today's behaviour. Fallback models reuse the task timing.
- `createAi`: chat/embeddings/Jev calls pass `timingOf(task)`; a Jev task's `escalate_to` provider gets the **Jev task's** timing (Decision 2).
- Superrefine: a `request_path` task must satisfy `timeout_ms × max_attempts ≤ 45 000`, or `2 ×` that when it is Jev with `escalate_to`.
- `ai.yaml` (all `request_path: true`): `ask_assistant` 20000×2; `ask_guard_decisions`, `ask_interpretation_decisions` 10000×2; `embeddings` 8000×2. Comment the rule in the YAML. Worker tasks unchanged.
- Pre-flight list of web-reachable tasks (`rg "createAiFromEnv|\.chat\(|\.decide\(|\.embed\(" apps/web/src packages/tools/src packages/ask/src`); any other becomes `request_path`.
**Tests (TDD):** `defaults timeout 60000 / attempts 3 / request_path false`; `rejects max_attempts 4`; `rejects a request_path task over budget`; `rejects a request_path jev task whose two stages exceed 45 s`; `bundled ai.yaml: ask_assistant, ask_guard_decisions, ask_interpretation_decisions, embeddings are request_path and fit`; `postJson aborts at the per-call timeout` (fake fetch honouring `signal`); `escalation uses the jev task's timing` (fake openrouter records `timing`).
**Done when:** `pnpm --filter @cs/ai exec vitest run config http ai` + `pnpm test:affected` pass.

### Task 3: Web Sentry, file tracing, Node-only runtime, request id
**Goal:** Web errors reach Sentry redacted; Vercel bundles carry runtime config files; nothing opts into Edge.
**Files:** create `apps/web/instrumentation.ts`, `apps/web/sentry.server.config.ts`, `apps/web/instrumentation-client.ts` (Decision 8), `apps/web/src/server/request-id.ts` (+ test), `apps/web/src/runtime.test.ts`, `apps/web/scripts/check-tracing.ts`; modify `apps/web/next.config.ts`, `apps/web/package.json` (dep `@sentry/nextjs`, script `check:tracing`), `apps/web/src/server/env.ts` (+ test).
**Interfaces:**
```ts
// env.ts WebEnv gains (all optional):
sentry: { dsn?: string; publicDsn?: string; environment?: string; issuesUrl?: string };  // SENTRY_DSN, NEXT_PUBLIC_SENTRY_DSN, SENTRY_ENVIRONMENT, SENTRY_ISSUES_URL
// request-id.ts
export function requestIdFrom(h: Headers): string;   // x-vercel-id, else crypto.randomUUID()
```
**Behaviour:**
- `instrumentation.ts`: `register()` imports `sentry.server.config` when `NEXT_RUNTIME === 'nodejs'`; `export const onRequestError = Sentry.captureRequestError`. Init only with a DSN; `tracesSampleRate: 0.1`, no replay, `sendDefaultPii: false`, `beforeSend`/`beforeSendTransaction` → `redactForLog` (server, from `@cs/core/server`). The browser file must not import `@cs/core/server`; it inlines the email mask + key redaction, with a parity test.
- Tags = ids only (`agencyId`, `clientId`, `requestId`) where a request context exists.
- `next.config.ts`: `outputFileTracingIncludes: { '/**': ['../../packages/ai/config/**', '../../packages/verticals/packs/**'] }` (packs per Task 0); wrap with `withSentryConfig` (silent; upload only when `SENTRY_AUTH_TOKEN` set; delete maps after upload).
- `runtime.test.ts`: no `apps/web/src/**/{page,route,layout}.ts(x)` exports `runtime = 'edge'`.
- `check-tracing.ts` (after `next build`): some `.next/server/**/*.nft.json` lists `packages/ai/config/ai.yaml` (and a pack if kept); exit 1 otherwise.
**Tests (TDD):** `no route or page opts into the Edge runtime`; `requestIdFrom prefers x-vercel-id`; `requestIdFrom falls back to a uuid`; `parseWebEnv leaves sentry fields undefined when unset`; `browser scrubber masks like redactForLog` (shared fixtures).
**Done when:** focused tests, `pnpm --filter @cs/web build`, `pnpm --filter @cs/web check:tracing`, typecheck, `pnpm --filter @cs/web e2e:affected` pass.

### Task 4: Worker observability — `/healthz`, strict env, Sentry, logger
**Goal:** Railway can health-check the worker; a misconfigured prod worker refuses to start; every job runs in a Sentry span with structured logs.
**Files:** create `apps/worker/src/{health,env,sentry,log}.ts` (+ tests); modify `main.ts`, `boss.ts` (+ `boss.test.ts`), `jobs/heartbeat.ts`, every `apps/worker/src/**` file with `console.*` (not `cli/**` tables), `apps/worker/package.json` (`@sentry/node`); create `apps/web/src/no-console.test.ts` + `apps/web/src/console-baseline.json` (Decision 5).
**Interfaces:**
```ts
export interface HealthState { startedAt: Date | null; lastHeartbeatAt: Date | null }
export const healthState: HealthState;
export function healthStatus(s: HealthState, now: Date): { ok: boolean; heartbeatAgeS: number | null };
export function startHealthServer(port: number, now?: () => Date): import('node:http').Server; // GET /healthz only
export const REQUIRED_PROD_ENV: readonly string[];             // plan Decision 4
export function missingProdEnv(env: NodeJS.ProcessEnv): string[]; // [] unless NODE_ENV=production; blank = missing
export function initWorkerSentry(env: NodeJS.ProcessEnv): boolean;
export function runJob<T>(job: Pick<JobDefinition<T>, 'name' | 'cron'>, jobId: string, data: T,
  handler: (data: T) => Promise<void | Record<string, unknown>>, log: Logger): Promise<void | Record<string, unknown>>;
export const workerLog: Logger;                                // createLogger().child({ role: 'worker' })
```
**Behaviour:**
- `healthStatus` per Decision 3; `/healthz` → `200 {"ok":true,"heartbeatAgeS":n}` / `503 {"ok":false,…}`, `cache-control: no-store`; other paths 404. Heartbeat handler sets `healthState.lastHeartbeatAt`; `main.ts` sets `startedAt` after `boss.start()`, listens on `PORT ?? 8080`, closes the server on shutdown.
- `main.ts` order: `initWorkerSentry` → `missingProdEnv` (print `[worker] missing required env: A, B`, exit 1) → boss.
- `registerJobs` calls `runJob` per batch item: child logger `{ job, jobId, agencyId?, clientId? }` (only string fields of those names from the payload); `Sentry.startSpan({ name: 'job.<name>', op: 'queue.process' })`; on throw `captureException` with tags, `log.error({ err })`, **rethrow**. Cron jobs wrap in `Sentry.withMonitor(name, fn, { schedule: { type: 'crontab', value: cron }, checkinMargin: 5, maxRuntime: 30 })`. Release per Decision 9; `beforeSend` → `redactForLog`.
- Replace `console.*` across `apps/worker/src/**` (incl. `pg-boss` `error` listener) with `workerLog`/children.
**Tests (TDD):** `healthy right after start before any heartbeat`; `unhealthy at 660 s + 1 after the last beat`; `a beat resets the age`; `not started → 503`; server test on an ephemeral port (200 → 503 via clock, `/other` 404); `missingProdEnv [] outside production`; `lists missing and blank vars in production`; `runJob rethrows and captures with job tags` (`vi.mock('@sentry/node')`); `withMonitor only for cron jobs`; `child logger carries agencyId/clientId but no other payload field`; `initWorkerSentry false without DSN`; `no-console guard` (worker zero outside cli; web ≤ baseline).
**Done when:** `pnpm --filter @cs/worker exec vitest run health env sentry boss`, `pnpm --filter @cs/web exec vitest run no-console`, typecheck pass.

### Task 5: CI on PG18, `drizzle-kit check`, 0025 pre-deploy check
**Goal:** CI and compose match prod Postgres; schema drift and the 0025 hazard fail before deploy.
**Files:** modify `.github/workflows/ci.yml` (test job only here), `docker-compose.yml`, `packages/db/package.json` (script `predeploy-check`); create `packages/db/src/cli/predeploy-check.ts`, `packages/db/src/predeploy.ts` (+ `predeploy.test.ts`).
**Interfaces:**
```ts
export async function findPredeployProblems(db: Db): Promise<string[]>;  // [] = safe to migrate
// CLI: loads .env like cli/migrate.ts (4 levels up), DATABASE_URL required, prints problems, exit 1 if any
```
**Behaviour:**
- Services/compose image → `pgvector/pgvector:pg18`; after `pnpm typecheck` add `pnpm --filter @cs/db exec drizzle-kit check`.
- `findPredeployProblems`: 0025 counts as applied iff `drizzle.__drizzle_migrations` exists and has a row with `created_at` = the `when` of tag `0025_model_ops` in `migrations/meta/_journal.json`. If not applied and table `client` exists, select `id` of clients failing the 0025 predicate (copy the `CHECK` body from `0025_model_ops.sql` as a `NOT (…)` filter) → one problem line listing ids. Missing tables ⇒ `[]` (fresh DB).
**Tests (TDD):** `fresh database → no problems`; `0025 applied → no problems even with odd data`; `0025 pending + a malformed score_thresholds row → problem naming its id` (build the scenario in a throwaway schema/DB: create `client` without the check, insert a bad row, fake an empty migrations table); `journal has 0025_model_ops`.
**Done when:** `pnpm --filter @cs/db exec vitest run predeploy`, `pnpm --filter @cs/db exec drizzle-kit check` pass locally.

### Task 6: Runtime roles `cs_worker` / `cs_web`
**Goal:** No owner URL at runtime: worker owns `pgboss`, web may only enqueue and read jobs (spec D9).
**Files:** create `packages/db/migrations/<next>_runtime_roles.sql` (`pnpm --filter @cs/db generate --custom --name=runtime_roles`), `packages/db/src/runtime-roles.test.ts`, `apps/worker/src/queue-grants.ts` (+ test); modify `infra/db/init/01-roles.sql`, `scripts/local-test-db.sh` (idempotent `ensure_roles` on `setup`/`start`), `apps/worker/src/main.ts`.
**Interfaces:** `export async function ensureQueueGrants(db: Db): Promise<void>` (runs the two guarded statements below; called after `boss.start()`).
**Migration SQL** (plus Task 0 findings):
```sql
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cs_worker') OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cs_web') THEN
    RAISE EXCEPTION 'roles cs_worker/cs_web missing: run infra/db/init/01-roles.sql (local) or docs/DEPLOY.md § Roles (Neon) first';
  END IF;
END $$;
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS pgboss;
--> statement-breakpoint
ALTER SCHEMA pgboss OWNER TO cs_worker;
--> statement-breakpoint
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT c.relname, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'pgboss' AND c.relkind IN ('r','p','v','m','S')
              AND NOT (c.relkind = 'S' AND EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype IN ('a','i'))) LOOP
    EXECUTE format('ALTER %s pgboss.%I OWNER TO cs_worker',
      CASE r.relkind WHEN 'S' THEN 'SEQUENCE' WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' ELSE 'TABLE' END, r.relname);
  END LOOP;
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'pgboss' LOOP
    EXECUTE format('ALTER ROUTINE %s OWNER TO cs_worker', r.sig);
  END LOOP;
  FOR r IN SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'pgboss' AND t.typtype IN ('e','d') LOOP
    EXECUTE format('ALTER TYPE pgboss.%I OWNER TO cs_worker', r.typname);
  END LOOP;
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA pgboss TO cs_web;
--> statement-breakpoint
GRANT SELECT ON ALL TABLES IN SCHEMA pgboss TO cs_web;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE cs_worker IN SCHEMA pgboss GRANT SELECT ON TABLES TO cs_web;
--> statement-breakpoint
DO $$ BEGIN IF to_regclass('pgboss.job') IS NOT NULL THEN GRANT INSERT ON pgboss.job TO cs_web; END IF; END $$;
-- no grants on schema public for either role
```
`ensureQueueGrants`: `GRANT SELECT ON ALL TABLES IN SCHEMA pgboss TO cs_web` + `GRANT INSERT ON pgboss.job TO cs_web` (as `cs_worker`; no-op when the URL is the local owner).
**01-roles.sql:** add `cs_worker`/`cs_web` (`LOGIN PASSWORD '<name>'`) in `DO … IF NOT EXISTS` blocks. **Owner step** before this migration reaches Neon dev (`pnpm db:migrate`): create both roles there + Task 0's membership grant (`DEPLOY.md` § Roles), else the guard aborts the migration.
**Tests (TDD)** (URLs derived from `TEST_DATABASE_URL` by swapping user/password): `cs_web can send a job and read its status`; `cs_web cannot UPDATE or DELETE pgboss.job`; `cs_web cannot SELECT public.client`; `cs_worker cannot SELECT public.client`; `fresh pgboss: worker start as cs_worker + ensureQueueGrants → cs_web send works`; `migration fails with the roles message when cs_web is missing` (temp DB).
**Done when:** focused tests, `pnpm --filter @cs/worker exec vitest run boss`, `drizzle-kit check` pass.

### Task 7: `get_platform_health` + `/platform/health`
**Goal:** Operators see worker, queue, vendor and source health; everyone else gets 404.
**Files:** create `packages/tools/src/platform/system-health.ts` (+ test), `packages/tools/src/tools/platform-health.ts` (+ test); modify `packages/tools/src/{deps.ts,tools/all.ts,index.ts}`, `apps/web/src/server/{queue,tools}.ts` (+ `queue.test.ts`), `apps/web/src/app/(platform)/platform/health/page.tsx`, `packages/demo/src/coverage.ts` (screen entry), `apps/web/scripts/e2e-affected-rules.ts` if needed.
**Interfaces:**
```ts
// deps.ts
export interface QueueStat { name: string; queued: number; active: number; failed24h: number; oldestQueuedAt: Date | null }
export type QueueStatsLookup = () => Promise<{ queues: QueueStat[]; lastHeartbeatAt: Date | null }>;
// ToolDeps gains: queueStats?: QueueStatsLookup; sentryIssuesUrl?: string
const Status = z.enum(['ok', 'warn', 'down']);
export const platformHealthOutput = z.object({
  generatedAt: z.string(),
  worker: z.object({ lastHeartbeatAt: z.string().nullable(), status: Status }),
  queues: z.array(z.object({ name: z.string(), queued: z.number(), active: z.number(), failed24h: z.number(), oldestQueuedAgeS: z.number().nullable(), status: Status })),
  vendors: z.array(z.object({ vendor: z.string(), calls24h: z.number(), errors24h: z.number(), lastOkAt: z.string().nullable(), status: Status })),
  sources: z.array(z.object({ kind: z.enum(['vendor_call', 'capture']), lastOkAt: z.string().nullable(), status: Status })),
  sentryUrl: z.string().nullable(),
});
export function healthStatuses(now: Date, raw: RawHealth): z.infer<typeof platformHealthOutput>; // pure, system-health.ts
```
**Behaviour:**
- Tool `get_platform_health`: web-only, `access: 'read'`, `permission: 'agency'`, `supportHidden: true`, input `{}`; first line `requirePlatformOperator(deps, ctx)`. No `queueStats` ⇒ `ToolError('internal', 'Queue status is not configured')`.
- `queueStatsFor(name)` in `queue.ts` (same `cs_web` queue connection as `jobStatus`; DEMO/TEST ⇒ empty + null): one grouped SQL over `pgboss.job` (`created`/`retry` = queued, `active`, `failed` with `completed_on > now() - 24h`, `min(created_on)` of queued) + latest `completed_on` of `system-heartbeat` over `pgboss.job ∪ pgboss.archive`.
- Vendors from `vendor_call` (48 h window); sources = latest ok `vendor_call` / ok `capture`. Thresholds: parked §3.4 + plan Decision 7.
- Page: replace the placeholder; keep the `isPlatformOperator` gate → then `callTool`; tables Worker / Queues / Vendors / Sources with calm status chips (existing palette), relative times with absolute `title`, "Open Sentry" link when `sentryUrl`. Follow pattern: `(platform)/platform/costs/page.tsx`.
**Tests (TDD):** `non-operator agency admin → not_found`; `guest contact → not_found`; `healthStatuses` edges (worker 11/30 min, queue 30 min/2 h/failed24h, error rate 0.2/0.5, no ok in 48 h, sources 26 h/72 h); `empty DB → worker down, queues [], vendors [], no divide-by-zero`; `queueStatsFor counts seeded pgboss rows` (mirror `queue.test.ts` setup).
**Done when:** `pnpm --filter @cs/tools exec vitest run platform-health system-health`, `pnpm --filter @cs/web exec vitest run queue` pass.

### Task 8: Domain switch, `/bot`, `robots.ts`, live docs
**Goal:** The crawler identifies as `rivalmonday.app`; the public bot page exists; live docs say `.app`.
**Files:** modify `packages/collectors/src/web/user-agent.ts` (+ test), `apps/web/src/proxy.ts` (`PUBLIC` only), `CLAUDE.md`, `apps/worker/CLAUDE.md`, `apps/worker/src/cli/collect-once.ts` (comment), `docs/OPS.md`, `docs/gotchas-cross-cutting.md`, `docs/brand/brand.md`, `README.md`; create `apps/web/src/app/bot/page.tsx`, `apps/web/src/app/robots.ts`, `apps/web/src/proxy.test.ts` (if absent).
**Behaviour:**
- `BOT_USER_AGENT = 'Mozilla/5.0 (compatible; RivalMondayBot/1.0; +https://rivalmonday.app/bot)'`; `BOT_TOKEN` unchanged.
- `PUBLIC` += `/^\/bot$/`, `/^\/robots\.txt$/` (Decision 10) — one isolated hunk (spec §6; 7a2 adds the Postmark entry beside it).
- `/bot`: outside route groups, static, always Rival Monday branding (no agency theming), wordmark, prose ≤ 720 px; `metadata.title = { absolute: 'RivalMondayBot · Rival Monday' }`. Copy = parked §3.5 verbatim (bold lead-ins, the two robots lines in one `<pre>`, `mailto:bot@rivalmonday.app`). Owner confirms the copy at plan review.
- `robots.ts` → `{ rules: [{ userAgent: '*', allow: ['/bot'], disallow: ['/'] }] }`.
- Docs: replace live `rivalmonday.com` with `rivalmonday.app` (not archive/plans/specs/BACKLOG history, not test fixtures).
**Tests (TDD):** `UA contains +https://rivalmonday.app/bot`; proxy: `/bot`, `/robots.txt` public; `/bots`, `/botx`, `/bot-admin`, `/bot/x` not public. E2E (Task 11 `ops.spec.ts`, `@smoke`).
**Done when:** focused tests pass; `rg -n "rivalmonday\.com" CLAUDE.md README.md apps packages docs/OPS.md docs/brand docs/gotchas-cross-cutting.md --glob '!*.test.ts'` prints nothing.

### Task 9: Latency pass
**Goal:** Measure every coverage page and meet spec D7 locally: ≤ 4 sequential DB stages per render; record the slowest pages.
**Files:** create `apps/web/scripts/profile-pages.ts` (+ args test), `apps/web/src/server/tool-timing.ts` (+ test); modify `apps/web/src/server/tools.ts` (`callTool` hook), `apps/web/package.json` (script `profile:pages`), then the pages/tools the report flags.
**Interfaces:**
```ts
// tool-timing.ts — active only when PROFILE_TOOLS=1 (never in production builds' default env)
export function recordToolTiming(e: { path: string; tool: string; startMs: number; endMs: number }): void; // appends NDJSON to .profile/tools.ndjson
export function sequentialStages(spans: { startMs: number; endMs: number }[]): number; // merged-overlap group count
// CLI: pnpm --filter @cs/web profile:pages [--base URL] [--cookie FILE] [--assert-stages 4]
```
**Behaviour:**
- Script signs in as the E2E admin (reuse `e2e/admin-session.ts` storage state) against a running `next start` with `PROFILE_TOOLS=1`, visits every `@cs/demo` `SCREENS` route (ids resolved like the coverage test), measures server time (request → full HTML), joins NDJSON by `x-rm-path`, prints the slowest 15 with per-tool ms and stage counts; `--assert-stages` exits 1 if any page exceeds it. `--base`/`--cookie` let the owner run it against prod (Task 12).
- Fix pass: pages over 4 stages first — independent reads into `Promise.all`, no per-row queries, then anything > 1.5 s locally. Each fix keeps its page's existing tests green. Leftovers → work file "New backlog" (spec §9).
**Tests (TDD):** `sequentialStages merges overlaps` (table); `recordToolTiming no-ops unless PROFILE_TOOLS=1`; args parser tests.
**Done when:** `pnpm --filter @cs/web profile:pages --assert-stages 4` passes against local Neon dev (report pasted into the work file); `pnpm test:affected`, `e2e:affected` pass.

### Task 10: Worker image, deploy job, `DEPLOY.md`, `turbo.json`
**Goal:** A portable worker image and a gated migrate-then-deploy pipeline; the owner can deploy and roll back from one runbook.
**Files:** create `apps/worker/Dockerfile`, `.dockerignore`, `apps/worker/railway.json`, `apps/worker/scripts/image-smoke.ts`, `docs/DEPLOY.md` (≤ 8 KB), `scripts/ci-workflow.test.mjs` (or a vitest under `apps/web/scripts`); modify `.github/workflows/ci.yml`, `apps/worker/package.json` (`smoke:image`), `turbo.json`.
**Behaviour:**
- Dockerfile per parked §3.1 (prune → `node:24-bookworm-slim`, frozen install, `playwright install --with-deps chromium`, explicit copy of `packages/ai/config/` [+ packs], `apps/worker/.release` if present, non-root user, `NODE_ENV=production PORT=8080`, `EXPOSE 8080`). `.dockerignore` excludes `node_modules`, `.env*`, `.git`, `.turbo`, `.next`, `.evidence`, `App/`, `.claude/`, `.superpowers/`, `docs/`.
- `image-smoke.ts`: loads `ai.yaml` (+ packs if runtime), launches/closes Chromium with `setContent`; no network/DB; prints `image-smoke ok`.
- `railway.json`: Dockerfile build, healthcheck `/healthz` (timeout 300), restart on failure, 1 replica, drain 40 s (verify field names).
- CI: `image` job (`docker build` + `docker run … smoke:image`); `deploy` job — `needs: [test, image]`, `if: github.ref == 'refs/heads/main' && github.event_name == 'push'`, `environment: production`, `concurrency: { group: production, cancel-in-progress: false }`; steps: install → `pnpm --filter @cs/db predeploy-check` → `pnpm --filter @cs/db migrate` (both `DATABASE_URL: ${{ secrets.MIGRATION_DATABASE_URL }}`) → `vercel pull/build --prod/deploy --prebuilt --prod` (`VERCEL_*`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT=${{ secrets.SENTRY_PROJECT_WEB }}`) → `echo $GITHUB_SHA > apps/worker/.release` + `railway up --ci --service rivalmonday-worker` → `sentry-cli releases new/finalize` for `SENTRY_PROJECT_WORKER`. Pin `vercel`, `@railway/cli`, `@sentry/cli` to exact versions ≥ 2 weeks old. No `continue-on-error`.
- `turbo.json`: `"agentGuidance": false`; pass-through `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_ISSUES_URL`, `SENTRY_RELEASE`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `LOG_LEVEL`, `PORT`, `PROFILE_TOOLS`.
- `DEPLOY.md` = parked §3.9 order + § Roles (Neon SQL for `cs_worker`/`cs_web` incl. Task 0's membership grants; `DATABASE_URL` per service: Railway = `cs_worker`, Vercel = `cs_web`, `APP_`/`SERVICE_DATABASE_URL` = `app_user`/`app_service`, owner only as `MIGRATION_DATABASE_URL`) + magic-link cutover note (spec D3) + secrets list (spec §3) + rollback + "set `WEB_MONITORING_ENABLED=true` only after `/bot` is live".
**Tests (TDD):** workflow-shape test: `deploy.needs ⊇ [test, image]`; `if` has `refs/heads/main` + `push`; concurrency `production`/no cancel; step order predeploy-check → migrate → Vercel → Railway; migrate/pre-check use `MIGRATION_DATABASE_URL`; no `continue-on-error`; postgres image ends `pg18`; `drizzle-kit check` step present.
**Done when:** shape test passes; `npx --yes @action-validator/cli .github/workflows/ci.yml` clean; host `pnpm --filter @cs/worker smoke:image` passes (no local Docker — image build proven in CI; say so in the report).

### Task 11: Docs + E2E
**Goal:** E2E for the new public/operator pages; docs and work file current.
**Files:** create `apps/web/e2e/ops.spec.ts`; modify `apps/web/scripts/e2e-affected-rules.ts` (`bot/`, `robots.ts` → `@smoke`; health → `@platform`), `docs/gotchas-cross-cutting.md` (roles + local `ensure_roles`, Sentry inert without DSN, `/healthz`, strict prod env, `PROFILE_TOOLS`), `apps/worker/CLAUDE.md` (Docker, `/healthz`, logger), `packages/db/CLAUDE.md` (pgboss ownership), `docs/work/phase-7.md` (Owner verification steps = parked §5 + latency targets; New backlog: 0025/magic-link notes closed by DEPLOY.md, latency leftovers).
**Tests:** E2E `@smoke`: `signed-out /bot shows RivalMondayBot and the exact UA`; `/robots.txt has Allow: /bot and Disallow: /`. `@platform`: `operator sees Worker, Queues, Vendors and Sources`; `agency admin gets 404 at /platform/health`.
**Done when:** `pnpm test:affected --base main` and `pnpm --filter @cs/web e2e:affected --base main` pass; `git ls-files --eol | grep crlf` empty; work file ≤ 10 KB.

### Task 12: Live deploy (gated on owner accounts, O17)
**Goal:** First production deploy via the pipeline, verified end to end. Runs only after the owner confirms every step below; may precede 7a2 (no real pilot agency before 7a2 merges, spec D1).
**Owner steps (in `DEPLOY.md` order):**
1. Neon project `rivalmonday-prod` (PG18, `us-east-1`, pgvector); create `app_user`, `app_service`, `cs_worker`, `cs_web` with new passwords (§ Roles); note pooled vs direct URLs.
2. Cloudflare R2 bucket + API token → `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
3. Railway service `rivalmonday-worker` (`apps/worker/railway.json`, auto-deploy off, 1 replica, env = `REQUIRED_PROD_ENV` with `DATABASE_URL` = `cs_worker` direct URL).
4. Vercel project (root `apps/web`, region `iad1`, git auto-deploy off; env incl. `DATABASE_URL` = `cs_web`, `APP_URL=https://rivalmonday.app`, Sentry DSNs, live Stripe + Turnstile keys); domain `rivalmonday.app` (+ `www` redirect); token, org id, project id.
5. Namecheap DNS: Vercel records; Postmark DKIM + Return-Path for `mail.rivalmonday.app`; SPF; DMARC `p=none` (→ `quarantine` after 2 clean weeks).
6. Postmark: account approval, live server token, `EMAIL_FROM` on the verified domain.
7. Sentry: projects web + worker, DSNs, alert rules (new issue, regression, missed check-in → owner email), auth token.
8. GitHub environment `production` secrets: `MIGRATION_DATABASE_URL`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `RAILWAY_TOKEN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT_WEB`, `SENTRY_PROJECT_WORKER`.
9. Approve any new `.env` keys for local use (Sentry vars stay unset locally).
**Steps (agent, with owner):** push to `main`; watch `test` → `image` → `deploy`; bootstrap the first platform admin (`pnpm --filter @cs/worker platform-admin` against prod `SERVICE_DATABASE_URL`, run by the owner); verify per `DEPLOY.md` checklist: TLS, magic-link sign-in, Sentry test event from web and worker, `/healthz` 200, `/platform/health` green after 1 h, `/bot` + `/robots.txt` signed-out, mail-tester ≥ 9/10, `profile:pages --base https://rivalmonday.app` p75 ≤ 1.5 s agency/workspace pages and every page ≤ 3 s (misses → backlog). Owner then sets `WEB_MONITORING_ENABLED=true` on Railway.
**Done when:** checklist passed and recorded in the work file; rollback rehearsed once (Vercel promote previous; Railway redeploy previous).
