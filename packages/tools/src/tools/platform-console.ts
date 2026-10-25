import { holdBillingIssue } from '@cs/billing';
import { type AccessContext, ToolError, toolkit } from '@cs/core';
import { agency, agencyBilling, agencyDailyStat, BILLING_STATES, auditLog, brief, client, membership, supportSession } from '@cs/db';
import { and, eq, gte, inArray, isNull, lte, type SQL, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { pageOf, pageResult, prevCursorOf } from '../paging';
import { requirePlatformOperator } from '../platform';
import { liveBilling } from '../platform/archive';
import { requireAgency } from './platform-billing';
import { ACTIVATION_TOOLS } from './prospects';
import { withPlatformAudit } from '../platform/audit';
import { type AgencyHealth, healthFlag } from '../platform/health';
import { bucketSeries, type SeriesRange, type SeriesRow, seriesWindowStart } from '../platform/series';
import { AGENCY_ROLES, addDays, CLIENT_ROLES, SESSION_ACTIVITY_AT, utcDay } from '../platform/stats';

/**
 * Phase 8a platform console (spec § Tools). Every tool: first statement `requirePlatformOperator`, read-only service reads
 * with explicit columns, no client content, one audit row via `withPlatformAudit` (registry web audit skipped: `skip-web`).
 */
const { defineTool } = toolkit<ToolDeps>();

const HEALTH = ['at_risk', 'idle', 'growing', 'steady'] as const satisfies readonly AgencyHealth[];
const HEALTH_RANK: Record<AgencyHealth, number> = { at_risk: 0, idle: 1, growing: 2, steady: 3 };
const LIST_WEB_DEFAULT = 50;
const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

export const PlatformRangeInput = z.enum(['12w', '12m']);
export const PlatformTile = z.object({ value: z.number(), delta28d: z.number().nullable() });
export const PlatformTiles = z.object({ agencies: PlatformTile, clientsActive: PlatformTile, seats: PlatformTile, wau: PlatformTile, spendMonthUsd: PlatformTile });
export const PlatformSeriesPoint = z.object({
  start: z.string(),
  agencies: z.number().nullable(),
  clientsActive: z.number().nullable(),
  seats: z.number().nullable(),
  wau: z.number().nullable(),
  spendUsd: z.number().nullable(),
});
const HealthEnum = z.enum(HEALTH);

/** Live ("today") figures for one agency. */
export interface LiveAgency {
  id: string;
  name: string;
  createdAt: Date;
  clientsActive: number;
  clientsProspect: number;
  agencySeats: number;
  clientSeats: number;
  wau: number;
  lastActivityAt: Date | null;
  /** Latest session of an agency-role member (health's "sign-in by any agency member"). */
  lastSignInAt: Date | null;
  lastBriefSentAt: Date | null;
  spendMonthUsd: number;
  clientsActive28dAgo: number | null;
  suspendedAt: string | null;
  archivedAt: string | null;
}

type LiveRow = {
  id: string;
  name: string;
  created_at: string | Date;
  clients_active: number;
  clients_prospect: number;
  agency_seats: number;
  client_seats: number;
  wau: number;
  last_activity_at: string | Date | null;
  last_sign_in_at: string | Date | null;
  last_brief_sent_at: string | Date | null;
  spend_month_usd: string;
  clients_active_28d: number | null;
  suspended_at: string | Date | null;
  archived_at: string | Date | null;
};

const dateOrNull = (v: string | Date | null): Date | null => (v === null ? null : new Date(v));
const isoOrNull = (v: string | Date | null): string | null => (v === null ? null : new Date(v).toISOString());
const monthStartOf = (day: string) => `${day.slice(0, 7)}-01`;

/**
 * Live figures per agency (all agencies, or one). Same definitions as the nightly job (`platform/stats.ts`):
 * active = status 'active'; seats = distinct users per role group; wau = distinct members with a session in
 * [today−6 00:00Z, now]; spend = agency-attributed llm_call + vendor_call since the UTC month start.
 */
export async function liveAgencies(deps: Pick<ToolDeps, 'service'>, now: Date, agencyId?: string, o: { nameLike?: string; archived?: 'exclude' | 'only' | 'include'; onHoldOnly?: boolean } = {}): Promise<LiveAgency[]> {
  const today = utcDay(now);
  const weekStart = sql`${`${addDays(today, -6)}T00:00:00.000Z`}::timestamptz`;
  const monthStart = sql`${`${monthStartOf(today)}T00:00:00.000Z`}::timestamptz`;
  const d28 = addDays(today, -28);
  const members = sql`(select m.user_id from membership m where m.agency_id = a.id)`;
  const staff = sql`(select m.user_id from membership m where m.agency_id = a.id and m.role in ${AGENCY_ROLES})`;
  // 7a2 D16: archived agencies are deleted for the console unless a caller asks for them (15c-3a: status filter, detail read).
  const filters: SQL[] = [];
  const archived = o.archived ?? 'exclude';
  if (archived === 'exclude') filters.push(sql`a.archived_at is null`);
  if (archived === 'only') filters.push(sql`a.archived_at is not null`);
  if (o.onHoldOnly) filters.push(sql`a.suspended_at is not null`);
  if (agencyId) filters.push(sql`a.id = ${agencyId}`);
  if (o.nameLike) filters.push(sql`a.name ilike '%' || ${o.nameLike} || '%' escape '\\'`);
  const where: SQL = filters.length ? sql`where ${sql.join(filters, sql` and `)}` : sql``;
  const rows = [
    ...(await deps.service.execute<LiveRow>(sql`
      select a.id, a.name, a.created_at,
        (select count(*)::int from client c where c.agency_id = a.id and c.status = 'active' and c.paused_at is null and c.archived_at is null) as clients_active,
        (select count(*)::int from client c where c.agency_id = a.id and c.status = 'prospect' and c.archived_at is null) as clients_prospect,
        (select count(distinct m.user_id)::int from membership m where m.agency_id = a.id and m.role in ${AGENCY_ROLES}) as agency_seats,
        (select count(distinct m.user_id)::int from membership m where m.agency_id = a.id and m.role in ${CLIENT_ROLES}) as client_seats,
        (select count(distinct s."userId")::int from auth.session s where s."userId" in ${members} and ${SESSION_ACTIVITY_AT} >= ${weekStart}) as wau,
        (select max(${SESSION_ACTIVITY_AT}) from auth.session s where s."userId" in ${members}) as last_activity_at,
        (select max(${SESSION_ACTIVITY_AT}) from auth.session s where s."userId" in ${staff}) as last_sign_in_at,
        (select max(b.sent_at) from brief b where b.agency_id = a.id and b.status = 'sent') as last_brief_sent_at,
        round((
          (select coalesce(sum(cost_usd), 0) from llm_call where agency_id = a.id and created_at >= ${monthStart})
          + (select coalesce(sum(cost_usd), 0) from vendor_call where agency_id = a.id and created_at >= ${monthStart})
        )::numeric, 4)::text as spend_month_usd,
        (select d.clients_active from agency_daily_stat d where d.agency_id = a.id and d.day = ${d28}::date) as clients_active_28d,
        a.suspended_at, a.archived_at
      from agency a ${where}`)),
  ];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    createdAt: new Date(r.created_at),
    clientsActive: r.clients_active,
    clientsProspect: r.clients_prospect,
    agencySeats: r.agency_seats,
    clientSeats: r.client_seats,
    wau: r.wau,
    lastActivityAt: dateOrNull(r.last_activity_at),
    lastSignInAt: dateOrNull(r.last_sign_in_at),
    lastBriefSentAt: dateOrNull(r.last_brief_sent_at),
    spendMonthUsd: Number(r.spend_month_usd),
    clientsActive28dAgo: r.clients_active_28d,
    suspendedAt: isoOrNull(r.suspended_at),
    archivedAt: isoOrNull(r.archived_at),
  }));
}

export function healthOf(a: LiveAgency, now: Date): AgencyHealth {
  return healthFlag({
    today: now, createdAt: a.createdAt, clientsActiveNow: a.clientsActive, clientsActive28dAgo: a.clientsActive28dAgo,
    lastSignInAt: a.lastSignInAt, lastBriefSentAt: a.lastBriefSentAt,
  });
}

/** Stat rows for the chart window plus the month-to-date span 28 days ago (explicit columns). */
export async function statRows(deps: Pick<ToolDeps, 'service'>, range: SeriesRange, now: Date, agencyId?: string): Promise<SeriesRow[]> {
  const today = utcDay(now);
  const window = seriesWindowStart(range, now);
  const ms28 = monthStartOf(addDays(today, -28));
  const from = ms28 < window ? ms28 : window;
  const d = agencyDailyStat;
  return deps.service
    .select({ agencyId: d.agencyId, day: d.day, clientsActive: d.clientsActive, agencySeats: d.agencySeats, clientSeats: d.clientSeats, wau: d.wau, spendUsd: d.spendUsd })
    .from(d)
    .where(and(gte(d.day, from), lte(d.day, addDays(today, -1)), agencyId ? eq(d.agencyId, agencyId) : undefined));
}

const sumOrNull = (vs: (number | null)[]): number | null => {
  const m = vs.filter((v): v is number => v !== null);
  return m.length === 0 ? null : m.reduce((a, b) => a + b, 0);
};

/** Live tiles; `delta28d` = live − the stat rows 28 days ago (NULL when nothing was measured then). */
export function tilesOf(live: LiveAgency[], rows: SeriesRow[], now: Date): z.input<typeof PlatformTiles> {
  const d28 = addDays(utcDay(now), -28);
  const ms28 = monthStartOf(d28);
  const then = rows.filter((r) => r.day === d28);
  const measured = then.length > 0;
  const seatsThen = then.map((r) => (r.agencySeats === null || r.clientSeats === null ? null : r.agencySeats + r.clientSeats));
  const spendThen = measured ? sumOrNull(rows.filter((r) => r.day >= ms28 && r.day <= d28).map((r) => (r.spendUsd === null ? null : Number(r.spendUsd)))) : null;
  const tile = (value: number, past: number | null, round = false) => ({
    value: round ? round4(value) : value,
    delta28d: past === null ? null : round ? round4(value - past) : value - past,
  });
  const sum = (f: (a: LiveAgency) => number) => live.reduce((acc, a) => acc + f(a), 0);
  return {
    agencies: tile(live.length, measured ? then.length : null),
    clientsActive: tile(sum((a) => a.clientsActive), sumOrNull(then.map((r) => r.clientsActive))),
    seats: tile(sum((a) => a.agencySeats + a.clientSeats), sumOrNull(seatsThen)),
    wau: tile(sum((a) => a.wau), sumOrNull(then.map((r) => r.wau))),
    spendMonthUsd: tile(sum((a) => a.spendMonthUsd), spendThen, true),
  };
}

export const platformOverview = defineTool({
  name: 'platform_overview',
  access: 'read',
  description: 'Platform operators: platform-wide tiles (agencies, active clients, seats, WAU, month-to-date spend) with 28-day deltas, and weekly/monthly series.',
  input: z.object({ range: PlatformRangeInput }),
  output: z.object({ tiles: PlatformTiles, series: z.array(PlatformSeriesPoint) }),
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    const role = await requirePlatformOperator(deps, ctx);
    return withPlatformAudit(deps, ctx, { tool: 'platform_overview', input, role }, async () => {
      const now = new Date();
      const [live, rows] = await Promise.all([liveAgencies(deps, now), statRows(deps, input.range, now)]);
      return { tiles: tilesOf(live, rows, now), series: bucketSeries(rows, input.range, now) };
    });
  },
});

const SORTS = ['name', 'created', 'clients', 'wau', 'lastActivity', 'spend', 'health'] as const;
type Sort = (typeof SORTS)[number];
type ListRow = { id: string; name: string; createdAt: Date; clientsActive: number; clientsProspect: number; agencySeats: number; clientSeats: number; wau: number | null; lastActivityAt: Date | null; spendMonthUsd: number; health: AgencyHealth; billingState: (typeof BILLING_STATES)[number]; onHold: boolean; archivedAt: string | null };

const SORT_KEY: Record<Sort, (r: ListRow) => number | string | null> = {
  name: (r) => r.name.toLowerCase(),
  created: (r) => r.createdAt.getTime(),
  clients: (r) => r.clientsActive,
  wau: (r) => r.wau,
  lastActivity: (r) => r.lastActivityAt?.getTime() ?? null,
  spend: (r) => r.spendMonthUsd,
  health: (r) => HEALTH_RANK[r.health],
};

/** Default direction: name and health ascending (A→Z, at_risk first); figures and dates descending. NULLs always last; ties by name, id. */
function compareRows(sort: Sort, dir: 'asc' | 'desc') {
  const key = SORT_KEY[sort];
  const sign = dir === 'asc' ? 1 : -1;
  return (a: ListRow, b: ListRow): number => {
    const ka = key(a);
    const kb = key(b);
    if (ka !== kb) {
      if (ka === null) return 1;
      if (kb === null) return -1;
      return (ka < kb ? -1 : 1) * sign;
    }
    const n = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    return n !== 0 ? n : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
}

/** Trimmed query for the name filter: under 2 characters is ignored; backslash, % and _ are escaped for ILIKE ... ESCAPE backslash. */
function nameLikeOf(query: string | undefined): string | undefined {
  const q = query?.trim() ?? '';
  return q.length < 2 ? undefined : q.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export const listPlatformAgencies = defineTool({
  name: 'list_platform_agencies',
  access: 'read',
  description: 'Platform operators: every agency with live figures (clients, seats, WAU, last activity, month-to-date spend) and a health flag. `query` (2+ characters) filters by name, case-insensitively.',
  input: z.object({
    sort: z.enum(SORTS).optional(),
    dir: z.enum(['asc', 'desc']).optional(),
    cursor: z.string().max(200).optional(),
    limit: z.number().int().min(1).max(100).optional(),
    query: z.string().max(100).optional(),
    status: z.enum(['active', 'on_hold', 'archived', 'all']).optional(),
  }),
  output: z.object({
    rows: z.array(z.object({
      id: z.string(),
      name: z.string(),
      createdAt: z.string(),
      clientsActive: z.number().int(),
      clientsProspect: z.number().int(),
      agencySeats: z.number().int(),
      clientSeats: z.number().int(),
      wau: z.number().int().nullable(),
      lastActivityAt: z.string().nullable(),
      spendMonthUsd: z.number(),
      health: HealthEnum,
      billingState: z.enum(BILLING_STATES),
      onHold: z.boolean(),
      archivedAt: z.string().nullable(),
    })),
    counts: z.object({ onHold: z.number().int(), archived: z.number().int() }),
    nextCursor: z.string().nullable(),
    prevCursor: z.string().nullable(),
  }),
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps, meta) {
    const role = await requirePlatformOperator(deps, ctx);
    return withPlatformAudit(deps, ctx, { tool: 'list_platform_agencies', input, role }, async () => {
      const { offset, limit } = pageOf(input, meta, LIST_WEB_DEFAULT);
      const sort = input.sort ?? 'name';
      const dir = input.dir ?? (sort === 'name' || sort === 'health' ? 'asc' : 'desc');
      const now = new Date();
      const status = input.status ?? 'active';
      const [lives, states, [cnt]] = await Promise.all([
        liveAgencies(deps, now, undefined, {
          nameLike: nameLikeOf(input.query),
          archived: status === 'archived' ? 'only' : status === 'all' ? 'include' : 'exclude',
          onHoldOnly: status === 'on_hold',
        }),
        deps.service.select({ id: agencyBilling.agencyId, state: agencyBilling.state }).from(agencyBilling),
        deps.service.select({
          onHold: sql<number>`count(*) filter (where ${agency.suspendedAt} is not null and ${agency.archivedAt} is null)::int`,
          archived: sql<number>`count(*) filter (where ${agency.archivedAt} is not null)::int`,
        }).from(agency),
      ]);
      const stateOf = new Map(states.map((r) => [r.id, r.state]));
      const all: ListRow[] = lives.map((a) => ({
        id: a.id, name: a.name, createdAt: a.createdAt, clientsActive: a.clientsActive, clientsProspect: a.clientsProspect,
        agencySeats: a.agencySeats, clientSeats: a.clientSeats, wau: a.wau, lastActivityAt: a.lastActivityAt,
        spendMonthUsd: a.spendMonthUsd, health: healthOf(a, now), billingState: stateOf.get(a.id) ?? 'pilot',
        onHold: a.suspendedAt !== null && a.archivedAt === null, archivedAt: a.archivedAt,
      }));
      all.sort(compareRows(sort, dir));
      const page = pageResult(all.slice(offset, offset + limit + 1), limit, offset);
      return {
        rows: page.rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), lastActivityAt: r.lastActivityAt?.toISOString() ?? null })),
        nextCursor: page.nextCursor,
        prevCursor: prevCursorOf(offset, limit),
        counts: { onHold: cnt?.onHold ?? 0, archived: cnt?.archived ?? 0 },
      };
    });
  },
});


const AgencyId = z.string().max(64);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const getPlatformAgency = defineTool({
  name: 'get_platform_agency',
  access: 'read',
  description: 'Platform operators: one agency (archived ones read-only, without health/tiles/series) — hold and archive state, health, live tiles with 28-day deltas, series, team counts per role and its clients (id, name, status, created).',
  input: z.object({ agencyId: AgencyId, range: PlatformRangeInput }),
  output: z.object({
    agency: z.object({ id: z.string(), name: z.string(), createdAt: z.string(), health: HealthEnum.nullable() }),
    tiles: PlatformTiles.nullable(),
    series: z.array(PlatformSeriesPoint).nullable(),
    hold: z.object({ since: z.string(), reason: z.string(), byName: z.string() }).nullable(),
    archivedAt: z.string().nullable(),
    holdBillingIssue: z.enum(['pause', 'resume']).nullable(),
    archiveBlockers: z.object({ agencyPlan: z.boolean(), clientSubscriptions: z.number().int() }),
    team: z.object({ agencyAdmin: z.number().int(), accountManager: z.number().int(), clientOwner: z.number().int(), clientViewer: z.number().int() }),
    clients: z.array(z.object({ id: z.string(), name: z.string(), status: z.string(), createdAt: z.string() })),
  }),
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    const role = await requirePlatformOperator(deps, ctx);
    const found = UUID_RE.test(input.agencyId) ? await requireAgency(deps, input.agencyId, { allowArchived: true }).catch((e: unknown) => {
      // Only "no such agency" maps to not_found; DB/other failures propagate.
      if (e instanceof ToolError && e.code === 'not_found') return null;
      throw e;
    }) : null;
    const exists = found !== null;
    // Unknown agency: no target audit_log to write into (FK), so the not_found call lands on the platform log.
    return withPlatformAudit(deps, ctx, { tool: 'get_platform_agency', input, role, agencyId: exists ? input.agencyId : undefined }, async () => {
      if (!found) throw new ToolError('not_found', 'Agency not found');
      const now = new Date();
      const isArchived = found.archivedAt !== null;
      const [live, rows, teamRows, clientRows, holdRows, issue, blockers] = await Promise.all([
        liveAgencies(deps, now, input.agencyId, { archived: 'include' }),
        isArchived ? Promise.resolve([] as SeriesRow[]) : statRows(deps, input.range, now, input.agencyId),
        deps.service
          .select({ role: membership.role, n: sql<number>`count(distinct ${membership.userId})::int` })
          .from(membership)
          .where(and(eq(membership.agencyId, input.agencyId), inArray(membership.role, ['agency_admin', 'account_manager', 'client_owner', 'client_viewer'])))
          .groupBy(membership.role),
        deps.service
          .select({ id: client.id, name: client.name, status: client.status, createdAt: client.createdAt })
          .from(client)
          .where(and(eq(client.agencyId, input.agencyId), isNull(client.archivedAt)))
          .orderBy(client.name, client.id),
        deps.service.execute<{ reason: string | null; name: string | null; email: string | null }>(sql`
          select a.suspended_reason as reason, u.name, u.email from agency a left join auth."user" u on u.id = a.suspended_by
          where a.id = ${input.agencyId} and a.suspended_at is not null`),
        holdBillingIssue(deps.service, input.agencyId),
        liveBilling(deps.service, input.agencyId),
      ]);
      const a = live[0];
      if (!a) throw new ToolError('not_found', 'Agency not found');
      const n = (r: string) => teamRows.find((t) => t.role === r)?.n ?? 0;
      return {
        agency: { id: a.id, name: a.name, createdAt: a.createdAt.toISOString(), health: isArchived ? null : healthOf(a, now) },
        tiles: isArchived ? null : tilesOf(live, rows, now),
        series: isArchived ? null : bucketSeries(rows, input.range, now),
        hold: a.suspendedAt === null || !holdRows[0] ? null : {
          since: a.suspendedAt, reason: holdRows[0].reason ?? '',
          byName: holdRows[0].name?.trim() || holdRows[0].email?.split('@')[0] || 'Platform staff',
        },
        archivedAt: a.archivedAt,
        holdBillingIssue: issue,
        archiveBlockers: blockers,
        team: { agencyAdmin: n('agency_admin'), accountManager: n('account_manager'), clientOwner: n('client_owner'), clientViewer: n('client_viewer') },
        clients: clientRows.map((c) => ({ id: c.id, name: c.name, status: c.status, createdAt: c.createdAt.toISOString() })),
      };
    });
  },
});

const ACTIVITY_WEB_DEFAULT = 20;
const ACTIVITY_KINDS = ['agency_created', 'client_created', 'client_activated', 'first_brief_sent', 'health_at_risk', 'support_session_started'] as const;
type ActivityKind = (typeof ACTIVITY_KINDS)[number];
type ActivityEvent = { at: Date; kind: ActivityKind; id: string; agencyId: string; agencyName: string; clientName?: string };
const AT_RISK_WINDOW_DAYS = 90;
const DAY_MS = 86_400_000;

/**
 * at_risk transitions recomputed from consecutive stat rows (spec: the job writes nothing extra). Same rule as `healthFlag`'s
 * at_risk arm: agency >= 28 days old and (no activity for 14 days, or fewer active clients than 28 days earlier). Stat rows only
 * carry `last_activity_at` (any member), so "sign-in" here is that column. Rows with `wau` NULL were not measured: skipped.
 */
export function atRiskTransitions(
  rows: { agencyId: string; day: string; clientsActive: number | null; wau: number | null; lastActivityAt: Date | null }[],
  created: Map<string, Date>,
  sinceDay: string,
): { agencyId: string; day: string }[] {
  const out: { agencyId: string; day: string }[] = [];
  const byAgency = new Map<string, typeof rows>();
  for (const r of rows) byAgency.set(r.agencyId, [...(byAgency.get(r.agencyId) ?? []), r]);
  for (const [agencyId, list] of byAgency) {
    list.sort((x, y) => (x.day < y.day ? -1 : 1));
    const active = new Map(list.map((r) => [r.day, r.clientsActive]));
    const createdAt = created.get(agencyId);
    if (!createdAt) continue;
    let prev: boolean | null = null;
    for (const r of list) {
      if (r.wau === null) continue;
      const end = new Date(`${r.day}T23:59:59.999Z`);
      const mature = (end.getTime() - createdAt.getTime()) / DAY_MS >= 28;
      const quiet = r.lastActivityAt === null || (end.getTime() - r.lastActivityAt.getTime()) / DAY_MS >= 14;
      const then = active.get(addDays(r.day, -28)) ?? null;
      const atRisk = mature && (quiet || (then !== null && r.clientsActive !== null && r.clientsActive < then));
      if (atRisk && prev === false && r.day >= sinceDay) out.push({ agencyId, day: r.day });
      prev = atRisk;
    }
  }
  return out;
}

export const listPlatformActivity = defineTool({
  name: 'list_platform_activity',
  access: 'read',
  description: 'Platform operators: newest-first feed of agency/client creation, client activation, first brief sent, agencies turning at-risk and support sessions opened (no client content, no session reasons).',
  input: z.object({ cursor: z.string().max(200).optional(), limit: z.number().int().min(1).max(50).optional() }),
  output: z.object({
    items: z.array(z.object({ at: z.string(), kind: z.enum(ACTIVITY_KINDS), agencyId: z.string(), agencyName: z.string(), clientName: z.string().optional() })),
    nextCursor: z.string().nullable(),
  }),
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps, meta) {
    const role = await requirePlatformOperator(deps, ctx);
    return withPlatformAudit(deps, ctx, { tool: 'list_platform_activity', input, role }, async () => {
      const { offset, limit } = pageOf(input, meta, ACTIVITY_WEB_DEFAULT);
      const today = utcDay(new Date());
      const sinceDay = addDays(today, -AT_RISK_WINDOW_DAYS);
      const [agencies, clients, activations, firstBriefs, stats, supportStarts] = await Promise.all([
        deps.service.select({ id: agency.id, name: agency.name, createdAt: agency.createdAt }).from(agency).where(isNull(agency.archivedAt)),
        deps.service.select({ id: client.id, agencyId: client.agencyId, name: client.name, createdAt: client.createdAt }).from(client).where(isNull(client.archivedAt)),
        deps.service
          .select({ id: auditLog.id, agencyId: auditLog.agencyId, at: auditLog.createdAt })
          .from(auditLog)
          .where(and(inArray(auditLog.tool, [...ACTIVATION_TOOLS]), eq(auditLog.outcome, 'ok'))),
        deps.service
          .select({ clientId: brief.clientId, at: sql<string | Date>`min(${brief.sentAt})` })
          .from(brief)
          .where(and(eq(brief.status, 'sent'), sql`${brief.sentAt} is not null`))
          .groupBy(brief.clientId),
        deps.service
          .select({ agencyId: agencyDailyStat.agencyId, day: agencyDailyStat.day, clientsActive: agencyDailyStat.clientsActive, wau: agencyDailyStat.wau, lastActivityAt: agencyDailyStat.lastActivityAt })
          .from(agencyDailyStat)
          .where(and(gte(agencyDailyStat.day, addDays(sinceDay, -57)), lte(agencyDailyStat.day, today))),
        // Never the reason: it is shown to the agency, not in the platform-wide feed.
        deps.service.select({ id: supportSession.id, agencyId: supportSession.agencyId, at: supportSession.startedAt }).from(supportSession),
      ]);
      const agencyName = new Map(agencies.map((a) => [a.id, a.name]));
      const clientById = new Map(clients.map((c) => [c.id, c]));
      const events: ActivityEvent[] = [];
      const push = (e: Omit<ActivityEvent, 'agencyName'>) => {
        const name = agencyName.get(e.agencyId);
        if (name !== undefined) events.push({ ...e, agencyName: name });
      };
      for (const a of agencies) push({ at: a.createdAt, kind: 'agency_created', id: a.id, agencyId: a.id });
      for (const c of clients) push({ at: c.createdAt, kind: 'client_created', id: c.id, agencyId: c.agencyId, clientName: c.name });
      for (const r of activations) push({ at: r.at, kind: 'client_activated', id: r.id, agencyId: r.agencyId });
      for (const b of firstBriefs) {
        const c = clientById.get(b.clientId);
        if (c) push({ at: new Date(b.at), kind: 'first_brief_sent', id: b.clientId, agencyId: c.agencyId, clientName: c.name });
      }
      for (const r of supportStarts) push({ at: r.at, kind: 'support_session_started', id: r.id, agencyId: r.agencyId });
      const created = new Map(agencies.map((a) => [a.id, a.createdAt]));
      for (const t of atRiskTransitions(stats, created, sinceDay)) push({ at: new Date(`${t.day}T00:00:00.000Z`), kind: 'health_at_risk', id: `${t.agencyId}:${t.day}`, agencyId: t.agencyId });
      // Deterministic: newest first, then kind, then id, so offset pages never reshuffle equal timestamps.
      events.sort((x, y) => y.at.getTime() - x.at.getTime() || (x.kind < y.kind ? -1 : x.kind > y.kind ? 1 : 0) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
      const page = pageResult(events.slice(offset, offset + limit + 1), limit, offset);
      return {
        items: page.rows.map((e) => ({ at: e.at.toISOString(), kind: e.kind, agencyId: e.agencyId, agencyName: e.agencyName, ...(e.clientName !== undefined ? { clientName: e.clientName } : {}) })),
        nextCursor: page.nextCursor,
      };
    });
  },
});

export const platformConsoleTools = [platformOverview, listPlatformAgencies, getPlatformAgency, listPlatformActivity];
