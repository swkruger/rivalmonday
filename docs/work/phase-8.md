# phase-8 — Platform admin console (agency list, growth, activity; read-only agency view)

**Kind:** feature   **Worktree:** ../CompetitorSpy-wt/phase-8   **Base:** main @ 5aedcb6
**Plan/spec:** 8a spec `docs/superpowers/specs/2026-10-12-phase-8a-platform-console-design.md` (d1–d9); 8a plan `docs/superpowers/plans/2026-10-12-phase-8a-platform-console.md` (P1–P5, Tasks 0–9). New phase, not yet in the roadmap.

## Status (overwrite)
8a **execution started 2026-10-13** (subagent-driven; phase-6 merged at `5aedcb6`). Test DB `cs_phase_8_test` on the local cluster. 8b (read-only agency drill-down, client-data privacy) not brainstormed.

## Next (overwrite)
1. Task 0 pre-flight (re-check phase-6 assumptions against the code; next free migration `0047`), then Tasks 1–9.
2. 8b brainstorm after 8a (Brief §6 Q2, Q8).

## Interfaces this branch adds or changes
None yet. Planned (8a): tables `platform_admin`, `agency_daily_stat`, `platform_audit_log` (service role only; next free migration `0047`); `PlatformRole`, `platformRole`, `requirePlatformOperator(deps, ctx, min?)`; `navFlagsFor(v, isPlatformOperator: boolean)`; tools `platform_overview`, `list_platform_agencies`, `get_platform_agency`, `list_platform_activity`; job `platform-daily-stats`; routes `/platform`, `/platform/agencies[/id]`, `/platform/health`; CLI `platform-admin`; E2E tag `@platform`.

## Verified at pre-flight 2026-10-13 (replaces "Assumes")
- phase-6 merged (main @ 5aedcb6); no rebase needed. Next free migration **0047** (dir `packages/db/migrations/`; 0048 for RLS). Roles `app_user`/`app_service`; default privileges grant both, so revoke app_user.
- `requirePlatformOperator(Pick<ToolDeps,'service'|'platformAdmins'>, ctx): Promise<void>`, env-email only; 14 call sites. `navFlagsFor(v, platformAdmins[], assistantName)` today (plan Task 2 changes it to boolean); operator nav items live in the `account` group, no Platform section.
- `audit_log.role` is plain text (no CHECK); `channel` CHECK web|mcp|ask. `AuditEvent.role` is typed `Role` so `recordPlatformAudit` inserts into `auditLog` directly; `hashInput` is private in `core/src/tools.ts`.
- Paging: `tools/src/paging.ts` offset cursors (`pageOf`, `pageResult`); `ACTIVATION_TOOLS=['convert_prospect']`; brief/alert have no `retracted_at`; membership is multi-row per user; `auth.session` columns camelCase.
- Worker jobs are listed in `apps/worker/src/main.ts`; worker and demo already depend on `@cs/tools`.

## Decisions (owner-approved)
- Split 8a (list + growth/activity) / 8b (drill-down). Console will later host agency management (add/delete/suspend), agency comms, income statement.
- Spec d1–d9 binding: `platform_admin` table (owner|staff|viewer) + env list as permanent owners; nightly `agency_daily_stat`; service-role reads behind `requirePlatformOperator`; no writes in 8a; health tab placeholder; names/statuses only; all platform reads audited.

## New backlog (target → item)
None yet.

## Owner verification steps
TBD.

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

### 4. Backlog to fold in
None on platform admin/impersonation/agency management. Adjacent:
- [ ] 5b-2 minors: `resolve.test.ts` lock poll; `reviewQuestions` drops unknown keys silently; malformed `PLATFORM_ADMIN_EMAILS` no warning; `enqueue` ignores null `send()`; prospect report "as of" dates; test gaps — *from 5b-2 Tasks 2–12*
- [ ] Usage page has no empty state for a zero-client agency; `list_alert_queue`'s `.limit(200)` gives no UI hint — *from 5b-2 Task 4, 5b-1 Task 12*

### 5. In-flight workstreams
`phase-6` (code; 0038–0043) and `phase-7-planning` (docs, parked). See **Assumes from other branches**; expect conflicts in `nav-items.ts`, `server/nav.ts`, `tools/all.ts`, `deps.ts`, `platform.ts`. Next free migration at execution time, currently ≥ `0043`.

### 6. Open questions for the owner
1. **Split?** (a) 8a agency list + growth/activity metrics, 8b read-only agency drill-down; (b) one phase; (c) 8a also folds in 7a's health page. **Rec: (a)** — drill-down carries the privacy/tenancy decisions.
2. **Read-only agency access = what?** (a) separate `/platform/agencies/<id>` pages built from the same tools (portfolio, usage, team, branding summary), no client workspaces; (b) "view as agency": render existing `/agency` + `/c/<id>` pages in a read-only operator mode (all writes refused); (c) (b) plus client workspaces. **Rec: (a)**, workspaces later if needed; every drill-down view audit-logged.
3. **Identifying platform admins:** (a) keep `PLATFORM_ADMIN_EMAILS` (exists, used by 5b-2/6b/7a); (b) `platform_admin` table/flag on `auth.user`; (c) Better Auth admin plugin. **Rec: (a)** now; (b) only if Phase 10 needs in-app admin invites.
4. **Tenancy bypass:** (a) service role inside `requirePlatformOperator` tools (existing pattern); (b) dedicated RLS policies keyed on an `app.platform_admin` GUC; (c) a read-only `platform_ro` DB role. **Rec: (a)**, with an explicit column allow-list per read.
5. **Growth/activity metrics & source:** (a) live aggregate queries over `agency`/`client`/`membership`/`audit_log`/ledgers/`auth.session`; (b) nightly `agency_daily_stat` snapshot table (history of seats/clients, cheap charts, billing can feed it); (c) (a) now, (b) in Phase 9. **Rec: (b)** — history isn't reconstructible from current rows. Confirm metrics: agencies, clients, seats, WAU, briefs/alerts sent, Ask, MCP calls, spend.
6. **Write actions:** (a) none (pure read-only); (b) minimal: agency status (pilot/active/suspended) + notes; (c) also create agency/invite admin. **Rec: (a)**, but add a nullable `agency.status`/`plan` seam only if Phase 9 confirms it; suspend/create belong to 9/10.
7. **7a health page:** (a) keep in 7a; (b) build `platform_health` here as a console tab; (c) leave a placeholder tab. **Rec: (c)** — 7a's tool needs worker/queue work out of scope here.
8. **Privacy of client data seen by admins:** (a) aggregates + names only (no evidence, briefs, Ask, reviewer data); (b) full read like an agency admin, audited; (c) per-agency consent toggle. **Rec: (a)** for 8a; decide (b)/(c) with Q2.
