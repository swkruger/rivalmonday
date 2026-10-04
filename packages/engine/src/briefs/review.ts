import { type AccessContext, canAccessClient, isAgencyRole, ToolError } from '@cs/core';
import { brief, type BriefKind, briefItem, changeEvent, competitor, type Db, feedback, recommendation, type Tx, withTenant } from '@cs/db';
import { and, asc, eq, inArray, isNotNull, ne } from 'drizzle-orm';
import type { PackLoader } from '../tag/tag-stage';
import { loadEventEvidence } from './evidence';
import { loadBriefClient } from './gather';
import { recommendationFromItem } from './recommendations';
import { checkSentence, splitSentences } from './rules';
import { finalBriefSummary } from './summary';

export type ReviewDeps = { service: Db; app: Db; packs: PackLoader };
export interface BriefView {
  brief: typeof brief.$inferSelect;
  items: (typeof briefItem.$inferSelect)[];
}
type ItemRow = typeof briefItem.$inferSelect;
const EDITABLE = ['headline', 'whatChanged', 'whyItMatters', 'recommendedAction'] as const;

function requireAgency(ctx: AccessContext) {
  if (!isAgencyRole(ctx.role)) throw new ToolError('permission_denied', 'Only agency roles may review briefs');
}

async function visibleBrief(app: Db, ctx: AccessContext, briefId: string) {
  const [b] = await withTenant(app, ctx, (tx) => tx.select().from(brief).where(eq(brief.id, briefId)).limit(1));
  if (!b || !canAccessClient(ctx, b.clientId)) throw new ToolError('not_found', 'Brief not found');
  return b;
}

async function visibleItem(app: Db, ctx: AccessContext, itemId: string): Promise<{ item: ItemRow; b: typeof brief.$inferSelect }> {
  const [item] = await withTenant(app, ctx, (tx) => tx.select().from(briefItem).where(eq(briefItem.id, itemId)).limit(1));
  if (!item) throw new ToolError('not_found', 'Brief item not found');
  return { item, b: await visibleBrief(app, ctx, item.briefId) };
}

const requireReady = (b: typeof brief.$inferSelect) => {
  if (b.status !== 'ready') throw new ToolError('invalid_input', `Brief is ${b.status}, not ready for review`);
};

/**
 * Locks the brief row for the duration of the write transaction and re-checks `ready`: the earlier check (against
 * an unlocked read, before this transaction opened) is only an early-exit — without this, a concurrent approval
 * could select its items and commit between that check and this write, landing an edit/drop/reorder after approval.
 */
async function lockReadyBrief(tx: Tx, briefId: string): Promise<typeof brief.$inferSelect> {
  const [row] = await tx.select().from(brief).where(eq(brief.id, briefId)).for('update');
  if (!row || row.status !== 'ready') throw new ToolError('invalid_input', `Brief is ${row?.status ?? 'gone'}, not ready for review`);
  return row;
}

export async function getBrief(deps: Pick<ReviewDeps, 'app'>, ctx: AccessContext, briefId: string): Promise<BriefView> {
  const b = await visibleBrief(deps.app, ctx, briefId);
  const agency = isAgencyRole(ctx.role);
  if (!agency && b.status !== 'approved' && b.status !== 'sent') throw new ToolError('not_found', 'Brief not found');
  const items = await withTenant(deps.app, ctx, (tx) => tx.select().from(briefItem).where(eq(briefItem.briefId, briefId)).orderBy(asc(briefItem.ord)));
  return { brief: b, items: agency ? items : items.filter((i) => i.status === 'active').map((i) => ({ ...i, upsellTag: null })) };
}

export async function editBriefItem(deps: ReviewDeps, ctx: AccessContext, itemId: string, patch: Partial<Record<(typeof EDITABLE)[number], string>>): Promise<{ warnings: string[] }> {
  requireAgency(ctx);
  const { item, b } = await visibleItem(deps.app, ctx, itemId);
  requireReady(b);
  const changes = Object.fromEntries(EDITABLE.filter((k) => patch[k] !== undefined && patch[k]!.trim() !== item[k]).map((k) => [k, patch[k]!.trim()])) as Partial<Record<(typeof EDITABLE)[number], string>>;
  if (Object.keys(changes).length === 0) return { warnings: [] };
  if (Object.values(changes).some((v) => v.length === 0 || v.length > 1200)) throw new ToolError('invalid_input', 'Edited text must be 1–1200 characters');

  const c = await loadBriefClient({ db: deps.service, packs: deps.packs }, item.clientId);
  const [own] = await deps.service.select({ name: competitor.name }).from(competitor).where(eq(competitor.id, item.competitorId));
  const evidence = await loadEventEvidence(deps.service, item.eventIds, [own?.name ?? '', c.name]);
  const changesList = [...evidence.values()].flat();
  const ev = {
    text: changesList.map((x) => x.text).join('\n'), captureDates: changesList.map((x) => x.capturedAt).filter((d): d is Date => d !== null),
    zips: [], competitorNames: own ? [own.name] : [],
  };
  const rules = { trackedCompetitorNames: c.competitorNames, clientTowns: c.towns, year: new Date().getUTCFullYear() };
  const warnings = Object.values(changes).flatMap((text) => splitSentences(text).flatMap((sentence) => checkSentence(sentence, ev, rules).reasons));

  await deps.service.transaction(async (tx) => {
    await lockReadyBrief(tx, item.briefId);
    await tx.update(briefItem).set({ ...changes, editedBy: ctx.userId }).where(eq(briefItem.id, itemId));
    await tx.insert(feedback).values({
      agencyId: item.agencyId, clientId: item.clientId, subjectType: 'brief_item', subjectId: itemId, kind: 'edit', actor: ctx.userId,
      before: Object.fromEntries(Object.keys(changes).map((k) => [k, item[k as (typeof EDITABLE)[number]]])), after: changes,
    });
  });
  return { warnings };
}

export async function dropBriefItem(deps: ReviewDeps, ctx: AccessContext, itemId: string, reason?: string): Promise<void> {
  requireAgency(ctx);
  const { item, b } = await visibleItem(deps.app, ctx, itemId);
  requireReady(b);
  await deps.service.transaction(async (tx) => {
    await lockReadyBrief(tx, item.briefId);
    const [current] = await tx.select({ status: briefItem.status }).from(briefItem).where(eq(briefItem.id, itemId)).for('update');
    if (!current || current.status === 'dropped') throw new ToolError('invalid_input', 'Brief item is already dropped');
    await tx.update(briefItem).set({ status: 'dropped' }).where(eq(briefItem.id, itemId));
    await tx.insert(feedback).values({ agencyId: item.agencyId, clientId: item.clientId, subjectType: 'brief_item', subjectId: itemId, kind: 'drop', actor: ctx.userId, reason: reason ?? null });
  });
}

export async function reorderBriefItems(deps: ReviewDeps, ctx: AccessContext, briefId: string, itemIds: string[]): Promise<void> {
  requireAgency(ctx);
  const b = await visibleBrief(deps.app, ctx, briefId);
  requireReady(b);
  await deps.service.transaction(async (tx) => {
    await lockReadyBrief(tx, briefId);
    const active = await tx.select({ id: briefItem.id, ord: briefItem.ord }).from(briefItem).where(and(eq(briefItem.briefId, briefId), eq(briefItem.status, 'active'))).orderBy(asc(briefItem.ord));
    if (itemIds.length !== active.length || new Set(itemIds).size !== itemIds.length || !itemIds.every((id) => active.some((a) => a.id === id))) {
      throw new ToolError('invalid_input', "The new order must list exactly the brief's active items");
    }
    // Reuse the active set's existing ord values (already ascending), just permuted: a dropped item keeps its own
    // ord, so renumbering from 0 could collide with one (the brief_id, ord constraint covers every status).
    const ords = active.map((a) => a.ord);
    for (const [i, id] of itemIds.entries()) await tx.update(briefItem).set({ ord: ords[i] }).where(eq(briefItem.id, id));
    await tx.insert(feedback).values({ agencyId: b.agencyId, clientId: b.clientId, subjectType: 'brief', subjectId: briefId, kind: 'reorder', actor: ctx.userId, before: { order: active.map((a) => a.id) }, after: { order: itemIds } });
  });
}

export async function rateBriefItem(deps: ReviewDeps, ctx: AccessContext, itemId: string, useful: boolean, reason?: string): Promise<void> {
  requireAgency(ctx);
  const { item } = await visibleItem(deps.app, ctx, itemId);
  await deps.service.insert(feedback).values({ agencyId: item.agencyId, clientId: item.clientId, subjectType: 'brief_item', subjectId: itemId, kind: 'rating', actor: ctx.userId, after: { useful }, reason: reason ?? null });
}

/**
 * No evidence, no claim: system-drops the brief's active items whose events were retracted (a `drop` feedback with
 * actor `system`, reason 'evidence retracted'), inside the caller's transaction. Recommendations are not touched.
 * Used at approval and again by `deliverBrief` just before sending. Returns the dropped item ids.
 */
export async function dropRetractedItems(tx: Tx, briefId: string): Promise<string[]> {
  const active = await tx.select().from(briefItem).where(and(eq(briefItem.briefId, briefId), eq(briefItem.status, 'active')));
  const eventIds = [...new Set(active.flatMap((i) => i.eventIds))];
  if (eventIds.length === 0) return [];
  const retracted = new Set((await tx.select({ id: changeEvent.id }).from(changeEvent).where(and(inArray(changeEvent.id, eventIds), isNotNull(changeEvent.retractedAt)))).map((r) => r.id));
  const stale = active.filter((i) => i.eventIds.some((id) => retracted.has(id)));
  if (stale.length === 0) return [];
  await tx.update(briefItem).set({ status: 'dropped' }).where(inArray(briefItem.id, stale.map((i) => i.id)));
  await tx.insert(feedback).values(stale.map((i) => ({ agencyId: i.agencyId, clientId: i.clientId, subjectType: 'brief_item', subjectId: i.id, kind: 'drop', actor: 'system', reason: 'evidence retracted' })));
  return stale.map((i) => i.id);
}

/**
 * Approves a ready brief inside the caller's transaction: claims it, system-drops items whose evidence was retracted,
 * recomputes the summary from what is left (decision 10), and turns the surviving items into recommendations.
 */
export async function approveBriefTx(tx: Tx, briefId: string, actor: string, now: Date, opts: { auto?: boolean } = {}): Promise<{ recommendations: number }> {
  const [claimed] = await tx.update(brief).set({ status: 'approved', approvedAt: now, approvedBy: actor, updatedAt: now }).where(and(eq(brief.id, briefId), eq(brief.status, 'ready'))).returning();
  if (!claimed) throw new ToolError('invalid_input', 'Brief is no longer ready for review');
  const active = await tx.select().from(briefItem).where(and(eq(briefItem.briefId, briefId), eq(briefItem.status, 'active')));
  const stale = new Set(await dropRetractedItems(tx, briefId));
  const all = await tx.select({ status: briefItem.status }).from(briefItem).where(eq(briefItem.briefId, briefId));
  const final = finalBriefSummary(claimed as { kind: BriefKind; summary: string }, all);
  if (final.kind !== claimed.kind || final.summary !== claimed.summary) await tx.update(brief).set(final).where(eq(brief.id, briefId));
  if (opts.auto) {
    await tx.insert(feedback).values({ agencyId: claimed.agencyId, clientId: claimed.clientId, subjectType: 'brief', subjectId: briefId, kind: 'status', actor, after: { status: 'approved', auto: true } });
  }
  // One live recommendation per move: skip an item whose move already has one that is not dismissed (any source).
  const moveIds = [...new Set(active.map((i) => i.moveId).filter((id): id is string => id !== null))];
  const covered = new Set(moveIds.length === 0 ? [] : (await tx.select({ moveId: recommendation.moveId }).from(recommendation).where(and(inArray(recommendation.moveId, moveIds), ne(recommendation.status, 'dismissed')))).map((r) => r.moveId));
  const recommend = active.filter((i) => !stale.has(i.id) && !(i.moveId && covered.has(i.moveId)));
  if (recommend.length === 0) return { recommendations: 0 };
  const inserted = await tx.insert(recommendation).values(recommend.map(recommendationFromItem)).onConflictDoNothing().returning({ id: recommendation.id });
  return { recommendations: inserted.length };
}

export async function approveBrief(deps: ReviewDeps, ctx: AccessContext, briefId: string): Promise<{ recommendations: number }> {
  requireAgency(ctx);
  const b = await visibleBrief(deps.app, ctx, briefId);
  requireReady(b);
  return deps.service.transaction((tx) => approveBriefTx(tx, briefId, ctx.userId, new Date()));
}
