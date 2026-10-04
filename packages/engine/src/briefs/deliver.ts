import { type AccessContext, canAccessClient, isAgencyRole, ToolError } from '@cs/core';
import { brief, briefItem, client, competitor, type Db, feedback, withTenant } from '@cs/db';
import type { Branding, BriefEmailProps } from '@cs/email';
import { and, asc, eq, gte, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import type { Conn } from '../delivery/contacts';
import { replyToFor } from '../delivery/contacts';
import { type DeliveryConfig, loadBranding, notify, personalLink } from '../delivery/outbox';
import { addDays, localClock } from '../delivery/time';
import { approveBriefTx, dropRetractedItems } from './review';
import { safeTimezone } from './schedule';
import { finalBriefSummary } from './summary';

export const DELIVERY_LOCAL_HOUR = 7;
export const DELIVERY_GRACE_DAYS = 6;

export interface BriefDeliveryView {
  b: typeof brief.$inferSelect;
  clientName: string;
  /** Active items only, sorted by ord (ords need not be 0-based or contiguous). */
  items: (typeof briefItem.$inferSelect & { competitorName: string })[];
  branding: Branding;
  signOff: string | null;
}

export async function loadBriefView(conn: Conn, briefId: string): Promise<BriefDeliveryView> {
  const [row] = await conn.select({ b: brief, clientName: client.name }).from(brief).innerJoin(client, eq(client.id, brief.clientId)).where(eq(brief.id, briefId));
  if (!row) throw new Error(`brief ${briefId} not found`);
  const items = await conn
    .select({ i: briefItem, competitorName: competitor.name })
    .from(briefItem)
    .innerJoin(competitor, eq(competitor.id, briefItem.competitorId))
    .where(and(eq(briefItem.briefId, briefId), eq(briefItem.status, 'active')))
    .orderBy(asc(briefItem.ord));
  const branding = await loadBranding(conn, row.b.agencyId);
  const am = await replyToFor(conn, row.b.agencyId, row.b.clientId);
  return { b: row.b, clientName: row.clientName, items: items.map((x) => ({ ...x.i, competitorName: x.competitorName })), branding, signOff: branding.signOff ?? `— ${am?.name ?? branding.displayName}` };
}

/** Client-facing props (decision 15): only active items, never the upsell tag. */
export function briefEmailProps(v: BriefDeliveryView, opts: { recipientName: string | null; link: string | null; pdfLink: string | null; itemLink: (itemId: string) => string | null }): BriefEmailProps {
  return {
    branding: v.branding, recipientName: opts.recipientName, clientName: v.clientName, deliveryDate: v.b.deliveryDate, kind: v.b.kind as 'standard' | 'quiet', summary: v.b.summary,
    items: v.items.map((i) => ({
      competitorName: i.competitorName, headline: i.headline, whatChanged: i.whatChanged, whyItMatters: i.whyItMatters, recommendedAction: i.recommendedAction,
      effort: i.effort as 'L' | 'M' | 'H', impact: i.impact as 'L' | 'M' | 'H', link: opts.itemLink(i.id),
    })),
    trend: v.b.trend, link: opts.link, pdfLink: opts.pdfLink, signOff: v.signOff,
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
    const final = finalBriefSummary(locked as { kind: 'standard' | 'quiet'; summary: string }, all);
    await tx.update(brief).set({ ...final, status: 'sent', sentAt: now, updatedAt: now }).where(eq(brief.id, briefId));
    const v = await loadBriefView(tx, briefId);
    const scope = { agencyId: v.b.agencyId, clientId: v.b.clientId };
    const notifications = await notify(tx, deps.delivery, {
      ...scope, kind: 'brief', audience: 'client', subjectType: 'brief', subjectId: briefId, dedupe: `brief:${briefId}`, link: { t: 'brief', id: briefId }, now,
      build: (r, link) => ({
        title: `Weekly competitor brief — ${v.b.deliveryDate}`,
        body: [v.b.summary, ...v.items.map((i) => `• ${i.headline}`)].join('\n'),
        email: { template: 'brief', props: briefEmailProps(v, {
          recipientName: r?.name ?? null, link,
          pdfLink: r ? personalLink(deps.delivery, r.contactId, scope, 'brief_pdf', briefId, now) : null,
          itemLink: (itemId) => (r ? personalLink(deps.delivery, r.contactId, scope, 'brief_item', itemId, now) : null),
        }) },
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

/** Decision 11: hourly; Monday 07:00 client-local onward (6 days of catch-up). */
export async function deliverDueBriefs(deps: { db: Db; delivery: DeliveryConfig }, now: Date): Promise<{ sent: string[]; autoApproved: number; overdue: number }> {
  const out = { sent: [] as string[], autoApproved: 0, overdue: 0 };
  const floor = new Date(now.getTime() - (DELIVERY_GRACE_DAYS + 2) * 86_400_000).toISOString().slice(0, 10);
  const rows = await deps.db
    .select({ id: brief.id, agencyId: brief.agencyId, clientId: brief.clientId, status: brief.status, deliveryDate: brief.deliveryDate, timezone: client.timezone, autoSend: client.briefAutoSend, clientName: client.name })
    .from(brief)
    .innerJoin(client, eq(client.id, brief.clientId))
    .where(and(inArray(brief.status, ['approved', 'ready']), isNull(brief.sentAt), gte(brief.deliveryDate, floor)));
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
