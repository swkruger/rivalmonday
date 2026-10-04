import { alert, alertEvent, changeEvent, client, type Db, eventScore } from '@cs/db';
import { and, asc, desc, eq, gt, isNull, lt, lte, ne, notInArray, sql } from 'drizzle-orm';

export const ALERT_LOOKBACK_HOURS = 48;
export const ALERT_MERGE_HOURS = 72;
export const ALERT_REVIEW_EXPIRY_DAYS = 7;
const HOUR = 3_600_000;

export interface SweepResult {
  created: number;
  merged: number;
  expired: number;
  drafting: string[];
}

/** Serialises alert creation/merging and throttled release for one client (transaction-level advisory lock). */
export const lockClientAlerts = (clientId: string) => sql`SELECT pg_advisory_xact_lock(hashtext(${`alerts:${clientId}`}))`;

/**
 * Decision 6: every recent, live, alert-routed event becomes an alert for its client, or joins that client's live
 * alert for the same competitor, change type and service from the last 72 h (near-duplicate merge, spec §9.3).
 */
export async function sweepAlerts(db: Db, now: Date, limit = 100): Promise<SweepResult> {
  const out: SweepResult = { created: 0, merged: 0, expired: 0, drafting: [] };
  const rows = await db
    .select({ agencyId: eventScore.agencyId, clientId: eventScore.clientId, score: eventScore.score, e: changeEvent, verticalId: client.verticalId, mode: client.alertMode })
    .from(eventScore)
    .innerJoin(changeEvent, eq(changeEvent.id, eventScore.eventId))
    .innerJoin(client, eq(client.id, eventScore.clientId))
    .where(and(
      eq(eventScore.route, 'alert'), isNull(changeEvent.retractedAt), ne(changeEvent.changeType, 'cosmetic'),
      gt(eventScore.scoredAt, new Date(now.getTime() - ALERT_LOOKBACK_HOURS * HOUR)), lte(eventScore.scoredAt, now),
      sql`NOT EXISTS (SELECT 1 FROM alert_event ae WHERE ae.client_id = ${eventScore.clientId} AND ae.event_id = ${eventScore.eventId})`,
    ))
    .orderBy(asc(eventScore.scoredAt), asc(changeEvent.id))
    .limit(limit);

  for (const r of rows) {
    await db.transaction(async (tx) => {
      await tx.execute(lockClientAlerts(r.clientId));
      const [already] = await tx.select({ id: alertEvent.alertId }).from(alertEvent).where(and(eq(alertEvent.clientId, r.clientId), eq(alertEvent.eventId, r.e.id)));
      if (already) return;
      const service = r.e.services[r.verticalId] ?? null;
      const svc = sql`(${changeEvent.services} ->> ${r.verticalId})`;
      const [twin] = await tx
        .select({ id: alert.id, score: alert.score })
        .from(alert)
        .innerJoin(changeEvent, eq(changeEvent.id, alert.eventId))
        .where(and(
          eq(alert.clientId, r.clientId), eq(alert.competitorId, r.e.competitorId), eq(changeEvent.changeType, r.e.changeType),
          service === null ? sql`${svc} IS NULL` : sql`${svc} = ${service}`,
          notInArray(alert.status, ['dismissed', 'withdrawn', 'expired']), gt(alert.createdAt, new Date(now.getTime() - ALERT_MERGE_HOURS * HOUR)),
        ))
        .orderBy(desc(alert.createdAt))
        .limit(1);
      if (twin) {
        await tx.insert(alertEvent).values({ alertId: twin.id, agencyId: r.agencyId, clientId: r.clientId, eventId: r.e.id });
        await tx.update(alert).set({ score: Math.max(twin.score, r.score), updatedAt: now }).where(eq(alert.id, twin.id));
        out.merged++;
        return;
      }
      const [a] = await tx
        .insert(alert)
        .values({ agencyId: r.agencyId, clientId: r.clientId, competitorId: r.e.competitorId, eventId: r.e.id, score: r.score, status: 'drafting', mode: r.mode, createdAt: now, updatedAt: now })
        .returning({ id: alert.id });
      await tx.insert(alertEvent).values({ alertId: a!.id, agencyId: r.agencyId, clientId: r.clientId, eventId: r.e.id });
      out.created++;
    });
  }

  const expired = await db
    .update(alert)
    .set({ status: 'expired', updatedAt: now })
    .where(and(eq(alert.status, 'pending_review'), lt(alert.createdAt, new Date(now.getTime() - ALERT_REVIEW_EXPIRY_DAYS * 24 * HOUR))))
    .returning({ id: alert.id });
  out.expired = expired.length;
  out.drafting = (await db.select({ id: alert.id }).from(alert).where(eq(alert.status, 'drafting')).orderBy(asc(alert.createdAt)).limit(limit)).map((a) => a.id);
  return out;
}
