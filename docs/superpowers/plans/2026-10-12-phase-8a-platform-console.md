# Phase 8a — Platform console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Lean plan format** (root `CLAUDE.md`): interfaces are binding; full code only where security-sensitive or SQL.

**Goal:** Platform operators get `/platform` (overview), `/platform/agencies` (list) and `/platform/agencies/[id]` (detail stub) showing agency growth and activity from a nightly snapshot, read-only and audited.

**Architecture:** New service-role tables `platform_admin`, `agency_daily_stat`, `platform_audit_log`; `platformRole` resolution in `@cs/tools/platform.ts`; a pg-boss job writes yesterday's stats per agency (backfill on empty table); four `@cs/tools` read tools gated by `requirePlatformOperator`; Next.js pages with existing `StatCard` / `LineChart`.

**Tech Stack:** TypeScript, Drizzle + Postgres (RLS), pg-boss, `@cs/tools` registry, Next.js App Router, Tailwind/shadcn, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-12-phase-8a-platform-console-design.md` (decisions d1–d9; read it in full before Task 1).

## Global constraints
- Read `docs/gotchas-cross-cutting.md` and the `CLAUDE.md` of every package touched before coding.
- All new tables: `ENABLE` + `FORCE ROW LEVEL SECURITY`, no policies, no `app_user` grants — service role only.
- Every platform tool's first statement: `await requirePlatformOperator(deps, ctx)`. Refusal = `permission_denied` → page 404, never 403. Unknown agency = `not_found` → 404.
- Read-only: no tool in this plan writes anything except audit rows. Only the nightly job writes `agency_daily_stat`.
- No client content in any platform payload (no evidence, briefs, Ask, reviews, reviewer data, `upsell_tag`). Client fields allowed: `id, name, status, createdAt`.
- "Active client" = `client.status = 'active'`; event readers filter `retracted_at IS NULL`.
- `NULL` = not measured; never coerce to 0 in job, tools or charts (charts draw gaps).
- Charts: hand-written inline SVG via existing `LineChart`, ≤ 5 series; validate the health-pill colours with the dataviz skill. Inter, brand tokens only.
- Migrations: next free number at execution time (≥ 0044 after phase-6); never edit applied migrations; `pnpm --filter @cs/db generate` then `--custom` for RLS.
- Jobs not scheduled in DEMO/TEST. Commits end with the Co-Authored-By line from root `CLAUDE.md`; LF only.
- Copy (decided): agency detail "Agency management is coming soon."; health tab "Platform health arrives with the deployment phase."; empty agency list "No agencies yet."; chart with no data "No history yet — figures appear after the first nightly run."

## Decisions (plan-local)
- **P1** `navFlagsFor` stays synchronous; the layout resolves `isPlatformOperator` via `isPlatformOperator(deps, ctx)` (async, cached per request with React `cache`) and passes the boolean in. Signature changes accordingly (Task 2).
- **P2** Stat computation lives in `packages/tools/src/platform/stats.ts` (pure SQL builders + `computeAgencyDay`), so the worker job and the demo seed share it. The job in `apps/worker/src/jobs/platform-stats.ts` only orchestrates.
- **P3** Series bucketing: `12w` → 12 ISO weeks ending yesterday, value = last day of week for level metrics (clients, seats, agencies), mean for `wau`, sum for flow metrics (spend, briefs, alerts); `12m` → 12 calendar months, same rules.
- **P4** Ask/MCP table presence: `to_regclass('public.ask_message')` / `to_regclass('public.audit_log')` + column `channel` check, once per job run.
- **P5** CLI `platform-admin` lives in `apps/worker/src/cli/platform-admin.ts` with arg parser `platform-admin-args.ts` (mirror `deliver-args.ts`), script `"platform-admin": "tsx src/cli/platform-admin.ts"`.

## File structure
- `packages/db/src/schema/platform.ts` (new) — three tables; export from schema index.
- `packages/db/drizzle/<n>_platform_console.sql` (generated) + `<n+1>_platform_console_rls.sql` (custom).
- `packages/tools/src/platform.ts` (modify) — `PlatformRole`, `platformRole`, `requirePlatformOperator(min)`.
- `packages/tools/src/platform/health.ts`, `stats.ts`, `series.ts`, `audit.ts` (new).
- `packages/tools/src/tools/platform-console.ts` (new) + `all.ts` (register).
- `apps/worker/src/jobs/platform-stats.ts` (new) + job list; `apps/worker/src/cli/platform-admin{,-args}.ts`.
- `apps/web/src/app/(app)/platform/page.tsx`, `agencies/page.tsx`, `agencies/[id]/page.tsx`, `health/page.tsx`, `_components/health-pill.tsx`, `_components/activity-feed.tsx` (new).
- `apps/web/src/server/nav.ts`, `components/shell/nav-items.ts`, `app/(app)/layout.tsx` (modify).
- `packages/demo/src/platform-stats.ts` (new), `coverage.ts`, `reset.ts` (modify); `apps/web/e2e/platform.spec.ts` (new).

## Dependencies on in-flight work
- **phase-6** must be merged first (or owner accepts stacking): it changes `packages/tools/src/platform.ts`, `tools/all.ts`, `deps.ts`, `nav-items.ts`, `server/nav.ts`, the registry (`channels`, `CallOptions`, audit `channel`/`tokenId`) and takes migrations 0038–0043. Re-check all of these in Task 0.
- phase-6 6b may add `/platform/ask` and service-role helpers in `platform.ts`; keep them and add the new nav entries alongside.
- phase-7-planning (parked): its `platform_health` replaces the Task 7 placeholder later. No code overlap.

## Review focus
1. A revoked `platform_admin` row or a guest (`contact:…`) must never see any platform page or tool result — including the nav section.
2. An operator listed in env **and** with a `viewer` row resolves to `owner` (env wins).
3. Agencies with zero clients / zero stat rows / younger than 28 days: tiles show values with `delta28d: null`, charts show the empty copy, health = `steady`; nothing throws.
4. Job re-run on the same day and backfill on a populated table must not double-count or overwrite measured `wau` with `NULL`.
5. Payload leaks: any platform tool returning a client column beyond `id, name, status, createdAt`, or anything from briefs/evidence/reviews.

---

### Task 0: Pre-flight
- [ ] `git rebase main` (phase-6 merged) — resolve conflicts in `platform.ts`, `all.ts`, `nav*.ts`.
- [ ] Re-check every "Dependencies on in-flight work" item against the code; note the next free migration number; fix file paths in this plan if they drifted; record changes in `docs/work/phase-8.md`.
- [ ] Find the exact tables/columns for: brief sent (`schema/briefs.ts` `sent_at`), alert delivered (`schema/delivery.ts` `delivered_at`), prospect reports (grep `schema/` for prospect report), Ask questions, MCP calls (`audit_log.channel = 'mcp'`). Write them into Task 4's Behaviour as notes.
- **Done when:** `pnpm test:affected` green on the rebased branch.

### Task 1: Schema + migrations
**Goal:** the three tables from spec § Data model, service-role only.
**Files:** create `packages/db/src/schema/platform.ts`; modify schema index; generated + custom migration.
**Interfaces:** Drizzle exports `platformAdmin`, `agencyDailyStat`, `platformAuditLog`; types `PlatformAdminRow`, `AgencyDailyStatRow`. Columns exactly as spec SQL (`spend_usd numeric(12,4)` → Drizzle `numeric(..., { mode: 'number' })` if supported, else string parsed in Task 4).
**Custom migration (full):**
```sql
ALTER TABLE platform_admin ENABLE ROW LEVEL SECURITY;      ALTER TABLE platform_admin FORCE ROW LEVEL SECURITY;
ALTER TABLE agency_daily_stat ENABLE ROW LEVEL SECURITY;   ALTER TABLE agency_daily_stat FORCE ROW LEVEL SECURITY;
ALTER TABLE platform_audit_log ENABLE ROW LEVEL SECURITY;  ALTER TABLE platform_audit_log FORCE ROW LEVEL SECURITY;
REVOKE ALL ON platform_admin, agency_daily_stat, platform_audit_log FROM app_user;
GRANT SELECT, INSERT, UPDATE ON platform_admin, agency_daily_stat TO app_service;
GRANT SELECT, INSERT ON platform_audit_log TO app_service;
```
(Mirror role names/grant style of the existing `membership` RLS migration; if `app_service` bypasses RLS via `BYPASSRLS`, keep that pattern.)
**Tests:** `packages/db` RLS test — `app_user` cannot select any of the three tables; partial unique index rejects two active rows for one user, allows a revoked + an active one.
**Done when:** `pnpm --filter @cs/db exec vitest run platform` passes.

### Task 2: Platform role resolution + nav + CLI
**Goal:** `platformRole` / `requirePlatformOperator(min)` per spec (code there is binding — security-sensitive); nav honours table rows; CLI adds/revokes admins.
**Files:** modify `packages/tools/src/platform.ts`, `platform.test.ts`, `apps/web/src/server/nav.ts` (+ test), `components/shell/nav-items.ts`, `app/(app)/layout.tsx`; create `apps/worker/src/cli/platform-admin.ts`, `platform-admin-args.ts` (+ test); add script to `apps/worker/package.json`.
**Interfaces:**
- `type PlatformRole = 'owner'|'staff'|'viewer'`; `platformRole(deps, ctx): Promise<PlatformRole|null>`; `isPlatformOperator(deps, ctx): Promise<boolean>`; `requirePlatformOperator(deps, ctx, min?: PlatformRole): Promise<PlatformRole>`.
- `navFlagsFor(v, isPlatformOperator: boolean): NavRoleFlags`; `navFor(v, clientId, isPlatformOperator: boolean)`.
- Nav "Platform" section items in order: `/platform` Overview, `/platform/agencies` Agencies, `/platform/reviews` Model reviews, `/platform/themes` Theme proposals, `/platform/health` Health.
- CLI: `platform-admin add <email> [--role owner|staff|viewer]` (default `viewer`; revokes any active row first, then inserts; `created_by='cli'`), `platform-admin revoke <email>`, `platform-admin list`. Unknown email → exit 1 with "No user with that email.".
**Tests:** env owner; table staff; revoked → null; guest → null; unknown user → null; env + viewer row → owner; `requirePlatformOperator(…, 'owner')` refuses staff; existing `model-ops`/`themes` tool tests still pass; nav shows Platform section only when flag true; args parser cases.
**Done when:** `pnpm --filter @cs/tools exec vitest run platform`, `pnpm --filter @cs/web exec vitest run nav`, `pnpm --filter @cs/worker exec vitest run platform-admin-args` pass.

### Task 3: Health flag
**Goal:** pure `healthFlag` per spec § Health flag.
**Files:** create `packages/tools/src/platform/health.ts` (+ test).
**Interfaces:** `type AgencyHealth = 'at_risk'|'idle'|'growing'|'steady'`; `healthFlag(i: { today: Date; createdAt: Date; clientsActiveNow: number; clientsActive28dAgo: number|null; lastSignInAt: Date|null; lastBriefSentAt: Date|null }): AgencyHealth`.
**Behaviour:** order at_risk → idle → growing → steady. Agency < 28 days old: skip both client-comparison rules and the 14-day sign-in rule → `steady` unless idle rule applies (only if ≥ 1 active client **and** age ≥ 14 days). `clientsActive28dAgo === null` → comparisons skipped. `lastSignInAt === null` on an agency ≥ 14 days old → at_risk.
**Tests:** one per rule, boundary at exactly 14 days, young agency, null history.
**Done when:** `pnpm --filter @cs/tools exec vitest run health` passes.

### Task 4: Stats computation + nightly job + backfill
**Goal:** compute and upsert one `agency_daily_stat` row per agency per day; backfill when empty.
**Files:** create `packages/tools/src/platform/stats.ts` (+ test), `apps/worker/src/jobs/platform-stats.ts` (+ test); register the job where other jobs are listed.
**Interfaces:**
- `computeAgencyDay(db: ServiceDb, agencyId: string, day: string /* YYYY-MM-DD UTC */, opts: { reconstructOnly: boolean; hasAsk: boolean; hasMcp: boolean }): Promise<AgencyDailyStatInsert>`
- `upsertDailyStats(db, rows: AgencyDailyStatInsert[]): Promise<void>` — `ON CONFLICT (agency_id, day) DO UPDATE` setting only columns that are non-null in the new row **or** when `reconstructOnly=false` (so backfill never nulls measured values).
- `runDailyStats(db, opts: { day?: string; backfill?: boolean; now?: Date }): Promise<{ agencies: number; days: number }>`
- Job: `defineJob({ name: 'platform-daily-stats', schema: z.looseObject({ day: z.string().optional(), backfill: z.boolean().optional() }), cron: '0 2 * * *', handler })` — follow `jobs/heartbeat.ts` / `jobs/model-ops.ts`.
**Behaviour:** see spec § Nightly job. Day boundaries UTC. Seats by `membership.role`. `wau` = distinct `auth.session.user_id` for agency members with `created_at` in `[day-6, day+1)`. `last_activity_at` = max session `created_at` of agency members up to day end. Spend = `sum(cost_usd)` of `llm_call` + `vendor_call` that day. Backfill: when table empty or `backfill: true`, iterate days from `max(agency.created_at, today-400d)` to yesterday with `reconstructOnly: true`. Ask/MCP via P4. Batch upserts per agency.
**Tests:** (test DB) idempotent second run equals first; prospect not counted as active; retracted alert/brief excluded if source has `retracted_at`; backfill leaves `wau`/`last_activity_at`/`ask_questions`/`mcp_calls` NULL; backfill after a measured run keeps measured `wau`; Ask/MCP NULL when tables absent (stub `hasAsk:false`); 400-day cap.
**Done when:** `pnpm --filter @cs/tools exec vitest run stats` and `pnpm --filter @cs/worker exec vitest run platform-stats` pass.

### Task 5: Audit helper + `platform_overview` + `list_platform_agencies`
**Goal:** first two tools and the platform audit helper.
**Files:** create `packages/tools/src/platform/audit.ts`, `series.ts` (+ tests), `packages/tools/src/tools/platform-console.ts` (+ test); modify `tools/all.ts`.
**Interfaces:**
- `recordPlatformAudit(deps, ctx, a: { tool: string; input: unknown; outcome: string; durationMs: number; agencyId?: string; role: PlatformRole }): Promise<void>` — `agencyId` set → insert into that agency's `audit_log` (`role = 'platform_' + role`), else into `platform_audit_log`. Reuse the registry's input hashing function (export it if private).
- `bucketSeries(rows: AgencyDailyStatRow[], range: '12w'|'12m', today: Date): SeriesPoint[]` per P3; `SeriesPoint = { start: string; agencies: number|null; clientsActive: number|null; seats: number|null; wau: number|null; spendUsd: number|null }`.
- Tile `= { value: number; delta28d: number|null }`.
- zod schemas and outputs exactly as spec § Tools table (`platform_overview`, `list_platform_agencies`). `limit` default 50, max 100; cursor via existing paging helper (`grep -rn "cursor" packages/tools/src` — reuse, don't re-implement).
**Behaviour:** live "today" tiles from current rows; `spendMonthUsd` live month-to-date; `delta28d` from stat row at `today-28d` (null if absent). Health per row via `healthFlag`. Sort `health` order at_risk, idle, growing, steady. Audit via `recordPlatformAudit` (no `agencyId`) in a `finally` so refusals are not logged there (refusal throws before).
**Tests:** non-operator and revoked → `permission_denied`; row keys exactly `{id,name,createdAt,clientsActive,clientsProspect,agencySeats,clientSeats,wau,lastActivityAt,spendMonthUsd,health}`; empty platform → `rows: []`; agency with no stats → `delta28d: null`; one `platform_audit_log` row per call; bucketing: week level vs flow vs mean, null-only bucket stays null.
**Done when:** `pnpm --filter @cs/tools exec vitest run platform-console series audit` passes.

### Task 6: `get_platform_agency` + `list_platform_activity`
**Goal:** agency detail and activity feed tools.
**Files:** modify `packages/tools/src/tools/platform-console.ts` (+ test).
**Interfaces:** spec § Tools table. `team: { agencyAdmin: number; accountManager: number; clientOwner: number; clientViewer: number }`. Activity item `{ at: string; kind: 'agency_created'|'client_created'|'client_activated'|'first_brief_sent'|'health_at_risk'; agencyId: string; agencyName: string; clientName?: string }`.
**Behaviour:** unknown/invalid `agencyId` → `not_found`. `get_platform_agency` audits into the **target** agency's `audit_log`. Activity: merge-sorted desc from `agency.created_at`, `client.created_at`, `audit_log` rows whose `tool` is in `ACTIVATION_TOOLS` (const array; Task 0 finds the tool name that turns prospect → active), first `brief.sent_at` per client, and at_risk transitions recomputed from consecutive stat rows (last 90 days only). Cursor = `(at, kind, id)` encoded via the paging helper; `limit` ≤ 50.
**Tests:** `not_found` for random uuid; detail `clients[]` keys exactly `{id,name,status,createdAt}`; audit row lands in target agency's log with `role` `platform_owner` for env operator; activity order and pagination stable across equal timestamps; no client content fields in items.
**Done when:** `pnpm --filter @cs/tools exec vitest run platform-console` passes.

### Task 7: Overview page, health placeholder, shared components
**Goal:** `/platform` and `/platform/health`.
**Files:** create `app/(app)/platform/page.tsx`, `health/page.tsx`, `_components/health-pill.tsx`, `_components/activity-feed.tsx`, `_components/range-toggle.tsx` (+ component tests).
**Behaviour:** server page calls `platform_overview` and `list_platform_activity` through the existing server tool-calling helper (follow `platform/reviews/page.tsx`); `permission_denied` → `notFound()`. Tiles via `StatCard` (two per row at phone width, as `/agency`). Charts via `LineChart`: (1) agencies + active clients, (2) seats + WAU, (3) spend. Range toggle = `?range=12w|12m` link pair (default `12w`). Activity feed: 20 items, "Show more" loads next cursor (client component calling a server action that uses `runTool`-style read; reads stay tools). Health pill: text label + colour (at_risk → danger token, idle → grey panel #EEF2F6 with dark text, growing → primary #47A8E7, steady → secondary #2A6BAC); validate with dataviz skill. Empty-data copy from Global constraints.
**Tests:** health-pill renders label per state; activity-feed renders kinds and "Show more" only with `nextCursor`; range toggle marks current.
**Done when:** `pnpm --filter @cs/web exec vitest run platform` passes; `pnpm --filter @cs/web typecheck` clean.

### Task 8: Agencies list + agency detail pages
**Goal:** `/platform/agencies` and `/platform/agencies/[id]`.
**Files:** create `app/(app)/platform/agencies/page.tsx`, `agencies/agency-table.tsx` (+ test), `agencies/[id]/page.tsx`.
**Behaviour:** list = sortable table (follow `client-lists.tsx`); sort via `?sort=&dir=`; columns name, created, active clients, prospects, seats (agency + client), WAU, last activity (relative), spend this month, health pill; row links to detail; "No agencies yet." when empty; table scrolls inside its card at phone width. Detail = header (name, created, health), tiles, the three charts for one agency, team counts, client list (name, status, created), the "Agency management is coming soon." line; invalid id → `notFound()`.
**Tests:** table sorts by header link, renders empty copy, `—` for null `wau`/`lastActivityAt`.
**Done when:** `pnpm --filter @cs/web exec vitest run agency-table` passes; typecheck clean.

### Task 9: Demo seed, coverage, E2E
**Goal:** demo shows 90 days of history; E2E proves access rules.
**Files:** create `packages/demo/src/platform-stats.ts` (+ test); modify `packages/demo/src/reset.ts`, `coverage.ts`; create `apps/web/e2e/platform.spec.ts`; E2E seed additions in `apps/web/e2e/seed.ts` if needed.
**Behaviour:** demo seeds 90 days of `agency_daily_stat` per demo agency with a plausible upward trend (deterministic via existing `random.ts`), plus one `platform_admin` `staff` row for a demo user if the demo has a second operator-suitable user (else none). Register `/platform`, `/platform/agencies`, `/platform/agencies/[id]` in `coverage.ts`. E2E tag `@platform`: `admin@e2e.test` sees tiles on `/platform`, opens first agency from the list, detail renders, and the agency's audit trail has a `platform_` row (query via test helper); a plain agency admin gets 404 on all three routes.
**Tests:** demo seed test asserts 90 rows per agency, deterministic; coverage test passes.
**Done when:** `pnpm --filter @cs/demo exec vitest run platform-stats coverage` and `pnpm --filter @cs/web e2e:affected` pass.
