import { alert, changeEvent, client, competitor, type Db } from '@cs/db';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { safeTimezone } from '../briefs/schedule';
import { type DeliveryConfig, loadBranding, notify, personalLink } from '../delivery/outbox';
import { localClock } from '../delivery/time';
import { lockClientAlerts } from './create';

export const DIGEST_LOCAL_HOUR = 17;

/** Decision 9: from 17:00 client-local, one digest per client per local day of its approved digest alerts. */
export async function runAlertDigests(deps: { db: Db; delivery: DeliveryConfig }, now: Date): Promise<{ clients: number; alerts: number; withdrawn: number }> {
  const out = { clients: 0, alerts: 0, withdrawn: 0 };
  const waiting = await deps.db
    .selectDistinct({ clientId: alert.clientId, agencyId: alert.agencyId, name: client.name, timezone: client.timezone })
    .from(alert)
    .innerJoin(client, eq(client.id, alert.clientId))
    .where(and(eq(alert.status, 'approved'), eq(alert.delivery, 'digest')));
  for (const c of waiting) {
    const clock = localClock(now, safeTimezone(c.timezone));
    if (clock.hour < DIGEST_LOCAL_HOUR) continue;
    await deps.db.transaction(async (tx) => {
      await tx.execute(lockClientAlerts(c.clientId));
      const [done] = await tx.select({ id: alert.id }).from(alert)
        .where(and(eq(alert.clientId, c.clientId), eq(alert.delivery, 'digest'), eq(alert.status, 'delivered'), eq(alert.deliveredLocalDate, clock.date))).limit(1);
      if (done) return;
      const rows = await tx
        .select({ a: alert, retractedAt: changeEvent.retractedAt, competitorName: competitor.name })
        .from(alert)
        .innerJoin(changeEvent, eq(changeEvent.id, alert.eventId))
        .innerJoin(competitor, eq(competitor.id, alert.competitorId))
        .where(and(eq(alert.clientId, c.clientId), eq(alert.status, 'approved'), eq(alert.delivery, 'digest')))
        .orderBy(asc(alert.createdAt), asc(alert.id))
        .for('update', { of: alert });
      const gone = rows.filter((r) => r.retractedAt);
      if (gone.length > 0) {
        await tx.update(alert).set({ status: 'withdrawn', updatedAt: now }).where(inArray(alert.id, gone.map((r) => r.a.id)));
        out.withdrawn += gone.length;
      }
      const live = rows.filter((r) => !r.retractedAt);
      if (live.length === 0) return;
      await tx.update(alert).set({ status: 'delivered', deliveredAt: now, deliveredLocalDate: clock.date, updatedAt: now }).where(inArray(alert.id, live.map((r) => r.a.id)));
      const branding = await loadBranding(tx, c.agencyId);
      const scope = { agencyId: c.agencyId, clientId: c.clientId };
      const title = `${live.length} more competitor alert${live.length === 1 ? '' : 's'} today`;
      await notify(tx, deps.delivery, {
        ...scope, kind: 'alert_digest', audience: 'client', subjectType: 'digest', subjectId: c.clientId, dedupe: `digest:${c.clientId}:${clock.date}`,
        link: { t: 'notifications', id: c.clientId }, now,
        build: (r, link) => ({
          title, body: live.map((x) => x.a.headline).join('\n'),
          email: { template: 'alert_digest', props: {
            branding, recipientName: r?.name ?? null, clientName: c.name, date: clock.date, link,
            alerts: live.map((x) => ({ competitorName: x.competitorName, headline: x.a.headline, body: x.a.body, link: r ? personalLink(deps.delivery, r.contactId, scope, 'alert', x.a.id, now) : link })),
          } },
        }),
      });
      out.clients++;
      out.alerts += live.length;
    });
  }
  return out;
}
