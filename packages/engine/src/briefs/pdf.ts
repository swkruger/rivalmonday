import { BriefReport, formatDayRange, type GradedChangesView, PDF_KEY_SUFFIX, type ReportTopic, topicOf } from '@cs/core';
import { brief, type Db } from '@cs/db';
import { type BriefReportDocumentProps, briefReportTitle, type PdfMeta, type PdfRenderer, renderBriefReportDocument } from '@cs/email';
import type { ObjectStore } from '@cs/storage';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { type BriefDeliveryView, briefEmailProps, loadBriefView, storedScorecardModel } from './deliver';
import { loadLiveChanges } from './summary';

export interface PdfDeps {
  db: Db;
  store: ObjectStore;
  pdf: PdfRenderer;
}
/** How long after sending a missing PDF is still re-rendered (the hourly delivery ticks re-enqueue it). */
export const PDF_CATCHUP_DAYS = 7;

/** Stateless backoff (7b1 Decision 6): re-render only when the whole hours since sending is a power of two (1, 2, 4 … 128 h; at most 8 renders over 7 days). */
export const PDF_RETRY_HOURS = (h: number): boolean => Number.isInteger(h) && h >= 1 && (h & (h - 1)) === 0;
export const pdfRetryDue = (sentAt: Date | null, now: Date): boolean => sentAt !== null && PDF_RETRY_HOURS(Math.floor((now.getTime() - sentAt.getTime()) / 3_600_000));

/** Sent briefs from the last 7 days whose PDF never rendered (the email already links it): the hourly tick re-enqueues them on the backoff hours only. */
export async function listBriefsMissingPdf(db: Db, now: Date): Promise<string[]> {
  const rows = await db.select({ id: brief.id, sentAt: brief.sentAt }).from(brief)
    .where(and(eq(brief.status, 'sent'), isNull(brief.pdfKey), gt(brief.sentAt, new Date(now.getTime() - PDF_CATCHUP_DAYS * 86_400_000))));
  return rows.filter((r) => pdfRetryDue(r.sentAt, now)).map((r) => r.id);
}

export const briefPdfKey = (agencyId: string, briefId: string) => `briefs/${agencyId}/${briefId}${PDF_KEY_SUFFIX}`;

/** Item topic (spec §4.8): move-based items → Moves; otherwise the topic of the first cited event's change type. */
const itemTopic = (i: BriefDeliveryView['items'][number]): ReportTopic => (i.moveId ? 'moves' : i.firstChangeType ? topicOf(i.firstChangeType) : 'offers');

/** The stored weekly report, or null for starting points, old briefs and a snapshot that no longer parses (warned). */
export function storedReport(v: BriefDeliveryView): BriefReport | null {
  if (v.b.kind === 'starting_point' || v.b.report === null || v.b.report === undefined) return null;
  const parsed = BriefReport.safeParse(v.b.report);
  if (parsed.success) return parsed.data;
  console.warn(`[briefs] brief ${v.b.id}: stored report does not parse, PDF falls back to cover + body: ${parsed.error.message}`);
  return null;
}

/**
 * Client-facing props of the brief PDF (decision 15: active items only, never the upsell tag; no links or feedback).
 * `live` = the graded lines still live at render (P3), never the stored `report.changes`. The scorecard is always shown (P7).
 * `report` = `storedReport(v)` when the caller already parsed it (parsed once per render).
 */
export function briefReportProps(v: BriefDeliveryView, live: GradedChangesView | null, mapImage: BriefReportDocumentProps['mapImage'], report: BriefReport | null = storedReport(v)): BriefReportDocumentProps {
  // 7c2: the PDF never carries the feedback line (it is an email-only prompt to reply).
  const legacy = { ...briefEmailProps(v, { recipientName: null, link: null, pdfLink: null, itemLink: () => null }), feedback: null };
  return {
    branding: v.branding, clientName: v.clientName, deliveryDate: v.b.deliveryDate,
    // period_end is the exclusive end of the window: the label names the last day inside it.
    periodLabel: formatDayRange(v.b.periodStart.toISOString(), new Date(v.b.periodEnd.getTime() - 1).toISOString(), v.timezone),
    kind: legacy.kind, summary: v.b.summary,
    items: legacy.items.map((it, n) => ({ ...it, link: null, topic: itemTopic(v.items[n]!) })),
    changes: report ? live : null, report, scorecard: report ? storedScorecardModel(v) : null, trend: v.b.trend, timezone: v.timezone, mapImage, legacy,
  };
}

/** PDF metadata (decision 16): the agency is the author; nothing names the platform. */
export const briefPdfMeta = (v: BriefDeliveryView): PdfMeta =>
  v.b.kind === 'starting_point'
    ? { title: `${v.clientName} — your starting point ${v.b.deliveryDate}`, author: v.branding.displayName, subject: 'Your starting point' }
    : { title: briefReportTitle(v.clientName, v.b.deliveryDate), author: v.branding.displayName, subject: 'Weekly competitor report' };

/** The client's view of an approved or sent brief as a branded PDF (decision 16): the weekly report (layout "C") or the starting point. */
export async function renderBriefPdf(deps: PdfDeps, briefId: string): Promise<{ key: string } | { skipped: string }> {
  const v = await loadBriefView(deps.db, briefId);
  if (v.b.status !== 'approved' && v.b.status !== 'sent') return { skipped: `brief is ${v.b.status}` };
  const report = storedReport(v);
  const live = report ? await deps.db.transaction((tx) => loadLiveChanges(tx, v.b)) : null;
  // Task 11 fills the map image; until then the Map rankings section shows its keyword table only.
  const html = await renderBriefReportDocument(briefReportProps(v, live, null, report));
  const bytes = await deps.pdf(html, briefPdfMeta(v), { allowUrls: v.branding.logoUrl ? [v.branding.logoUrl] : [] });
  const key = briefPdfKey(v.b.agencyId, briefId);
  await deps.store.put(key, bytes, 'application/pdf', { overwrite: true });
  await deps.db.update(brief).set({ pdfKey: key }).where(eq(brief.id, briefId));
  return { key };
}
