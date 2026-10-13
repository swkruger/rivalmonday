import { agency, agencyDailyStat, type Db, type Tx } from '@cs/db';
import { asc, sql } from 'drizzle-orm';

/** The worker's / seed's service-role connection (BYPASSRLS): agency_daily_stat is service-role only. */
export type ServiceDb = Db;
export type AgencyDailyStatInsert = typeof agencyDailyStat.$inferInsert;

export interface StatSources {
  hasAsk: boolean;
  hasMcp: boolean;
}

export interface ComputeOpts extends StatSources {
  /** Backfill: only figures reconstructable from dated rows; wau, last_activity_at, ask_questions, mcp_calls stay NULL. */
  reconstructOnly: boolean;
}

const DAY_MS = 86_400_000;
/** Spec § Nightly job: backfill history goes back at most 400 days. */
export const BACKFILL_MAX_DAYS = 400;
const UPSERT_CHUNK = 500;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const AGENCY_ROLES = sql`('agency_admin', 'account_manager')`;
const CLIENT_ROLES = sql`('client_owner', 'client_viewer')`;

/** UTC calendar day (YYYY-MM-DD) of an instant. */
export function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(day: string, n: number): string {
  return utcDay(new Date(Date.parse(`${day}T00:00:00.000Z`) + n * DAY_MS));
}

function assertDay(day: string): void {
  if (!DAY_RE.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00.000Z`)) || addDays(day, 0) !== day) {
    throw new Error(`invalid stats day '${day}' (expected YYYY-MM-DD)`);
  }
}

/** P4: Ask / MCP sources, detected once per run. A missing source yields NULL (not measured), never 0. */
export async function detectStatSources(db: ServiceDb): Promise<StatSources> {
  const [r] = [
    ...(await db.execute<{ has_ask: boolean; has_mcp: boolean }>(sql`
      select to_regclass('public.ask_message') is not null as has_ask,
             (to_regclass('public.audit_log') is not null and exists (
               select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'audit_log' and column_name = 'channel')) as has_mcp`)),
  ];
  return { hasAsk: r?.has_ask === true, hasMcp: r?.has_mcp === true };
}

type DayRow = {
  clients_active: number;
  clients_prospect: number;
  agency_seats: number;
  client_seats: number;
  briefs_sent: number;
  alerts_sent: number;
  prospect_reports: number;
  spend_usd: string;
  wau: number | null;
  last_activity_at: string | Date | null;
  ask_questions: number | null;
  mcp_calls: number | null;
};

/**
 * One agency's figures for one UTC day [day 00:00Z, day+1 00:00Z), in a single statement.
 * Levels (clients, seats) count current rows created before the day ends; flows count rows dated inside the day.
 */
export async function computeAgencyDay(db: ServiceDb, agencyId: string, day: string, opts: ComputeOpts): Promise<AgencyDailyStatInsert> {
  assertDay(day);
  const start = `${day}T00:00:00.000Z`;
  const end = `${addDays(day, 1)}T00:00:00.000Z`;
  const weekStart = `${addDays(day, -6)}T00:00:00.000Z`;
  const s = sql`${start}::timestamptz`;
  const e = sql`${end}::timestamptz`;
  const members = sql`(select m.user_id from membership m where m.agency_id = ${agencyId})`;
  const measured = !opts.reconstructOnly;

  const wau = measured
    ? sql`(select count(distinct s."userId")::int from auth.session s
           where s."userId" in ${members} and s."createdAt" >= ${weekStart}::timestamptz and s."createdAt" < ${e})`
    : sql`null::int`;
  const lastActivity = measured
    ? sql`(select max(s."createdAt") from auth.session s where s."userId" in ${members} and s."createdAt" < ${e})`
    : sql`null::timestamptz`;
  const ask = measured && opts.hasAsk
    ? sql`(select count(*)::int from ask_message where agency_id = ${agencyId} and role = 'user' and created_at >= ${s} and created_at < ${e})`
    : sql`null::int`;
  const mcp = measured && opts.hasMcp
    ? sql`(select count(*)::int from audit_log where agency_id = ${agencyId} and channel = 'mcp' and created_at >= ${s} and created_at < ${e})`
    : sql`null::int`;

  const [r] = [
    ...(await db.execute<DayRow>(sql`
      select
        (select count(*)::int from client where agency_id = ${agencyId} and status = 'active' and created_at < ${e}) as clients_active,
        (select count(*)::int from client where agency_id = ${agencyId} and status = 'prospect' and created_at < ${e}) as clients_prospect,
        (select count(distinct user_id)::int from membership where agency_id = ${agencyId} and role in ${AGENCY_ROLES} and created_at < ${e}) as agency_seats,
        (select count(distinct user_id)::int from membership where agency_id = ${agencyId} and role in ${CLIENT_ROLES} and created_at < ${e}) as client_seats,
        (select count(*)::int from brief where agency_id = ${agencyId} and status = 'sent' and sent_at >= ${s} and sent_at < ${e}) as briefs_sent,
        (select count(*)::int from alert where agency_id = ${agencyId} and status = 'delivered' and delivered_at >= ${s} and delivered_at < ${e}) as alerts_sent,
        (select count(*)::int from prospect_report where agency_id = ${agencyId} and status = 'ready'
           and coalesce(finished_at, created_at) >= ${s} and coalesce(finished_at, created_at) < ${e}) as prospect_reports,
        round((
          (select coalesce(sum(cost_usd), 0) from llm_call where agency_id = ${agencyId} and created_at >= ${s} and created_at < ${e})
          + (select coalesce(sum(cost_usd), 0) from vendor_call where agency_id = ${agencyId} and created_at >= ${s} and created_at < ${e})
        )::numeric, 4)::text as spend_usd,
        ${wau} as wau,
        ${lastActivity} as last_activity_at,
        ${ask} as ask_questions,
        ${mcp} as mcp_calls`)),
  ];
  if (!r) throw new Error('stats query returned no row');
  return {
    agencyId,
    day,
    clientsActive: r.clients_active,
    clientsProspect: r.clients_prospect,
    agencySeats: r.agency_seats,
    clientSeats: r.client_seats,
    wau: r.wau,
    briefsSent: r.briefs_sent,
    alertsSent: r.alerts_sent,
    prospectReports: r.prospect_reports,
    askQuestions: r.ask_questions,
    mcpCalls: r.mcp_calls,
    spendUsd: r.spend_usd,
    lastActivityAt: r.last_activity_at === null ? null : new Date(r.last_activity_at),
  };
}

const STAT_COLUMNS = [
  'clients_active', 'clients_prospect', 'agency_seats', 'client_seats', 'wau', 'briefs_sent', 'alerts_sent',
  'prospect_reports', 'ask_questions', 'mcp_calls', 'spend_usd', 'last_activity_at',
] as const;
const SET_KEYS = {
  clients_active: 'clientsActive', clients_prospect: 'clientsProspect', agency_seats: 'agencySeats', client_seats: 'clientSeats',
  wau: 'wau', briefs_sent: 'briefsSent', alerts_sent: 'alertsSent', prospect_reports: 'prospectReports',
  ask_questions: 'askQuestions', mcp_calls: 'mcpCalls', spend_usd: 'spendUsd', last_activity_at: 'lastActivityAt',
} as const satisfies Record<(typeof STAT_COLUMNS)[number], keyof AgencyDailyStatInsert>;

/**
 * `INSERT … ON CONFLICT (agency_id, day) DO UPDATE` (idempotent).
 * Live rows (default) replace the stored figures. Reconstructed rows (`reconstructOnly: true`, the backfill) only fill
 * columns that are still NULL, so a backfill never nulls — or rewrites — a measured value.
 * Rows in one call must have distinct (agency_id, day).
 */
export async function upsertDailyStats(db: ServiceDb | Tx, rows: AgencyDailyStatInsert[], opts: { reconstructOnly?: boolean } = {}): Promise<void> {
  const set: Record<string, unknown> = { computedAt: sql`now()` };
  for (const col of STAT_COLUMNS) {
    const c = sql.raw(`"${col}"`);
    set[SET_KEYS[col]] = opts.reconstructOnly
      ? sql`coalesce(${agencyDailyStat}.${c}, excluded.${c})`
      : sql`excluded.${c}`;
  }
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    await db.insert(agencyDailyStat).values(chunk).onConflictDoUpdate({ target: [agencyDailyStat.agencyId, agencyDailyStat.day], set });
  }
}

export interface RunDailyStatsOpts {
  /** Recompute this UTC day (YYYY-MM-DD) instead of yesterday. */
  day?: string;
  /** Fill history from max(agency.created_at, today − 400 d) to yesterday. Automatic when the table is empty. */
  backfill?: boolean;
  now?: Date;
}

/**
 * The nightly job (spec § Nightly job): yesterday (UTC) — or `day` — for every agency, measured.
 * With a backfill, the earlier days are reconstructed (`reconstructOnly`) and only fill gaps.
 * Returns how many agencies got rows and how many distinct days were written.
 */
export async function runDailyStats(db: ServiceDb, opts: RunDailyStatsOpts = {}): Promise<{ agencies: number; days: number }> {
  const now = opts.now ?? new Date();
  const today = utcDay(now);
  const yesterday = addDays(today, -1);
  const target = opts.day ?? yesterday;
  assertDay(target);

  const empty = opts.day === undefined && (await db.select({ day: agencyDailyStat.day }).from(agencyDailyStat).limit(1)).length === 0;
  const backfill = opts.backfill === true || empty;
  const sources = await detectStatSources(db);
  const floor = addDays(today, -BACKFILL_MAX_DAYS);

  const agencies = await db.select({ id: agency.id, createdAt: agency.createdAt }).from(agency).orderBy(asc(agency.createdAt));
  const daysWritten = new Set<string>();
  let agencyCount = 0;

  for (const a of agencies) {
    const created = utcDay(a.createdAt);
    const history: AgencyDailyStatInsert[] = [];
    if (backfill) {
      const from = created > floor ? created : floor;
      for (let d = from; d <= yesterday; d = addDays(d, 1)) {
        if (d === target) continue;
        history.push(await computeAgencyDay(db, a.id, d, { ...sources, reconstructOnly: true }));
      }
    }
    const rows = created <= target ? [await computeAgencyDay(db, a.id, target, { ...sources, reconstructOnly: false })] : [];
    if (history.length === 0 && rows.length === 0) continue;
    await db.transaction(async (tx) => {
      await upsertDailyStats(tx, history, { reconstructOnly: true });
      await upsertDailyStats(tx, rows);
    });
    agencyCount += 1;
    for (const r of [...history, ...rows]) daysWritten.add(r.day);
  }
  return { agencies: agencyCount, days: daysWritten.size };
}
