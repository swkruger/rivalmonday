import { agency, agencyServiceable, brief, client, clientSetup, clientWorkAllowed, type Db, type OpsAlert, opsAlert } from '@cs/db';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { DELIVERY_LOCAL_HOUR } from './deliver';
import { STARTING_POINT_WAIT_HOURS } from './readiness';
import { BRIEF_CATCHUP_UNTIL_HOUR, BRIEF_LOCAL_HOUR, BRIEF_LOCAL_WEEKDAY, briefDue, DEFAULT_TIMEZONE, deliveryDateFor, localParts, safeTimezone } from './schedule';
import { startingPointClockStart } from './setup-clock';

/** 7c2: when a client's weekly brief (or one-off starting point) is checked for readiness. */
export type ReadinessCheckpoint = 'generation_closed' | 'pre_delivery' | 'pre_delivery_unapproved' | 'starting_point_late';

export interface ReadinessIssue {
  checkpoint: ReadinessCheckpoint;
  severity: 'warning' | 'critical';
  /** The local Monday the briefs are for (`YYYY-MM-DD`); for `starting_point_late` the UTC date the starting point was due. */
  deliveryDate: string;
  /** Weekly issues: the clients' (safe) IANA time zone; issues are grouped per zone. Absent for `starting_point_late`. */
  timezone?: string;
  dedupeKey: string;
  clients: { clientId: string; clientName: string; agencyName: string }[];
}

/** Sunday 19:00 client time: twelve hours before Monday 07:00 delivery. */
export const PRE_DELIVERY_LOCAL_HOUR = 19;
/** A starting point still not ready this long after it was due (clock start + 48 h) is late. */
export const STARTING_POINT_LATE_HOURS = 6;

const OK_STATUSES = new Set(['ready', 'approved', 'sent']);
const HOUR_MS = 3_600_000;

/**
 * Which weekly checkpoint applies at `now` in `tz`: from Friday 12:00 (generation closed) through Monday 06:59 local, with
 * `preDelivery` from Sunday 19:00. `windowOpenedAt` = the Thursday 22:00 local the generation window opened (to the hour, so
 * it may be off by one hour across a DST change). `null` outside the checkpoint window.
 */
export function weeklyCheckpoint(now: Date, tz: string): { deliveryDate: string; windowOpenedAt: Date; preDelivery: boolean } | null {
  const p = localParts(now, tz); // weekday 0 = Sun
  const fri = p.weekday === 5 && p.hour >= BRIEF_CATCHUP_UNTIL_HOUR, sat = p.weekday === 6, sun = p.weekday === 0;
  const mon = p.weekday === 1 && p.hour < DELIVERY_LOCAL_HOUR;
  if (!(fri || sat || sun || mon)) return null;
  const deliveryDate = mon ? `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}` : deliveryDateFor(now, tz);
  const hoursSinceOpen = ((p.weekday - BRIEF_LOCAL_WEEKDAY + 7) % 7) * 24 + p.hour - BRIEF_LOCAL_HOUR; // Thu 22:00 local
  const windowOpenedAt = new Date(now.getTime() - hoursSinceOpen * 3_600_000 - (now.getTime() % 3_600_000)); // ±1 h around DST
  return { deliveryDate, windowOpenedAt, preDelivery: (sun && p.hour >= PRE_DELIVERY_LOCAL_HOUR) || mon };
}

type IssueClient = ReadinessIssue['clients'][number];

const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** clientId → status of its brief on that date (`null` = none). `anyKind = false` ignores starting points. */
async function briefStatuses(db: Db, pairs: { clientId: string; date: string }[], anyKind: boolean): Promise<Map<string, string | null>> {
  const found = await db.execute<{ client_id: string; status: string | null }>(sql`
    SELECT d.client_id, b.status
      FROM unnest(ARRAY[${sql.join(pairs.map((p) => sql`${p.clientId}`), sql`, `)}]::uuid[],
                  ARRAY[${sql.join(pairs.map((p) => sql`${p.date}`), sql`, `)}]::date[]) AS d(client_id, delivery_date)
      LEFT JOIN brief b ON b.client_id = d.client_id AND b.delivery_date = d.delivery_date${anyKind ? sql`` : sql` AND b.kind <> 'starting_point'`}`);
  return new Map([...found].map((r) => [r.client_id, r.status]));
}

/**
 * Every brief or starting point that should exist by now and does not. Clients: workable (`clientWorkAllowed`: active, not
 * paused/archived/spend-paused) in a serviceable agency. Weekly issues are grouped per (checkpoint, delivery date, time zone); a late
 * starting point is one issue per client.
 */
export async function findReadinessIssues(db: Db, now: Date): Promise<ReadinessIssue[]> {
  const rows = await db
    .select({
      id: client.id, name: client.name, timezone: client.timezone, briefAutoSend: client.briefAutoSend, activatedAt: client.activatedAt, createdAt: client.createdAt,
      agencyName: agency.name,
      competitorsDoneAt: clientSetup.competitorsDoneAt, ownerPickRequestedAt: clientSetup.ownerPickRequestedAt, completedAt: clientSetup.completedAt, dismissedAt: clientSetup.dismissedAt, setupClientId: clientSetup.clientId,
      spStatus: brief.status,
    })
    .from(client)
    .innerJoin(agency, eq(agency.id, client.agencyId))
    .leftJoin(clientSetup, eq(clientSetup.clientId, client.id))
    .leftJoin(brief, and(eq(brief.clientId, client.id), eq(brief.kind, 'starting_point')))
    .where(and(clientWorkAllowed(client), agencyServiceable(client.agencyId)))
    .orderBy(agency.name, client.name);

  const groups = new Map<string, ReadinessIssue>();
  const add = (checkpoint: ReadinessCheckpoint, deliveryDate: string, timezone: string, c: IssueClient) => {
    // Per time zone: each zone crosses its checkpoint at its own hour, and a resolved key never reopens.
    const dedupeKey = `${checkpoint}:${deliveryDate}:${timezone}`;
    let g = groups.get(dedupeKey);
    if (!g) groups.set(dedupeKey, (g = { checkpoint, severity: checkpoint === 'pre_delivery_unapproved' ? 'warning' : 'critical', deliveryDate, timezone, dedupeKey, clients: [] }));
    g.clients.push(c);
  };

  // Weekly: the clients inside a checkpoint window that were already active when its generation window opened.
  const expected: { c: (typeof rows)[number]; tz: string; deliveryDate: string; preDelivery: boolean }[] = [];
  for (const c of rows) {
    const tz = safeTimezone(c.timezone);
    const cp = weeklyCheckpoint(now, tz);
    if (!cp || (c.activatedAt ?? c.createdAt).getTime() > cp.windowOpenedAt.getTime()) continue;
    expected.push({ c, tz, deliveryDate: cp.deliveryDate, preDelivery: cp.preDelivery });
  }
  if (expected.length > 0) {
    // One query for every (client, delivery date): any kind counts (a starting point may hold that Monday).
    const status = await briefStatuses(db, expected.map((e) => ({ clientId: e.c.id, date: e.deliveryDate })), true);
    for (const { c, tz, deliveryDate, preDelivery } of expected) {
      const s = status.get(c.id) ?? null;
      const ic = { clientId: c.id, clientName: c.name, agencyName: c.agencyName };
      if (preDelivery && (s === null || s === 'failed')) add('pre_delivery', deliveryDate, tz, ic);
      else if (preDelivery && s === 'ready' && !c.briefAutoSend) add('pre_delivery_unapproved', deliveryDate, tz, ic);
      else if (s === null || !OK_STATUSES.has(s)) add('generation_closed', deliveryDate, tz, ic);
    }
  }

  const issues = [...groups.values()];
  // Starting points: due at clock start + 48 h, late 6 h after that.
  const overdue: { c: (typeof rows)[number]; tz: string; due: Date; dueLocal: { date: string; monday: boolean } }[] = [];
  for (const c of rows) {
    if (c.spStatus !== null && OK_STATUSES.has(c.spStatus)) continue;
    const setup = c.setupClientId ? { competitorsDoneAt: c.competitorsDoneAt, ownerPickRequestedAt: c.ownerPickRequestedAt, completedAt: c.completedAt, dismissedAt: c.dismissedAt } : null;
    const start = startingPointClockStart(c, setup, now);
    if (!start) continue;
    const due = new Date(start.getTime() + STARTING_POINT_WAIT_HOURS * HOUR_MS);
    if (now.getTime() < due.getTime() + STARTING_POINT_LATE_HOURS * HOUR_MS) continue;
    const tz = safeTimezone(c.timezone);
    const p = localParts(due, tz);
    overdue.push({ c, tz, due, dueLocal: { date: ymd(p.year, p.month, p.day), monday: p.weekday === 1 } });
  }
  // The starting point claims `delivery_date` = local today, so on a local Monday already holding the client's weekly brief it
  // cannot be created until Tuesday: lateness then counts from Tuesday 00:00 local (late from Tuesday 06:00 local).
  const mondays = overdue.filter((o) => o.dueLocal.monday);
  const blocked = mondays.length ? await briefStatuses(db, mondays.map((o) => ({ clientId: o.c.id, date: o.dueLocal.date })), false) : new Map<string, string | null>();
  for (const { c, tz, due, dueLocal } of overdue) {
    if (dueLocal.monday && blocked.get(c.id)) {
      const p = localParts(now, tz);
      const tuesday = addDays(dueLocal.date, 1);
      const nowLocal = ymd(p.year, p.month, p.day);
      if (nowLocal < tuesday || (nowLocal === tuesday && p.hour < STARTING_POINT_LATE_HOURS)) continue;
    }
    issues.push({
      checkpoint: 'starting_point_late', severity: 'critical', deliveryDate: due.toISOString().slice(0, 10), dedupeKey: `starting_point_late:${c.id}`,
      clients: [{ clientId: c.id, clientName: c.name, agencyName: c.agencyName }],
    });
  }
  return issues.map((i) => ({ ...i, dedupeKey: `brief_readiness:${i.dedupeKey}` }));
}

/**
 * Records this run's issues in `ops_alert` (kind `brief_readiness`): a new key is inserted, an open one refreshed
 * (`last_seen_at`, `summary`, `severity`; `first_seen_at` kept; `emailed_at` cleared when the alert gained a client), an open one no longer reported resolved. A resolved key is
 * never reopened. `toEmail` = open rows not yet emailed.
 */
export async function checkBriefReadiness(db: Db, now: Date): Promise<{ open: OpsAlert[]; toEmail: OpsAlert[]; resolved: number }> {
  const issues = await findReadinessIssues(db, now);
  return db.transaction(async (tx) => {
    for (const i of issues) {
      const summary = { clients: i.clients, deliveryDate: i.deliveryDate, checkpoint: i.checkpoint };
      await tx.insert(opsAlert)
        .values({ kind: 'brief_readiness', dedupeKey: i.dedupeKey, severity: i.severity, summary, firstSeenAt: now, lastSeenAt: now })
        .onConflictDoUpdate({
          target: opsAlert.dedupeKey,
          set: {
            lastSeenAt: now, summary, severity: i.severity,
            // A client new to this open alert re-arms its email (the email lists every client); a shrinking or unchanged set does not.
            emailedAt: sql`CASE WHEN EXISTS (
                SELECT 1 FROM jsonb_array_elements(excluded.summary->'clients') n
                 WHERE NOT (coalesce(ops_alert.summary->'clients', '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('clientId', n->>'clientId'))))
              THEN NULL ELSE ops_alert.emailed_at END`,
          },
          setWhere: isNull(opsAlert.resolvedAt),
        });
    }
    const keys = issues.map((i) => i.dedupeKey);
    const resolved = await tx.update(opsAlert).set({ resolvedAt: now })
      .where(and(
        eq(opsAlert.kind, 'brief_readiness'), isNull(opsAlert.resolvedAt),
        ...(keys.length ? [sql`${opsAlert.dedupeKey} <> ALL(ARRAY[${sql.join(keys.map((k) => sql`${k}`), sql`, `)}]::text[])`] : []),
      ))
      .returning({ id: opsAlert.id });
    const open = await tx.select().from(opsAlert)
      .where(and(eq(opsAlert.kind, 'brief_readiness'), isNull(opsAlert.resolvedAt)))
      .orderBy(opsAlert.firstSeenAt, opsAlert.dedupeKey);
    return { open, toEmail: open.filter((a) => a.emailedAt === null), resolved: resolved.length };
  });
}

export async function markOpsAlertEmailed(db: Db, id: string, at: Date): Promise<void> {
  await db.update(opsAlert).set({ emailedAt: at }).where(eq(opsAlert.id, id));
}

/** 7c2 Task 7: the counts row of the readiness panel on /platform/health (open issues come from `ops_alert`). */
export interface BriefReadinessSummary {
  checkedAt: string;
  /** The `America/Chicago` cycle's delivery date; each client is counted against its own zone's date. */
  deliveryDate: string;
  /** Clients inside their cycle's span (Thu 22:00 to Mon 06:59 local) that were active when its generation window opened. */
  due: number;
  ready: number;
  approved: number;
  sent: number;
  /** Due with no brief for the date, or one still `generating`. */
  missing: number;
  failed: number;
  /** `ready` with auto-send off: goes out only once approved. */
  awaitingApproval: number;
  startingPointsLate: number;
}

/**
 * The span a client counts as due in the readiness summary: from its generation window opening (Thursday 22:00 local)
 * through Monday 06:59 local of that cycle's delivery Monday. Wider than `weeklyCheckpoint` (alarms start Friday 12:00)
 * so operators can watch generation progress. `null` outside it.
 */
function summaryCycle(now: Date, tz: string): { deliveryDate: string; windowOpenedAt: Date } | null {
  const cp = weeklyCheckpoint(now, tz);
  if (cp) return cp;
  if (!briefDue(now, tz)) return null; // Thu 22:00 to Fri 11:59 local is the remaining part of the span
  const p = localParts(now, tz);
  const hoursSinceOpen = ((p.weekday - BRIEF_LOCAL_WEEKDAY + 7) % 7) * 24 + p.hour - BRIEF_LOCAL_HOUR;
  return { deliveryDate: deliveryDateFor(now, tz), windowOpenedAt: new Date(now.getTime() - hoursSinceOpen * HOUR_MS - (now.getTime() % HOUR_MS)) };
}

/**
 * Live readiness counts. Per workable client its current cycle: from Thursday 22:00 through Monday 06:59 local
 * (`summaryCycle`) the client is due for that Monday if it was active when the window opened; outside it the cycle is the
 * next Monday and nothing is due yet. Status counts cover due clients only, by the brief (any kind) holding the client's
 * own delivery date.
 */
export async function summarizeBriefReadiness(db: Db, now: Date): Promise<BriefReadinessSummary> {
  const rows = await db
    .select({ id: client.id, timezone: client.timezone, briefAutoSend: client.briefAutoSend, activatedAt: client.activatedAt, createdAt: client.createdAt })
    .from(client)
    .where(and(clientWorkAllowed(client), agencyServiceable(client.agencyId)));
  const due: { c: (typeof rows)[number]; date: string }[] = [];
  for (const c of rows) {
    const cp = summaryCycle(now, safeTimezone(c.timezone));
    if (cp && (c.activatedAt ?? c.createdAt).getTime() <= cp.windowOpenedAt.getTime()) due.push({ c, date: cp.deliveryDate });
  }
  const status = due.length ? await briefStatuses(db, due.map((d) => ({ clientId: d.c.id, date: d.date })), true) : new Map<string, string | null>();
  const out: BriefReadinessSummary = {
    checkedAt: now.toISOString(),
    deliveryDate: summaryCycle(now, DEFAULT_TIMEZONE)?.deliveryDate ?? deliveryDateFor(now, DEFAULT_TIMEZONE),
    due: due.length, ready: 0, approved: 0, sent: 0, missing: 0, failed: 0, awaitingApproval: 0, startingPointsLate: 0,
  };
  for (const { c } of due) {
    const s = status.get(c.id) ?? null;
    if (s === 'ready') {
      out.ready++;
      if (!c.briefAutoSend) out.awaitingApproval++;
    } else if (s === 'approved') out.approved++;
    else if (s === 'sent') out.sent++;
    else if (s === 'failed') out.failed++;
    else out.missing++; // no row, or still generating
  }
  out.startingPointsLate = (await findReadinessIssues(db, now)).filter((i) => i.checkpoint === 'starting_point_late').length;
  return out;
}
