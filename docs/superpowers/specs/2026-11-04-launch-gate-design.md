# Launch gate — page DB stages ≤ 8 (design)

**Date:** 2026-11-04 · **Branch:** `launch-gate` · **Gates:** 7a1 Task 12 (live deploy) · **Brief:** `docs/work/launch-gate.md`
**References:** 7a spec `2026-10-19-phase-7a-launch-production-security-design.md` §2 D7 (latency budget), §3 (profiler). Not restated here.

## Intent
Before the first live deploy, every web page must reach the database in at most **8 sequential stages** (a stage = one group of overlapping/touching query spans, `sequentialStages()` in `apps/web/src/server/tool-timing.ts`). On Neon each stage costs ~50 ms, so today's shell (~12, max 22) and platform pages (19–20) spend 0.6–1 s waiting on round trips before any page work. The gate keeps first-pilot pages inside D7's p75 ≤ 1.5 s.

**Goals**
- Every crawlable `(app)` and `(platform)` page, plus `c/[clientId]/ask/[threadId]`, `platform/ask/[threadId]`, `c/[clientId]/reports/[reportId]` and `kb/[id]`, passes `--assert-db-stages 8 --strict-routes` on the local test cluster.
- The previously invisible round trips (Better Auth session lookup, BEGIN/COMMIT, tagged `sql`) are measured and reported.
- One latency run on Neon dev and one on staging, recorded (measurement only).

**Non-goals**
- No caching across requests (AccessContext is rebuilt each request; binding).
- No Better Auth `cookieCache` (a revoked session would stay valid ~5 min). Revisit only if a later measurement needs it.
- No CI job for the gate in this branch (backlog).
- No page redesign or copy change; output HTML stays the same.

**Anti-goals** (failure even if the number passes)
- A tenant-scoping or RLS shortcut to save a round trip (e.g. reading outside `withTenant`, merging two tenants' reads).
- Losing an audit row, or auditing a write or a support-session call later than today.
- A refusal that stops returning 404.

## Decisions (agent's calls; owner skipped the questions and accepted the brief's recommendations, 2026-11-04)
- **D1 One branch**, three task groups: app shell → platform + `list_platform_costs` → the four parameterised pages + Better Auth timing. One baseline at the start, one gate run at the end.
- **D2 Read audits off the critical path.** A successful **read** tool called from the **web** channel, **outside a support session**, writes its audit row after the response via Next `after()`. Writes, failed calls, MCP/Ask/worker channels and every support-session call keep today's awaited insert. Badge/count reads that carry no tenant data (nav counts, unread count, onboarding status) become `audit: 'skip-web'` where they aren't already.
- **D3 Session lookup:** left as is; only measured (Better Auth pool instrumented under `PROFILE_TOOLS`).
- **D4 Shell collapse:** first run the shell's independent reads together with `Promise.all` after viewer resolution; add one `get_shell_context` tool only if a shell page is still over 8 after that.
- **D5 Gate counting:** the gate number (8) counts drizzle query stages as in 7a (comparable). Better Auth and BEGIN/COMMIT stages are reported in separate columns, not asserted.
- **D6 Enforcement:** a manual pre-deploy run (command + table pasted into the work file and DEPLOY.md checklist); a CI job goes to the backlog.
- **D7 Database:** the stage count is taken on the local test cluster (5444) with the E2E/demo seed (deterministic). Latency (p75, max per page) is measured once on Neon dev and once on staging and recorded.
- **D8 Bar:** ≤ 8 for every page, operator pages included, with `--strict-routes` so no route is skipped silently.

## Interfaces (binding)

### Tool registry (`@cs/core` `tools.ts`)
```ts
export interface InvokeOptions {
  /** Web only: run a successful read's audit insert after the response. Absent ⇒ awaited (today). */
  deferAudit?: (task: () => Promise<void>) => void;
}
ToolRegistry.invoke(ctx, name, input, opts?: InvokeOptions)
```
Rules: deferral applies only when the tool is a read (the registry's existing read/write marker; plan verifies its name), the call succeeded, `ctx.channel === 'web'` and the context has no support session. A deferred insert that throws is reported with `reportError` and never surfaces to the user. `apps/web/src/server/tools.ts` passes `deferAudit: (t) => after(t)`; `runTool` never passes it.

### Billing snapshot (`apps/web/src/server/billing-state.ts`)
`billingSnapshotOf` reads `agency_billing` and the hold state in **one** query (join or two selects in one `Promise.all`); return type unchanged.

### Platform costs (`@cs/tools` `platform/costs/read.ts`)
`loadCostState` reads all services in **at most 2 queries** after the first (grouped by service), replacing the 2-per-service loop. `list_platform_costs` output unchanged (snapshot-tested).

### Shell (`components/shell/app-shell.tsx`, `(app)/layout.tsx`, `(platform)/layout.tsx`)
After `viewerWith`/`requireContext`, independent reads (`themeForViewer`, `list_clients`, client name, unread count, platform role, client billing notice, `get_spend_status`, nav counts, `verticalOptions`, platform `list_platform_costs` + `get_ai_guard_state`) start together. Data each read depends on (e.g. client name needs the client id from the path) is passed in, not re-read. Optional, only if needed: tool `get_shell_context` (read, `skip-web`, `ISOLATION_FIXTURES` entry; out-of-scope client ⇒ `not_found`).

### Profiler (`apps/web/scripts/profile-pages.ts`, `server/db-timing.ts`, `server/auth.ts`)
- Under `PROFILE_TOOLS=1` only: the Better Auth `pg` Pool's `query` is wrapped to emit `db` spans tagged `source: 'auth'`; BEGIN/COMMIT and tagged `sql` round trips emit spans tagged `source: 'tx'` / counted like other queries.
- Report columns per page: `dbStages` (asserted, drizzle queries as in 7a), `authStages`, `txStages`, `wallMs`. `--assert-db-stages` asserts `dbStages` only.
- `--param` values for the four routes come from the seed (plan: a small `profile-params` helper reading ids from the E2E/demo seed so the run is one command).

## What's left to the builder
Exact grouping of shell reads; whether the billing snapshot is a join or a parallel pair; how seed ids are found; which further reads become `skip-web` (each must hold no tenant data beyond counts).

## Verification
- Unit: registry deferral rules (read+web+no support ⇒ deferred; write / support / non-web / failure ⇒ awaited), `loadCostState` query count and unchanged output, `billingSnapshotOf` unchanged result.
- Gate: `PROFILE_TOOLS=1` local run, `--assert-db-stages 8 --strict-routes` with the four params, before/after table in the work file.
- Latency: same crawl against a local `next start` on Neon dev (spans + wall time), and against staging by wall time only (`PROFILE_TOOLS` stays local-only), no assert; p75 + max recorded.
- `pnpm test:affected` + `e2e:affected` at the final review.
