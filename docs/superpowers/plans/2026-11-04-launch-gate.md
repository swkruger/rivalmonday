# Launch gate (page DB stages ≤ 8) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every web page reaches the DB in ≤ 8 sequential stages (`--assert-db-stages 8 --strict-routes`), with the hidden round trips measured, before 7a1 Task 12.
**Architecture:** Measure first (profiler gains auth/tx columns and a one-command local gate), then remove stages: read audits after the response, one-stage billing snapshot, parallel shell reads, grouped platform-cost queries; fix any page still over; record latency on Neon dev + staging.
**Tech stack:** Next.js App Router (`after()` from `next/server`), drizzle + postgres-js, `pg` (Better Auth), vitest, Playwright crawler `scripts/profile-pages.ts`.
**Spec:** `docs/superpowers/specs/2026-11-04-launch-gate-design.md` (D1–D8).

## Global constraints
- Output HTML, tool outputs, refusals (404) and RLS scoping unchanged; no caching across requests.
- `PROFILE_TOOLS` stays local-only; instrumentation is a no-op when it is unset.
- Writes, failed calls, non-web channels and every support-session call keep the **awaited, fail-closed** audit insert.
- A new tool ⇒ `ISOLATION_FIXTURES` entry; out-of-scope client ⇒ `not_found`.
- Read `docs/gotchas-cross-cutting.md` and `apps/web/CLAUDE.md`, `packages/core/CLAUDE.md`, `packages/tools/CLAUDE.md` before coding. LF only. Commits end with the `Co-Authored-By` line from root CLAUDE.md (your own model).

## Decisions
Spec D1–D8. Plan-level: deferral rides on the existing `CallOptions` (no new `invoke` parameter); a deferred audit insert that fails is reported (`reportError` + console) and cannot fail the already-sent response (accepted trade-off for successful web reads only).

## File structure
- `packages/core/src/tools.ts` — `CallOptions.deferAudit`, deferral rule.
- `apps/web/src/server/tools.ts` — pass `deferAudit` via `after()` in `invokeTimed` (reads path only).
- `apps/web/src/server/db-timing.ts`, `server/auth.ts`, `scripts/profile-pages.ts`, `scripts/profile-args.ts` — auth/tx spans, columns, `--params-from-seed`.
- `apps/web/scripts/profile-gate.sh` (new) — one-command local gate (build, `PROFILE_TOOLS=1 next start`, crawl, stop).
- `apps/web/src/server/billing-state.ts`; `components/shell/app-shell.tsx`; `app/(app)/layout.tsx`; `app/(platform)/layout.tsx`; `packages/tools/src/platform/costs/read.ts`; the four pages as needed.
- Docs: work file (tables), `docs/DEPLOY.md` § Checklist, `apps/web/CLAUDE.md` (gate recipe), BACKLOG item for the CI job (at merge).

## Dependencies on in-flight work
None (`git branch --no-merged main` empty at kickoff). Re-check in Task 0.

## Review focus
1. A support-session read, a write, an MCP/Ask call or a failed read must still audit **before** returning (deferral leaks here = lost audit trail).
2. Parallelised shell reads must not run a tenant read before the viewer/access check that guards it (a refusal must still 404 before any tenant data is read).
3. `after()` outside a request scope (scripts, tests, worker) must not throw — web-only wiring, registry default awaited.
4. `loadCostState` grouping must keep per-service results identical for services with zero rows.
5. The gate must not pass by skipping routes (`--strict-routes`, four `--param` routes present in the table).

---

### Task 0: Pre-flight
- [ ] `git fetch -q origin && git rebase main`; `git branch --no-merged main` (expect only `launch-gate`); re-read the brief § 2 paths and confirm each still exists (`git grep -n "billingSnapshotOf\|loadCostState\|sequentialStages" -- apps packages`). Note drift in the work file.

### Task 1: Profiler — hidden round trips, seed params, one-command gate, baseline
**Goal:** measure everything; produce the before table.
**Files:** modify `apps/web/src/server/db-timing.ts`, `apps/web/src/server/auth.ts`, `apps/web/scripts/profile-pages.ts`, `apps/web/scripts/profile-args.ts`; create `apps/web/scripts/profile-gate.sh`; tests next to `profile-args`/`db-timing` (follow existing `*.test.ts` there).
**Interfaces:**
- `ToolTiming` db spans gain `source?: 'app' | 'auth' | 'tx'` (absent ⇒ `'app'`).
- `instrumentPgPool(pool: Pool): Pool` in `db-timing.ts` — wraps `pool.query` (and client `query` from `pool.connect`) to write `source: 'auth'` spans; called in `auth.ts` only when `profilingOn()`.
- postgres-js `begin`/`commit` and tagged `sql` round trips write `source: 'tx'` spans (extend `instrumentSql`).
- Report row: `{ route, path, status, wallMs, dbStages, authStages, txStages }`; `dbStages` = `sequentialStages(app spans)` exactly as today; `--assert-db-stages N` asserts `dbStages` only.
- `--params-from-seed`: fills `clientId`, `threadId` (client Ask + platform Ask), `reportId`, `id` (kb) from the E2E seed (read via the service URL; follow `e2e/` fixture readers). `--param` still overrides.
- `profile-gate.sh [--db local|neon-dev]`: builds, starts `PROFILE_TOOLS=1 next start -p 3100`, waits for `/health`, runs `profile:pages --params-from-seed --strict-routes --assert-db-stages 8 --json .profile/gate.json`, stops the server; exit code = crawler's.
**Behaviour:** auth/tx columns are reported, never asserted (D5). Unknown source ⇒ `app`.
**Tests (TDD):** `sequentialStages` ignores `auth`/`tx` spans for `dbStages`; `parseProfileArgs` accepts `--params-from-seed` and `--json`; `instrumentPgPool` records one `auth` span per query and passes results through unchanged; profiling off ⇒ pool returned untouched.
**Done when:** focused tests pass; `bash apps/web/scripts/profile-gate.sh` runs on the local cluster with the E2E seed (expected to FAIL the assert at baseline); the per-page **before** table (route, dbStages, authStages, txStages, wallMs) is pasted into `docs/work/launch-gate.md` § Baseline; recipe in `apps/web/CLAUDE.md`. Commit.

### Task 2: Read audits off the critical path
**Goal:** successful web reads stop adding an audit stage.
**Files:** `packages/core/src/tools.ts`, `packages/core/src/tools.test.ts` (or the existing registry test file), `apps/web/src/server/tools.ts`, tool definitions that become `skip-web`.
**Interfaces:**
```ts
export interface CallOptions { channel: ToolChannel; tokenId?: string; tokenScope?: TokenScope;
  /** Web reads only: run the audit insert after the response (Next `after`). Ignored unless the rule below holds. */
  deferAudit?: (task: () => Promise<void>) => void }
```
Rule (security-sensitive, exact):
```ts
const defer = opts.deferAudit && opts.channel === 'web' && !ctx.support && tool?.access !== 'write' && outcome === 'ok';
```
When `defer`: `opts.deferAudit(async () => { try { await this.audit.record(event) } catch (err) { console.error('[tools] deferred audit write failed', err); this.options.onDeferredAuditError?.(err) } })` and return without awaiting. Otherwise today's awaited, fail-closed path unchanged. `ToolRegistryOptions.onDeferredAuditError?: (err: unknown) => void` (web passes `reportError`). The audit event (incl. `durationMs`) is built before deferring.
- Web: `invokeTimed` passes `{ channel: 'web', deferAudit: (t) => after(t) }`; `runTool` unchanged.
- `skip-web`: nav count tools, unread count, `get_spend_status`, `get_onboarding_status` — only where the output is counts/flags without tenant rows; list which in the commit message.
**Tests (TDD):** deferred when read+web+ok+no support (audit sink not called before `invoke` resolves, called once after flushing the deferred task); awaited for: write tool, `ctx.support` set, channel `mcp`/`ask`, outcome ≠ ok (failed read), `deferAudit` absent; awaited audit failure still throws `internal`; deferred audit failure calls `onDeferredAuditError` and does not reject.
**Done when:** `pnpm --filter @cs/core exec vitest run tools` and `pnpm --filter @cs/web exec vitest run server/tools` pass; tsc clean for core + web. Commit.

### Task 3: One-stage billing snapshot
**Files:** `apps/web/src/server/billing-state.ts` + its test.
**Interfaces:** `billingSnapshotOf` signature and return unchanged; `agency_billing` and hold state read in one stage (one query or `Promise.all`), still `cache()`d.
**Tests:** existing billing-state tests pass unchanged; new: on hold + billing row ⇒ same snapshot as before; no billing row ⇒ same as before.
**Done when:** focused tests pass. Commit.

### Task 4: Parallel app shell
**Goal:** `(app)` pages ≤ 8 db stages.
**Files:** `apps/web/src/components/shell/app-shell.tsx`, `apps/web/src/app/(app)/layout.tsx` (+ their tests).
**Behaviour:** after viewer/context resolution, start every independent read together (spec § Shell list); values one read needs from another are passed in (client id from the path, viewer/role already resolved), not re-read. Admin-only `get_onboarding_status` joins the same batch; `mark_onboarding_redirected` (a write) stays after it. Rendered output identical. **Follow pattern:** `navCounts` (already `Promise.all`).
**Tests:** existing shell/layout tests pass; add one asserting the shell renders the same props when one decorative read returns `null` (tryCallTool) — degrade, not fail.
**Done when:** focused tests pass; `profile-gate.sh` shows every `(app)` route ≤ 8 `dbStages` (paste the rows). If any `(app)` route is still > 8, stop and report it — Task 6 decides on `get_shell_context`. Commit.

### Task 5: Platform layout and costs
**Files:** `apps/web/src/app/(platform)/layout.tsx`; `packages/tools/src/platform/costs/read.ts` + its test.
**Interfaces:** `loadCostState` returns the same shape; after the first read, at most **2** more queries total (grouped by service, e.g. `WHERE service = ANY($1)` / `GROUP BY service`), services with no rows still present with today's empty values. Layout: `platformRole` result feeds the owner-only `list_platform_costs` and `get_ai_guard_state`, which run together with the shell batch.
**Tests (TDD):** `loadCostState` issues ≤ 3 queries for 6 services (spy on the db handle); output equals today's for a fixture with one service empty and one with several snapshots (snapshot from the current implementation first).
**Done when:** focused tests pass; gate rows for `/platform/**` ≤ 8. Commit.

### Task 6: Remaining pages (and `get_shell_context` only if needed)
**Goal:** the four parameterised routes and any route still over 8 pass.
**Files:** per page: `c/[clientId]/ask/[threadId]` (`ask-screen.tsx`), `platform/ask/[threadId]/page.tsx`, `c/[clientId]/reports/[reportId]/page.tsx` (`loadReport` then `helpGuides` → together), `kb/[id]/page.tsx`.
**Behaviour:** same technique (independent reads together after the page's access gate; the gate read itself stays first so refusals 404 before tenant reads). `platform/ask/[threadId]`: `requireOperatorContext` first, then the thread read with the other three.
- Only if an `(app)` shell route is still > 8 after Task 4: add read tool `get_shell_context` in `@cs/tools` (`access: 'read'`, `audit: 'skip-web'`, returns the shell's decorative data in one `withTenant`), `ISOLATION_FIXTURES` entry, out-of-scope client ⇒ `not_found`; record the choice in the work file Decisions.
**Tests:** existing page tests pass; for each changed page, a refusal test (wrong client / non-operator) still 404s.
**Done when:** `bash apps/web/scripts/profile-gate.sh` exits 0 (all routes ≤ 8, four param routes present). Paste the **after** table into the work file. Commit.

### Task 7: Latency runs and docs
**Files:** `docs/work/launch-gate.md`, `docs/DEPLOY.md` § Checklist, `apps/web/CLAUDE.md`.
- `profile-gate.sh --db neon-dev` (local `next start` against Neon dev `cs_dev`, no assert): record p75 and max wall time, mean ms per stage.
- Staging: `pnpm --filter @cs/web profile:pages --base https://staging.rivalmonday.app --cookie FILE --strict-routes` (wall time only; the owner provides a signed-in cookie file or the agent signs in with the staging admin used for E2E-on-staging if one exists — ask first, never print it). Record p75 and max.
- DEPLOY.md checklist: "before Task 12: `bash apps/web/scripts/profile-gate.sh` exits 0" replaces the "backlog gate" sentence. Work file New backlog: CI job (spec D6); any page > 3 s on staging.
**Done when:** numbers in the work file; docs committed.
