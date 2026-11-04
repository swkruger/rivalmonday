# launch-gate — cut shell + page sequential DB stages to ≤ 8 before the live deploy

**Kind:** implementation   **Worktree:** ../CompetitorSpy-wt/launch-gate   **Base:** main @ 42e9ddbe
**Plan/spec:** [spec](../superpowers/specs/2026-11-04-launch-gate-design.md) · [plan](../superpowers/plans/2026-11-04-launch-gate.md)

## Status (overwrite)
Spec + lean plan written 2026-11-04; awaiting owner approval. Gates 7a1 Task 12 (live deploy).

## Next (overwrite)
Owner approves the plan; then subagent-driven development (Task 0 pre-flight first).

## Interfaces this branch adds or changes
None yet. Next free migration: **0097** (probably not needed).

## Assumes from other branches
None (`git branch --no-merged main` is empty).

## Decisions (owner-approved)
1. Owner, 2026-11-04: skipped the questions; the brief's recommendations stand (spec D1-D8).

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

## Baseline (before)
Task 1, 2026-11-03: `bash apps/web/scripts/profile-gate.sh` (local cluster 5444, E2E seed, warm visit, `--params-from-seed`), sorted by `dbStages`. Gate FAILS as expected: 59 of 68 pages > 8; max 23 (`/platform`, `/platform/runbook`), median 15. Not profiled (strict-routes fail): `/c/[clientId]/ask/[threadId]` (the admin has no own thread in the seed; Ask threads are author-only), `/c/[clientId]/reports/[reportId]` (no `trend_report` in the seed), `/c/[clientId]/evidence/[evidenceId]` (no crawlable link). Back-to-back runs differ by about ±1 stage on a few pages (span overlap is timing-dependent).

| route | path | status | dbStages | authStages | txStages | wallMs |
|---|---|---|---|---|---|---|
| /platform | `/platform` | 200 | 23 | 1 | 4 | 77 |
| /platform/runbook | `/platform/runbook` | 200 | 23 | 1 | 4 | 72 |
| /platform/agencies | `/platform/agencies` | 200 | 22 | 1 | 4 | 81 |
| /platform/help | `/platform/help` | 200 | 22 | 1 | 4 | 69 |
| /platform/knowledge/[id] | `/platform/knowledge/new` | 200 | 22 | 1 | 4 | 65 |
| /platform/knowledge/new | `/platform/knowledge/new` | 200 | 22 | 1 | 4 | 76 |
| /platform/reviews | `/platform/reviews` | 200 | 22 | 1 | 4 | 76 |
| /platform/topics | `/platform/topics` | 200 | 22 | 1 | 4 | 83 |
| /platform/waitlist | `/platform/waitlist` | 200 | 22 | 1 | 4 | 81 |
| /c/[clientId] | `/c/fa0688ac…` | 200 | 21 | 2 | 16 | 182 |
| /c/[clientId]/changes | `/c/fa0688ac…/changes` | 200 | 21 | 2 | 16 | 102 |
| /platform/ask | `/platform/ask` | 200 | 21 | 1 | 4 | 83 |
| /platform/leads | `/platform/leads` | 200 | 21 | 1 | 4 | 74 |
| /platform/verticals | `/platform/verticals` | 200 | 21 | 1 | 4 | 83 |
| /c/[clientId]/competitors/[competitorId] | `/c/fa0688ac…/competitors/58c9f21e…` | 200 | 19 | 2 | 13 | 181 |
| /platform/health | `/platform/health` | 200 | 18 | 1 | 4 | 95 |
| /platform/knowledge | `/platform/knowledge` | 200 | 18 | 1 | 4 | 91 |
| /c/[clientId]/settings/billing | `/c/fa0688ac…/settings/billing` | 404 | 17 | 4 | 7 | 69 |
| /c/[clientId]/setup | `/c/fa0688ac…/setup` | 200 | 17 | 2 | 8 | 61 |
| /agency/help | `/agency/help` | 200 | 16 | 2 | 5 | 58 |
| /agency/leads | `/agency/leads` | 200 | 16 | 2 | 5 | 54 |
| /agency/settings/branding | `/agency/settings/branding` | 200 | 16 | 2 | 5 | 52 |
| /c/[clientId]/pitch-snapshot | `/c/fa0688ac…/pitch-snapshot` | 404 | 16 | 4 | 6 | 89 |
| /inbox | `/inbox` | 200 | 16 | 2 | 5 | 70 |
| /kb/[id] | `/kb/d72aa9d4…` | 200 | 16 | 2 | 5 | 81 |
| /platform/billing | `/platform/billing` | 200 | 16 | 1 | 4 | 71 |
| /settings/profile | `/settings/profile` | 200 | 16 | 2 | 5 | 95 |
| /agency/alerts | `/agency/alerts` | 200 | 15 | 2 | 6 | 91 |
| /agency/settings/ai | `/agency/settings/ai` | 200 | 15 | 2 | 6 | 71 |
| /agency/settings/billing | `/agency/settings/billing` | 200 | 15 | 2 | 5 | 67 |
| /agency/settings/platform-access | `/agency/settings/platform-access` | 200 | 15 | 2 | 5 | 80 |
| /agency/settings/runbook | `/agency/settings/runbook` | 200 | 15 | 2 | 5 | 89 |
| /agency/settings/slack-teams | `/agency/settings/slack-teams` | 200 | 15 | 2 | 5 | 62 |
| /agency/settings/team | `/agency/settings/team` | 200 | 15 | 2 | 5 | 65 |
| /platform/ask/[threadId] | `/platform/ask/2ae1e639…` | 200 | 15 | 1 | 4 | 69 |
| /agency/prospects | `/agency/prospects` | 200 | 14 | 2 | 5 | 64 |
| /agency/settings/intake | `/agency/settings/intake` | 200 | 14 | 2 | 7 | 63 |
| /c/[clientId]/briefs | `/c/fa0688ac…/briefs` | 200 | 14 | 2 | 6 | 76 |
| /c/[clientId]/reviews | `/c/fa0688ac…/reviews` | 200 | 14 | 2 | 10 | 101 |
| /c/[clientId]/settings/profile | `/c/fa0688ac…/settings/profile` | 200 | 14 | 2 | 9 | 79 |
| /agency/settings/intake/preview | `/agency/settings/intake/preview` | 200 | 13 | 2 | 7 | 50 |
| /c/[clientId]/recommendations | `/c/fa0688ac…/recommendations` | 200 | 13 | 2 | 6 | 79 |
| /platform/costs | `/platform/costs` | 200 | 13 | 1 | 4 | 80 |
| /c/[clientId]/help | `/c/fa0688ac…/help` | 200 | 12 | 2 | 6 | 68 |
| /c/[clientId]/pricing | `/c/fa0688ac…/pricing` | 200 | 12 | 2 | 6 | 67 |
| /c/[clientId]/settings/delivery | `/c/fa0688ac…/settings/delivery` | 200 | 12 | 2 | 7 | 126 |
| /agency/approvals/[briefId] | `/agency/approvals/85a8bda9…` | 200 | 11 | 2 | 8 | 67 |
| /c/[clientId]/ask | `/c/fa0688ac…/ask` | 200 | 11 | 2 | 6 | 73 |
| /c/[clientId]/settings/alerts | `/c/fa0688ac…/settings/alerts` | 200 | 11 | 2 | 6 | 72 |
| /c/[clientId]/settings/usage | `/c/fa0688ac…/settings/usage` | 200 | 11 | 2 | 7 | 84 |
| /agency/approvals | `/agency/approvals` | 200 | 10 | 2 | 6 | 58 |
| /agency/settings/usage | `/agency/settings/usage` | 200 | 10 | 2 | 8 | 58 |
| /c/[clientId]/ads | `/c/fa0688ac…/ads` | 200 | 10 | 2 | 8 | 96 |
| /c/[clientId]/competitors | `/c/fa0688ac…/competitors` | 200 | 10 | 2 | 6 | 104 |
| /c/[clientId]/rankings | `/c/fa0688ac…/rankings` | 200 | 10 | 2 | 16 | 123 |
| /platform/agencies/[id] | `/platform/agencies/2e0737ee…` | 200 | 10 | 1 | 4 | 116 |
| /c/[clientId]/alerts/[alertId] | `/c/fa0688ac…/alerts/b088021f…` | 200 | 9 | 2 | 10 | 90 |
| /c/[clientId]/settings/ai | `/c/fa0688ac…/settings/ai` | 200 | 9 | 2 | 9 | 72 |
| /c/[clientId]/settings/runbook | `/c/fa0688ac…/settings/runbook` | 200 | 9 | 2 | 8 | 81 |
| /agency | `/agency` | 200 | 8 | 2 | 6 | 104 |
| /c/[clientId]/briefs/[briefId] | `/c/fa0688ac…/briefs/85a8bda9…` | 200 | 8 | 2 | 11 | 90 |
| /c/[clientId]/moves | `/c/fa0688ac…/moves` | 200 | 8 | 2 | 9 | 87 |
| /agency/clients/new | `/agency/clients/new` | 200 | 7 | 2 | 2 | 55 |
| /agency/prospects/[clientId] | `/agency/prospects/new` | 200 | 7 | 2 | 2 | 35 |
| /agency/prospects/new | `/agency/prospects/new` | 200 | 7 | 2 | 2 | 65 |
| /paused | `/paused` | 307 | 7 | 4 | 0 | 29 |
| /c/[clientId]/setup/competitors | `/c/fa0688ac…/setup/competitors` | 307 | 6 | 2 | 2 | 34 |
| /onboarding | `/onboarding` | 307 | 5 | 2 | 0 | 52 |
