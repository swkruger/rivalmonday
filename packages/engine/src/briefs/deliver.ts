import { type AccessContext, canAccessClient, formatDayRange, type GradedChangesView, isAgencyRole, REPORT_CAPS, ToolError } from '@cs/core';
import { agencyServiceable, clientServiceable, brief, briefItem, type BriefKind, client, competitor, type Db, feedback, withTenant } from '@cs/db';
import type { Branding, BriefEmailProps, BriefHighlights, FeedbackContact } from '@cs/email';
import { and, asc, eq, gte, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import type { Conn } from '../delivery/contacts';
import { replyToFor } from '../delivery/contacts';
import { type DeliveryConfig, loadBranding, notify, personalLink } from '../delivery/outbox';
import { addDays, localClock } from '../delivery/time';
import { Scorecard } from './scorecard';
import { scorecardModel } from './scorecard-model';
import { approveBriefTx, dropRetractedItems } from './review';
import { safeTimezone } from './schedule';
import { finalBriefSummary, liveMajorCount, loadLiveChanges } from './summary';

export const DELIVERY_LOCAL_HOUR = 7;
export const DELIVERY_GRACE_DAYS = 6;
/** Decided copy (12b): the client-facing title of a starting point; `agencyProduct` is the agency's brand display name. */
export const startingPointSubject = (agencyProduct: string) => `Your starting point with ${agencyProduct}`;

export interface BriefDeliveryView {
  b: typeof brief.$inferSelect;
  clientName: string;
  /** Active items only, sorted by ord (ords need not be 0-based or contiguous). Self items (no competitor) carry the client's name. */
  items: (typeof briefItem.$inferSelect & { competitorName: string; firstChangeType: string | null })[];
  branding: Branding;
  signOff: string | null;
  /** 7c2: `replyToFor` (the AM, else the agency admin) — the client email's feedback line; null hides it. */
  replyTo: FeedbackContact | null;
  /** The client's time zone (`safeTimezone`): dates printed in the weekly report PDF. */
  timezone: string;
}

export async function loadBriefView(conn: Conn, briefId: string): Promise<BriefDeliveryView> {
  const [row] = await conn.select({ b: brief, clientName: client.name, timezone: client.timezone }).from(brief).innerJoin(client, eq(client.id, brief.clientId)).where(eq(brief.id, briefId));
  if (!row) throw new Error(`brief ${briefId} not found`);
  const items = await conn
    // The first cited event's change type decides the item's report topic (spec §4.8); a correlated subquery, no extra round trip.
    .select({ i: briefItem, competitorName: competitor.name, firstChangeType: sql<string | null>`(SELECT e.change_type FROM event e WHERE e.id = (${briefItem.eventIds}->>0)::uuid)` })
    .from(briefItem)
    .leftJoin(competitor, eq(competitor.id, briefItem.competitorId))
    .where(and(eq(briefItem.briefId, briefId), eq(briefItem.status, 'active')))
    .orderBy(asc(briefItem.ord));
  const branding = await loadBranding(conn, row.b.agencyId);
  const am = await replyToFor(conn, row.b.agencyId, row.b.clientId);
  return { b: row.b, clientName: row.clientName, items: items.map((x) => ({ ...x.i, competitorName: x.competitorName ?? row.clientName, firstChangeType: x.firstChangeType })), branding, signOff: branding.signOff ?? `— ${am?.name ?? branding.displayName}`, replyTo: am, timezone: safeTimezone(row.timezone) };
}

/** The stored scorecard as its display model; null when absent or unparseable (warned). The weekly report PDF always shows it (P7). */
export const storedScorecardModel = (v: BriefDeliveryView) => {
  if (v.b.scorecard === null || v.b.scorecard === undefined) return null;
  const parsed = Scorecard.safeParse(v.b.scorecard);
  if (!parsed.success) {
    console.warn(`[briefs] brief ${v.b.id}: stored scorecard does not parse, sending without it: ${parsed.error.message}`);
    return null;
  }
  return scorecardModel(parsed.data, { clientName: v.clientName });
};
// A weekly brief stores its scorecard every week, but the email shows it only on a quiet week (a standard week keeps today's email).
const scorecardOf = (v: BriefDeliveryView) => (v.b.kind === 'standard' ? null : storedScorecardModel(v));

/** The weekly email's highlights (spec §4.7): Major one-liners, then Notable, at most `REPORT_CAPS.emailLines`; `minor` = Minor events (the stat line's count). */
export function briefHighlights(live: GradedChangesView, tz: string): BriefHighlights {
  const graded = live.lines.filter((l) => l.grade !== 'minor');
  const ordered = [...graded.filter((l) => l.grade === 'major'), ...graded.filter((l) => l.grade === 'notable')];
  return {
    totals: live.totals,
    lines: ordered.slice(0, REPORT_CAPS.emailLines).map((l) => ({ grade: l.grade as 'major' | 'notable', text: l.text, dates: formatDayRange(l.firstAt, l.lastAt, tz) })),
    moreLines: Math.max(0, ordered.length - REPORT_CAPS.emailLines),
    minor: live.totals.minor,
  };
}

/** Client-facing props (decision 15): only active items, never the upsell tag. `feedback` = the view's `replyTo` (the PDF overrides it with null). */
export function briefEmailProps(v: BriefDeliveryView, opts: { recipientName: string | null; link: string | null; pdfLink: string | null; itemLink: (itemId: string) => string | null; live?: GradedChangesView | null }): BriefEmailProps {
  return {
    branding: v.branding, recipientName: opts.recipientName, clientName: v.clientName, deliveryDate: v.b.deliveryDate, kind: v.b.kind as BriefEmailProps['kind'], summary: v.b.summary,
    items: v.items.map((i) => ({
      competitorName: i.competitorName, headline: i.headline, whatChanged: i.whatChanged, whyItMatters: i.whyItMatters, recommendedAction: i.recommendedAction,
      subject: i.subject, effort: i.effort as 'L' | 'M' | 'H', impact: i.impact as 'L' | 'M' | 'H', link: opts.itemLink(i.id),
    })),
    trend: v.b.trend, scorecard: scorecardOf(v), link: opts.link, pdfLink: opts.pdfLink, signOff: v.signOff, feedback: v.replyTo,
    // Weekly briefs with a live graded view only; an old brief (no report), a starting point or a week with no changes keeps the full body.
    highlights: opts.live && v.b.kind !== 'starting_point' && (opts.live.totals.major + opts.live.totals.notable + opts.live.totals.minor > 0) ? briefHighlights(opts.live, v.timezone) : null,
  };
}

/** Sends one approved brief: drops retracted-evidence items, final summary (decision 10), status 'sent', client notifications — one transaction. */
export async function deliverBrief(deps: { db: Db; delivery: DeliveryConfig }, briefId: string, now: Date): Promise<{ notifications: number } | { skipped: string }> {
  return deps.db.transaction(async (tx) => {
    const [locked] = await tx.select().from(brief).where(eq(brief.id, briefId)).for('update');
    if (!locked || locked.status !== 'approved') return { skipped: `brief is ${locked?.status ?? 'gone'}` };
    // Evidence retracted after approval: drop those items before the summary is recomputed (decision 10).
    await dropRetractedItems(tx, briefId);
    const all = await tx.select({ status: briefItem.status }).from(briefItem).where(eq(briefItem.briefId, briefId));
    // Loaded once (retractions are already dropped above) and reused for the summary and the email highlights; a starting point has none.
    const live = locked.kind === 'starting_point' ? null : await loadLiveChanges(tx, locked);
    const final = finalBriefSummary(locked as { kind: BriefKind; summary: string }, all, liveMajorCount(live));
    // pdf_key = null (P4): the sender renders the PDF fresh at dispatch; the hourly catch-up and /files/brief re-render a missing one.
    await tx.update(brief).set({ ...final, status: 'sent', sentAt: now, updatedAt: now, pdfKey: null }).where(eq(brief.id, briefId));
    const v = await loadBriefView(tx, briefId);
    const scope = { agencyId: v.b.agencyId, clientId: v.b.clientId };
    const notifications = await notify(tx, deps.delivery, {
      ...scope, kind: 'brief', audience: 'client', subjectType: 'brief', subjectId: briefId, dedupe: `brief:${briefId}`, link: { t: 'brief', id: briefId }, now,
      build: (r, link) => ({
        title: v.b.kind === 'starting_point' ? startingPointSubject(v.branding.displayName) : `Weekly competitor brief — ${v.b.deliveryDate}`,
        body: [v.b.summary, ...v.items.map((i) => `• ${i.headline}`)].join('\n'),
        email: { template: 'brief', props: { ...briefEmailProps(v, {
          recipientName: r?.name ?? null, link, live,
          pdfLink: r ? personalLink(deps.delivery, r.contactId, scope, 'brief_pdf', briefId, now) : null,
          itemLink: (itemId) => (r ? personalLink(deps.delivery, r.contactId, scope, 'brief_item', itemId, now) : null),
        }), attachPdf: v.b.kind !== 'starting_point' } },
      }),
    });
    return { notifications };
  });
}

/** Untouched = no human edit/drop/reorder on the brief or its items (a usefulness rating is not a change). */
export async function isUntouched(conn: Conn, briefId: string): Promise<boolean> {
  const [hit] = await conn
    .select({ id: feedback.id })
    .from(feedback)
    .where(and(
      ne(feedback.actor, 'system'), inArray(feedback.kind, ['edit', 'drop', 'reorder']),
      or(and(eq(feedback.subjectType, 'brief'), eq(feedback.subjectId, briefId)),
        and(eq(feedback.subjectType, 'brief_item'), sql`${feedback.subjectId} IN (SELECT id FROM brief_item WHERE brief_id = ${briefId})`)),
    ))
    .limit(1);
  return !hit;
}

/** Decision 11: hourly; Monday 07:00 client-local onward (6 days of catch-up). Starting points are sent on approval instead (12b Q2). */
export async function deliverDueBriefs(deps: { db: Db; delivery: DeliveryConfig }, now: Date): Promise<{ sent: string[]; autoApproved: number; overdue: number }> {
  const out = { sent: [] as string[], autoApproved: 0, overdue: 0 };
  const floor = new Date(now.getTime() - (DELIVERY_GRACE_DAYS + 2) * 86_400_000).toISOString().slice(0, 10);
  const rows = await deps.db
    .select({ id: brief.id, agencyId: brief.agencyId, clientId: brief.clientId, status: brief.status, deliveryDate: brief.deliveryDate, timezone: client.timezone, autoSend: client.briefAutoSend, clientName: client.name })
    .from(brief)
    .innerJoin(client, eq(client.id, brief.clientId))
    .where(and(inArray(brief.status, ['approved', 'ready']), isNull(brief.sentAt), gte(brief.deliveryDate, floor), ne(brief.kind, 'starting_point'), agencyServiceable(client.agencyId), clientServiceable(client)));
  for (const r of rows) {
    const clock = localClock(now, safeTimezone(r.timezone));
    const due = clock.date > r.deliveryDate || (clock.date === r.deliveryDate && clock.hour >= DELIVERY_LOCAL_HOUR);
    if (!due || clock.date > addDays(r.deliveryDate, DELIVERY_GRACE_DAYS)) continue;
    try {
      if (r.status === 'ready') {
        if (r.autoSend && (await isUntouched(deps.db, r.id))) {
          await deps.db.transaction((tx) => approveBriefTx(tx, r.id, 'system', now, { auto: true }));
          out.autoApproved++;
        } else {
          out.overdue += await notifyOverdue(deps, r, now);
          continue;
        }
      }
      const res = await deliverBrief(deps, r.id, now);
      if ('notifications' in res) out.sent.push(r.id);
    } catch (err) {
      console.warn(`[briefs] delivering brief ${r.id} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return out;
}

async function notifyOverdue(deps: { db: Db; delivery: DeliveryConfig }, r: { id: string; agencyId: string; clientId: string; deliveryDate: string; clientName: string; autoSend: boolean }, now: Date): Promise<number> {
  const branding = await loadBranding(deps.db, r.agencyId);
  const title = `Brief not sent: ${r.clientName}`;
  const lines = [`The brief for ${r.deliveryDate} is still waiting for approval, so it was not sent at 07:00 client time.`, r.autoSend ? 'It was edited, so auto-send left it for you.' : 'Auto-send is off for this client.', 'Approve it (it then goes out within the hour) or use "send now".'];
  const n = await notify(deps.db, deps.delivery, {
    agencyId: r.agencyId, clientId: r.clientId, kind: 'brief_overdue', audience: 'agency', subjectType: 'brief', subjectId: r.id, dedupe: `brief_overdue:${r.id}`, link: { t: 'brief', id: r.id }, now,
    build: (rec, link) => ({ title, body: lines.join('\n'), email: { template: 'agency_notice', props: { branding, recipientName: rec?.name ?? null, clientName: r.clientName, notice: 'brief_overdue', title, lines, link, actionLabel: 'Review brief' } } }),
  });
  return n > 0 ? 1 : 0;
}

/** Spec §5.1 "approve, send now": agency roles; a ready brief is approved by the caller first. */
export async function sendBriefNow(deps: { service: Db; app: Db; delivery: DeliveryConfig }, ctx: AccessContext, briefId: string, now = new Date()): Promise<{ notifications: number }> {
  if (!isAgencyRole(ctx.role)) throw new ToolError('permission_denied', 'Only agency roles may send briefs');
  const [b] = await withTenant(deps.app, ctx, (tx) => tx.select().from(brief).where(eq(brief.id, briefId)));
  if (!b || !canAccessClient(ctx, b.clientId)) throw new ToolError('not_found', 'Brief not found');
  if (b.status === 'ready') await deps.service.transaction((tx) => approveBriefTx(tx, briefId, ctx.userId, now));
  else if (b.status !== 'approved') throw new ToolError('invalid_input', `Brief is ${b.status}; only a ready or approved brief can be sent`);
  const res = await deliverBrief({ db: deps.service, delivery: deps.delivery }, briefId, now);
  if ('skipped' in res) throw new ToolError('invalid_input', `Brief was not sent: ${res.skipped}`);
  return res;
}
