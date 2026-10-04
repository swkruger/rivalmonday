import { alert, brief, changeEvent, client, competitor, type Db, eventScore, move, moveEvent, recommendation, type TrendReportData, trendReport } from '@cs/db';
import { renderTrendReportDocument, type TrendReportEmailProps } from '@cs/email';
import { and, eq, gt, gte, isNull, lt, ne, sql } from 'drizzle-orm';
import { PDF_CATCHUP_DAYS, type PdfDeps } from '../briefs/pdf';
import { safeTimezone } from '../briefs/schedule';
import { trendSnapshot } from '../briefs/trend';
import { type DeliveryConfig, loadBranding, notify, personalLink } from '../delivery/outbox';
import { localClock, zonedTimeToUtc } from '../delivery/time';
import type { PackLoader } from '../tag/tag-stage';

export const REPORT_LOCAL_HOUR = 8;
export const REPORT_FIRST_DAYS = 7;
export const QUARTER_WINDOW_DAYS = 90;
const QUARTER_START_MONTHS = [1, 4, 7, 10];

export function previousQuarter(localDate: string): { quarter: string; startDate: string; endDate: string } {
  const [y, m] = localDate.split('-').map(Number);
  const currentStart = Math.floor((m! - 1) / 3) * 3 + 1;
  const end = `${y}-${String(currentStart).padStart(2, '0')}-01`;
  const startMonth = currentStart === 1 ? 10 : currentStart - 3;
  const startYear = currentStart === 1 ? y! - 1 : y!;
  return { quarter: `${startYear}-Q${(startMonth - 1) / 3 + 1}`, startDate: `${startYear}-${String(startMonth).padStart(2, '0')}-01`, endDate: end };
}

const count = sql<number>`count(*)::int`;
const inPeriod = (col: Parameters<typeof gte>[0], p: { start: Date; end: Date }) => and(gte(col, p.start), lt(col, p.end));

/** Decision 17: deterministic numbers only (nothing model-written, so nothing to verify). */
export async function computeTrendReport(deps: { db: Db; packs: PackLoader }, clientId: string, period: { start: Date; end: Date }, quarter: string): Promise<TrendReportData> {
  const snap = await trendSnapshot(deps, clientId, period, QUARTER_WINDOW_DAYS);
  const byType = await deps.db
    .select({ type: changeEvent.changeType, n: count })
    .from(eventScore)
    .innerJoin(changeEvent, eq(changeEvent.id, eventScore.eventId))
    .where(and(eq(eventScore.clientId, clientId), isNull(changeEvent.retractedAt), ne(changeEvent.changeType, 'cosmetic'), inPeriod(eventScore.scoredAt, period)))
    .groupBy(changeEvent.changeType);
  const moves = await deps.db
    .select({ moveType: move.moveType, name: competitor.name, status: move.status, closedAt: move.closedAt, first: move.firstDetectedAt })
    .from(move)
    .innerJoin(competitor, eq(competitor.id, move.competitorId))
    .where(and(
      eq(move.clientId, clientId), inPeriod(move.firstDetectedAt, period),
      // No evidence, no claim: a move counts only while at least one of its events is live.
      sql`EXISTS (SELECT 1 FROM ${moveEvent} me JOIN ${changeEvent} ce ON ce.id = me.event_id WHERE me.move_id = ${move.id} AND ce.retracted_at IS NULL)`,
    ))
    .orderBy(move.firstDetectedAt);
  const [briefs] = await deps.db.select({ n: count }).from(brief).where(and(eq(brief.clientId, clientId), eq(brief.status, 'sent'), inPeriod(brief.sentAt, period)));
  const [alerts] = await deps.db.select({ n: count }).from(alert).where(and(eq(alert.clientId, clientId), eq(alert.status, 'delivered'), inPeriod(alert.deliveredAt, period)));
  const recs = await deps.db.select({ status: recommendation.status, n: count }).from(recommendation).where(and(eq(recommendation.clientId, clientId), inPeriod(recommendation.createdAt, period))).groupBy(recommendation.status);
  const recN = (s: string) => recs.find((r) => r.status === s)?.n ?? 0;
  return {
    quarter, windowDays: QUARTER_WINDOW_DAYS, businesses: snap.businesses,
    eventsByType: Object.fromEntries(byType.map((r) => [r.type, r.n])),
    moves: moves.map((m) => ({ moveType: m.moveType, competitorName: m.name, status: m.closedAt ? 'closed' : m.status, firstDetectedAt: m.first.toISOString().slice(0, 10) })),
    briefsSent: briefs?.n ?? 0, alertsDelivered: alerts?.n ?? 0,
    recommendations: { created: recs.reduce((s, r) => s + r.n, 0), done: recN('done'), inProgress: recN('in_progress'), dismissed: recN('dismissed') },
  };
}

/** Decision 17: hourly; in the first week of a quarter, from 08:00 client-local, last quarter's report for every client. */
export async function runQuarterlyReports(deps: { db: Db; packs: PackLoader; delivery: DeliveryConfig }, now: Date): Promise<{ created: string[] }> {
  const created: string[] = [];
  const clients = await deps.db.select({ id: client.id, agencyId: client.agencyId, name: client.name, timezone: client.timezone, createdAt: client.createdAt }).from(client);
  for (const c of clients) {
    const tz = safeTimezone(c.timezone);
    const clock = localClock(now, tz);
    const [, m, d] = clock.date.split('-').map(Number);
    if (!QUARTER_START_MONTHS.includes(m!) || d! > REPORT_FIRST_DAYS || clock.hour < REPORT_LOCAL_HOUR) continue;
    const q = previousQuarter(clock.date);
    const period = { start: zonedTimeToUtc(q.startDate, '00:00', tz), end: zonedTimeToUtc(q.endDate, '00:00', tz) };
    if (c.createdAt >= period.end) continue;
    const [exists] = await deps.db.select({ id: trendReport.id }).from(trendReport).where(and(eq(trendReport.clientId, c.id), eq(trendReport.quarter, q.quarter)));
    if (exists) continue;
    try {
      const data = await computeTrendReport(deps, c.id, period, q.quarter);
      const id = await deps.db.transaction(async (tx) => {
        const [rep] = await tx.insert(trendReport).values({ agencyId: c.agencyId, clientId: c.id, quarter: q.quarter, periodStart: period.start, periodEnd: period.end, data, status: 'sent', sentAt: now }).onConflictDoNothing().returning({ id: trendReport.id });
        if (!rep) return null;
        const branding = await loadBranding(tx, c.agencyId);
        const scope = { agencyId: c.agencyId, clientId: c.id };
        const title = `Competitor trends for ${q.quarter}`;
        for (const audience of ['client', 'agency'] as const) {
          await notify(tx, deps.delivery, {
            ...scope, kind: 'trend_report', audience, subjectType: 'trend_report', subjectId: rep.id, dedupe: `trend_report:${rep.id}:${audience}`, link: { t: 'trend_report', id: rep.id }, now,
            build: (r, link) => {
              const props: TrendReportEmailProps = { branding, recipientName: r?.name ?? null, clientName: c.name, quarter: q.quarter, data, link, pdfLink: r ? personalLink(deps.delivery, r.contactId, scope, 'trend_report_pdf', rep.id, now) : null };
              return { title, body: `${c.name}: your competitor trends for ${q.quarter} are ready.`, email: { template: 'trend_report', props } };
            },
          });
        }
        return rep.id;
      });
      if (id) created.push(id);
    } catch (err) {
      console.warn(`[reports] quarterly report for client ${c.id} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { created };
}

/** Sent reports from the last 7 days whose PDF never rendered (the email already links it): the hourly tick re-enqueues them. */
export async function listReportsMissingPdf(db: Db, now: Date): Promise<string[]> {
  const rows = await db.select({ id: trendReport.id }).from(trendReport)
    .where(and(eq(trendReport.status, 'sent'), isNull(trendReport.pdfKey), gt(trendReport.sentAt, new Date(now.getTime() - PDF_CATCHUP_DAYS * 86_400_000))));
  return rows.map((r) => r.id);
}

export const reportPdfKey = (agencyId: string, reportId: string) => `reports/${agencyId}/${reportId}.pdf`;

export async function renderReportPdf(deps: PdfDeps, reportId: string): Promise<{ key: string }> {
  const [row] = await deps.db.select({ r: trendReport, name: client.name }).from(trendReport).innerJoin(client, eq(client.id, trendReport.clientId)).where(eq(trendReport.id, reportId));
  if (!row?.r.data) throw new Error(`trend report ${reportId} not found`);
  const branding = await loadBranding(deps.db, row.r.agencyId);
  const html = await renderTrendReportDocument({ branding, recipientName: null, clientName: row.name, quarter: row.r.quarter, data: row.r.data, link: null, pdfLink: null });
  const bytes = await deps.pdf(html, { title: `${row.name} — competitor trends ${row.r.quarter}`, author: branding.displayName, subject: 'Quarterly competitor trend report' }, { allowUrls: branding.logoUrl ? [branding.logoUrl] : [] });
  const key = reportPdfKey(row.r.agencyId, reportId);
  await deps.store.put(key, bytes, 'application/pdf');
  await deps.db.update(trendReport).set({ pdfKey: key }).where(eq(trendReport.id, reportId));
  return { key };
}
