import { type AccessContext, toolkit } from '@cs/core';
import { agencyDailyStat } from '@cs/db';
import { and, eq, gte, lte, type SQL, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { pageOf, pageResult } from '../paging';
import { requirePlatformOperator } from '../platform';
import { withPlatformAudit } from '../platform/audit';
import { type AgencyHealth, healthFlag } from '../platform/health';
import { bucketSeries, type SeriesRange, type SeriesRow, seriesWindowStart } from '../platform/series';
import { AGENCY_ROLES, addDays, CLIENT_ROLES, utcDay } from '../platform/stats';

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
};

const dateOrNull = (v: string | Date | null): Date | null => (v === null ? null : new Date(v));
const monthStartOf = (day: string) => `${day.slice(0, 7)}-01`;

/**
 * Live figures per agency (all agencies, or one). Same definitions as the nightly job (`platform/stats.ts`):
 * active = status 'active'; seats = distinct users per role group; wau = distinct members with a session in
 * [today−6 00:00Z, now]; spend = agency-attributed llm_call + vendor_call since the UTC month start.
 */
export async function liveAgencies(deps: Pick<ToolDeps, 'service'>, now: Date, agencyId?: string): Promise<LiveAgency[]> {
  const today = utcDay(now);
  const weekStart = sql`${`${addDays(today, -6)}T00:00:00.000Z`}::timestamptz`;
  const monthStart = sql`${`${monthStartOf(today)}T00:00:00.000Z`}::timestamptz`;
  const d28 = addDays(today, -28);
  const members = sql`(select m.user_id from membership m where m.agency_id = a.id)`;
  const staff = sql`(select m.user_id from membership m where m.agency_id = a.id and m.role in ${AGENCY_ROLES})`;
  const where: SQL = agencyId ? sql`where a.id = ${agencyId}` : sql``;
  const rows = [
    ...(await deps.service.execute<LiveRow>(sql`
      select a.id, a.name, a.created_at,
        (select count(*)::int from client c where c.agency_id = a.id and c.status = 'active') as clients_active,
        (select count(*)::int from client c where c.agency_id = a.id and c.status = 'prospect') as clients_prospect,
        (select count(distinct m.user_id)::int from membership m where m.agency_id = a.id and m.role in ${AGENCY_ROLES}) as agency_seats,
        (select count(distinct m.user_id)::int from membership m where m.agency_id = a.id and m.role in ${CLIENT_ROLES}) as client_seats,
        (select count(distinct s."userId")::int from auth.session s where s."userId" in ${members} and s."createdAt" >= ${weekStart}) as wau,
        (select max(s."createdAt") from auth.session s where s."userId" in ${members}) as last_activity_at,
        (select max(s."createdAt") from auth.session s where s."userId" in ${staff}) as last_sign_in_at,
        (select max(b.sent_at) from brief b where b.agency_id = a.id and b.status = 'sent') as last_brief_sent_at,
        round((
          (select coalesce(sum(cost_usd), 0) from llm_call where agency_id = a.id and created_at >= ${monthStart})
          + (select coalesce(sum(cost_usd), 0) from vendor_call where agency_id = a.id and created_at >= ${monthStart})
        )::numeric, 4)::text as spend_month_usd,
        (select d.clients_active from agency_daily_stat d where d.agency_id = a.id and d.day = ${d28}::date) as clients_active_28d
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
type ListRow = { id: string; name: string; createdAt: Date; clientsActive: number; clientsProspect: number; agencySeats: number; clientSeats: number; wau: number | null; lastActivityAt: Date | null; spendMonthUsd: number; health: AgencyHealth };

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

export const listPlatformAgencies = defineTool({
  name: 'list_platform_agencies',
  description: 'Platform operators: every agency with live figures (clients, seats, WAU, last activity, month-to-date spend) and a health flag.',
  input: z.object({
    sort: z.enum(SORTS).optional(),
    dir: z.enum(['asc', 'desc']).optional(),
    cursor: z.string().max(200).optional(),
    limit: z.number().int().min(1).max(100).optional(),
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
    })),
    nextCursor: z.string().nullable(),
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
      const all: ListRow[] = (await liveAgencies(deps, now)).map((a) => ({
        id: a.id, name: a.name, createdAt: a.createdAt, clientsActive: a.clientsActive, clientsProspect: a.clientsProspect,
        agencySeats: a.agencySeats, clientSeats: a.clientSeats, wau: a.wau, lastActivityAt: a.lastActivityAt,
        spendMonthUsd: a.spendMonthUsd, health: healthOf(a, now),
      }));
      all.sort(compareRows(sort, dir));
      const page = pageResult(all.slice(offset, offset + limit + 1), limit, offset);
      return {
        rows: page.rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), lastActivityAt: r.lastActivityAt?.toISOString() ?? null })),
        nextCursor: page.nextCursor,
      };
    });
  },
});

export const platformConsoleTools = [platformOverview, listPlatformAgencies];
