# Phase 7a — Launch: production & security (design)

**Date:** 2026-10-19 · **Branch:** `phase-7` · **Core spec:** §10.2, §11, §4.5, §9.4, §8.3–8.4, §3 · **Items:** `docs/work/phase-7-scope.md` § 7a.
"O*n*" = owner decision *n* in `docs/work/phase-7.md`. New decisions and interfaces only. Supersedes the parked 2026-10-12 7a spec; parts cited as "parked §x" are binding as written there unless changed here.

## 1. Goal
Gated first prod deploy at `rivalmonday.app`, operator-visible failures, no owner DB URL at runtime (7a1); security and data-lifecycle gaps closed before real pilots (7a2).

## 2. Decisions
1. **Two plans (O18).** 7a1's last task (live deploy) runs once O17 accounts exist and may precede 7a2. **No real pilot agency is onboarded before 7a2 is merged.**
2. **Pipeline/worker** per O3, parked §3.1/§3.7, **minus worker roles** (`WORKER_ROLES` dropped, O14; 7c revisits). Crons stay in pg-boss.
3. **Prod DB is fresh**; the 0025 pre-deploy check still runs every deploy (cheap insurance). Magic-link token cutover = `DEPLOY.md` note.
4. **Edge-safety:** `@cs/core`'s main entry has no `node:*` import; crypto users move to `@cs/core/server`. `proxy.ts` stays on Node; a test forbids `runtime = 'edge'` in `apps/web`.
5. **AI timeouts in `ai.yaml`.** Web-reachable tasks are `request_path: true` with `timeout_ms × max_attempts ≤ 45 000` (config test). Worker tasks keep 60 s × 3.
6. **Postgres 18 + pgvector** in CI and docker-compose; `drizzle-kit check` gates CI.
7. **Latency targets** (server time, `iad1` ↔ Neon `us-east-1`): agency/workspace pages p75 ≤ 1.5 s, every page ≤ 3 s. Locally against Neon dev: ≤ 4 sequential DB stages per render (independent reads in `Promise.all`, no per-row queries).
8. **Observability (O5):** Sentry server + browser (replay off, `sendDefaultPii: false`, `beforeSend` → `redactForLog`), tags = ids only (`agencyId`, `clientId`, `job`, `requestId`); pino JSON logs; `apps/worker/src/**` moves off `console.*`; lint blocks new ones in `apps/**`. Request id = `x-vercel-id`, else a uuid (no proxy change).
9. **DB roles (O6).** Worker `DATABASE_URL` = `cs_worker` (owns schema `pgboss`); web `DATABASE_URL` = `cs_web` (enqueue + job reads). Data stays on `app_user` (RLS) / `app_service` (BYPASSRLS, DML only). The owner URL exists only as GitHub secret `MIGRATION_DATABASE_URL`. Roles are created out-of-band (`01-roles.sql`, Neon console); grants live in a migration, like 0001. Local `.env` unchanged.
10. **Domain (O4):** UA → `+https://rivalmonday.app/bot`; public `/bot` page (copy = parked §3.5, owner confirms at plan review); live docs → `.app`. **No sender code**: From comes from `EMAIL_FROM`; 13a's `senderFor` owns sender logic.
11. **One SSRF guard** in `@cs/collectors` replaces `tools/src/kb/public-url.ts`. It checks every user/page-supplied URL, every redirect hop and every Playwright request; 4b webhook allowlist unchanged.
12. **Ask is pinned to the thread's client:** every tool call runs with `clientScope = [thread.clientId]`; a confirmed action runs only if its tool ∈ `ASK_WRITE_TOOLS` and any `clientId` in its input equals the thread's.
13. **Plan gating (O13):** `plan.features` (`ask`, `mcp`) gates those channels for **all** roles; no billing row / pilot plan = both on. Refusal = tool invisible → `not_found` / 404. No new `ToolErrorCode`.
14. **MCP client scope:** `client_owner` may be granted `manage`; still bounded by role permission, client `features`, `clientScope`. `client_viewer` stays `read`.
15. **Object store never overwrites by default**; content-addressed keys treat "exists" as stored; derived PDFs pass `overwrite: true`.
16. **Archival (O7):** `archived_at` on agency/client; archived = deleted for tenants and schedulers. Archive/purge = **operator CLIs only**. Purge after 90 days (O18); ledger/audit rows survive purge, detached and anonymised.
17. **No evidence pruning in 7a.** Evidence is shared across tenants; purge never touches evidence, captures or objects. Future pruning must use `evidenceReferenced()`.
18. **Stale outbox (O12) at send time:** a `pending` notification due (`not_before`) > 7 days ago becomes `skipped`. Only unserviceable periods make rows that overdue, so every reactivation path is covered without hooks.
19. **Postmark (O9):** hard bounce / spam complaint deactivates every contact with that address in that agency; one agency notice if the contact belongs to a client; soft bounce = log only.

## 3. Interfaces — 7a1
- **`@cs/core/server`** (`exports["./server"]` → `src/server/index.ts`): `signLink`/`verifyLink`, `generatePat`/`hashPat`, `hashInput`, and the logger (`createLogger`, `redactForLog`, `LogContext` per parked §3.2). How the registry obtains `hashInput` is the plan's choice; the import-graph test is binding.
- **`ai.yaml` task fields** (optional, all tasks): `timeout_ms` (default 60000), `max_attempts` (1–3, default 3), `request_path` (default false); schema `packages/ai/src/config.ts`, used by `http.ts`. Initial: `ask_assistant` 20000×2; `ask_guard_decisions`, `ask_interpretation_decisions` 10000×2; `embeddings` 8000×2 — all `request_path`.
- **`apps/web/next.config.ts`:** `outputFileTracingIncludes: { '/**': ['../../packages/ai/config/**', '../../packages/verticals/packs/**'] }` (packs dropped if 14a moved all runtime reads to the DB).
- **CI:** `pgvector/pgvector:pg18`; `pnpm --filter @cs/db exec drizzle-kit check`; worker image build + `apps/worker/scripts/image-smoke.ts`; `deploy` job: `pnpm --filter @cs/db predeploy-check` → `migrate` (both with `DATABASE_URL=${{ secrets.MIGRATION_DATABASE_URL }}`) → Vercel prebuilt + source maps → `railway up`. Secrets: `MIGRATION_DATABASE_URL`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `RAILWAY_TOKEN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT_WEB`, `SENTRY_PROJECT_WORKER`.
- **`packages/db/src/cli/predeploy-check.ts`:** if `0025` is not in drizzle's migrations table and a `client` row fails the 0025 `client_score_thresholds_check` predicate → print ids, exit 1.
- **Migration `<next>_runtime_roles`** (number claimed at pre-flight; brief assumes `0080`):
```sql
CREATE SCHEMA IF NOT EXISTS pgboss;
ALTER SCHEMA pgboss OWNER TO cs_worker;
-- DO block: ALTER … OWNER TO cs_worker for every existing table, sequence, function and type in pgboss (dev/test DBs)
GRANT USAGE ON SCHEMA pgboss TO cs_web;
GRANT SELECT ON ALL TABLES IN SCHEMA pgboss TO cs_web;
ALTER DEFAULT PRIVILEGES FOR ROLE cs_worker IN SCHEMA pgboss GRANT SELECT ON TABLES TO cs_web;
GRANT INSERT ON pgboss.job TO cs_web;
-- no grants on schema public for either role
```
  Plus whatever pre-flight proves pg-boss 10 needs on PG18 (`CREATE` on the database for `cs_worker`; `EXECUTE` on functions `send` calls for `cs_web`). `01-roles.sql` adds both roles (dev password = name); grant tests derive URLs from `TEST_DATABASE_URL`. `server/queue.ts` code unchanged.
- **Worker:** `apps/worker/src/health.ts` (`/healthz`), `apps/worker/src/env.ts` (strict production env, parked list + `SENTRY_DSN`), `apps/worker/Dockerfile`, `@sentry/node` in `registerJobs` + cron check-ins (parked §3.3).
- **Web:** `apps/web/instrumentation.ts`, `sentry.client.config.ts`. Optional env validated in `apps/web/src/server/env.ts`: `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_ISSUES_URL`. All new vars → `turbo.json` `globalPassThroughEnv`; owner approves `.env` edits.
- **Health:** tool `get_platform_health` (`packages/tools/src/tools/platform-health.ts`; web-only, `access: 'read'`, `supportHidden`, `requirePlatformOperator` first), service `packages/tools/src/platform/system-health.ts`. Output: `worker {lastHeartbeatAt, status}`, `queues[] {name, queued, active, failed24h, oldestQueuedAgeS, status}`, `vendors[] {vendor, calls24h, errors24h, lastOkAt, status}`, `sources[] {kind, lastOkAt, status}` (ok `vendor_call` / ok `capture`), `sentryUrl`. Sources/thresholds: parked §3.4. Page: existing `app/(platform)/platform/health/page.tsx`.
- **Domain:** `packages/collectors/src/web/user-agent.ts`; `apps/web/src/app/bot/page.tsx`; `apps/web/src/app/robots.ts` (`Allow: /bot`, `Disallow: /`); docs `CLAUDE.md`, `apps/worker/CLAUDE.md`, `docs/OPS.md`, `docs/brand/`; new `docs/DEPLOY.md` (parked §3.9 + role creation + magic-link note).
- **Latency:** `apps/web/scripts/profile-pages.ts` visits the `@cs/demo` coverage pages as the E2E admin against a running build and prints the slowest 15 with per-tool durations.
- `turbo.json` `"agentGuidance": false`.

## 4. Interfaces — 7a2
- **SSRF guard** `packages/collectors/src/net/guard.ts`:
```ts
export function isPublicAddress(addr: string): boolean;   // moved; SIIT ::ffff:0:0:0/96 → false; mapped ::ffff:0:0/96 judged by its IPv4
export function isPublicHttpUrl(value: string): boolean;  // moved unchanged; tools re-exports
export async function assertPublicUrl(url: string, lookup?: LookupFn): Promise<void>; // all A/AAAA public, else SsrfBlockedError
export class SsrfBlockedError extends Error { readonly code = 'ssrf_blocked' }
export const guardedFetchText: FetchText;                  // redirect 'manual', ≤ 5 hops, assertPublicUrl per hop
```
  `createPlaywrightRenderer`: `context.route('**/*')` runs `assertPublicUrl` on every request and aborts on failure; blocked document → status `'error'`, error `ssrf_blocked` (no DB change). `robots.ts` and `defaultFetchText` use `guardedFetchText`. `IMPORT_ERRORS` += `'not_public'`.
- **KB:** every writer of `kb_article.source_url` requires `isPublicHttpUrl`; `import_kb_url` checks the agency exists and the client belongs to it (`invalid_input`) before enqueue.
- **Ask:** `handleAskTurn` order: user viewer → `ask` feature + plan → `Origin` present and its host = `Host` (else 404) → `content-type: application/json` (else 415) → body ≤ 32 KB by header and streamed count (else 413) → parse → client checks. `route.ts` stops pre-parsing. `turn.ts`: scoped context on every `registry.invoke`; at `trace.costUsd ≥ ASK_TURN_BUDGET_USD` (0.30, `@cs/ask`) the next call is the forced final one. `confirmAskAction` enforces D12 (refusal → action `failed`).
- **Plan gating:** `AccessContext.planFeatures: ReadonlySet<'ask' | 'mcp'>` set in `accessContextFor` (`packages/tools/src/access/memberships.ts`); `isVisible` (`packages/core/src/tools.ts`) checks `CHANNEL_FEATURE` against it for every role.
- **MCP:** `grantableScopes('client_owner')` → `['read','feedback','manage']`.
- **Object store:** `put(key, body, contentType, opts?: { overwrite?: boolean })`; exists → `ObjectExistsError` (`@cs/storage`). fs `flag: 'wx'`; R2 `IfNoneMatch: '*'` (412 → `ObjectExistsError`) if `r2.live.test.ts` proves support, else HEAD-then-put. Logos/rank maps catch it as stored; brief/report PDFs `overwrite: true`; evidence propagates.
- **Support audit:** web-only read tools `get_team`, `get_agency_branding`, `list_webhooks`, `list_client_recipients` wrap the service functions (8b masks); their pages use `callTool` (`server/theme.ts` stays direct). `recordSupportAccess(service, ctx, { surface: 'go' | 'evidence' | 'pdf' | 'rank_map', subjectId })` in `packages/tools/src/platform/audit.ts`, called by `/go/[target]/[id]` and `/files/*` under `ctx.support`. `end_support_session` audits under the session's agency.
- **Postmark:** `POST /api/postmark/webhook`; Basic auth user `postmark`, password `POSTMARK_WEBHOOK_SECRET` (constant-time; unset → 404). Handles `RecordType 'Bounce'` + `Type 'HardBounce'` and `RecordType 'SpamComplaint'`: agency from `notification.provider_id = MessageID` (no match, e.g. auth mail → log only); one tx: `contact.active = false` for agency + `lower(email)`, agency notice `contact_bounced` (`AGENCY_KINDS` + email `notice` union; pattern `engine/src/delivery/rank-notices.ts`; dedupe per contact) if the contact has a `client_id`. Everything after auth → 200.
- **Migration `<next>_lifecycle`:** `agency.archived_at`, `client.archived_at` (`timestamptz NULL`, service role only); `plan.features jsonb NOT NULL DEFAULT '["ask","mcp"]'`; `notification_status_check` += `'skipped'`; drop FKs `audit_log.agency_id`, `llm_call.agency_id`/`client_id`, `vendor_call.agency_id`/`client_id` (columns kept); `client` SELECT policy for `app_user` adds `archived_at IS NULL`.
- **Archival filters:** `clientServiceable` adds `archived_at IS NULL`; `agencyServiceable` adds "agency not archived"; `listMemberships` drops archived agencies/clients (→ `/no-access`); service-role lists (portfolio, platform, MCP `search`) filter archived. `evidenceReferenced(evidenceIdCol): SQL` in `packages/db/src/filters.ts` (any `brief_item`/`recommendation`/`alert` `evidence_ids` contains it).
- **CLIs** (`apps/worker/src/cli/`): `archive agency|client <id> [--undo]` (sets/clears `archived_at`, `platform_audit_log` row); `purge-archived --older-than 90d [--dry-run]`: per row archived before the cutoff, one tx: set `audit_log.user_id = 'purged'` (agency: all its rows; client: rows of users whose only membership was that client), then `DELETE` (existing cascades); never touches evidence/captures/objects; refuses < 30d; prints counts.
- **Leads:** `leads-cleanup` deletes `verified` leads (incl. pool) with `coalesce(verified_at, updated_at)` > 180 days old.
- **Outbox:** the sender sets `pending` rows with `not_before < now() - 7 days` to `skipped`, `error = 'stale'`, before claiming.

## 5. Scope per plan
**7a1** = everything in §3, task order: code + config tasks → `DEPLOY.md` + deploy job → **live deploy last (gated, O17)**. **7a2** = everything in §4; runs after 7a1's code tasks, not waiting for the live deploy.

## 6. 13a file ownership (O2)
7a's only edit to a 13a-owned file is `proxy.ts` `PUBLIC` (+`/^\/bot$/`, +`/^\/api\/postmark\/webhook$/`): one isolated hunk; whichever branch lands second rebases. The webhook keys on `notification.provider_id`, so 13a's per-agency Postmark servers reuse its URL. No sender/auth-host/error-page code in 7a.

## 7. Testing
TDD per task (root CLAUDE.md test scope). Must-haves: core import graph; request-path AI budget; grants per role (allowed and refused); `isPublicAddress` table incl. SIIT/mapped/NAT64; renderer aborts a redirect to `127.0.0.1` (local fixture); Ask foreign-client fetch + action mismatch + 404/415/413 order; plan-off hides tools for agency roles; purge keeps anonymised ledger/audit rows and evidence. E2E: `/bot` signed-out; `/platform/health` operator vs agency admin (404).

## 8. Owner prerequisites (O17)
Before the live task: Neon prod (PG18, `us-east-1`) + the four roles; Vercel (`iad1`, token, domain); Railway; R2; Postmark approval, DKIM/SPF/DMARC, webhook secret; Sentry projects + alerts; GitHub `production` secrets (§3); live Stripe/Turnstile; `/bot` live before `WEB_MONITORING_ENABLED=true`. At plan review: `/bot` copy, new env vars.

## 9. Risks
- Unknowns proven at pre-flight: pg-boss 10 grant needs; R2 `IfNoneMatch`; any `RESTRICT` FK that would block purge's `DELETE`; 14a/14b runtime file loads, new tools and jobs.
- Latency may need caching → leftovers go to backlog, not scope.

## 10. Out of scope
White-label sign-in/titles (15a/13a); cap pausing (O10, 7b); 7b/7c items; worker roles, multi-replica; evidence pruning; archive UI; previews/staging.
