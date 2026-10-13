# phase-8 — Platform admin console (agency list, growth, activity; read-only agency view)

**Kind:** feature   **Worktree:** ../CompetitorSpy-wt/phase-8   **Base:** main @ 5aedcb6
**Plan/spec:** 8a spec `docs/superpowers/specs/2026-10-12-phase-8a-platform-console-design.md` (d1–d9); 8a plan `docs/superpowers/plans/2026-10-12-phase-8a-platform-console.md` (P1–P5, Tasks 0–9). New phase, not yet in the roadmap.

## Status (overwrite)
**8a complete 2026-10-13** — Tasks 0–9 + final-review fix wave done (subagent-driven, every task reviewed; final whole-branch review → 2 fixes applied, re-review clean). `test:affected --base main`: only failure is the pre-existing engine date time-bomb (see backlog); `e2e:affected` 44/45, `smoke.spec:41` timeout flake passed on re-run; `@platform` 4/4. Ready for `/rm-merge` (owner go-ahead). Test DB `cs_phase_8_test`. 8b not brainstormed.

## Next (overwrite)
1. Owner: verification steps below, then `/rm-merge phase-8` (full unit + E2E suite there).
2. Then 8b brainstorm (Brief §6 Q2, Q8) via `/rm-kickoff phase-8b` (work file exists on main).

## Interfaces this branch adds or changes
- Migrations **0047** `platform_console` (tables `platform_admin`, `agency_daily_stat`, `platform_audit_log`) + **0048** RLS (FORCE RLS, no policies, `app_user` revoked, audit log append-only). Next free **0049**.
- `@cs/tools`: `PlatformRole`, `platformRole`, `isPlatformOperator`, `requirePlatformOperator(deps, ctx, min?) → PlatformRole` (env list = owner; `platform_admin` rows; guests never). `recordPlatformAudit`, `withPlatformAudit`; `bucketSeries`; `healthFlag`; `computeAgencyDay`/`upsertDailyStats(db, rows, {reconstructOnly})`/`runDailyStats`, `SESSION_ACTIVITY_AT`, `addDays`, `utcDay` exported. `ACTIVATION_TOOLS` in `prospects.ts`.
- `@cs/core`: `hashInput` now exported.
- Tools (web-only, `audit: 'skip-web'`): `platform_overview`, `list_platform_agencies`, `get_platform_agency` (audits into target agency `audit_log`, role `platform_<role>`), `list_platform_activity`.
- `navFlagsFor(v, isPlatformOperator: boolean, …)`; layout resolves the flag via `isPlatformOperator` (one DB query per request).
- Job `platform-daily-stats` (cron `0 2 * * *`, backfills ≤ 400 days when table empty). CLI `pnpm --filter @cs/worker platform-admin add|revoke|list`.
- Routes `/platform`, `/platform/agencies`, `/platform/agencies/[id]`, `/platform/health` (placeholder). E2E tag `@platform`.

## Decisions (owner-approved)
- Split 8a (list + growth/activity) / 8b (drill-down). Console will later host agency management (add/delete/suspend), agency comms, income statement.
- Spec d1–d9 binding: `platform_admin` table (owner|staff|viewer) + env list as permanent owners; nightly `agency_daily_stat`; service-role reads behind `requirePlatformOperator`; no writes in 8a; health tab placeholder; names/statuses only; all platform reads audited.
- Controller rulings (execution, reversible): activity/WAU/sign-in = `greatest(session.createdAt, updatedAt)` (spec said "created"; daily-refreshed sessions hid daily users); agencies < 28 d never at_risk; health sign-in = agency roles only; backfill fills only NULL columns; platform tools audit once (skip-web), refusals unaudited; offset paging for activity; growing pill ink text on #47A8E7; delivered alerts count even if event later retracted.

## New backlog (target → item)
- Polish (high) → engine `score-stage.test.ts` date time-bomb: fixture dates fixed 2026-10, `scoreEvent` ages vs real clock → pass `now` (fails on main and every branch).
- Unscheduled → activity `client_activated` lacks `clientName` (record activation, e.g. `client.activated_at`); `list_platform_activity` loads all sources per call (bound/paginate in SQL); agencies list silently capped at 100 (paging or notice).
- Polish → stats: `wau`/`last_activity_at` ignore `membership.created_at`; `runDailyStats` accepts today/future `day`; backfill is 400×agencies sequential queries.
- Polish → console: name sort `<` vs `localeCompare`; spend delta "up" tone; duplicate "Overview" nav labels ("Platform overview"); unused `email?` in `nav.ts` viewer type.
- Polish → tests: CLI add/revoke SQL; 27/28-day health boundary; `tilesOf` ms28 filter + NULL-last sort; agency-cascade/`relforcerowsecurity` asserts; page-level tests; E2E audit before/after count.

## Owner verification steps
1. `pnpm demo:reset` → sign in as the demo operator → `/platform`: tiles, three charts (90 days), activity feed; `12w/12m` toggle.
2. `/platform/agencies` → sort headers, health pill colours (check pill contrast in the browser), open an agency → detail, "Agency management is coming soon.".
3. As a plain agency admin: `/platform`, `/platform/agencies`, `/platform/health` → 404; no Platform nav items.
4. `pnpm --filter @cs/worker platform-admin add <email> --role staff` → that user sees the console; `revoke` → 404.
5. Optional (cs_dev): run the worker once → `agency_daily_stat` backfilled; re-run → no duplicates.

## Brief

### 1. Scope (owner's words; no roadmap row)
"A platform admin level dashboard and related pages, showing agency list, agency growth and activity. Read only access to agency level."
- **Spec §3:** hierarchy Platform → Agency → Client; the Platform tier has no role/screens yet — this phase gives it a console.
- **Agency list:** clients (active/prospect), seats by role, created, last activity, spend.
- **Growth:** agencies / clients / seats over time (inline SVG, `LineChart`).
- **Activity:** sign-ins, briefs/alerts sent, prospects, Ask/MCP use, spend (§7.5 ledgers).
- **Read-only agency drill-down:** what the agency admin sees in §5.1 (portfolio, usage & limits, team, branding), no writes.
- **Seams for 9–11 (don't design):** agency status/plan (pilot/trial/paid/suspended) owned by Phase 9; growth metrics billing (seats, MRR) can feed; agency list as where Phase 10 onboarding lands. §10.6 MVP billing = metering only; §2.2 Stripe/agency onboarding = "Phase 2 (wholesale)".

### 2. Already built — reuse, don't rebuild
- **Operator gate:** `PLATFORM_ADMIN_EMAILS` → `apps/web/src/server/env.ts`, `runtime-env.ts` `platformAdmins(name)` (+`DEMO_OPERATOR_EMAIL` in DEMO/TEST), `packages/core/src/platform.ts`, `packages/tools/src/platform.ts` `isPlatformOperator`/`requirePlatformOperator` (no guests; → 404). Nav flag `isPlatformOperator` (`server/nav.ts`, `shell/nav-items.ts`). E2E operator `admin@e2e.test`.
- **Operator pages:** `/platform/reviews`, `/platform/themes` (`apps/web/src/app/(app)/platform/`); tools in `tools/src/tools/model-ops.ts`, `themes.ts` = `requirePlatformOperator` then `deps.service` (cross-agency) — the pattern to mirror.
- **Auth/access:** Better Auth (`server/auth*.ts`, schema `auth`); `membership`/`invitation` (`db/src/schema/access.ts`, service role only); `AccessContext` (`core/src/access.ts`) rebuilt per request (`server/current-viewer.ts`).
- **Tools/tenancy:** `tools/src/{registry,deps}.ts`, `tools/all.ts`; `server/run-tool.ts`, `server/tools.ts`, `perEnv`; `withTenant` (`db/src/tenant.ts`).
- **Data:** `agency` (`id, name, branding, created_at` — no status/plan), `client.status`/`monthly_cap_usd` (`schema/tenancy.ts`); `audit_log` (index `(agency_id, created_at)`), `llm_call`, `vendor_call` (`schema/ledger.ts`); `auth.session`.
- **Agency views:** `/agency` (`get_portfolio`), `/agency/usage` (`get_usage`, `tools/src/usage.ts`), `/agency/team`, `/agency/branding`. UI: `components/stat-card.tsx`, `charts/line-chart.tsx`, `spend-badge.tsx`, `client-lists.tsx`.
- **Demo:** `cs_demo` seed; register screens in `packages/demo/src/coverage.ts`; dev panel `apps/web/src/dev-panel/`.

### 3. Binding decisions (do not re-open)
- Every web read/write is a registered `@cs/tools` tool, audit-logged; writes via `runTool`; server actions don't pre-check roles. Page refusals → 404, never 403.
- Operator tier = `PLATFORM_ADMIN_EMAILS` checked by `requirePlatformOperator` per call (5b-2 decision 2); sidebar section cosmetic.
- RLS tenancy via `withTenant`; service role only where needed. Self-hosted Better Auth; access in our own `membership` table (no Better Auth `organization` plugin).
- Charts hand-written inline SVG (`LineChart`, ≤ 5 series; dataviz skill).
- `upsell_tag` never client-facing; `retracted_at IS NULL`; no jobs in DEMO/TEST.
- phase-6 6b e5/Q8: Ask threads are author-only; platform review only where `client.ask_review_allowed`, every view audit-logged.

### 6. Open questions left for 8b (Q1, Q3–Q7 decided in the 8a spec)
2. **Read-only agency access = what?** (a) separate `/platform/agencies/<id>` pages built from the same tools (portfolio, usage, team, branding summary), no client workspaces; (b) "view as agency": render existing `/agency` + `/c/<id>` pages in a read-only operator mode (all writes refused); (c) (b) plus client workspaces. **Rec: (a)**, workspaces later if needed; every drill-down view audit-logged.
8. **Privacy of client data seen by admins:** (a) aggregates + names only (no evidence, briefs, Ask, reviewer data); (b) full read like an agency admin, audited; (c) per-agency consent toggle. **Rec: (a)** for 8a; decide (b)/(c) with Q2.
