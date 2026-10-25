# phase-7c2 — scale & pilot: concurrency, vendor limiter, capture pacing, due scans, readiness, rehearsal, feedback, PILOT.md

**Kind:** implementation   **Worktree:** ../CompetitorSpy-wt/phase-7c2   **Base:** main f275eee7
**Plan/spec:** [plan](../superpowers/plans/2026-10-23-phase-7c2-scale-pilot.md) · [spec](../superpowers/specs/2026-10-22-phase-7c-quality-scale-pilot-design.md) — owner-approved 2026-10-23 (planned on `phase-7-planning`).

## Status (overwrite)
Execution started 2026-10-25 (worktree + test DB `cs_phase_7c2_test`). 7b1 + 7c1 merged; 7b2 not yet (no dependency).

## Next (overwrite)
Task 0 pre-flight → SDD. Task 12 (staging rehearsal) waits for the owner's staging setup.

## Interfaces this branch adds or changes
See the plan's Interfaces blocks; migrations take the next free number at execution.

## Assumes from other branches
7b1 AiGuard / usesAi / createAiFromEnv(…, guard?); 7c1 may hand a SQL leak fix to this branch's migration; staging (owner) before Task 12.

## Decisions (owner-approved)
Spec decisions + plan "Decisions"; owner decisions 2026-10-22/23 summarised in `git show phase-7-planning:docs/work/phase-7-planning.md` (folded into STATE/BACKLOG at merge).

## New backlog (target → item)
None yet.

## Owner verification steps
Listed in the plan's docs task.

## Pre-flight findings (T0 2026-10-25)
- **7b1 merged, all five points exist:** `JobDefinition.usesAi` (`jobs.ts:27`); `registerJobs(boss, jobs, { pollingIntervalSeconds?, aiPaused?: () => Promise<boolean> })` with `includeMetadata: true` already set (`boss.ts:27`); `createAiFromEnv(env, config, ledger, samples?, guard?)` (`ai/env.ts:9`, guard = 5th); `runJob(job, jobId, data, handler, log, opts: { resend? })` handles `AiPausedError` (`sentry.ts:70-100`, platform -> resend 600 s, client -> `skipped`); `clientWorkAllowed(t: typeof client | string): SQL` (`db/src/filters.ts:40`, already used by `generate.ts`/`readiness.ts`); worker `deps.aiGuard()` (`deps.ts:257`, `{ aiGuard: false }` for CLIs) wraps `getAi`; `spend_guard_event` (`schema/platform.ts:79`); `spend-guard-panel.tsx` under `/platform/health/_components`; `platformOperatorEmails({ service, platformAdmins }, roles)` (`tools/src/platform/costs/alerts.ts:15`). `@cs/ui` `StatusChip` exists (`health-tables.tsx` uses it).
- **7c1 merged:** `TABLE_CLASS` in `packages/db/test/table-classes.ts:21` (`table: 'service_only'|...`); `ISOLATION_FIXTURES` in `packages/tools/src/isolation/fixtures.ts` (`{ kind: 'client'|'object'|'agency'|'platform'|'caller', input }`).
- **Migrations:** main ends `0092`; this branch claims **0093**. Only unmerged branch `phase-16` is docs-only (no overlap, no migrations).
- **Session state vs pooler:** rg is empty. `createDb` today is `postgres(url, { max: 5, onnotice })`; Task 1 adds `max`/`prepare`.
- **`client` INSERT:** only `tools/onboarding.ts:70` (service tx). Test inserts as `app_user`: only `db/src/tenant.test.ts:47` (negative; message becomes `permission denied`). Other tests/seeds use owner. `rls-sweep` `REFUSED` already accepts both messages. Keep the plain REVOKE (no policy fallback).
- **Fetch sites:** `ai/http.ts:49`, `dataforseo.ts:108`, `apify.ts:36`, `scrapecreators.ts:23`, `static-map.ts:38`, plus two the plan missed: `meta-search.ts:43` (60 s) and `:69` (310 s). Task 2 must convert these too.
- **Cron schemas:** all accept `{ _cron: true }`, but `kb-embed`/`kb-sync` use `z.object` (strips it) and `runJob` gets parsed data; plan Task 7 fixed to read raw data (see plan, Cron schemas).
- **Queues:** all 12 names exist exactly. Shared state: `deps.ts` lazy singletons are safe (sync `??=`; `ai` is a cached promise, cleared on reject; `createBrowserCache` sets `cached` synchronously). Watch for Task 1/3: (a) `RobotsPolicy.load` has no in-flight dedupe, so N pollers can fetch one origin's robots.txt at once (Task 3's robots slot must cover this); (b) `createBrowserCache` can double-launch when a dead cached browser is found by two callers (minor leak); (c) `warnedNoSalt` is a benign once-flag; (d) `HostRateLimiter.wait` reserves synchronously (safe). One shared Chromium serves up to 4 contexts (memory check in the rehearsal).
- **Constants exist:** `schedule.ts` (`BRIEF_LOCAL_WEEKDAY=4`, `BRIEF_LOCAL_HOUR=22`, `BRIEF_CATCHUP_UNTIL_HOUR=12`, `safeTimezone`, `localParts`, `briefDue`, `deliveryDateFor`), `deliver.ts:15 DELIVERY_LOCAL_HOUR=7`, `readiness.ts:7 STARTING_POINT_WAIT_HOURS=48`, `generate.ts:17-18 BRIEF_MAX_ATTEMPTS=3, BRIEF_STALE_MINUTES=30`, `setup-clock.ts startingPointClockStart(c, s, now): Date|null`, `replyToFor(db, agencyId, clientId)` (`delivery/contacts.ts:116`), `SsrfBlockedError(url)` (`net/guard.ts:14`), `createGuardedFetchText({ fetch?, assertUrl? })`, `createPlaywrightRenderer({ assertUrl?, ... })`, worker `engineConfigured()` (`deps.ts:308`). `SUPPORT_REPLY_TO` is only an env var; the exported constant is `DEFAULT_SUPPORT_REPLY_TO` (`apps/worker/src/deps.ts:41`), web uses `webEnv().supportReplyTo`.
- **PILOT metrics:** `brief.approved_at` exists (`schema/briefs.ts:66`); ratings live in `feedback` (`kind='rating'`, `after: { rating }`, `subject_type` brief_item/event/...), there is no brief-level rating column.
