import type { Ai } from '@cs/ai';
import { type AccessContext, canAccessClient, isAgencyRole, ToolError } from '@cs/core';
import { alert, type AlertStatus, changeEvent, client, competitor, type Db, feedback, type Tx, withTenant } from '@cs/db';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { safeTimezone } from '../briefs/schedule';
import { type DeliveryConfig, loadBranding, notify } from '../delivery/outbox';
import { localClock } from '../delivery/time';
import type { PackLoader } from '../tag/tag-stage';
import { lockClientAlerts, withdrawAlerts } from './create';
import { writeAlertText } from './write';

export const ALERTS_PER_DAY = 3;
export type ReleaseOutcome = 'immediate' | 'digest' | 'withdrawn';
export interface AlertDeps {
  db: Db;
  ai: Ai;
  packs: PackLoader;
  delivery: DeliveryConfig;
}
type AlertRow = typeof alert.$inferSelect;

async function clientOf(tx: Tx, clientId: string) {
  const [c] = await tx.select({ name: client.name, timezone: client.timezone }).from(client).where(eq(client.id, clientId));
  if (!c) throw new Error(`client ${clientId} not found`);
  return { name: c.name, tz: safeTimezone(c.timezone) };
}
const competitorName = async (tx: Tx, id: string) => (await tx.select({ name: competitor.name }).from(competitor).where(eq(competitor.id, id)))[0]?.name ?? 'A competitor';

/**
 * Decisions 9-10: deliver now if the client has had fewer than ALERTS_PER_DAY immediate alerts this client-local day;
 * else hold it for the evening digest; a retracted primary event withdraws it. The caller holds lockClientAlerts.
 */
export async function releaseAlert(tx: Tx, cfg: DeliveryConfig, a: AlertRow, now: Date): Promise<ReleaseOutcome> {
  const [ev] = await tx.select({ retractedAt: changeEvent.retractedAt }).from(changeEvent).where(eq(changeEvent.id, a.eventId));
  if (!ev || ev.retractedAt) {
    await withdrawAlerts(tx, [a.id], now);
    return 'withdrawn';
  }
  const c = await clientOf(tx, a.clientId);
  const today = localClock(now, c.tz).date;
  const [n] = await tx.select({ n: sql<number>`count(*)::int` }).from(alert).where(and(eq(alert.clientId, a.clientId), eq(alert.delivery, 'immediate'), eq(alert.deliveredLocalDate, today)));
  if ((n?.n ?? 0) >= ALERTS_PER_DAY) {
    await tx.update(alert).set({ status: 'approved', delivery: 'digest', updatedAt: now }).where(eq(alert.id, a.id));
    return 'digest';
  }
  await tx.update(alert).set({ status: 'delivered', delivery: 'immediate', deliveredAt: now, deliveredLocalDate: today, updatedAt: now }).where(eq(alert.id, a.id));
  const branding = await loadBranding(tx, a.agencyId);
  const comp = await competitorName(tx, a.competitorId);
  const detectedOn = localClock(a.createdAt, c.tz).date;
  await notify(tx, cfg, {
    agencyId: a.agencyId, clientId: a.clientId, kind: 'alert', audience: 'client', subjectType: 'alert', subjectId: a.id, dedupe: `alert:${a.id}`,
    link: { t: 'alert', id: a.id }, now,
    build: (r, link) => ({ title: a.headline, body: a.body, email: { template: 'alert', props: { branding, recipientName: r?.name ?? null, clientName: c.name, competitorName: comp, headline: a.headline, body: a.body, detectedOn, link } } }),
  });
  return 'immediate';
}

const NOTE: Record<string, string> = {
  pending_review: 'Approve it to send it to the client, or dismiss it with a reason.',
  immediate: 'It was sent to the client.',
  digest: "The client already had today's maximum of immediate alerts, so it goes in this evening's digest.",
  digest_only: "It goes in the client's evening digest (digest-only mode).",
};

async function notifyAm(tx: Tx, cfg: DeliveryConfig, a: AlertRow, note: keyof typeof NOTE, now: Date) {
  const c = await clientOf(tx, a.clientId);
  const branding = await loadBranding(tx, a.agencyId);
  const review = note === 'pending_review';
  const title = `${review ? 'Review alert' : 'Alert'}: ${a.headline}`;
  const lines = [a.body, `${c.name} · score ${Math.round(a.score)}${a.written === 'template' ? ' · evidence template (the writer could not verify its text)' : ''}`, NOTE[note]!];
  await notify(tx, cfg, {
    agencyId: a.agencyId, clientId: a.clientId, kind: 'am_alert', audience: 'agency', subjectType: 'alert', subjectId: a.id, dedupe: `am_alert:${a.id}`,
    link: { t: 'alert', id: a.id }, now,
    build: (r, link) => ({ title, body: lines.join('\n'), email: { template: 'agency_notice', props: { branding, recipientName: r?.name ?? null, clientName: c.name, notice: 'am_alert', title, lines, link, actionLabel: review ? 'Review alert' : 'Open alert' } } }),
  });
}

/** Writes and verifies the text (outside any transaction), then applies the client's mode (decision 8). */
export async function processAlert(deps: AlertDeps, alertId: string, now: Date): Promise<{ status: AlertStatus | 'skipped'; release?: ReleaseOutcome }> {
  const [a0] = await deps.db.select().from(alert).where(eq(alert.id, alertId));
  if (!a0 || a0.status !== 'drafting') return { status: 'skipped' };
  const text = await writeAlertText(deps, a0, now);
  return deps.db.transaction(async (tx) => {
    await tx.execute(lockClientAlerts(a0.clientId));
    const [a] = await tx.select().from(alert).where(and(eq(alert.id, alertId), eq(alert.status, 'drafting'))).for('update');
    if (!a) return { status: 'skipped' as const };
    if (!text) {
      await withdrawAlerts(tx, [a.id], now);
      return { status: 'withdrawn' as const, release: 'withdrawn' as const };
    }
    const [w] = await tx.update(alert).set({ headline: text.headline, body: text.body, written: text.written, evidenceIds: text.evidenceIds, updatedAt: now }).where(eq(alert.id, a.id)).returning();
    if (a.mode === 'direct') {
      const release = await releaseAlert(tx, deps.delivery, w!, now);
      if (release !== 'withdrawn') await notifyAm(tx, deps.delivery, w!, release, now);
      return { status: release === 'immediate' ? 'delivered' : release === 'digest' ? 'approved' : 'withdrawn', release };
    }
    if (a.mode === 'digest_only') {
      await tx.update(alert).set({ status: 'approved', delivery: 'digest', updatedAt: now }).where(eq(alert.id, a.id));
      await notifyAm(tx, deps.delivery, w!, 'digest_only', now);
      return { status: 'approved' as const, release: 'digest' as const };
    }
    await tx.update(alert).set({ status: 'pending_review', updatedAt: now }).where(eq(alert.id, a.id));
    await notifyAm(tx, deps.delivery, w!, 'pending_review', now);
    return { status: 'pending_review' as const };
  });
}

function requireAgency(ctx: AccessContext) {
  if (!isAgencyRole(ctx.role)) throw new ToolError('permission_denied', 'Only agency roles may review alerts');
}
async function visibleAlert(app: Db, ctx: AccessContext, alertId: string): Promise<AlertRow> {
  const [a] = await withTenant(app, ctx, (tx) => tx.select().from(alert).where(eq(alert.id, alertId)));
  if (!a || !canAccessClient(ctx, a.clientId)) throw new ToolError('not_found', 'Alert not found');
  return a;
}

/** Client roles see only delivered alerts (decision 15 / Phase 4a carry-over: client readers filter by status). */
export async function getAlert(deps: { app: Db }, ctx: AccessContext, alertId: string): Promise<AlertRow> {
  const a = await visibleAlert(deps.app, ctx, alertId);
  if (!isAgencyRole(ctx.role) && a.status !== 'delivered') throw new ToolError('not_found', 'Alert not found');
  return a;
}

export async function approveAlert(deps: { service: Db; app: Db; delivery: DeliveryConfig }, ctx: AccessContext, alertId: string, now = new Date()): Promise<ReleaseOutcome> {
  requireAgency(ctx);
  const visible = await visibleAlert(deps.app, ctx, alertId);
  return deps.service.transaction(async (tx) => {
    await tx.execute(lockClientAlerts(visible.clientId));
    const [a] = await tx.select().from(alert).where(eq(alert.id, alertId)).for('update');
    if (!a || a.status !== 'pending_review') throw new ToolError('invalid_input', `Alert is ${a?.status ?? 'gone'}, not waiting for review`);
    const [reviewed] = await tx.update(alert).set({ reviewedBy: ctx.userId, reviewedAt: now, updatedAt: now }).where(eq(alert.id, a.id)).returning();
    await tx.insert(feedback).values({ agencyId: a.agencyId, clientId: a.clientId, subjectType: 'alert', subjectId: a.id, kind: 'status', actor: ctx.userId, before: { status: 'pending_review' }, after: { status: 'approved' } });
    return releaseAlert(tx, deps.delivery, reviewed!, now);
  });
}

export async function dismissAlert(deps: { service: Db; app: Db }, ctx: AccessContext, alertId: string, reason: string, now = new Date()): Promise<void> {
  requireAgency(ctx);
  const why = reason.trim();
  if (why.length === 0 || why.length > 500) throw new ToolError('invalid_input', 'A dismissal needs a reason (1-500 characters)');
  const visible = await visibleAlert(deps.app, ctx, alertId);
  await deps.service.transaction(async (tx) => {
    await tx.execute(lockClientAlerts(visible.clientId));
    const [a] = await tx.select().from(alert).where(and(eq(alert.id, alertId), inArray(alert.status, ['pending_review', 'approved']))).for('update');
    if (!a) throw new ToolError('invalid_input', 'Only an alert waiting for review or for the digest can be dismissed');
    await tx.update(alert).set({ status: 'dismissed', dismissReason: why, reviewedBy: ctx.userId, reviewedAt: now, updatedAt: now }).where(eq(alert.id, a.id));
    await tx.insert(feedback).values({ agencyId: a.agencyId, clientId: a.clientId, subjectType: 'alert', subjectId: a.id, kind: 'status', actor: ctx.userId, before: { status: a.status }, after: { status: 'dismissed' }, reason: why });
  });
}
