# launch-gate — cut shell + page sequential DB stages to ≤ 8 before the live deploy

**Kind:** implementation   **Worktree:** ../CompetitorSpy-wt/launch-gate   **Base:** main @ 42e9ddbe
**Plan/spec:** [spec](../superpowers/specs/2026-11-04-launch-gate-design.md) · [plan](../superpowers/plans/2026-11-04-launch-gate.md)

## Status (overwrite)
2026-11-04: Tasks 0-7 done. **Gate passes:** `bash apps/web/scripts/profile-gate.sh --seed` → exit 0, 71/71 routes, max 7 dbStages (baseline: 58 of 68 over 8, max 23). Neon dev latency measured (§ Results): agency/workspace p75 **1476 ms** (≤ 1.5 s, by 24 ms), max **3188 ms**; 2 pages over 3 s (New backlog). The staging run is an owner step. Gates 7a1 Task 12 (live deploy).

## Next (overwrite)
Final whole-branch review (`pnpm test:affected` + `e2e:affected`, `--base main`) and one fix wave; the owner runs the staging crawl (Owner verification steps); `/rm-merge` on the owner's go-ahead.

## Interfaces this branch adds or changes
- `apps/web/scripts/profile-gate.sh [--db local|neon-dev] [--seed] [--skip-build] [-- <profile:pages args>]` (recipe: `apps/web/CLAUDE.md` § Page profiler).
- `profile:pages` flags `--assert-db-stages N`, `--strict-routes`, `--params-from-seed`, `--json FILE`; columns `dbStages`/`authStages`/`txStages` (median of 3 warm visits).
- `@cs/core` `ToolRegistry.invoke`: `CallOptions.deferAudit` (web read, no support session, outcome ok → `after()`); `ToolRegistryOptions.onDeferredAuditError`.
- `apps/web` `startShellReads(viewer, ctx, { zone, platformRole })` → `AppShell` `reads`; `@cs/tools` `allInOrder` (parallel reads, old refusal order); `@cs/db` `withTenant` pipelines `set_config` with the first query.
- E2E seed `seedProfileRows` (admin auth user + Ask thread, one `sent` quarterly `trend_report`). No migration (next free **0097**).

## Assumes from other branches
None.

## Decisions (owner-approved)
1. Owner, 2026-11-04: skipped the questions; the brief's recommendations stand (spec D1-D8).
2. Controller, Task 7: the staging crawl needs an owner-provided signed-in cookie, so it is an owner step.

## New backlog (target → item)
- **7a1 Task 12 (before or with the live deploy) → two pages over 3 s on Neon dev:** `/c/[clientId]/competitors/[competitorId]` 3188 ms (113 queries), `/c/[clientId]` 3073 ms (110 queries). Wall time tracks *query count* (pool max 5 → queueing), not dbStages: cut queries per page (duplicate reads across ~18 parallel tools, e.g. `get_client_profile` ×2, `get_ask_starters` ×2) or size the pool per request. Re-measure from Vercel iad1 (staging) first: this box adds ~95 ms per query.
- **Next perf pass → `get_evidence_refs` per-competitor loop** (`packages/tools/src/tools/evidence.ts:78`, `for … await competitorLinked`): one transaction per distinct competitor, so `/c/[clientId]/recommendations` is **10 dbStages / 2785 ms on cs_dev** (4 on the E2E seed). Batch the link check. The E2E-seed gate cannot see data-dependent loops.
- **Pilot hardening → CI job for the gate** (spec D6): `next start` + `PROFILE_TOOLS=1` + `--assert-db-stages 8 --strict-routes` on the E2E seed.
- **Next perf pass → rankings `before` cursor as a keyset `(finished_at, id)`** (6b review).
- **If pool queueing shows on staging → `spendByClient` as one CTE** (6b review).
- **Watch → workspace `/c/` p75 alone is 1679 ms** (agency pages 918 ms); the combined D7 p75 passes by 24 ms.

## Owner verification steps
1. **Staging latency (wall time only, D7):** sign in to `https://staging.rivalmonday.app` as an agency admin in a browser; copy the request `Cookie` header (DevTools → Network → any page request) into a file outside the repo, e.g. `$TEMP/rm-staging-cookie.txt`. From the worktree root (Git Bash):
   `pnpm --filter @cs/web profile:pages --base https://staging.rivalmonday.app --cookie "$TEMP/rm-staging-cookie.txt" --strict-routes --json .profile/staging.json`
   Add `--param clientId=<staging client id>` if a `/c/` route is unresolved. Pass = agency/workspace pages p75 ≤ 1.5 s and every page ≤ 3 s. Paste p75/max here, then delete the cookie file.
2. Optional: `bash apps/web/scripts/profile-gate.sh --seed` → `profile-gate: exit 0`.

## Results
### Gate (local cluster 5444, E2E seed)
- **Baseline** (Task 1, 2026-11-03): 58 of 68 pages over 8, max 23 (`/platform`, `/platform/reviews`), median 14; 3 param routes unprofiled. (app) shell ~12 stages per page, (platform) 18-23.
- **Final** (Task 6c, `1371acaf`): exit 0, 71/71 profiled, max **7**, median 4.
- **What moved it:** Tasks 2-3 web-read audit inserts deferred with `after()` (D2), billing row + hold state in one stage; Task 4 `startShellReads` (shell-only pages ~12 → 4); Task 5 platform layout in one stage, `loadCostState` 3 queries instead of 1 + 2 × 6 (platform 18-23 → 1-6); Task 6a `withTenant` pipelining, billing snapshot beside the plan read, tool reads overlapped (`allInOrder`, parity snapshots recorded on the old code); 6b rank/alert/runbook tools, branding on the membership, page reads started with their inputs; 6c evidence/compare tools, one-statement `competitorLinked`, seeded param rows.
- **Reading the numbers:** removing the shell waterfall made some page chains *look* longer (overlapping spans had hidden them); 404/307 rows are ±1-2 noisy (the previous visit's tail spans). `dbStages` is a lower bound on depth: it counts gaps in the union of overlapping spans, and the page and its layouts run twin access chains concurrently, so wall time on Neon is the real check.

### Latency (Neon dev `cs_dev`, Task 7, 2026-11-04)
`bash apps/web/scripts/profile-gate.sh --db neon-dev --skip-build -- --cookie FILE` with `PROFILE_SEED_ADMIN_EMAIL` = the admin of `CS Dev Verification Agency` (client `CS Dev Verification Client`, every feature on). Local `next start` with the E2E server env + cs_dev URLs; signed in once by magic link through the file outbox (`POSTMARK_SERVER_TOKEN` blank). Exit 1: `/c/[clientId]/recommendations` 10 dbStages (data-dependent, backlog) and 5 param routes with no cs_dev row/link (`alerts/[alertId]`, `reports/[reportId]`, `agency/prospects/[clientId]`, `platform/agencies/[id]`, `platform/knowledge/[id]`). `/platform/*` 404s (that admin is not in the E2E `PLATFORM_ADMIN_EMAILS`), so it is out of the budget.
- **wallMs (median of 3), 45 agency/workspace 200 pages:** p50 1158, **p75 1476**, mean 1288, **max 3188**. Agency + account pages (22): p75 918, max 1906 (`/agency`). Workspace `/c/` pages (23): p75 1679, max 3188.
- **Per stage:** mean wall ≈ **198 ms per (db + auth) stage**; app query median 97 ms (p90 200), auth query median 43 ms. This box → Neon is about twice the ~50 ms the 7a numbers assumed.
- **Pool fan-out shows:** median query time barely moves (93 → 109 ms), but mean wall climbs with queries per page: < 30 q 753 ms, 30-50 q 1413 ms, 50-80 q 2007 ms, ≥ 80 q 3131 ms. One request holds up to 5 service connections (pool max 5): ~110 queries × ~130 ms / 5 ≈ 2.9 s. Rankings (67 q) 2348 ms; settings pages 0.8-1.6 s (no spike).
- **D7:** p75 passes (1476 ≤ 1500); "every page ≤ 3 s" fails on 2 pages → New backlog.

<details><summary>Per-route table (71 routes): dbStages baseline → final (local), local ms, Neon dev dbStages and ms; sorted by Neon ms</summary>

| route | db base → local | local ms | Neon db | Neon ms |
|---|---|---|---|---|
| /c/[clientId]/competitors/[competitorId] | 20 → 4 | 153 | 7 | **3188** |
| /c/[clientId] | 20 → 5 | 148 | 5 | **3073** |
| /c/[clientId]/recommendations | 13 → 4 | 67 | 10 | 2785 |
| /c/[clientId]/rankings | 10 → 6 | 109 | 7 | 2348 |
| /c/[clientId]/changes | 22 → 6 | 95 | 7 | 1963 |
| /agency | 8 → 6 | 121 | 3 | 1906 |
| /c/[clientId]/reviews | 13 → 4 | 97 | 4 | 1710 |
| /c/[clientId]/moves | 7 → 4 | 86 | 5 | 1647 |
| /c/[clientId]/pitch-snapshot (404) | 18 → 6 | 65 | 7 | 1622 (404) |
| /c/[clientId]/settings/ai | 8 → 5 | 82 | 6 | 1608 |
| /c/[clientId]/ads | 8 → 3 | 91 | 4 | 1554 |
| /c/[clientId]/briefs/[briefId] | 8 → 5 | 71 | 5 | 1484 |
| /c/[clientId]/competitors | 10 → 3 | 79 | 4 | 1476 |
| /c/[clientId]/ask/[threadId] | — → 6 | 85 | 5 | 1468 |
| /agency/approvals | 11 → 4 | 60 | 8 | 1386 |
| /c/[clientId]/setup | 17 → 4 | 59 | 5 | 1385 |
| /c/[clientId]/pricing | 13 → 6 | 77 | 7 | 1382 |
| /c/[clientId]/ask | 11 → 4 | 70 | 5 | 1355 |
| /c/[clientId]/briefs | 13 → 3 | 76 | 4 | 1268 |
| /c/[clientId]/settings/billing (404) | 19 → 7 | 61 | 8 | 1254 (404) |
| /c/[clientId]/evidence/[evidenceId] | — → 6 | 96 | 4 | 1229 |
| /c/[clientId]/settings/profile | 13 → 3 | 67 | 4 | 1190 |
| /c/[clientId]/settings/alerts | 11 → 3 | 63 | 4 | 1173 |
| /c/[clientId]/settings/runbook | 9 → 5 | 81 | 4 | 1173 |
| /agency/settings/billing | 15 → 3 | 48 | 7 | 1158 |
| /agency/settings/usage | 11 → 5 | 57 | 4 | 1114 |
| /c/[clientId]/settings/delivery | 12 → 3 | 93 | 4 | 1098 |
| /c/[clientId]/settings/usage | 12 → 3 | 60 | 4 | 1087 |
| /c/[clientId]/help | 13 → 3 | 57 | 4 | 1082 |
| /agency/approvals/[briefId] | 10 → 6 | 60 | 5 | 1063 |
| /agency/leads | 16 → 3 | 49 | 3 | 923 |
| /agency/settings/intake/preview | 14 → 3 | 52 | 4 | 901 |
| /settings/profile | 15 → 4 | 80 | 4 | 879 |
| /agency/settings/intake | 13 → 5 | 58 | 3 | 856 |
| /agency/settings/runbook | 14 → 4 | 62 | 4 | 853 |
| /agency/settings/slack-teams | 16 → 5 | 61 | 3 | 847 |
| /agency/settings/team | 15 → 4 | 62 | 4 | 803 |
| /agency/settings/branding | 16 → 4 | 47 | 3 | 802 |
| /agency/alerts | 15 → 3 | 54 | 2 | 791 |
| /agency/settings/ai | 15 → 4 | 45 | 3 | 790 |
| /kb/[id] | 16 → 4 | 49 | 3 | 787 |
| /inbox | 16 → 4 | 48 | 3 | 777 |
| /agency/settings/platform-access | 15 → 4 | 57 | 3 | 767 |
| /agency/help | 16 → 4 | 43 | 4 | 752 |
| /agency/prospects | 14 → 3 | 52 | 2 | 741 |
| /platform/knowledge/new | 22 → 3 | 85 | 2 | 720 (404) |
| /platform/ask/[threadId] | 18 → 1 | 71 | 2 | 707 (404) |
| /platform/knowledge | 18 → 1 | 63 | 1 | 706 (404) |
| /platform/waitlist | 22 → 2 | 62 | 2 | 706 (404) |
| /platform/verticals | 21 → 2 | 64 | 2 | 699 (404) |
| /platform/reviews | 23 → 3 | 68 | 1 | 698 (404) |
| /platform/costs | 14 → 3 | 76 | 1 | 691 (404) |
| /platform/billing | 16 → 4 | 64 | 2 | 684 (404) |
| /agency/clients/new | 7 → 3 | 41 | 3 | 678 |
| /platform/health | 18 → 3 | 101 | 1 | 678 (404) |
| /platform/topics | 22 → 3 | 53 | 2 | 675 (404) |
| /platform/ask | 18 → 1 | 60 | 1 | 673 (404) |
| /platform/runbook | 22 → 3 | 64 | 2 | 667 (404) |
| /platform/help | 22 → 2 | 62 | 1 | 663 (404) |
| /platform/agencies | 22 → 3 | 69 | 2 | 662 (404) |
| /agency/prospects/new | 7 → 3 | 32 | 3 | 661 |
| /c/[clientId]/setup/competitors (307) | 6 → 3 | 39 | 4 | 659 (307) |
| /platform/leads | 21 → 1 | 68 | 1 | 654 (404) |
| /platform | 23 → 3 | 75 | 2 | 646 (404) |
| /paused (307) | 10 → 6 | 31 | 4 | 570 (307) |
| /onboarding (307) | 5 → 3 | 31 | 3 | 397 (307) |
| /agency/prospects/[clientId] | 14 → 3 | 60 | — | — |
| /c/[clientId]/alerts/[alertId] | 8 → 4 | 69 | — | — |
| /c/[clientId]/reports/[reportId] | — → 4 | 79 | — | — |
| /platform/agencies/[id] | 10 → 3 | 113 | — | — |
| /platform/knowledge/[id] | 22 → 2 | 62 | — | — |
</details>

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
