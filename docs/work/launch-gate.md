# launch-gate — cut shell + page sequential DB stages to ≤ 8 before the live deploy

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/launch-gate   **Base:** main @ 42e9ddbe
**Plan/spec:** none yet

## Status (overwrite)
Kickoff brief written; nothing built. Gates 7a1 Task 12 (live deploy).

## Next (overwrite)
Owner answers § 6; then brainstorming, spec, lean plan.

## Interfaces this branch adds or changes
None yet. Next free migration: **0097** (probably not needed).

## Assumes from other branches
None (`git branch --no-merged main` is empty).

## Decisions (owner-approved)
None yet.

## New backlog (target → item)
—

## Owner verification steps
—

## Brief

### 1. Scope: a performance gate, not a roadmap phase
- **Source:** 7a spec (`specs/2026-10-19-phase-7a-launch-production-security-design.md`) §2 D7 (p75 ≤ 1.5 s, every page ≤ 3 s; locally ≤ 4 sequential stages), §3 (profiler), §9 (leftovers → backlog). 7a1 plan Task 9 passed `--assert-stages 4` (*tool* stages, `6ac3ae5a`). `9b4b68e7` added DB counting; the 7a1 final review set this gate at **`--assert-db-stages 8`** (DB stages, shell included). `DEPLOY.md` § Checklist: prod p75 is a measurement only.
- **Stage** = `sequentialStages()` (`apps/web/src/server/tool-timing.ts`): spans are merged when they overlap or touch, and each group counts once. A `Promise.all` is 1 stage; each awaited-after read adds 1.
- **Measured by:** `PROFILE_TOOLS=1` (local only) → `server/db.ts` wraps the drizzle pools with `instrumentSql` (`server/db-timing.ts`). That writes one `db` span per `sql.unsafe` round trip, plus `tool` spans from `server/tools.ts` `invokeTimed`, to `apps/web/.profile/tools.ndjson`. `scripts/profile-pages.ts` (+ `profile-args.ts`) crawls `@cs/demo` `SCREENS`, makes one warm visit each and joins spans by `x-rm-path` and time. Flags: `--assert-db-stages N`, `--strict-routes`, `--param`.
- **Blind spots:** Better Auth's `pg` pool (the session lookup, every request), tagged `sql\`\``, and postgres-js BEGIN/COMMIT. Real round trips are higher than the reported counts.
- **Numbers (7a1, 2026-10-20, Neon dev, about 50 ms per query):** (app) shell ~**12** per page (max **22**); (platform) **19–20**. No per-page table and no local recipe were kept, so re-baseline first. ask/[threadId], reports/[reportId] and kb/[id] were never profiled (no crawlable link; use `--param`).
- **To reach ≤ 8:** run the shell's independent reads together after viewer resolution; merge single-row reads that run back to back; remove the per-service loops; stop audit inserts adding stages; then fix any page still over.

### 2. Already built: reuse, don't rebuild (the waterfall; ∥ = parallel)
1. `server/current-viewer.ts` `viewerWith` → Better Auth `getSession` (own pool, uncounted) → `resolveSupportViewer` (only with `rm_support`).
2. `server/viewer.ts` `resolveViewer` → `listMemberships` → client-hint lookup (more than one membership only) → `accessContextFor` (`planFeaturesFor`).
3. `requireContext` → `server/billing-state.ts` `billingSnapshotOf` (`cache()`d): `agency_billing`, **then** `isOnHold`. Two reads that could be one.
4. `(app)/layout.tsx`: admins only, `get_onboarding_status` (+ maybe `mark_onboarding_redirected`).
5. `components/shell/app-shell.tsx` is **fully sequential**: `themeForViewer` → `list_clients` → client name → `unreadCount` (2 reads) → `resolvePlatformRole` → `clientBillingNoticeOf` → `get_spend_status` → `navCounts` (∥ 3 count tools) → `verticalOptions()`.
6. `@cs/core` `tools.ts` `ToolRegistry.invoke`: after the handler, an **awaited `audit.record` insert** (+1 stage) unless the tool is `audit: 'skip-web'`. `list_clients`, `get_ai_guard_state` and `count_catalog_review` skip it; `get_spend_status`, the nav counts, `list_platform_costs` and `get_onboarding_status` appear not to (verify).
7. `(platform)/layout.tsx`: `requireOperatorContext` → `platformRole` → owner-only `list_platform_costs` → `get_ai_guard_state` → `AppShell zone="platform"` (step 5 again).
8. `@cs/tools` `platform/costs/read.ts` `loadCostState`: 1 read, then **2 sequential queries per service × 6 = 13 stages**. The loop is per service, not per snapshot row as the backlog says.
9. `@cs/db` `tenant.ts` `withTenant`: a transaction + `set_config` round trip before each RLS read. `server/tools.ts` `callTool`/`tryCallTool` (reads; refusal → `notFound()`/null); `server/run-tool.ts` `runTool` (writes).
10. Pages: `c/[clientId]/reports/[reportId]` (`loadReport`: 3 tools ∥, then `helpGuides`); `kb/[id]` (`get_kb_article`); `c/[clientId]/ask/[threadId]` → `ask-screen.tsx` (unread); `platform/ask/[threadId]` (thread, then `requireOperatorContext`, then 3 ∥).
11. Pools: `server/db.ts` + `packages/db/src/client.ts` (per role and env, `max 5`); `server/auth.ts` (Better Auth `Pool max 5`; no `cookieCache`).

### 3. Binding decisions (root CLAUDE.md; do not reopen)
- Web reads are `@cs/tools` tools (`callTool`); writes go through `runTool`. Refusals → 404, never 403.
- RLS tenancy (`withTenant`); the AccessContext is rebuilt every request (no caching across requests).
- Self-hosted Better Auth (schema `auth`); access comes from our `membership` table.
- No route `loading.tsx` (use `Suspense`). A new tool needs an `ISOLATION_FIXTURES` entry; a new table needs a `TABLE_CLASS` entry.
- Support sessions: every call is audited (8b). `PROFILE_TOOLS` stays local-only. Prod: Vercel iad1 + Neon, `cs_web`.

### 4. Backlog to fold in (verbatim)
- [ ] **HIGH - gates 7a1 Task 12:** shell DB stages: (app) shell ~12 sequential stages/page (max 22), (platform) 19-20 (`list_platform_costs` per-snapshot-row queries); target `--assert-db-stages 8`; also time the Better Auth pg pool and profile ask/[threadId], reports/[reportId], kb/[id] — *from 7a*
- [ ] Page latency on the remote Neon DB: pages took 28–36 s in E2E (Playwright timeouts raised to 90 s/test, 15 s/expect in `playwright.config.ts`) — look before launch — *from 5c-2*
- [ ] Flaky Neon connections in tests (`ECONNRESET`/`connect ETIMEDOUT` in `db` RLS tests, `collectors` `suggest.test.ts`, E2E seed); one un-bisected `@cs/collectors` full-suite failure (passed 249/249 on re-run) — add retry/pool settings or bisect — *from 5c-2 / demo runs* (optional)

### 5. In-flight workstreams
`git branch --no-merged main` is empty. Next free migration: **0097** (STATE). Shared docs change only at merge.

### 6. Open questions for the owner (ordered by design impact)
1. **Split?** (a) One branch: shell → platform + `list_platform_costs` → 3 pages + Better Auth timing; (b) lg-1 shell + platform, lg-2 pages; (c) 3 branches. **Rec (a):** a small, linked change set; one baseline and one final run.
2. **Read audit inserts:** (a) keep them awaited (+1 stage per tool); (b) defer successful web-channel *reads* with `after()` (never writes or support sessions); (c) mark more badge reads `skip-web`. **Rec (b)+(c).**
3. **Session lookup:** (a) leave it and only count it; (b) Better Auth `cookieCache` (~5 min; a revoked session lives that long); (c) share one pool with `service`. **Rec (a)**; (b) only if the numbers need it.
4. **Collapse the shell:** (a) `Promise.all` over the existing reads; (b) one `get_shell_context` tool (needs an isolation fixture); (c) (a), then (b) only if still over 8. **Rec (c).**
5. **Does the gate count Better Auth and BEGIN/COMMIT?** (a) yes, and 8 still applies; (b) count them but report only; (c) no change. **Rec (b):** 8 stays comparable with 7a.
6. **Enforce in CI?** (a) a manual pre-deploy run, pasted here; (b) a CI job (`next start` + `PROFILE_TOOLS=1` + `--assert-db-stages 8 --strict-routes` on the E2E seed); (c) (a) now, (b) to backlog. **Rec (c):** the count doesn't depend on the DB, but CI minutes are a concern (repo going private).
7. **Which DB?** (a) local cluster 5444 (same count, deterministic); (b) Neon dev (D7's wording; real ~50 ms per stage); (c) count on local, latency on Neon dev + staging. **Rec (c).**
8. **Bar for `/platform/**` and the 3 pages:** (a) ≤ 8 everywhere; (b) ≤ 10 for operator pages; (c) measure only. **Rec (a)** + `--strict-routes`.
