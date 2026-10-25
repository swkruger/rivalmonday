# Phase 7c2 — Scale & pilot (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute this plan task by task. **Lean plan format** (root `CLAUDE.md`): Interfaces are binding; implementers write code + tests from Behaviour + Tests. Full code appears only for SQL/grants, security-sensitive logic, non-obvious algorithms and decided copy.

**Goal:** Make one worker carry 2× pilot scale (120 clients) with every brief ready well before Monday 07:00, prove it in a staging rehearsal, and hand the owner a pilot runbook: per-queue concurrency and pools, a per-vendor limiter, per-host capture pacing with deferral, set-based due scans, a brief-readiness alarm (`ops_alert`), the health-affecting 7a follow-ups, rehearsal tooling + the owner-gated rehearsal, feedback links, `PILOT.md` and the `cs_dev` fixture rename.

**Architecture:** Still one worker replica (O14). `registerJobs` starts N pollers per queue (pg-boss 10.4.2 has no `localConcurrency`); app queries move to a pooled `app_service` URL sized from the concurrency map. Outbound vendor/AI calls pass one in-process limiter (`@cs/core/server`) whose timeout starts after the slot. Captures take a per-host try-lock and re-enqueue themselves instead of sleeping. An hourly `brief-readiness` job writes service-only `ops_alert` rows and emails platform staff. The rehearsal runs on staging (Vercel Preview + Neon staging branch + a second Railway worker + a fixture-host service) with a rehearsal AI, fixture vendors and fixture hosts; all four rehearsal switches are refused in production.

**Spec:** `docs/superpowers/specs/2026-10-22-phase-7c-quality-scale-pilot-design.md` — the 7c2 parts of §3 (decisions 1–11, 16–20), §4 "7c2 code", "Env", "Docs", §5 "Concurrency", "Readiness", "7b spike guard", copy, §6 7c2, §7 open items (binding; not restated). Core spec §1.4, §9.1–9.2, §11.

## Global constraints
- Root `CLAUDE.md` Essentials; `docs/gotchas-cross-cutting.md`; `apps/worker/CLAUDE.md`, `packages/{collectors,db,engine,demo}/CLAUDE.md` when touched. Never read/print/stage `.env`; **ask the owner before adding any var to the root `.env`** (none is needed: every new var is optional and unset locally).
- **One worker replica.** `numReplicas` stays 1; the root `CLAUDE.md` one-replica rule is unchanged. Crawler: honest UA, RFC 9309, **≥ 3 s per host**, crawl-delay honoured (cap 60 s), never evade; `WEB_MONITORING_ENABLED` stays unset in prod.
- **Concurrency (decision 6):** 4 → `rival-search`, `vendor-collect`, `brief-client`, `web-capture-page`; 3 → `starting-point-client`, `engine-tag`, `engine-review`; 2 → `prospect-snapshot`, `rank-scan`, `setup-suggestions`, `runbook-tailor`, `rival-monthly-client`; else 1. Overrides `WORKER_QUEUE_CONCURRENCY` (`"brief-client=6,rival-search=5"`), each 1–8. `RIVAL_MONTHLY_SPACING_SECONDS` 2700 → **900**.
- **Pools (decision 20):** worker app pool `max` = Σ(localConcurrency − 1 over raised queues) + 10 (defaults ⇒ 33), on the pooled URL; pg-boss keeps its own direct pool (`pg` default 10).
- **Vendor limits (decision 7):** openrouter 8 concurrent, jev 8 concurrent, dataforseo 10/s, apify 3 concurrent, scrapecreators 5/s, stadia 5/s.
- **Captures (decision 8):** one render per host at a time; defer when the next slot is **> 10 s** away (`startAfter`, `singletonKey: 'capture:<trackedPageId>'`); robots.txt takes a slot.
- **Readiness (decision 10–11):** hourly at `25 * * * *`; generation closed after Friday 12:00 local (`BRIEF_CATCHUP_UNTIL_HOUR`); pre-delivery Sunday 19:00 local (12 h before 07:00); starting point late = not `ready` 6 h after due (due = `startingPointClockStart` + `STARTING_POINT_WAIT_HOURS` 48 h); recipients `platformOperatorEmails(deps, ['owner','staff'])`.
- **Rehearsal (decisions 1–4):** 40 agencies × 3 clients = 120 + 12 new starting points; all `America/Chicago`; Monday seed → next Monday 07:00; 110 clients on rehearsal AI ($0, `provider = 'rehearsal'`), live slice 10; `VENDOR_FAKE_MODE=fixtures`; captures only to our fixture hosts; budget ≤ $5 AI, ~$20 infra. Pass bar: weekly `ready` ≤ 4 h after window open; starting points ≤ 6 h after due; 0 `failed`; `sent` by 07:15 local, notifications by 07:45; no expired job; RSS < 75 %; Neon connections < 80 % of limit; no two requests to one host < 3 s apart; a `Crawl-delay: 30` host doesn't slow the others; fault run raises the alarm; the 7b spike guard never trips.
- **Env (spec §4 Env):** new `WORKER_QUEUE_CONCURRENCY`, `SERVICE_DATABASE_POOLED_URL`, `AI_PROVIDER_MODE` (`live`|`rehearsal`), `REHEARSAL_LIVE_CLIENT_IDS`, `VENDOR_FAKE_MODE`, `CRAWL_HOST_ALLOWLIST` — all in `turbo.json` `globalPassThroughEnv`. The worker refuses the last four unless `SENTRY_ENVIRONMENT=staging` or `NODE_ENV≠production` (fail closed).
- Web reads via registered tools; web writes via `runTool`; page refusals 404. `ops_alert` is service-only. Never edit applied migrations; **migration number = next free at execution time**.
- **Not folded (spec decision 18):** `WORKER_ROLES`/replicas, flaky-Neon test retries, the 7a embeddings batch (only if the rehearsal shows embedding timeouts — then a Task 12 fix).
- Commits end `Co-Authored-By: <model> <noreply@anthropic.com>`; LF only. Test scope: root `CLAUDE.md` § Process 6.

## Decisions (plan-local; the spec binds)
1. **Concurrency source:** `QUEUE_CONCURRENCY` (`apps/worker/src/concurrency.ts`) is the only default table; `main.ts` stamps `localConcurrency` onto each `JobDefinition` (defaults + overrides) before `registerJobs`. A malformed override, an unknown queue or a value outside 1–8 exits the worker at start (named in stderr).
2. **Pooled URL:** `SERVICE_DATABASE_POOLED_URL` (`app_service` via the Neon pooler). Unset ⇒ `SERVICE_DATABASE_URL` with a start-up warning. The pooled client uses `prepare: false` (PgBouncer transaction mode); no code takes session-level state (scan in Task 0).
3. **Timeout after the slot:** the limiter wraps a `TimedFetch` (`init.timeoutMs`); the five call sites (`@cs/ai` `postJson`, DataForSEO, Apify, ScrapeCreators, Stadia) pass `timeoutMs` instead of building `AbortSignal.timeout` themselves, so waiting for a slot never eats the request timeout. A concurrency slot is held until response headers.
4. **Host lock is a try-lock:** a capture finding its host busy defers rather than blocking a poller. Deferred retries are staggered by a per-host cursor (Task 3 algorithm); a deferral reserves no real slot.
5. **`web-capture-page` becomes `policy: 'short'`;** every enqueue (schedule, manual, deferral) passes `singletonKey: 'capture:<trackedPageId>'` (a keyless send would collide on `''`).
6. **Readiness:** one `ops_alert` row per `brief_readiness:<checkpoint>:<deliveryDate>` (weekly) and per `brief_readiness:starting_point_late:<clientId>` (a starting point's "delivery date" is unique per client). Checkpoints `generation_closed` (critical), `pre_delivery` (critical), `pre_delivery_unapproved` (warning), `starting_point_late` (critical). Clients activated after their window opened, and spend-paused clients (7b1 `clientWorkAllowed`), are not expected. The job no-ops when `engineConfigured()` is false (dev noise).
7. **Health panel numbers are computed live** by `get_platform_health` (`checkedAt` = now); `issues[]` = open `ops_alert` rows.
8. **`client` INSERT:** no `app_user` path inserts `client` (`createClientCore` runs on the service tx), so the migration revokes INSERT outright with **no** column grant. If Task 0 finds an `app_user` insert, use the restrictive policy in Task 5 instead (Drizzle names every column in an INSERT, so a column grant would break it).
9. **Cron monitor:** `registerJobs` schedules cron jobs with data `{ _cron: true }`; `runJob` uses `Sentry.withMonitor` only for that payload. Sentry captures a job error only on its last attempt (pg-boss `includeMetadata`); earlier attempts log `warn`.
10. **Heartbeat** retries `ensureQueueGrants` and returns `{ queueGrants: 'ok'|'failed', rssMb, dbConnections, dbMaxConnections }`; `/healthz` is 503 while grants fail. The rehearsal report reads these outputs.
11. **Fixture hosts** are served by a third staging Railway service running `apps/worker/src/cli/fixture-hosts.ts` from the worker image (5 custom domains `fx1…fx5.rehearsal.rivalmonday.app`, `fx5` sends `Crawl-delay: 30`). Content per client group: variant = `hash(groupSlug, ISO week) mod 10`; variants 0–6 serve a mutation from **Wednesday 00:00 UTC** of that week (so Mon/Tue captures are the baseline). Vendor fixtures are static (no new reviews/ads after the seed), so only web mutations create events (~70 % standard / ~30 % quiet).
12. **Fault run** = 3 extra clients in a 41st agency whose brief rows for the rehearsal Monday are pre-set `failed` at `BRIEF_MAX_ATTEMPTS`; the report excludes them from the clean pass bar and requires a critical `generation_closed` alert + email for them.
13. **Feedback contact for the web page** comes from a new web-only read tool `get_feedback_contact` (not `get_brief`, which also serves MCP/Ask). Agency "Send feedback" uses `SUPPORT_REPLY_TO ?? support@rivalmonday.app` (agency-facing only).
14. **Teardown archives** the rehearsal agencies through the existing `archive` CLI, never deletes evidence; the owner then deletes the staging branch, bucket and services.
15. **Task order:** feedback links (Task 11) land before the rehearsal (Task 12) so the rehearsal exercises the final email path.

## File structure
- Worker: `apps/worker/src/{concurrency.ts (+test),boss.ts,jobs.ts,main.ts,deps.ts,env.ts,health.ts,sentry.ts,queue-grants.ts}`, `jobs/{web,rivals,heartbeat,briefs}.ts`, new `jobs/ops.ts`, `cli/fixture-hosts.ts`, `package.json`.
- Core/AI/collectors: `packages/core/src/server/{token-bucket.ts,index.ts}`; `packages/ai/src/{http.ts,env.ts}`; `packages/collectors/src/{vendors/{dataforseo,apify,scrapecreators,fixture-fetch}.ts,rankings/static-map.ts,web/{rate-limit,robots,polite}.ts,capture/capture-page.ts,net/guard.ts,rehearsal/fixture-sites.ts,index.ts}`.
- DB/engine: `packages/db/migrations/<next>_ops_alert.sql`, `packages/db/src/{schema/ops.ts,schema/index.ts,client.ts}`; `packages/engine/src/briefs/{generate,readiness,brief-readiness}.ts`, `packages/engine/src/{rehearsal-ai.ts,rehearsal-latency.json}`, `delivery/contacts.ts`, `alerts/route.ts`, `briefs/deliver.ts`.
- Email/tools/web: `packages/email/src/{types.ts,render.ts,templates/{platform-ops-alert,brief,alert,agency-welcome}.tsx}`; `packages/tools/src/{platform/system-health.ts,tools/platform-health.ts,tools/feedback.ts,index.ts}`; `apps/web/src/{components/shell/avatar-menu.tsx,app/(app)/c/[clientId]/briefs/[briefId]/page.tsx,app/(platform)/platform/health/_components/,server/{queue,runtime-env}.ts}`.
- Demo: `packages/demo/src/rehearsal/{seed,approve,fault,report,teardown,latency,guards}.ts`, `packages/demo/src/cli/rehearsal.ts`, `package.json`.
- Docs: `docs/PILOT.md` (new), `docs/{OPS,DEPLOY,BACKLOG,gotchas-cross-cutting}.md`, `apps/worker/CLAUDE.md`, `packages/demo/CLAUDE.md`, `turbo.json`.

## Dependencies on in-flight work (re-check in Task 0)
- **7b1 (cost guards; plan in this folder; assumed to land first).** Assumed present (7b1 plan Tasks 6–8): `JobDefinition.usesAi`, `registerJobs(…, { aiPaused })` with `includeMetadata: true`, `createAiFromEnv(…, samples?, guard?)`, `runJob` handling of `AiPausedError` (`platform` → re-send `startAfter: 600`; `client` → skip), `registerJobs` deferring `usesAi` batches while paused, `clientWorkAllowed` in `@cs/db` `filters.ts` (schedulers switched to it), the AI guard wrapped where `deps.getAi` builds the Ai, `spend_guard_event`, the `/platform/health` Spend guard panel. Interplay: **the 7b1 defer logic must live inside the one handler that all N pollers share** (Task 1); due scans and readiness use `clientWorkAllowed` (Tasks 4, 6); the rehearsal Ai is wrapped by the same guard (Task 10a); the report reads `spend_guard_event` (no `spike_paused` allowed). Rehearsal rows cost $0 (not in the guard or client limits). **If 7b1 is not merged:** build on today's code (`clientServiceable`, no guard) and record "7b1 adapts" in the work file; whichever lands second re-checks these five points. Conflict files: `apps/worker/src/{boss,sentry,jobs,deps,main}.ts`, `packages/engine/src/briefs/{generate,readiness}.ts`, `packages/ai/src/env.ts`, `/platform/health` components, `turbo.json`.
- **7c1 (quality gates, no migrations):** SQL fixes for leaks its suites find move into this plan's Task 5 migration (owner-approved); a new tool needs an `ISOLATION_FIXTURES` entry (`get_feedback_contact`, Task 11) and a new table a `TABLE_CLASS` entry (`ops_alert: 'service_only'`, Task 5); if 7c1 is merged, add them in those tasks; if not, 7c1's pre-flight picks them up.
- **7b2, 15c-2, 15b-3b, 15c-3, 13a:** 15c-2 moves `/platform/health` chips to `@cs/ui` `StatusChip` (use whichever exists); 13a touches `deps.ts`/`main.ts`/`turbo.json`/email sending; 15b-3b renames tools (no overlap here). Small hunks; the second to land rebases.
- **Not in this plan:** the Launch gate (shell DB stages) and the live deploy (7a1 Task 12). **Staging must exist before this plan's Task 12** (owner, decision 19; Neon staging branch needs the prod Neon project, O17).
- **Migrations:** one (`ops_alert` + hardening), number = next free at execution (T0 2026-10-25: main ends `0092`, so this branch claims `0093`; phase-16 adds none; 15c-3, 13a may claim first).

## Review focus
1. **N pollers on one queue** — shared lazy singletons, a throwing handler on one poller, graceful stop waiting for all N, 7b1's deferral on every poller (Task 1 tests).
2. **Limiter vs timeouts** — a request queued 5 s still gets its full `timeoutMs`; an aborted waiter frees its place; a throwing fetch releases its slot; FIFO under mixed vendors (Task 2 tests).
3. **Capture deferral** — a deferred capture makes no request; a robots fetch takes a slot; a `Crawl-delay: 30` host defers while another host renders; staggered retries don't all return at once; a duplicate capture is not queued twice (Task 3 tests).
4. **Readiness alarms** — no alarm for a client activated after the window, a spend-paused client, or a starting point holding that Monday; an alarm for a `generating` row past Friday 12:00; resolved keys never re-email; a failed send retries next hour (Task 6 tests).
5. **Rehearsal switches in production** — any of the four vars with `NODE_ENV=production` and `SENTRY_ENVIRONMENT` ≠ `staging` (incl. unset/`Staging `) exits 1; staging + `WEB_MONITORING_ENABLED=true` without an allowlist exits 1; the allowlist refuses a non-listed host on every hop (Task 9a tests).

---

### Task 0: Pre-flight
**Goal:** Prove the plan's assumptions on current `main`; fix the plan inline where they fail.
**Steps:**
- `git fetch && git rebase main`; `pnpm install`; own test DB (`bash scripts/local-test-db.sh start`, `cs_phase_7c2_test`); `pnpm --filter @cs/worker exec vitest run src/boss.test.ts` once (pgboss schema).
- **Dependencies:** `git branch --no-merged main`; for 7b1 check `rg "usesAi|clientWorkAllowed|AiPausedError|spend_guard_event" packages apps`; record which of the five interplay points exist. Same for 7c1 (`ISOLATION_FIXTURES`, `TABLE_CLASS`). Claim the next free migration number.
- **Session state vs pooler:** `rg -n "pg_advisory_lock\(|set_config\([^)]*false\)|SET SESSION|\bLISTEN\b|\.prepare\(" packages apps --glob '!*.test.*'` must stay empty for worker paths (empty on 2026-10-23).
- **`client` INSERT:** `rg -n "insert\(client\)" packages apps --glob '!*.test.*' --glob '!**/e2e/**' --glob '!packages/demo/**'` — today only `packages/tools/src/tools/onboarding.ts` (service tx). List tests inserting `client` as `app_user` (they move to the service/owner connection).
- **Fetch sites:** `rg -n "AbortSignal.timeout" packages/ai/src packages/collectors/src/{vendors,rankings}` — expect `http.ts`, `dataforseo.ts:108`, `apify.ts:35`, `scrapecreators.ts:22`, `static-map.ts:38`.
- **Cron schemas:** every `defineJob` with `cron` has a schema accepting `{ _cron: true }` (`z.looseObject`). (T0 2026-10-25) All accept it, but `kb-embed` and `kb-sync` use `z.object` (zod 4 strips unknown keys), and `registerJobs` hands `runJob` the PARSED data: `_cron` would be lost there. Task 7: `registerJobs` passes `isCron: item.data?._cron === true` (raw data) to `runJob`, or change both schemas to `z.looseObject`; do not read `_cron` from parsed data.
- **Concurrency safety:** read the handlers of the 12 raised queues and their `deps` methods for module-level mutable state (e.g. `warnedNoSalt`, caches); note any that needs a guard.
- Conflict-scan every task's Files against `main` and in-flight branches.
**Done when:** findings in `docs/work/phase-7c2.md`; plan edited where needed.

### Task 1: Worker concurrency + pools
**Goal:** N pollers per raised queue, env overrides, pooled app connection sized from the map, faster monthly spacing.
**Files:** create `apps/worker/src/concurrency.ts` (+ `concurrency.test.ts`); modify `apps/worker/src/{jobs.ts,boss.ts,main.ts,deps.ts}` (+ `boss.test.ts`, `deps.test.ts`), `apps/worker/src/jobs/rivals.ts` (+ test), `packages/db/src/client.ts` (+ test), `turbo.json`.
**Interfaces:**
- `JobDefinition<T>.localConcurrency?: number` (1–8).
- `export const QUEUE_CONCURRENCY: Readonly<Record<string, number>>` (Global constraints values).
- `export function parseConcurrencyOverrides(env: NodeJS.ProcessEnv, known: readonly string[]): Record<string, number>` — reads `WORKER_QUEUE_CONCURRENCY`; throws `Error` naming the bad entry (spec signature + the known-queue list).
- `export function applyConcurrency<T extends JobDefinition<any>>(jobs: T[], table: Record<string, number>): T[]` (copies; never mutates).
- `export function appPoolMax(jobs: Pick<JobDefinition<unknown>, 'localConcurrency'>[]): number` = Σ max(0, c − 1) + 10.
- `CreateDbOptions` + `max?: number` (default 5), `prepare?: boolean` (default true).
- `createWorkerDeps(env, opts?: { appPoolMax?: number })`; `getDb` uses `SERVICE_DATABASE_POOLED_URL ?? SERVICE_DATABASE_URL` with `{ max: opts.appPoolMax ?? 5, prepare: !pooled }`.
- `RIVAL_MONTHLY_SPACING_SECONDS = 900`. Produces: `localConcurrency` (consumed by Tasks 3, 12).
**Behaviour:**
- `registerJobs` builds **one** batch handler per job (today's loop + `runJob`, plus 7b1's paused deferral if present) and calls `boss.work(name, opts, handler)` `localConcurrency ?? 1` times; `createQueue`/`updateQueue`/`schedule` stay once per job.
- Each poller keeps batch size 1 and `pollingIntervalSeconds` 2; `policy`/singleton keys unchanged.
- `main.ts`: `const jobs = applyConcurrency([...], { ...QUEUE_CONCURRENCY, ...parseConcurrencyOverrides(process.env, names) })`; bad override ⇒ stderr + `process.exit(1)` before `boss.start()`; `createWorkerDeps(process.env, { appPoolMax: appPoolMax(jobs) })` — so deps must be created after the list exists (reorder the job factories' inputs, not their behaviour). Log the effective table once (`workerLog.info({ concurrency }, …)`).
- Unset pooled URL ⇒ `workerLog.warn('SERVICE_DATABASE_POOLED_URL unset; app queries use the direct URL')`.
- `turbo.json`: add `WORKER_QUEUE_CONCURRENCY`, `SERVICE_DATABASE_POOLED_URL`.
- **Follow pattern:** `boss.ts` today; env parsing like `apps/worker/src/env.ts`.
**Tests (TDD):**
- `concurrency.test.ts`: `every QUEUE_CONCURRENCY key is a registered job name` (import the job factories with stub deps); `parses "brief-client=6,rival-search=5"`; `rejects "brief-client=9", "x=2", "brief-client", "brief-client=1.5"`; `appPoolMax of the defaults is 33`; `applyConcurrency does not mutate its input`.
- `boss.test.ts` (real pg-boss on the test DB): `a job with localConcurrency 3 runs 3 handlers at once` (handlers await a shared latch; assert 3 active simultaneously); `a handler that throws on one poller does not stop the others`; `stop({ graceful, wait }) resolves only after every in-flight handler finished`; `createQueue is called once per job`.
- `client.test.ts`: `createDb honours max and prepare` (inspect `sqlClient.options`).
- `rivals.test.ts`: spacing assertion updated to 900.
**Done when:** `pnpm --filter @cs/worker exec vitest run concurrency boss deps rivals`, `pnpm --filter @cs/db exec vitest run client`, `pnpm test:affected`.

### Task 2: Per-vendor limiter + timed fetch
**Goal:** One in-process limiter for every vendor/AI call made by the worker, with the timeout starting after the slot.
**Files:** create `packages/core/src/server/token-bucket.ts` (+ test); modify `packages/core/src/server/index.ts`, `packages/ai/src/{http.ts,env.ts}` (+ tests), `packages/collectors/src/vendors/{dataforseo,apify,scrapecreators}.ts`, `packages/collectors/src/rankings/static-map.ts` (+ tests), `apps/worker/src/deps.ts` (+ test).
**Interfaces:**
```ts
export type VendorKey = 'openrouter' | 'jev' | 'dataforseo' | 'apify' | 'scrapecreators' | 'stadia';
export interface VendorLimit { concurrent?: number; perSecond?: number }
export const DEFAULT_VENDOR_LIMITS: Record<VendorKey, VendorLimit>; // decision 7 values
export type TimedFetch = (input: string | URL | Request, init?: RequestInit & { timeoutMs?: number }) => Promise<Response>;
export function timedFetch(inner?: typeof fetch): TimedFetch;          // timeoutMs → AbortSignal, no limit
export interface VendorLimiter { acquire(vendor: VendorKey, signal?: AbortSignal): Promise<() => void>; limitedFetch(vendor: VendorKey, inner?: typeof fetch): TimedFetch }
export function createVendorLimiter(cfg?: Partial<Record<VendorKey, VendorLimit>>, clock?: { now(): number; sleep(ms: number): Promise<void> }): VendorLimiter;
```
- `HttpDeps.fetch: TimedFetch`; `postJson` passes `{ timeoutMs }`, no own signal. `createAiFromEnv(env, config, ledger, samples?, guard?, http?: { openrouter?: TimedFetch; jev?: TimedFetch })` — `guard?` is 7b1's 5th parameter (`AiDeps.guard`); this task appends `http?` after it (if 7b1 is not merged, add `http?` as the 5th and 7b1 inserts `guard?` before it).
- Vendor `opts.fetch?: TimedFetch`; default `timedFetch()`. Call sites pass `timeoutMs` (130 000 / 310 000 / 60 000 / 10 000 — unchanged values).
**Algorithm (full code, `token-bucket.ts` core):**
```ts
interface Waiter { grant(): void; aborted: boolean }
interface State { tokens: number; at: number; inFlight: number; queue: Waiter[]; pumping: boolean }

export function createVendorLimiter(cfg: Partial<Record<VendorKey, VendorLimit>> = DEFAULT_VENDOR_LIMITS, clock = { now: Date.now, sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) }): VendorLimiter {
  const states = new Map<VendorKey, State>();
  const st = (v: VendorKey) => {
    let s = states.get(v);
    if (!s) states.set(v, (s = { tokens: cfg[v]?.perSecond ?? 0, at: clock.now(), inFlight: 0, queue: [], pumping: false }));
    return s;
  };
  // Grants strictly in arrival order; one pump per vendor at a time. A release or a refill re-runs it.
  async function pump(v: VendorKey): Promise<void> {
    const s = st(v);
    if (s.pumping) return;
    s.pumping = true;
    try {
      while (s.queue.length > 0) {
        const head = s.queue[0]!;
        if (head.aborted) { s.queue.shift(); continue; }
        const { concurrent, perSecond } = cfg[v] ?? {};
        if (concurrent !== undefined && s.inFlight >= concurrent) return; // release() re-pumps
        if (perSecond !== undefined) {
          const now = clock.now();
          s.tokens = Math.min(perSecond, s.tokens + ((now - s.at) / 1000) * perSecond);
          s.at = now;
          if (s.tokens < 1) { await clock.sleep(Math.ceil(((1 - s.tokens) / perSecond) * 1000)); continue; }
          s.tokens -= 1;
        }
        s.queue.shift();
        s.inFlight++;
        head.grant();
      }
    } finally { s.pumping = false; }
  }
  function acquire(v: VendorKey, signal?: AbortSignal): Promise<() => void> {
    if (!cfg[v]) return Promise.resolve(() => {});
    if (signal?.aborted) return Promise.reject(signal.reason);
    const s = st(v);
    return new Promise((resolve, reject) => {
      let released = false;
      const w: Waiter = { aborted: false, grant: () => { signal?.removeEventListener('abort', onAbort); resolve(() => { if (released) return; released = true; s.inFlight--; void pump(v); }); } };
      const onAbort = () => { w.aborted = true; reject(signal!.reason); void pump(v); };
      signal?.addEventListener('abort', onAbort, { once: true });
      s.queue.push(w);
      void pump(v);
    });
  }
  const limitedFetch = (v: VendorKey, inner: typeof fetch = globalThis.fetch): TimedFetch => async (input, init = {}) => {
    const { timeoutMs, ...rest } = init;
    const release = await acquire(v, rest.signal ?? undefined);
    try {
      const t = timeoutMs ? AbortSignal.timeout(timeoutMs) : null;
      const signal = t && rest.signal ? AbortSignal.any([rest.signal, t]) : (t ?? rest.signal ?? undefined);
      return await inner(input, { ...rest, signal });
    } finally { release(); } // held until headers (decision 3)
  };
  return { acquire, limitedFetch };
}
```
**Behaviour:** worker deps builds one limiter and passes `limitedFetch('dataforseo')` etc. (and to `createAiFromEnv` for openrouter/jev); the web app is unchanged (default `timedFetch()`). Anthropic batch (SDK) is not limited. Log a limiter wait > 5 s at `debug` with vendor + ms (no URL).
**Tests (TDD):** `token-bucket.test.ts` with a fake clock: `perSecond 10 grants 10 at once then 1 per 100 ms`; `concurrent 3 holds the 4th until a release`; `grants in FIFO order`; `an aborted waiter rejects with the signal reason and does not consume a slot`; `a throwing fetch releases its slot`; `a request queued 5 s still gets its full timeoutMs` (inner fetch observes signal not aborted at 5 s + timeoutMs − 1); `an unknown vendor passes straight through`; `release twice frees one slot`. `http.test.ts`: `postJson passes timeoutMs, not a signal`. Vendor tests: `passes timeoutMs <value>`. `deps.test.ts`: `vendor clients get the limited fetch`.
**Done when:** `pnpm --filter @cs/core exec vitest run token-bucket`, `pnpm --filter @cs/ai exec vitest run http env`, `pnpm --filter @cs/collectors exec vitest run dataforseo apify scrapecreators static-map`, `pnpm --filter @cs/worker exec vitest run deps`, `pnpm test:affected`.

### Task 3: Captures — host lock, deferral, robots slot
**Goal:** Parallel captures across hosts, one render per host, deferral instead of sleeping, robots fetch paced.
**Files:** modify `packages/collectors/src/web/{rate-limit,robots,polite}.ts`, `packages/collectors/src/capture/capture-page.ts`, `packages/collectors/src/index.ts` (+ tests), `apps/worker/src/jobs/web.ts`, `apps/worker/src/{main,deps}.ts` (+ tests).
**Interfaces:**
- `HostRateLimiter`: `nextSlotIn(url: string, crawlDelaySeconds?: number | null): number`; `deferIn(url, crawlDelaySeconds?): number`; `withHostLock<T>(url: string, fn: () => Promise<T>): Promise<T | typeof HOST_BUSY>`; `export const HOST_BUSY: unique symbol`. `wait()` unchanged in signature.
- `RobotsPolicy` constructor + 5th param `limiter?: Pick<HostRateLimiter, 'wait'>`; new `peek(url): RobotsVerdict | null` (cache only, never fetches).
- `PoliteRenderer extends Renderer { renderOrDefer(url: string, opts?: { maxWaitMs?: number }): Promise<{ page: RenderedPage } | { deferred: true; retryInMs: number }> }`; `createPoliteRenderer` returns it. `MAX_CAPTURE_WAIT_MS = 10_000`.
- `capturePage(...)` → `{ status: CaptureStatus | 'missing' | 'deferred'; captureId?: string; retryInMs?: number }` (uses `renderOrDefer` when present).
- Worker: `web-capture-page` `queue: { policy: 'short' }`; `createWebJobs(deps, queue: { enqueueCapture(id: string, startAfterSeconds?: number): Promise<void>; enqueueDiff? })`; handler returns `{ deferred: true, retryInSeconds }` when deferred.
**Algorithm (full code; limiter internals switch from "next slot" to "last request start"):**
```ts
private readonly last = new Map<string, number>();      // start time of the last reserved request per host
private readonly cursor = new Map<string, number>();    // deferral stagger, not a reservation
private readonly locked = new Set<string>();
private intervalFor(d?: number | null) { return Math.max(this.minIntervalMs, Math.min((d ?? 0) * 1000, this.maxCrawlDelayMs)); }
async wait(url: string, d?: number | null): Promise<void> {
  const host = siteHost(url), now = this.now();
  const slot = Math.max(now, (this.last.get(host) ?? -Infinity) + this.intervalFor(d));
  this.last.set(host, slot);                              // reserve synchronously
  if (slot > now) await this.sleep(slot - now);
}
nextSlotIn(url: string, d?: number | null): number {
  return Math.max(0, (this.last.get(siteHost(url)) ?? -Infinity) + this.intervalFor(d) - this.now());
}
deferIn(url: string, d?: number | null): number {
  const host = siteHost(url), now = this.now(), interval = this.intervalFor(d);
  const at = Math.max(now + this.nextSlotIn(url, d), this.cursor.get(host) ?? 0);
  this.cursor.set(host, at + interval);                   // next deferral returns one interval later
  return Math.max(at - now, this.minIntervalMs);
}
async withHostLock<T>(url: string, fn: () => Promise<T>): Promise<T | typeof HOST_BUSY> {
  const host = siteHost(url);
  if (this.locked.has(host)) return HOST_BUSY;
  this.locked.add(host);
  try { return await fn(); } finally { this.locked.delete(host); }
}
```
`renderOrDefer` (polite.ts):
```ts
async renderOrDefer(url, opts = {}) {
  const max = opts.maxWaitMs ?? MAX_CAPTURE_WAIT_MS;
  const defer = (d: number | null) => ({ deferred: true as const, retryInMs: deps.limiter.deferIn(url, d) });
  const r = await deps.limiter.withHostLock(url, async () => {
    const known = deps.robots.peek(url);
    if (!known && deps.limiter.nextSlotIn(url, null) > max) return defer(null);   // robots fetch would wait too long
    const verdict = known ?? (await deps.robots.check(url));                       // a fetch takes a slot (RobotsPolicy.limiter)
    if (!verdict.allowed) return { page: emptyPage(url, 'robots_disallowed', verdict.reason) };
    if (deps.limiter.nextSlotIn(url, verdict.crawlDelaySeconds) > max) return defer(verdict.crawlDelaySeconds);
    return { page: await renderChecked(url, verdict) };                             // today's render() body after the robots check
  });
  return r === HOST_BUSY ? defer(deps.robots.peek(url)?.crawlDelaySeconds ?? null) : r;
}
```
**Behaviour:** `render()` keeps its blocking behaviour (KB, discovery) but shares `renderChecked`. `RobotsPolicy.load` calls `limiter?.wait(robotsUrl, null)` before the fetch and dedupes concurrent loads of one origin (in-flight promise map). Worker: deps passes the limiter to `RobotsPolicy`; every capture enqueue uses `singletonKey: 'capture:<id>'`; a deferral enqueues with `startAfter: Math.ceil(retryInMs / 1000)` and logs `[web-capture-page] <id> deferred <s>s`.
**Tests (TDD):** `rate-limit.test.ts`: `nextSlotIn reserves nothing`; `crawl-delay learned after the robots fetch spaces the page request 30 s from it`; `deferIn staggers successive deferrals by one interval`; `withHostLock returns HOST_BUSY while held and frees on throw`. `robots.test.ts`: `a robots fetch waits for a limiter slot`; `two concurrent checks of one origin fetch once`; `peek never fetches`. `polite.test.ts` (fake renderer + clock): `a busy host defers without a request`; `Crawl-delay 30 host defers while another host renders immediately`; `a deferred robots fetch defers the capture`; `no two requests to one host < 3 s apart across 20 mixed captures`. `capture-page.test.ts`: `returns deferred with retryInMs`. `web.test.ts`: `deferral re-enqueues with startAfter and the capture singletonKey`; `schedule enqueue passes the singletonKey`.
**Done when:** `pnpm --filter @cs/collectors exec vitest run rate-limit robots polite capture-page`, `pnpm --filter @cs/worker exec vitest run web deps`, `pnpm test:affected`.

### Task 4: Set-based due scans
**Goal:** Two queries for `listBriefDueClients`, a prefilter for `listStartingPointDue`, provably equivalent.
**Files:** modify `packages/engine/src/briefs/{generate,readiness}.ts` (+ tests).
**Interfaces:** signatures unchanged (`(db: Db, now: Date) => Promise<string[]>`), order = today's (client query order; starting points by `created_at`).
**Algorithm (full code):**
```ts
export async function listBriefDueClients(db: Db, now: Date): Promise<string[]> {
  const clients = await db.select({ id: client.id, timezone: client.timezone }).from(client)
    .where(and(clientWorkAllowed(client), agencyServiceable(client.agencyId)));   // already so on main (7b1 merged)
  const ids: string[] = [], dates: string[] = [];
  for (const c of clients) {                       // tz math stays in JS: SQL AT TIME ZONE throws on bad zones
    const tz = safeTimezone(c.timezone);
    if (!briefDue(now, tz)) continue;
    ids.push(c.id); dates.push(deliveryDateFor(now, tz));
  }
  if (ids.length === 0) return [];
  const staleBefore = new Date(now.getTime() - BRIEF_STALE_MINUTES * 60_000).toISOString();
  const rows = await db.execute<{ id: string }>(sql`
    SELECT d.client_id AS id
      FROM unnest(ARRAY[${sql.join(ids.map((x) => sql`${x}`), sql`, `)}]::uuid[],
                  ARRAY[${sql.join(dates.map((x) => sql`${x}`), sql`, `)}]::date[]) WITH ORDINALITY AS d(client_id, delivery_date, ord)
      LEFT JOIN brief b ON b.client_id = d.client_id AND b.delivery_date = d.delivery_date AND b.kind <> 'starting_point'
     WHERE b.id IS NULL
        OR (b.status = 'failed' AND b.attempts < ${BRIEF_MAX_ATTEMPTS})
        OR (b.status = 'generating' AND b.updated_at < ${staleBefore}::timestamptz)
     ORDER BY d.ord`);
  return [...rows].map((r) => r.id);
}
```
`listStartingPointDue`: one query — serviceable clients `LEFT JOIN brief sp ON sp.client_id = c.id AND sp.kind = 'starting_point'` keeping `sp.id IS NULL`, failed with attempts left, or stale `generating` (same predicates), `ORDER BY c.created_at`; then `startingPointReadiness` only for those.
**Behaviour:** `(client_id, delivery_date)` is unique, so a starting point holding the Monday yields `b` null on the weekly join → due (today's behaviour; `claimBrief` then skips). Update the two doc comments (no more "one lookup per client").
**Tests (TDD):** keep today's implementations verbatim in `generate.test.ts`/`readiness.test.ts` as `legacyListBriefDueClients`/`legacyListStartingPointDue`; `set-based scan equals legacy` over seeded worlds: tz mix (`America/Chicago`, `Pacific/Kiritimati`, `Asia/Kolkata`, invalid `"Mars/Base"`, null), clock instants Thu 21:59/22:00, Fri 11:59/12:00 local, a DST-change week, brief states (none, failed attempts 2/3, generating 29/31 min old, ready, starting point holding the date), paused/prospect/archived clients, a suspended agency. `returns [] without a query when no client is in its window` (spy on `db.execute`). `listStartingPointDue skips readiness for a client with a sent starting point` (spy).
**Done when:** `cd packages/engine && npx vitest run generate readiness`, `pnpm test:affected`.

### Task 5: Migration — `ops_alert` + hardening
**Goal:** The service-only alert table, `client` INSERT closed for `app_user`, `notification.provider_id` index.
**Files:** create `packages/db/migrations/<next>_ops_alert.sql` (plain `generate --name=ops_alert` for the table/index, then a `--custom` statement block for RLS/grants per `packages/db/CLAUDE.md`), `packages/db/src/schema/ops.ts`; modify `packages/db/src/schema/index.ts`, `packages/db/src/schema/delivery.ts` (index), the privilege guard test (`packages/db/src/evidence.test.ts` "app_user has exactly the … allow-list": drop `client` INSERT), tests that insert `client` as `app_user` (T0 2026-10-25: only `packages/db/src/tenant.test.ts:47` "cannot write rows into another agency" — expects `/row-level security/`, becomes `/permission denied/`; the rls-sweep `REFUSED` regex already accepts both; also fix the `client INSERT/UPDATE/DELETE ... never revoked` comment in `evidence.test.ts:81`); create `packages/db/src/ops-alert.test.ts`. If 7c1 is merged: `TABLE_CLASS.ops_alert = 'service_only'`.
**Interfaces:** `opsAlert` table — `id uuid pk defaultRandom`, `kind text not null check (kind in ('brief_readiness'))`, `dedupe_key text not null unique`, `severity text not null check in ('warning','critical')`, `summary jsonb not null default '{}'`, `first_seen_at timestamptz not null default now()`, `last_seen_at timestamptz not null default now()`, `emailed_at timestamptz`, `resolved_at timestamptz`. Types `OpsAlert`, `OpsAlertSeverity`.
**SQL (RLS/grants part):**
```sql
ALTER TABLE ops_alert ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ops_alert FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON ops_alert FROM app_user;
--> statement-breakpoint
REVOKE INSERT ON client FROM app_user;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS notification_provider_id_idx ON notification (provider_id);
```
Fallback (Decision 8, only if Task 0 found an `app_user` insert): keep INSERT and add
```sql
CREATE POLICY client_insert_service_columns ON client AS RESTRICTIVE FOR INSERT TO app_user
  WITH CHECK (self_competitor_id IS NULL AND archived_at IS NULL AND paused_at IS NULL AND paused_by IS NULL
              AND activated_at IS NULL AND status = 'prospect' AND alert_mode = 'after_am_check' AND brief_auto_send = false
              AND monthly_cap_usd = 15 AND competitor_limit = 5 AND ask_monthly_quota = 100 AND ask_review_allowed = true);
```
(columns per 7b1's schema at execution — re-list service-only columns from `tenancy.ts`).
**Behaviour:** snapshot regenerated so `generate` = "No schema changes"; `app_service` keeps full access (BYPASSRLS). Any RLS/grant fix 7c1 deferred here (7c1 has no migrations; see its work file) joins this migration with its own test.
**Tests (TDD):** `app_user sees 0 ops_alert rows and cannot insert` (permission denied); `dedupe_key is unique`; `severity check refuses "info"`; `app_user cannot INSERT a client` (permission denied); `app_service can insert a client`; `notification_provider_id_idx exists`; privilege guard allow-list updated (no `client` INSERT).
**Done when:** `pnpm --filter @cs/db exec vitest run ops-alert schema evidence tenant`, `drizzle-kit check`, `pnpm --filter @cs/db generate` = no changes, `pnpm test:affected`.

### Task 6: Brief readiness check, job and email
**Goal:** Know by Friday noon / Sunday evening (client time) that a brief or starting point is missing, and email staff once.
**Files:** create `packages/engine/src/briefs/brief-readiness.ts` (+ test), `packages/email/src/templates/platform-ops-alert.tsx` (+ `platform-ops-alert.test.ts`), `apps/worker/src/jobs/ops.ts` (+ test); modify `packages/engine/src/briefs/index.ts`, `packages/email/src/{types,render,index}.ts`, `apps/worker/src/{deps,main}.ts`.
**Interfaces:**
```ts
export type ReadinessCheckpoint = 'generation_closed' | 'pre_delivery' | 'pre_delivery_unapproved' | 'starting_point_late';
export interface ReadinessIssue { checkpoint: ReadinessCheckpoint; severity: 'warning' | 'critical'; deliveryDate: string; dedupeKey: string; clients: { clientId: string; clientName: string; agencyName: string }[] }
export const PRE_DELIVERY_LOCAL_HOUR = 19; export const STARTING_POINT_LATE_HOURS = 6;
export function weeklyCheckpoint(now: Date, tz: string): { deliveryDate: string; windowOpenedAt: Date; preDelivery: boolean } | null;
export async function findReadinessIssues(db: Db, now: Date): Promise<ReadinessIssue[]>;
export async function checkBriefReadiness(db: Db, now: Date): Promise<{ open: OpsAlert[]; toEmail: OpsAlert[]; resolved: number }>;
export async function markOpsAlertEmailed(db: Db, id: string, at: Date): Promise<void>;
```
- Email: `PlatformOpsAlertProps { branding; checkpoint; severity; deliveryDate; clients: { clientName; agencyName }[]; healthUrl }`, template `platform_ops_alert`. Worker deps: `briefReadiness(): { run(now): Promise<…>; send(to: string, alert: OpsAlert): Promise<void>; recipients(): Promise<string[]> }` (recipients via `platformOperatorEmails({ service, platformAdmins }, ['owner','staff'])`). Job `brief-readiness`, cron `25 * * * *`, `queue: { policy: 'short', retryLimit: 1, expireInSeconds: 600 }`.
**Algorithm (full code for the checkpoint; the rest follows Behaviour):**
```ts
export function weeklyCheckpoint(now: Date, tz: string) {
  const p = localParts(now, tz);                                    // weekday 0 = Sun
  const fri = p.weekday === 5 && p.hour >= BRIEF_CATCHUP_UNTIL_HOUR, sat = p.weekday === 6, sun = p.weekday === 0;
  const mon = p.weekday === 1 && p.hour < DELIVERY_LOCAL_HOUR;
  if (!(fri || sat || sun || mon)) return null;
  const deliveryDate = mon ? `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}` : deliveryDateFor(now, tz);
  const hoursSinceOpen = ((p.weekday - BRIEF_LOCAL_WEEKDAY + 7) % 7) * 24 + p.hour - BRIEF_LOCAL_HOUR;  // Thu 22:00 local
  const windowOpenedAt = new Date(now.getTime() - hoursSinceOpen * 3_600_000 - (now.getTime() % 3_600_000)); // ±1 h around DST
  return { deliveryDate, windowOpenedAt, preDelivery: (sun && p.hour >= PRE_DELIVERY_LOCAL_HOUR) || mon };
}
```
**Behaviour:**
- Clients = `clientServiceable` + `agencyServiceable` (+ 7b1 `clientWorkAllowed`), not archived, with agency name; skip a client whose `activatedAt ?? createdAt` > `windowOpenedAt`. One brief query for all (client, deliveryDate) pairs (`unnest`, any kind — a starting point holding that Monday counts).
- `generation_closed`: no brief with status `ready|approved|sent` (incl. none, `generating`, `failed`) → critical. `pre_delivery` (when `preDelivery`): none or `failed` → critical; `ready` and `brief_auto_send = false` → `pre_delivery_unapproved` warning. A client in `pre_delivery` is not repeated under `generation_closed` (same email only once per checkpoint anyway).
- `starting_point_late`: clients with a setup clock (`startingPointClockStart` with their `client_setup`) where `now ≥ clockStart + 48 h + 6 h` and the starting point is not `ready|approved|sent` → critical, one issue per client, `deliveryDate` = due date (UTC `YYYY-MM-DD`).
- `checkBriefReadiness`: upsert by `dedupe_key` (`first_seen_at` kept, `last_seen_at = now`, `summary = { clients, deliveryDate, checkpoint }`, `severity`); open rows (`resolved_at IS NULL`) of kind `brief_readiness` whose key is not in this run's issues get `resolved_at = now`. `toEmail` = open rows with `emailed_at IS NULL`. A resolved key is never reopened (upsert `WHERE resolved_at IS NULL`; a reappearing resolved key is ignored).
- Job: `engineConfigured()` false ⇒ return `{ skipped: 'engine_unconfigured' }`. For each `toEmail` row: send to every recipient; all succeeded ⇒ `markOpsAlertEmailed`; any failure ⇒ leave null (retries next hour), log the alert id only. Returns `{ open, emailed, resolved }`.
- **Copy (decided; owner signs off):** subject `Rival Monday ops: {n} brief(s) not ready for {deliveryDate}` (critical weekly) / `Rival Monday ops: {n} brief(s) awaiting approval for {deliveryDate}` (warning) / `Rival Monday ops: starting point late for {clientName}`. Lead line by checkpoint — `generation_closed`: "Generation closed at Friday 12:00 client time and these clients have no ready brief for {deliveryDate}."; `pre_delivery`: "Delivery is Monday 07:00 client time and these briefs are missing or failed."; `pre_delivery_unapproved`: "These briefs are ready but not approved, and auto-send is off: they will not go out Monday 07:00 unless approved."; `starting_point_late`: "This starting point is not ready 6 hours after it was due." Then a list `{agencyName} — {clientName}` (first 20, then "and {n} more") and "Open Health: {healthUrl}". Always Rival Monday branded, footer "Platform ops alert".
- **Follow pattern:** `platform-cost-low.tsx` + deps `platformCosts().sendLowEmail`; `jobs/platform-costs.ts`.
**Tests (TDD):** `weeklyCheckpoint`: Thu 23:00 → null; Fri 11:59 → null; Fri 12:00 → closed, not pre-delivery; Sun 18:59 vs 19:00; Mon 06:59 → today's date; Mon 07:00 → null; `Pacific/Kiritimati`. `findReadinessIssues`: `missing brief at Fri 12:00 → generation_closed`; `generating row past Fri 12:00 → critical`; `starting point holding the Monday and ready → no issue`; `client activated Friday 09:00 → not expected`; `spend-paused client → not expected` (if 7b1); `ready + auto-send off on Sun 19:00 → warning`; `failed on Sun 19:00 → pre_delivery critical`; `starting point 54 h after clock start and generating → late`; `archived/paused/prospect clients ignored`. `checkBriefReadiness`: `second run updates last_seen_at, no second email`; `cleared issue gets resolved_at`; `resolved key never re-emails`. `ops.test.ts`: `a failed send keeps emailed_at null`; `emails every recipient once`; `skips without engine`. Template: `renders subject and list, caps at 20`.
**Done when:** `cd packages/engine && npx vitest run brief-readiness`, `pnpm --filter @cs/email exec vitest run platform-ops-alert`, `pnpm --filter @cs/worker exec vitest run ops`, `pnpm test:affected`.

### Task 7: Health — readiness panel and 7a health follow-ups
**Goal:** Operators see readiness on `/platform/health`; grants failures are visible; cron monitors and Sentry stop over-reporting.
**Files:** modify `packages/tools/src/platform/system-health.ts`, `packages/tools/src/tools/platform-health.ts` (+ tests); `apps/web/src/app/(platform)/platform/health/{page.tsx,_components/}` (+ a `readiness-panel.tsx` + test); `apps/web/src/server/{queue,runtime-env}.ts` (+ tests, `EnvUrls.owner` → `queue` and its callers); `apps/worker/src/{health,sentry,boss,main,queue-grants}.ts`, `apps/worker/src/jobs/heartbeat.ts` (+ tests); `packages/engine/src/briefs/brief-readiness.ts` (summary fn).
**Interfaces:**
- `platformHealthOutput.briefReadiness: { checkedAt: string; deliveryDate: string; due: number; ready: number; approved: number; sent: number; missing: number; failed: number; awaitingApproval: number; startingPointsLate: number; issues: { checkpoint: string; severity: 'warning'|'critical'; deliveryDate: string; clients: number; firstSeenAt: string; emailedAt: string | null }[] }`.
- `summarizeBriefReadiness(db: Db, now: Date): Promise<Omit<BriefReadiness, 'issues'>>` (engine): per client its current cycle (`weeklyCheckpoint`, else the next Monday with `due` = 0 until the window opens); `deliveryDate` = the `America/Chicago` cycle date; counts by brief status for each client's own date; `missing` = due with no row or `generating`; `awaitingApproval` = `ready` and auto-send off.
- `HealthState.queueGrantsOk: boolean | null`; `healthStatus` ok requires `queueGrantsOk !== false`.
- `createHeartbeatJob(deps: { ensureGrants(): Promise<void>; sample(): Promise<{ dbConnections: number; dbMaxConnections: number }> }): JobDefinition` → returns `{ queueGrants: 'ok'|'failed', rssMb: number, dbConnections, dbMaxConnections }` (`count(*) FROM pg_stat_activity`, `current_setting('max_connections')`, via the service db).
- `runJob(job, jobId, data, handler, log, attempt?: { retryCount: number; retryLimit: number })`.
**Behaviour:**
- `get_platform_health` adds `briefReadiness` (service db; open `ops_alert` rows, newest first, ≤ 20). Panel: counts row + issues list with `StatusChip` (critical = down, warning = warn) and "emailed {relative}" / "not emailed yet"; empty issues ⇒ "No readiness issues." (copy for owner sign-off).
- Heartbeat: grants retried every beat; `healthState.queueGrantsOk` set from the result; `main.ts` sets it from the start-up attempt too. `/healthz` body adds `queueGrants`.
- `registerJobs`: `boss.schedule(name, cron, { _cron: true })`; `work(..., { includeMetadata: true })` (7b1 already sets it for its resend) and passes `{ retryCount, retryLimit }` to `runJob`. `runJob`: `withMonitor` only when `data._cron === true`; `captureException` only when `retryCount >= retryLimit` (else `jlog.warn`).
- `withQueueStatsReporting` default path test (logger + Sentry spy).
- **Follow pattern:** `health-tables.tsx`; `platform-costs` panel copy style.
**Tests (TDD):** `system-health.test.ts`: `briefReadiness parses`; `platform-health.test.ts`: `returns open issues only, newest first`; `summarizeBriefReadiness counts per status on Saturday`. Web `readiness-panel.test.tsx`: `renders counts, a critical issue and the empty state`. Worker: `healthz is 503 while queue grants fail`; `heartbeat retries grants and reports failed`; `heartbeat output carries rssMb and dbConnections`; `withMonitor runs only for the cron payload`; `a failing job is captured once, on its last attempt`. Web: `withQueueStatsReporting default logs and captures`; `envUrls exposes queue`.
**Done when:** `pnpm --filter @cs/tools exec vitest run system-health platform-health`, `pnpm --filter @cs/worker exec vitest run health heartbeat sentry boss`, `pnpm --filter @cs/web exec vitest run readiness-panel queue runtime-env`, `pnpm test:affected`, `pnpm --filter @cs/web e2e:affected`.

### Task 8: Security test backfill (BACKLOG § 7a, tests only)
**Goal:** Close the untested 7a security cases; fix only what a test proves broken.
**Files:** tests in `packages/ask/src/` (turn/actions tests), `packages/tools/src/` (plan-features, support, purge-related), `packages/db/src/*-rls.test.ts`, `apps/worker/src/purge.test.ts`, `apps/worker/src/jobs/leads.test.ts`, `apps/web` page tests for agency `settings/ai` and evidence `canAsk`.
**Interfaces:** none new.
**Behaviour / Tests (TDD), one `it` each:**
- Ask: `pinned admin cannot update_recommendation_status on another client's recommendation`; `multi-agency user whose other agency's plan lacks ask gets not_found for that agency's client` (7a2 Decision 4).
- T1: `agency RLS update test is not vacuous` — B's UPDATE on an A agency row affects 0 rows **and** A's row exists and is visible to A.
- T3: `support viewer context gets the default plan features`; `ask-support.test` uses the real `hasChannel` (remove the re-implementation).
- Purge: `purged client with an agency-level membership keeps the membership`; `a retried pending notification with future not_before survives purge of another tenant`; `old accepted/unverified leads survive the 180-day cleanup per its rule`.
- Plan-off: `agency settings/ai 404s when the plan lacks ask`; `evidence page hides Ask when canAsk is false`.
- A failing case found here gets a minimal fix in the same task and a BACKLOG line if larger.
**Done when:** each focused file passes (`pnpm --filter <pkg> exec vitest run <pattern>`), `pnpm test:affected`, `pnpm --filter @cs/web e2e:affected`.

### Task 9a: Rehearsal switches refused in production + crawl allowlist
**Goal:** The four rehearsal switches work only on staging (fail closed), and staging crawling reaches only allow-listed hosts.
**Files:** modify `apps/worker/src/{env.ts,main.ts,deps.ts}` (+ tests), `packages/collectors/src/net/guard.ts` (+ test), `packages/collectors/src/index.ts`, `turbo.json`.
**Interfaces:**
- `export const REHEARSAL_ENV = ['AI_PROVIDER_MODE', 'REHEARSAL_LIVE_CLIENT_IDS', 'VENDOR_FAKE_MODE', 'CRAWL_HOST_ALLOWLIST'] as const;` `export function rehearsalEnvErrors(env: NodeJS.ProcessEnv): string[]`.
- `export function allowlistedAssert(allow: readonly string[], inner?: (url: string) => Promise<void>): (url: string) => Promise<void>` (guard.ts).
**Security-sensitive code (full):**
```ts
/** Spec §4 Env: rehearsal switches only on staging or outside production. Fail closed: anything unclear refuses. */
export function rehearsalEnvErrors(env: NodeJS.ProcessEnv): string[] {
  const set = REHEARSAL_ENV.filter((k) => (env[k] ?? '').trim() !== '');
  const staging = env.SENTRY_ENVIRONMENT === 'staging';
  const allowed = staging || (env.NODE_ENV !== undefined && env.NODE_ENV !== 'production');
  const errors: string[] = [];
  if (set.length > 0 && !allowed) errors.push(`refusing rehearsal settings outside staging: ${set.join(', ')}`);
  if (env.AI_PROVIDER_MODE && !['live', 'rehearsal'].includes(env.AI_PROVIDER_MODE)) errors.push('AI_PROVIDER_MODE must be live or rehearsal');
  if (env.VENDOR_FAKE_MODE && env.VENDOR_FAKE_MODE !== 'fixtures') errors.push('VENDOR_FAKE_MODE must be fixtures');
  if (staging && env.WEB_MONITORING_ENABLED === 'true' && !(env.CRAWL_HOST_ALLOWLIST ?? '').trim()) errors.push('staging crawling requires CRAWL_HOST_ALLOWLIST');
  if (staging && env.AI_PROVIDER_MODE !== 'rehearsal' && (env.REHEARSAL_LIVE_CLIENT_IDS ?? '').trim()) errors.push('REHEARSAL_LIVE_CLIENT_IDS needs AI_PROVIDER_MODE=rehearsal');
  return errors;
}

export function allowlistedAssert(allow: readonly string[], inner: (url: string) => Promise<void> = (u) => assertPublicUrl(u)) {
  const hosts = new Set(allow.map((h) => h.trim().toLowerCase()).filter(Boolean));
  return async (url: string): Promise<void> => {
    let host: string;
    try { host = new URL(url).hostname.toLowerCase(); } catch { throw new SsrfBlockedError(url); }
    if (!hosts.has(host)) throw new SsrfBlockedError(url);   // exact host match, no suffix/wildcard
    await inner(url);                                        // still public-address checked
  };
}
```
(`main.ts`: errors ⇒ stderr + `process.exit(1)` right after `missingProdEnv`, before any connection. Use `SsrfBlockedError`'s real constructor signature.)
**Behaviour:**
- Worker deps: `CRAWL_HOST_ALLOWLIST` set ⇒ `RobotsPolicy(createGuardedFetchText({ assertUrl }))`, `createPlaywrightRenderer({ assertUrl })` and the discovery fetch all use `allowlistedAssert(list)` (`list` = comma-separated `CRAWL_HOST_ALLOWLIST`). Unset ⇒ today's guard, unchanged.
- `turbo.json`: the four rehearsal vars.
**Tests (TDD):** `env.test.ts`: `production refuses each of the four vars`; `SENTRY_ENVIRONMENT "Staging" or "staging " refuses`; `NODE_ENV unset refuses`; `staging allows them`; `staging crawling without an allowlist refuses`; `development allows`. `guard.test.ts`: `allowlisted host passes`; `sub-domain/suffix of a listed host refuses`; `listed host resolving to 127.0.0.1 still refuses`; `redirect hop to a non-listed host refuses` (renderer route test with the assert).
**Done when:** `pnpm --filter @cs/worker exec vitest run env deps`, `pnpm --filter @cs/collectors exec vitest run guard renderer`, `pnpm test:affected`.

### Task 9b: Fixture vendors, fixture hosts and staging setup docs
**Goal:** Fake vendors at $0, fixture websites we own, and the owner's staging setup steps.
**Files:** create `packages/collectors/src/vendors/fixture-fetch.ts` (+ test), `packages/collectors/src/rehearsal/fixture-sites.ts` (+ test), `apps/worker/src/cli/fixture-hosts.ts` (+ test); modify `packages/collectors/src/index.ts`, `apps/worker/src/deps.ts` (+ test), `apps/worker/package.json` (`"fixture-hosts"`), `docs/DEPLOY.md` (§ Staging).
**Interfaces:**
- `export function createFixtureFetch(opts?: { latencyMs?: () => number }): typeof fetch` — DataForSEO (`api.dataforseo.com`, sandbox), Apify, ScrapeCreators, Stadia.
- `export function fixtureResponse(host: string, path: string, now: Date): { status: number; headers: Record<string, string>; body: string }`; `FIXTURE_CRAWL_DELAY_HOST_INDEX = 4`.
- CLI `pnpm --filter @cs/worker fixture-hosts` (env `PORT`, `FIXTURE_HOSTS`, `FIXTURE_LOG_TOKEN`).
**Behaviour:**
- Worker deps: `VENDOR_FAKE_MODE=fixtures` ⇒ vendor clients' inner fetch = `createFixtureFetch()` (still through the Task 2 limiter); vendor-key presence checks accept dummy keys.
- Fixture fetch: zero every cost field (ledger $0); DataForSEO `task_post` echoes `tag`, `tasks_ready` returns posted ids at once, `task_get` returns the matching fixture with that `tag`; content templated by the request's keyword/place so names match the seeded competitor; static across calls (no new reviews/ads). Unknown URL ⇒ 599 response. Uses `packages/collectors/test/fixtures/vendors/*` shapes.
- Fixture sites (Decision 11): `/robots.txt` per host (`fx5` adds `Crawl-delay: 30`), pages `/g<group>/s<site>/{,pricing,services,offers}`; variant from `hash(\`g<group>\`, isoWeek) mod 10`; variants 0–6 swap a price, reword a paragraph or add an offer from Wednesday 00:00 UTC; deterministic; pages self-contained (no sub-resources).
- Fixture host server: starts only when `SENTRY_ENVIRONMENT=staging` or `NODE_ENV` is set and ≠ `production` (same rule as `rehearsalEnvErrors`), else exits 1; unknown `Host` ⇒ 404; logs each request `{ host, path, at, ua }` into a 50 000-entry ring; `GET /__rehearsal/log` with `Authorization: Bearer <FIXTURE_LOG_TOKEN>` returns it (constant-time compare; unset token ⇒ 404).
- **DEPLOY.md § Staging** (owner steps): Neon schema-only branch `staging` of the prod project, compute = planned prod; roles inherited; migrate with the staging owner URL (`DATABASE_URL=<staging owner> pnpm --filter @cs/db migrate`); R2 bucket `rivalmonday-staging`; Postmark test-server token; Vercel Preview env (staging URLs, `SENTRY_ENVIRONMENT=staging`); Railway project `rivalmonday-staging` with the worker (1 replica, size = planned prod, `SENTRY_ENVIRONMENT=staging`, rehearsal vars, `SERVICE_DATABASE_POOLED_URL`) and `fixture-hosts` (start command `node --import tsx src/cli/fixture-hosts.ts`, 5 custom domains, Namecheap CNAMEs); cost note (~$20 for the rehearsal week); teardown.
**Tests (TDD):** `fixture-fetch.test.ts`: `DataForSEO round trip echoes tag and costs 0`; `unknown URL → 599`. `fixture-sites.test.ts`: `variant stable within a week, baseline before Wednesday`; `~70 % of 1 000 groups mutate` (±5 %); `fx5 robots has Crawl-delay 30`. `fixture-hosts.test.ts`: `unknown host 404`; `log needs the token`; `refuses to start in production`.
**Done when:** `pnpm --filter @cs/collectors exec vitest run fixture-fetch fixture-sites`, `pnpm --filter @cs/worker exec vitest run fixture-hosts deps`, `pnpm test:affected`.

### Task 10a: Rehearsal AI
**Goal:** A $0 task-aware AI for 110 clients, real models for a 10-client live slice, wired into the worker.
**Files:** create `packages/engine/src/rehearsal-ai.ts` (+ test), `packages/engine/src/rehearsal-latency.json` (placeholder percentiles until Task 10b `latency` runs); modify `packages/engine/src/index.ts`, `apps/worker/src/deps.ts` (+ test).
**Interfaces:**
- `export function createRehearsalAi(o: { live: Ai; liveClientIds: ReadonlySet<string>; latency: Record<string, { p50: number; p90: number; p99: number }>; config: AiConfig; ledger: LedgerSink; random?: () => number }): Ai` — `scope.clientId` in the set ⇒ `live`; everything else (incl. scopes without a client) ⇒ `createAi(config, { openrouter, jev, embeddings, ledger, batch: null })` with rehearsal providers (`id: 'rehearsal'`, cost 0, latency sampled piecewise-linearly from the task's percentiles, default `{ p50: 800, p90: 2500, p99: 6000 }`).
- Worker: `AI_PROVIDER_MODE=rehearsal` ⇒ `getAi` returns `createRehearsalAi({ live: <today's Ai>, liveClientIds: parse(REHEARSAL_LIVE_CLIENT_IDS) … })`, with 7b1's worker guard (`aiGuard()`) passed to both the live Ai (`createAiFromEnv(…, guard, http)`) and the rehearsal `createAi` deps (`AiDeps.guard`), so the live slice is guarded exactly like prod.
**Behaviour:**
- **Rehearsal providers:** chat answers satisfy the request's `jsonSchema` per task — `brief_writer` writes one item per candidate id found in the prompt, quoting only numbers/names present in that candidate's evidence text (so `verifyDraft` keeps it); other schema tasks get a minimal valid object; plain chat returns a short sentence; decisions answer every question with the "supported/true" option at confidence 0.95 (`verifier_decisions` passes); embeddings reuse the `fakeEmbedding` approach (512-dim). A test enumerates `ai.yaml` tasks and asserts each produces a schema-valid answer.
**Tests (TDD):** `rehearsal-ai.test.ts`: `non-live client calls are ledgered at $0 with provider rehearsal`; `live client calls go to the live Ai`; `every ai.yaml chat task returns a schema-valid answer`; `a rehearsal brief for a seeded test client passes verifyDraft with ≥ 1 item` (test DB); `latency sampled within p50–p99`.
**Done when:** `cd packages/engine && npx vitest run rehearsal-ai`, `pnpm --filter @cs/worker exec vitest run deps`, `pnpm test:affected`.

### Task 10b: The `rehearsal` CLI
**Goal:** Seed, approve, fault, report and teardown commands for the staging rehearsal.
**Files:** create `packages/demo/src/rehearsal/{guards,seed,approve,fault,report,teardown,latency}.ts` (+ tests), `packages/demo/src/cli/rehearsal.ts`; modify `packages/demo/package.json` (`"rehearsal": "tsx src/cli/rehearsal.ts"`), `packages/demo/CLAUDE.md`, `.gitignore` (`rehearsal-manifest.json`, `rehearsal-archive.sh`).
**Interfaces:**
- CLI `pnpm --filter @cs/demo rehearsal <cmd>`; DB from `SERVICE_DATABASE_URL` (seed/fault/teardown) and `DATABASE_URL` (report reads `pgboss`):
  - `seed --agencies 40 --clients 3 --starting-points 12 --live-clients 10 --confirm-db <host>/<db>` → writes `rehearsal-manifest.json` (gitignored) with ids, live ids (print `REHEARSAL_LIVE_CLIENT_IDS=…`), seed time.
  - `approve [--manifest f]` · `fault --clients 3` · `report [--fixture-log-url u --fixture-log-token-env NAME]` · `teardown --confirm-db <host>/<db>` · `latency --out packages/engine/src/rehearsal-latency.json` (reads `cs_dev` `llm_call`, owner-run).
**Behaviour:**
- **Guards (`guards.ts`, all commands that write):** `--confirm-db` must equal `<hostname>/<database>` of the URL; refuse if any agency exists whose name doesn't start with `Rehearsal `; refuse a database name ending `_test`.
- **Seed (decisions 1–3, Decision 11):** agencies `Rehearsal Agency 01…40`, each an admin + AM contact (`@example.com`) and 3 active `America/Chicago` clients activated 35 days ago with a `sent` starting point, 4 past `sent` weekly briefs, 3 tracked competitors on fixture hosts (group = client index, daily cadence pages), vendor sources marked current; half the clients `brief_auto_send = true`. 12 extra clients (agency 41–44) activated at seed time with `client_setup.competitors_done_at = now` (starting-point clock). Live slice = 10 random weekly clients. Plans/billing rows so `agencyServiceable` passes. Writes go through the service connection or registered tools; no evidence is fabricated (the worker captures).
- **Approve:** for every `ready` brief of an auto-send-off client, `createToolRegistry(...).invoke(adminCtx, 'approve_brief', …)` — the registry path web `runTool` wraps (audit included), never a service function. Owner runs it Friday ~14:00 local.
- **Fault (Decision 12):** agency `Rehearsal Agency Fault` + 3 clients; their brief rows for the coming Monday set `failed`, `attempts = BRIEF_MAX_ATTEMPTS`, before Thursday.
- **Report:** prints the pass bar as PASS/FAIL lines, excluding fault clients except for "fault alarm raised" (a `generation_closed` critical `ops_alert` with `emailed_at` set covering all 3). Sources: `brief.generated_at` vs window open (4 h), starting points vs due + 6 h, `failed` count, `sent_at` ≤ 07:15 local, `notification.sent_at` ≤ 07:45 local, expired jobs (`output->'value'->>'message' = 'job failed by timeout in active state'` in `pgboss.job` ∪ `pgboss.archive`), heartbeat outputs (max RSS vs `--memory-mb`, max `dbConnections / dbMaxConnections`), fixture log (min gap per host ≥ 3 s, `fx5` ≥ 30 s, p95 capture lag of the other hosts not worse than with `fx5` excluded), `spend_guard_event` has no `spike_paused` (7b1), live-slice spend/day × 6 projected vs the spike threshold, total `llm_call` cost.
- **Teardown:** writes `rehearsal-archive.sh` with one `pnpm --filter @cs/worker archive agency <id>` line per rehearsal agency (the existing 7a2 archive CLI; `@cs/demo` cannot import the worker) and prints the owner's manual cleanup (staging branch, bucket, Railway services). Evidence is never deleted.
**Tests (TDD):** `guards.test.ts`: `wrong --confirm-db refuses`; `a non-rehearsal agency refuses`; `_test database refuses`. `seed.test.ts` (test DB, scaled `--agencies 2 --clients 2 --starting-points 1`): counts, auto-send split, starting-point clock set, `listBriefDueClients` picks them on Thursday 22:00. `fault.test.ts`, `report.test.ts` (fixture DB rows → expected PASS/FAIL lines), `approve.test.ts` (goes through the registry; audit row written).
**Done when:** `cd packages/demo && npx vitest run rehearsal`, `pnpm test:affected`.

### Task 11: Feedback links
**Goal:** Clients can write to their agency from briefs, alerts and starting points; agencies can write to us.
**Files:** modify `packages/email/src/types.ts`, `packages/email/src/templates/{brief,alert,agency-welcome}.tsx` (+ tests), `packages/engine/src/briefs/deliver.ts`, `packages/engine/src/alerts/route.ts` (+ tests), `apps/worker/src/deps.ts` (welcome props); create `packages/tools/src/tools/feedback.ts` (+ test); modify `packages/tools/src/index.ts` (register), `apps/web/src/app/(app)/c/[clientId]/briefs/[briefId]/page.tsx`, `apps/web/src/components/shell/avatar-menu.tsx` (+ tests) and the shell that renders it. If 7c1 merged: `ISOLATION_FIXTURES.get_feedback_contact = { kind: 'client', input: (w, t) => ({ clientId: t }) }`.
**Interfaces:**
- `BriefEmailProps.feedback?: { email: string; name: string | null } | null`; `AlertEmailProps.feedback?` (same); `AgencyWelcomeProps.supportEmail: string`.
- Tool `get_feedback_contact` — input `{ clientId: uuid }`, output `{ email: string; name: string | null } | null`, `permission: 'read'`, `channels: ['web']`, `access: 'read'`; `canAccessClient` + tenant client lookup like `get_starting_point_status`, then `replyToFor(deps.service, agencyId, clientId)`.
- `AvatarMenu` + prop `supportEmail?: string | null` (agency roles only).
**Behaviour:**
- `briefEmailProps` sets `feedback` from the view's `replyToFor` result (already loaded); the PDF variant passes `null`. `route.ts` loads `replyToFor` once per alert. Hidden when null. Mailto subject `Feedback: {brief title}` (the brief email's subject line) / `Feedback: {alert headline}`.
- Brief page: client roles (`!isAgencyRole`) only, under the brief view, hidden when the tool returns null.
- Avatar menu: agency roles (user kind) get "Send feedback" → `mailto:{supportEmail}?subject=Pilot%20feedback`; support viewers and client roles don't. `supportEmail` = `webEnv().supportReplyTo ?? 'support@rivalmonday.app'`; worker welcome uses `SUPPORT_REPLY_TO || DEFAULT_SUPPORT_REPLY_TO`.
- **Copy (decided in spec §5; owner signs off):** client email "Something look off? Reply to this email or write to {name} at {email}." / no name: "Something look off? Reply to this email or write to your agency at {email}."; client in-app "Something look off? Email {name|your agency}."; agency menu "Send feedback"; welcome "Questions or feedback during the pilot? Email {supportEmail}. We read every message." Nothing client-facing names Rival Monday.
**Tests (TDD):** email: `brief shows the named feedback line`; `falls back to "your agency"`; `hidden when feedback is null`; `PDF variant has no feedback line`; `alert shows the line`; `welcome shows supportEmail`. Engine: `briefEmailProps carries replyToFor`. Tool: `returns the AM, else the admin`; `another agency's client → not_found`; `client_viewer of the client gets it`. Web: `brief page shows the link for client roles only`; `avatar menu shows Send feedback for agency roles only`.
**Done when:** `pnpm --filter @cs/email exec vitest run brief alert agency-welcome`, `pnpm --filter @cs/tools exec vitest run feedback`, `cd packages/engine && npx vitest run deliver route`, `pnpm --filter @cs/web exec vitest run avatar-menu`, `pnpm test:affected`, `pnpm --filter @cs/web e2e:affected`.

### Task 12: Staging rehearsal (owner-gated) + fix wave
**Goal:** Prove the pass bar at 120 clients on staging; fix what fails.
**Gate:** owner go-ahead and staging set up per `DEPLOY.md` § Staging (Task 9b). **Costs (owner approves):** ≤ $5 live AI (10-client slice), ~$20 infra for the week (Neon staging compute, Railway worker + fixture service, R2/Postmark test ≈ $0). Nothing hits real competitor sites or paid vendor APIs.
**Steps (controller with the owner; no product code until the fix wave):**
1. Deploy the branch to staging (Vercel Preview + `railway up` to the staging services); migrate the staging DB; `kb:seed` not needed.
2. Monday: `rehearsal latency` (cs_dev, committed if changed), `rehearsal seed --agencies 40 --clients 3 --starting-points 12 --live-clients 10 --confirm-db …`, `rehearsal fault --clients 3`; set `REHEARSAL_LIVE_CLIENT_IDS` on the staging worker and redeploy.
3. Watch daily: `/platform/health` (staging), Railway memory (4 Playwright contexts at `web-capture-page` = 4), Neon connections, Sentry `staging`. The 7b guard runs on its cold-start floor (history-less DB); it is tuned only through 7b's own setting, never disabled.
4. Friday ~14:00 local: `rehearsal approve`. Check the fault alarm email in Postmark (test server activity).
5. Next Monday 08:00 local: `rehearsal report` → paste PASS/FAIL into the work file.
6. **Fix wave:** each FAIL → a focused fix task (tune `WORKER_QUEUE_CONCURRENCY`, limiter numbers in `DEFAULT_VENDOR_LIMITS`, pool sizes, or code), then a re-run of the affected part (a short re-run may use a fresh Thursday window only). A spike-guard trip goes to 7b as "too tight for a Thursday burst" (spec §5). Final numbers become the code defaults.
7. `rehearsal teardown`; owner deletes the staging resources or keeps the branch for the next rehearsal.
**Done when:** the report shows every PASS line on one run (fault alarm included); work file records numbers, final concurrency/limits and costs.

### Task 13: `cs_dev` fixture rename + owner live checks
**Goal:** Close the HANDOVER/backlog pilot items.
**Files:** `docs/OPS.md`, `docs/gotchas-cross-cutting.md` (names only); no code.
**Behaviour:**
- Rename on `cs_dev` (owner approves; run once with the owner URL):
```sql
UPDATE agency SET name = 'Internal QA Agency' WHERE id = 'aaf5e009-974b-4ce8-b7ec-b722c5c66b1c' AND name = 'CS Dev Verification Agency';
UPDATE client SET name = 'Internal QA Client' WHERE id = '25f99947-4559-4150-ab5d-dd432540aca0' AND name = 'CS Dev Verification Client';
```
- Prod check (in PILOT.md, before the first invite): `SELECT id, name FROM agency WHERE id = 'aaf5e009-974b-4ce8-b7ec-b722c5c66b1c' OR name ILIKE 'Internal QA%' OR name ILIKE 'CS Dev%' OR name ILIKE 'Rehearsal%';` must return 0 rows.
- Owner live checks: `pnpm --filter @cs/ai exec vitest run jev.live` with the real `TYPESAFE_API_KEY` (confirms 0- vs 1-based scores; record the result); `/link-other-account` exercised live once (steps in PILOT.md). Results → work file; failures → BACKLOG.
**Done when:** owner confirms both checks and the rename; docs updated.

### Task 14: Docs
**Goal:** The pilot runbook and the operating docs for everything above.
**Files:** create `docs/PILOT.md`; modify `docs/OPS.md`, `docs/DEPLOY.md`, `docs/BACKLOG.md`, `docs/gotchas-cross-cutting.md`, `apps/worker/CLAUDE.md`, `packages/collectors/CLAUDE.md`, `packages/demo/CLAUDE.md`, `docs/work/phase-7c2.md`. Root `CLAUDE.md` one-replica rule **unchanged**.
**Behaviour:**
- **`PILOT.md` (≤ 12 KB):** gate (7c1 green + Task 12 passed + Launch gate + live deploy done + prod has no QA/rehearsal tenants); invite batches of ≤ 3 agencies, the next batch after a clean first weekly; daily checks (`/platform/health` incl. readiness and spend guard, Sentry, Postmark bounces), weekly checks (Friday readiness, Monday sends, `/platform/costs`); feedback: `pilot-feedback` GitHub label + a sheet, reviewed Fridays; kill switches (`WEB_MONITORING_ENABLED` unset, `WORKER_QUEUE_CONCURRENCY` down to 1s, 7b spike reset/pause, pausing a client); §1.4 metrics as SQL — items useful (`feedback` rating), AM review time (first AM `feedback` row on a brief → `brief.approved_at`, 0 when untouched; Task 0 confirms columns), unsupported claims (eval B2 + client reports), recommendations done/in progress, client attach, weekly active use (`audit_log` channel web/ask by client roles), cost per client (`spendByClient`); `/link-other-account` steps.
- `OPS.md`: § Rehearsal (commands, manifest, guards, fault, report lines); § Internal QA Agency/Client (renamed); `WORKER_QUEUE_CONCURRENCY` tuning; `ops_alert` meaning and how to read/resolve.
- `DEPLOY.md`: § Env worker `SERVICE_DATABASE_POOLED_URL` (pooled `app_service`); never set the four rehearsal vars in production (the worker refuses); § Staging (Task 9b) final; Checklist: `/healthz` shows `queueGrants: ok`.
- `BACKLOG.md`: close worker concurrency, in-process limiter parts of the 2a item (cross-replica stays), `listBriefDueClients`, 7a items done here (grants, `withMonitor`/retries/queue stats, WITH CHECK/INSERT, `provider_id` index, Ask/T1/T3/purge/plan-off tests), `jev.live`, `/link-other-account`, the fixture rename; add fix-wave leftovers.
- Gotchas/package notes: N pollers share deps (no per-job module state); limiter `timeoutMs` convention; capture deferral + `capture:` singleton key; rehearsal switches refused in prod.
**Done when:** `wc -c` caps hold (STATE/work files ≤ 12 KB, PILOT ≤ 12 KB); `git ls-files --eol | grep crlf` empty; links resolve.
