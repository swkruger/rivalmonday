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
Task 1 (fix round 1), 2026-11-03: `bash apps/web/scripts/profile-gate.sh --seed` (local cluster 5444, E2E seed, `--params-from-seed`). Each value is the **median of 3 warm visits**. Rows are sorted by `dbStages`. The gate FAILS, as expected: 58 of 68 pages are over 8, max 23 (`/platform`, `/platform/reviews`), median 14.

- **Seed client:** E2E HVAC. It has the most features of any seeded client, but it lacks `ask` and `mcp`; no seeded client has all five. Its two 404s are not feature gates: `settings/billing` is client_owner-only, and `pitch-snapshot` needs a ready prospect report.
- **Not profiled** (strict-routes fails on these; Task 6 owns them):
  - `/c/[clientId]/ask/[threadId]`: there is no admin-authored thread.
  - `/c/[clientId]/reports/[reportId]`: there is no `trend_report`.
  - `/c/[clientId]/evidence/[evidenceId]`: no crawlable link.

| route | path | status | dbStages | authStages | txStages | wallMs |
|---|---|---|---|---|---|---|
| /platform | `/platform` | 200 | 23 | 1 | 4 | 81 |
| /platform/reviews | `/platform/reviews` | 200 | 23 | 1 | 4 | 79 |
| /c/[clientId]/changes | `/c/6555332e…/changes` | 200 | 22 | 2 | 16 | 122 |
| /platform/agencies | `/platform/agencies` | 200 | 22 | 1 | 4 | 78 |
| /platform/help | `/platform/help` | 200 | 22 | 1 | 4 | 86 |
| /platform/knowledge/[id] | `/platform/knowledge/1e298ba4…` | 200 | 22 | 1 | 4 | 79 |
| /platform/knowledge/new | `/platform/knowledge/new` | 200 | 22 | 1 | 4 | 79 |
| /platform/runbook | `/platform/runbook` | 200 | 22 | 1 | 4 | 78 |
| /platform/topics | `/platform/topics` | 200 | 22 | 1 | 4 | 81 |
| /platform/waitlist | `/platform/waitlist` | 200 | 22 | 2 | 4 | 64 |
| /platform/leads | `/platform/leads` | 200 | 21 | 1 | 4 | 84 |
| /platform/verticals | `/platform/verticals` | 200 | 21 | 1 | 4 | 86 |
| /c/[clientId] | `/c/6555332e…` | 200 | 20 | 2 | 15 | 174 |
| /c/[clientId]/competitors/[competitorId] | `/c/6555332e…/competitors/4bf020a9…` | 200 | 20 | 2 | 12 | 170 |
| /c/[clientId]/settings/billing | `/c/6555332e…/settings/billing` | 404 | 19 | 4 | 6 | 75 |
| /c/[clientId]/pitch-snapshot | `/c/6555332e…/pitch-snapshot` | 404 | 18 | 4 | 6 | 78 |
| /platform/ask | `/platform/ask` | 200 | 18 | 1 | 4 | 88 |
| /platform/ask/[threadId] | `/platform/ask/6ee1b99b…` | 200 | 18 | 1 | 4 | 84 |
| /platform/health | `/platform/health` | 200 | 18 | 1 | 4 | 115 |
| /platform/knowledge | `/platform/knowledge` | 200 | 18 | 1 | 4 | 81 |
| /c/[clientId]/setup | `/c/6555332e…/setup` | 200 | 17 | 2 | 8 | 64 |
| /agency/help | `/agency/help` | 200 | 16 | 2 | 5 | 52 |
| /agency/leads | `/agency/leads` | 200 | 16 | 2 | 5 | 68 |
| /agency/settings/branding | `/agency/settings/branding` | 200 | 16 | 2 | 5 | 63 |
| /agency/settings/slack-teams | `/agency/settings/slack-teams` | 200 | 16 | 2 | 5 | 64 |
| /inbox | `/inbox` | 200 | 16 | 2 | 5 | 50 |
| /kb/[id] | `/kb/9f9b0872…` | 200 | 16 | 2 | 5 | 50 |
| /platform/billing | `/platform/billing` | 200 | 16 | 1 | 4 | 72 |
| /agency/alerts | `/agency/alerts` | 200 | 15 | 2 | 6 | 78 |
| /agency/settings/ai | `/agency/settings/ai` | 200 | 15 | 2 | 5 | 73 |
| /agency/settings/billing | `/agency/settings/billing` | 200 | 15 | 2 | 5 | 63 |
| /agency/settings/platform-access | `/agency/settings/platform-access` | 200 | 15 | 2 | 5 | 54 |
| /agency/settings/team | `/agency/settings/team` | 200 | 15 | 2 | 5 | 81 |
| /settings/profile | `/settings/profile` | 200 | 15 | 2 | 5 | 95 |
| /agency/prospects | `/agency/prospects` | 200 | 14 | 2 | 5 | 58 |
| /agency/prospects/[clientId] | `/agency/prospects/33874490…` | 200 | 14 | 2 | 6 | 69 |
| /agency/settings/intake/preview | `/agency/settings/intake/preview` | 200 | 14 | 2 | 6 | 65 |
| /agency/settings/runbook | `/agency/settings/runbook` | 200 | 14 | 2 | 5 | 57 |
| /platform/costs | `/platform/costs` | 200 | 14 | 1 | 4 | 101 |
| /agency/settings/intake | `/agency/settings/intake` | 200 | 13 | 2 | 7 | 58 |
| /c/[clientId]/briefs | `/c/6555332e…/briefs` | 200 | 13 | 2 | 6 | 90 |
| /c/[clientId]/help | `/c/6555332e…/help` | 200 | 13 | 2 | 7 | 74 |
| /c/[clientId]/pricing | `/c/6555332e…/pricing` | 200 | 13 | 2 | 6 | 75 |
| /c/[clientId]/recommendations | `/c/6555332e…/recommendations` | 200 | 13 | 2 | 6 | 79 |
| /c/[clientId]/reviews | `/c/6555332e…/reviews` | 200 | 13 | 2 | 10 | 102 |
| /c/[clientId]/settings/profile | `/c/6555332e…/settings/profile` | 200 | 13 | 2 | 9 | 81 |
| /c/[clientId]/settings/delivery | `/c/6555332e…/settings/delivery` | 200 | 12 | 2 | 7 | 109 |
| /c/[clientId]/settings/usage | `/c/6555332e…/settings/usage` | 200 | 12 | 2 | 6 | 86 |
| /agency/approvals | `/agency/approvals` | 200 | 11 | 2 | 5 | 59 |
| /agency/settings/usage | `/agency/settings/usage` | 200 | 11 | 2 | 8 | 78 |
| /c/[clientId]/ask | `/c/6555332e…/ask` | 200 | 11 | 2 | 5 | 74 |
| /c/[clientId]/settings/alerts | `/c/6555332e…/settings/alerts` | 200 | 11 | 2 | 6 | 79 |
| /agency/approvals/[briefId] | `/agency/approvals/f33a572d…` | 200 | 10 | 2 | 11 | 66 |
| /c/[clientId]/competitors | `/c/6555332e…/competitors` | 200 | 10 | 2 | 5 | 104 |
| /c/[clientId]/rankings | `/c/6555332e…/rankings` | 200 | 10 | 2 | 13 | 117 |
| /paused | `/paused` | 307 | 10 | 4 | 0 | 31 |
| /platform/agencies/[id] | `/platform/agencies/f9ef9187…` | 200 | 10 | 1 | 4 | 108 |
| /c/[clientId]/settings/runbook | `/c/6555332e…/settings/runbook` | 200 | 9 | 2 | 8 | 83 |
| /agency | `/agency` | 200 | 8 | 2 | 6 | 97 |
| /c/[clientId]/ads | `/c/6555332e…/ads` | 200 | 8 | 2 | 8 | 92 |
| /c/[clientId]/alerts/[alertId] | `/c/6555332e…/alerts/906537f6…` | 200 | 8 | 2 | 10 | 83 |
| /c/[clientId]/briefs/[briefId] | `/c/6555332e…/briefs/f33a572d…` | 200 | 8 | 2 | 10 | 91 |
| /c/[clientId]/settings/ai | `/c/6555332e…/settings/ai` | 200 | 8 | 2 | 10 | 67 |
| /agency/clients/new | `/agency/clients/new` | 200 | 7 | 2 | 2 | 30 |
| /agency/prospects/new | `/agency/prospects/new` | 200 | 7 | 2 | 2 | 33 |
| /c/[clientId]/moves | `/c/6555332e…/moves` | 200 | 7 | 2 | 9 | 87 |
| /c/[clientId]/setup/competitors | `/c/6555332e…/setup/competitors` | 307 | 6 | 2 | 2 | 32 |
| /onboarding | `/onboarding` | 307 | 5 | 2 | 0 | 28 |
