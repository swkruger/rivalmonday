import { agency, agencyServiceable, brief, client, clientSetup, clientWorkAllowed, type Db, type OpsAlert, opsAlert } from '@cs/db';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { DELIVERY_LOCAL_HOUR } from './deliver';
import { STARTING_POINT_WAIT_HOURS } from './readiness';
import { BRIEF_CATCHUP_UNTIL_HOUR, BRIEF_LOCAL_HOUR, BRIEF_LOCAL_WEEKDAY, deliveryDateFor, localParts, safeTimezone } from './schedule';
import { startingPointClockStart } from './setup-clock';

/** 7c2: when a client's weekly brief (or one-off starting point) is checked for readiness. */
export type ReadinessCheckpoint = 'generation_closed' | 'pre_delivery' | 'pre_delivery_unapproved' | 'starting_point_late';

export interface ReadinessIssue {
  checkpoint: ReadinessCheckpoint;
  severity: 'warning' | 'critical';
  /** The local Monday the briefs are for (`YYYY-MM-DD`); for `starting_point_late` the UTC date the starting point was due. */
  deliveryDate: string;
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

/**
 * Every brief or starting point that should exist by now and does not. Clients: workable (`clientWorkAllowed`: active, not
 * paused/archived/spend-paused) in a serviceable agency. Weekly issues are grouped per (checkpoint, delivery date); a late
 * starting point is one issue per client.
 */
export async function findReadinessIssues(db: Db, now: Date): Promise<ReadinessIssue[]> {
  const rows = await db
    .select({
      id: client.id, name: client.name, timezone: client.timezone, briefAutoSend: client.briefAutoSend, activatedAt: client.activatedAt, createdAt: client.createdAt,
      agencyName: agency.name,
      competitorsDoneAt: clientSetup.competitorsDoneAt, completedAt: clientSetup.completedAt, dismissedAt: clientSetup.dismissedAt, setupClientId: clientSetup.clientId,
      spStatus: brief.status,
    })
    .from(client)
    .innerJoin(agency, eq(agency.id, client.agencyId))
    .leftJoin(clientSetup, eq(clientSetup.clientId, client.id))
    .leftJoin(brief, and(eq(brief.clientId, client.id), eq(brief.kind, 'starting_point')))
    .where(and(clientWorkAllowed(client), agencyServiceable(client.agencyId)))
    .orderBy(agency.name, client.name);

  const groups = new Map<string, ReadinessIssue>();
  const add = (checkpoint: ReadinessCheckpoint, deliveryDate: string, c: IssueClient) => {
    const dedupeKey = `${checkpoint}:${deliveryDate}`;
    let g = groups.get(dedupeKey);
    if (!g) groups.set(dedupeKey, (g = { checkpoint, severity: checkpoint === 'pre_delivery_unapproved' ? 'warning' : 'critical', deliveryDate, dedupeKey, clients: [] }));
    g.clients.push(c);
  };

  // Weekly: the clients inside a checkpoint window that were already active when its generation window opened.
  const expected: { c: (typeof rows)[number]; deliveryDate: string; preDelivery: boolean }[] = [];
  for (const c of rows) {
    const cp = weeklyCheckpoint(now, safeTimezone(c.timezone));
    if (!cp || (c.activatedAt ?? c.createdAt).getTime() > cp.windowOpenedAt.getTime()) continue;
    expected.push({ c, deliveryDate: cp.deliveryDate, preDelivery: cp.preDelivery });
  }
  if (expected.length > 0) {
    // One query for every (client, delivery date): any kind counts (a starting point may hold that Monday).
    const found = await db.execute<{ client_id: string; status: string | null }>(sql`
      SELECT d.client_id, b.status
        FROM unnest(ARRAY[${sql.join(expected.map((e) => sql`${e.c.id}`), sql`, `)}]::uuid[],
                    ARRAY[${sql.join(expected.map((e) => sql`${e.deliveryDate}`), sql`, `)}]::date[]) AS d(client_id, delivery_date)
        LEFT JOIN brief b ON b.client_id = d.client_id AND b.delivery_date = d.delivery_date`);
    const status = new Map([...found].map((r) => [r.client_id, r.status]));
    for (const { c, deliveryDate, preDelivery } of expected) {
      const s = status.get(c.id) ?? null;
      const ic = { clientId: c.id, clientName: c.name, agencyName: c.agencyName };
      if (preDelivery && (s === null || s === 'failed')) add('pre_delivery', deliveryDate, ic);
      else if (preDelivery && s === 'ready' && !c.briefAutoSend) add('pre_delivery_unapproved', deliveryDate, ic);
      else if (s === null || !OK_STATUSES.has(s)) add('generation_closed', deliveryDate, ic);
    }
  }

  const issues = [...groups.values()];
  // Starting points: due at clock start + 48 h, late 6 h after that.
  for (const c of rows) {
    if (c.spStatus !== null && OK_STATUSES.has(c.spStatus)) continue;
    const setup = c.setupClientId ? { competitorsDoneAt: c.competitorsDoneAt, completedAt: c.completedAt, dismissedAt: c.dismissedAt } : null;
    const start = startingPointClockStart(c, setup, now);
    if (!start) continue;
    const due = new Date(start.getTime() + STARTING_POINT_WAIT_HOURS * HOUR_MS);
    if (now.getTime() < due.getTime() + STARTING_POINT_LATE_HOURS * HOUR_MS) continue;
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
