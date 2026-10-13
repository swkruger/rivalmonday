# Phase 8a — Platform console: agency list, growth & activity (design)

**Status:** owner-approved design, 2026-10-12. **Branch:** `phase-8`. **Brief:** `docs/work/phase-8.md`.
New decisions and interfaces only; the core spec (`2026-09-29-core-platform-design.md`) and root `CLAUDE.md` § Decisions still bind. Core spec §3 names a Platform tier above Agency; this phase gives it a console.

## Goal
Give platform operators (the owner and staff) one place to see every agency, how it is growing, how active it is and what it costs — without querying the database and without being able to change any agency's data.

## Phase split (decision d1)
- **8a (this spec):** platform admin identity, nightly agency stats, overview + agency list + agency detail stub, activity feed, platform audit.
- **8b (own spec later):** read-only agency drill-down (what "read-only access to agency level" shows, client-data privacy).
- **Later phases (not designed here):** agency management (add / delete / suspend), direct agency communications, income statement, billing fields (Phase 9). 8a leaves seams: an extensible Platform nav section, `/platform/agencies/[id]` as the place actions will live, `agency_daily_stat` as the table billing metrics (MRR, paid seats) will extend, roles that will gate writes.

## Decisions (owner-approved 2026-10-12)
- **d1** Split 8a / 8b as above.
- **d2** Platform admins = `platform_admin` table with roles `owner | staff | viewer`, **plus** `PLATFORM_ADMIN_EMAILS` kept as the bootstrap: anyone listed is always `owner`. No admin-management UI in 8a (rows are inserted by SQL/CLI). In 8a every role may read everything; roles start to matter with write actions.
- **d3** History comes from a nightly snapshot table `agency_daily_stat`; "today" figures are computed live. First run backfills what is reconstructible; the rest stays `NULL`.
- **d4** Cross-agency reads use the existing pattern: platform tools call `requirePlatformOperator` first, then read through `deps.service` with an explicit column list per query. No new RLS policies or DB roles.
- **d5** No write actions in 8a. The only writer is the nightly job.
- **d6** `/platform/health` is a placeholder tab; the real page comes with Phase 7a (`platform_health`).
- **d7** In 8a operators see agency-level aggregates plus client **names and statuses** only — no evidence, briefs, Ask, reviews or reviewer data. Privacy beyond that is 8b.
- **d8** Every platform read is audited: per-agency reads in that agency's `audit_log`, cross-agency reads in a new `platform_audit_log`.
- **d9** Health flag is computed at read time, never stored (thresholds below).

## Data model (migration: next free number at execution time, currently ≥ 0044)

All three tables: `ENABLE` + `FORCE ROW LEVEL SECURITY`, **no policies**, no `app_user` grants — service role only (same as `membership`). Write the migration with `pnpm --filter @cs/db generate`, RLS/grants in a custom migration after it.

```sql
CREATE TABLE platform_admin (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL REFERENCES auth."user"(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('owner','staff','viewer')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  text,                    -- auth user id or 'cli'
  revoked_at  timestamptz
);
CREATE UNIQUE INDEX platform_admin_active_user_uq ON platform_admin (user_id) WHERE revoked_at IS NULL;

CREATE TABLE agency_daily_stat (
  agency_id         uuid NOT NULL REFERENCES agency(id) ON DELETE CASCADE,
  day               date NOT NULL,              -- UTC day the figures describe
  clients_active    integer,
  clients_prospect  integer,
  agency_seats      integer,                    -- memberships with role agency_admin|account_manager
  client_seats      integer,                    -- memberships with role client_owner|client_viewer
  wau               integer,                    -- distinct users with a session created in (day-6 .. day)
  briefs_sent       integer,
  alerts_sent       integer,
  prospect_reports  integer,
  ask_questions     integer,                    -- NULL until phase-6 Ask is merged
  mcp_calls         integer,                    -- NULL until phase-6 MCP is merged
  spend_usd         numeric(12,4),              -- llm_call + vendor_call cost that day
  last_activity_at  timestamptz,
  computed_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (agency_id, day)
);

CREATE TABLE platform_audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL,
  tool        text NOT NULL,
  input_hash  text NOT NULL,
  outcome     text NOT NULL,
  duration_ms integer NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX platform_audit_log_created_idx ON platform_audit_log (created_at);
```
Notes: `client.status` is `active | prospect` only (no paused state exists). Counts are per day except `wau` (rolling 7 days). `NULL` = not measured; `0` = measured zero. Platform-wide series are `SUM` over agencies per day.

## Platform role resolution (`packages/tools/src/platform.ts`)

```ts
export type PlatformRole = 'owner' | 'staff' | 'viewer';
const RANK: Record<PlatformRole, number> = { viewer: 1, staff: 2, owner: 3 };

/** Guests ('contact:…') never qualify. Env list wins (always owner); else the active platform_admin row. */
export async function platformRole(deps: Pick<ToolDeps,'service'|'platformAdmins'>, ctx: AccessContext): Promise<PlatformRole | null> {
  if (ctx.userId.startsWith('contact:')) return null;
  const rows = [...(await deps.service.execute<{ email: string; role: PlatformRole | null }>(sql`
    select u.email, pa.role from auth."user" u
    left join platform_admin pa on pa.user_id = u.id and pa.revoked_at is null
    where u.id = ${ctx.userId}`))];
  const row = rows[0];
  if (!row) return null;
  if ((deps.platformAdmins ?? []).includes(row.email.toLowerCase())) return 'owner';
  return row.role ?? null;
}

export async function isPlatformOperator(deps, ctx): Promise<boolean> { return (await platformRole(deps, ctx)) !== null; }

/** Every platform tool calls this first; anyone else gets permission_denied (→ 404). */
export async function requirePlatformOperator(deps, ctx, min: PlatformRole = 'viewer'): Promise<PlatformRole> {
  const role = await platformRole(deps, ctx);
  if (role === null || RANK[role] < RANK[min]) throw new ToolError('permission_denied', 'Platform operators only');
  return role;
}
```
Existing callers (`model-ops.ts`, `themes.ts`, nav flag) keep working unchanged. The nav flag `isPlatformOperator` now also honours table rows. CLI: `pnpm --filter @cs/worker cli platform-admin add|revoke <email> [--role]` (service role; refuses unknown emails).

## Nightly job `platform-daily-stats` (`apps/worker`)
- Scheduled through pg-boss like existing jobs, **02:00 UTC**, computes **yesterday** (UTC) for every agency; `INSERT … ON CONFLICT (agency_id, day) DO UPDATE` → idempotent. Optional `{ day }` payload recomputes one day.
- Sources: `client` (status, created_at), `membership` (role), `auth.session` (wau, last activity), brief/alert delivery tables (sent that day; events filter `retracted_at IS NULL`), prospect reports, `llm_call` + `vendor_call` (`cost_usd`), Ask/MCP tables **if present** (detected once per run; else `NULL`).
- **Backfill** (`{ backfill: true }`, runs automatically when the table is empty): for each day from the agency's `created_at` (max 400 days) fills `clients_active/prospect` and seats from `created_at` of current rows, `spend_usd`, `briefs_sent`, `alerts_sent`, `prospect_reports` from their dated rows; `wau`, `last_activity_at`, `ask_questions`, `mcp_calls` stay `NULL`. Charts draw gaps for `NULL`, never drops.
- Not scheduled in DEMO/TEST (existing rule). Tests call the job function. `pnpm demo:reset` seeds 90 days of plausible stats for the demo agencies.

## Health flag (d9) — `packages/tools/src/platform/health.ts`
Pure function over (today's live figures, the stat row 28 days ago, last sign-in, last brief sent). First match wins:
1. **at_risk** — no sign-in by any agency member for 14 days, **or** `clients_active` lower than 28 days ago.
2. **idle** — no brief sent for 14 days (agency with ≥ 1 active client).
3. **growing** — `clients_active` higher than 28 days ago.
4. **steady** — otherwise (includes agencies younger than 28 days).

## Tools (`packages/tools/src/tools/platform-console.ts`, registered in `all.ts`)
All: `channels: ['web']`, read-only, first statement `await requirePlatformOperator(deps, ctx)`, service reads with explicit columns. Inputs (zod, camelCase):

| Tool | Input | Output (summary) |
|---|---|---|
| `platform_overview` | `{ range: '12w' \| '12m' }` | `tiles`: agencies, clientsActive, seats (agency+client), wau, spendMonthUsd — each `{ value, delta28d \| null }`; `series`: per week/month buckets of agencies, clientsActive, seats, wau, spendUsd |
| `list_platform_agencies` | `{ sort?: 'name'\|'created'\|'clients'\|'wau'\|'lastActivity'\|'spend'\|'health', dir?: 'asc'\|'desc', cursor?, limit? (≤ 100, default 50) }` | `rows`: `{ id, name, createdAt, clientsActive, clientsProspect, agencySeats, clientSeats, wau, lastActivityAt, spendMonthUsd, health }`, `nextCursor` |
| `get_platform_agency` | `{ agencyId: uuid, range }` | `agency { id, name, createdAt, health }`, `tiles`, `series` (as overview, one agency), `team`: counts per role, `clients`: `{ id, name, status, createdAt }[]` |
| `list_platform_activity` | `{ cursor?, limit? (≤ 50) }` | `items`: `{ at, kind, agencyId, agencyName, clientName? }`, `nextCursor` |

- Cursor = existing `paging.ts` shape. Unknown `agencyId` → `not_found` (→ 404).
- Activity `kind`: `agency_created`, `client_created`, `client_activated` (prospect → active, from allow-listed `audit_log` tool names), `first_brief_sent`, `health_at_risk` (transition detected by the nightly job comparing flags; the job writes nothing extra — the feed recomputes from consecutive stat rows). No client content, ever.
- Monthly spend tile = live month-to-date sum from ledgers; other "today" tiles live; `delta28d` from the stat row 28 days ago (`null` if absent).

## Audit (d8)
- `get_platform_agency` writes one row to the **target agency's** `audit_log` (`user_id` = operator, `role` = `'platform_<role>'`, `tool`, `outcome`), so agencies' logs show platform views.
- `platform_overview`, `list_platform_agencies`, `list_platform_activity` write to `platform_audit_log` (`input_hash` same hashing as `audit_log`).
- The registry's normal per-call audit still runs for the operator's own context; implementers wire the extra row via the tool handler (service role), not by changing registry semantics.

## Pages (`apps/web/src/app/(app)/platform/`)
- `/platform` — tile row (`StatCard`), charts (`LineChart`): agencies + active clients; seats + WAU; spend; range toggle 12 weeks / 12 months; activity feed (latest 20, "Show more").
- `/platform/agencies` — sortable table (`client-lists.tsx` pattern), health pill per row; row → detail.
- `/platform/agencies/[id]` — header (name, created, health), tiles, charts, team counts, client list (name, status, created). Placeholder line: "Agency management is coming soon." (no buttons).
- `/platform/health` — placeholder: "Platform health arrives with the deployment phase."
- Nav: a "Platform" section — Overview, Agencies, Reviews, Themes, Health — shown when `isPlatformOperator` (cosmetic; tools enforce).
- Health pill colours: four states from brand tokens (`at_risk` danger, `idle` neutral grey panel, `growing` primary, `steady` secondary), each with a text label; validate contrast with the dataviz skill. Charts ≤ 5 series, hand-written SVG.
- Phone width: tiles two per row (agency KPI pattern); table scrolls inside its card, no page scroll.
- Refusals → 404. Register the three pages in `packages/demo/src/coverage.ts`.

## Testing
- **Unit (TDD):** `platformRole` — env owner, table row, revoked row, guest, unknown user, env wins over table role; `requirePlatformOperator(min)` ranks. Each tool refuses non-operator and revoked operator (`permission_denied`). Job: idempotent re-run, backfill leaves non-reconstructible columns `NULL`, only `status='active'` counts as active, retracted events excluded, Ask/MCP `NULL` when tables absent. Health flag thresholds incl. young agency. Column allow-list: `list_platform_agencies` row keys exactly as specified. Audit: `get_platform_agency` writes into target agency's `audit_log`; list tools write `platform_audit_log`.
- **E2E `@platform`:** `admin@e2e.test` sees overview tiles, opens an agency, agency detail renders; a plain agency admin gets 404 on `/platform`, `/platform/agencies`, `/platform/agencies/<id>`.

## Dependencies on in-flight work
- `phase-6` adds migrations 0038–0043, `ask_*`, `api_token`, MCP audit `channel`; touches `platform.ts`, `nav-items.ts`, `server/nav.ts`, `tools/all.ts`, `deps.ts`. 8a must rebase after phase-6 merges (or detect Ask/MCP tables at runtime as specified) and take the next free migration number then.
- `phase-7-planning` (parked) 7a's `platform_health` tool + `/platform/health` page replace d6's placeholder.

## Out of scope
Agency writes (status, suspend, delete, create), billing/plan fields, messaging, income statement, admin-management UI, agency drill-down beyond the stub, MCP exposure of platform tools.
