import { ad, alert, alertEvent, brief, briefItem, feedback, recommendation, review, trendReport, type TrendBusiness, type TrendReportData, type TrendSnapshot } from '@cs/db';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { atUtc, DAY, notAfter } from './clock';
import type { SeedContext } from './context';
import type { ActiveClientKey, DemoEvent } from './ids';
import { demoPdf } from './pdf';

const WHY: Record<string, string> = {
  price_change: 'Price-sensitive customers in your area compare these prices before they book.',
  promo: 'A visible special can pull this week’s bookings away from you.',
  ad_started: 'More paid ads usually mean more calls going to them for the same searches.',
  ad_stopped: 'Fewer competing ads make this a cheap window for your own campaigns.',
  review_spike: 'Complaints in their reviews are an opening to highlight your own reliability.',
  rating_change: 'Ratings are the first thing searchers compare in the map pack.',
  new_service: 'They now compete for a service you offer.',
  hiring: 'Hiring signals they expect more demand and faster response times.',
  service_area_change: 'They now market to ZIP codes you serve.',
  new_location: 'A closer location shortens their response time in your area.',
  content: 'A minor site change, worth a glance.',
};
const ACTION: Record<string, string> = {
  price_change: 'Promote a value bundle instead of matching the price.',
  promo: 'Answer with a time-limited offer of your own on your Google profile.',
  ad_started: 'Check your ad coverage on the same keywords.',
  ad_stopped: 'Raise bids on the keywords they just left.',
  review_spike: 'Ask happy customers about punctuality in your review requests.',
  rating_change: 'Reply to your newest reviews and ask recent customers for one.',
  new_service: 'Highlight your experience with this service on your site.',
  hiring: 'Promote your same-day availability while they are short-staffed.',
  service_area_change: 'Run local ads in the ZIP codes they just added.',
  new_location: 'Tell nearby customers about your response times.',
  content: 'No action needed.',
};
const PLAYBOOK: Record<string, string> = { price_change: 'price_cut_bundle', promo: 'promo_blitz_counter', ad_started: 'ad_surge_watch', review_spike: 'reputation_slump_capture', service_area_change: 'territory_defend', new_service: 'new_service_response', hiring: 'hiring_push_capacity' };
const MOVE_ACTION: Record<string, { title: string; playbookId: string }> = {
  price_war: { title: 'Hold price and sell certainty: lead with guarantees', playbookId: 'price_war_hold_position' },
  promo_blitz: { title: 'Counter with one strong offer instead of many small ones', playbookId: 'promo_blitz_counter' },
  ad_surge: { title: 'Watch cost per lead and protect your brand keywords', playbookId: 'ad_surge_watch' },
};
const STATUS_CYCLE = ['done', 'in_progress', 'todo', 'dismissed'] as const;

const ageDays = (ctx: SeedContext, e: DemoEvent) => (ctx.clock.now.getTime() - e.occurredAt.getTime()) / DAY;

/** Spec §9.1.5 trend numbers for one client's businesses, computed from the seeded rows. */
export async function trendBusinesses(ctx: SeedContext, client: ActiveClientKey): Promise<TrendBusiness[]> {
  const list = [
    ...(client === 'loneStar' ? [{ id: ctx.ids.selfLoneStar, name: 'Lone Star Cooling', self: true }] : []),
    ...ctx.ids.competitors[client].map((c) => ({ id: c.id, name: c.name, self: false })),
  ];
  const ids = list.map((b) => b.id);
  const since = ctx.clock.daysAgo(90);
  const prev = ctx.clock.daysAgo(180);
  const sinceTs = sql`${since.toISOString()}::timestamptz`;
  const stats = await ctx.db
    .select({ id: review.competitorId, n: sql<number>`count(*) filter (where ${review.postedAt} >= ${sinceTs})::int`, avg: sql<number | null>`avg(${review.rating}) filter (where ${review.postedAt} >= ${sinceTs})`, prevAvg: sql<number | null>`avg(${review.rating}) filter (where ${review.postedAt} < ${sinceTs})` })
    .from(review).where(and(inArray(review.competitorId, ids), gte(review.postedAt, prev))).groupBy(review.competitorId);
  const ads = await ctx.db.select({ id: ad.competitorId, n: sql<number>`count(*)::int` }).from(ad).where(and(inArray(ad.competitorId, ids), eq(ad.isActive, true))).groupBy(ad.competitorId);
  const r1 = (x: number | null) => (x === null ? null : Math.round(Number(x) * 10) / 10);
  return list.map((b) => {
    const s = stats.find((x) => x.id === b.id);
    return { competitorId: b.id, name: b.name, self: b.self, reviews: Number(s?.n ?? 0), avgRating: r1(s?.avg ?? null), prevAvgRating: r1(s?.prevAvg ?? null), activeAds: b.self ? null : Number(ads.find((x) => x.id === b.id)?.n ?? 0) };
  });
}

function itemValues(ctx: SeedContext, client: ActiveClientKey, briefId: string, e: DemoEvent, ord: number, status: 'active' | 'dropped') {
  const m = ctx.ids.moves.find((x) => x.competitorId === e.competitorId && x.client === client);
  return {
    briefId, agencyId: ctx.ids.agencyId, clientId: ctx.ids.clients[client], ord, competitorId: e.competitorId, headline: e.summary, whatChanged: `${e.summary}.`,
    whyItMatters: WHY[e.changeType] ?? WHY.content!, recommendedAction: ACTION[e.changeType] ?? ACTION.content!, confidence: 0.88,
    effort: e.changeType === 'price_change' ? 'L' : 'M', impact: e.route === 'alert' ? 'H' : 'M', eventIds: [e.id], moveId: m?.id ?? null, evidenceIds: e.evidenceIds,
    upsellTag: e.changeType.startsWith('ad_') ? 'ppc_audit' : null, playbookId: PLAYBOOK[e.changeType] ?? null, status,
    editedBy: status === 'dropped' ? ctx.ids.users.admin.userId : null,
  };
}

async function seedSentBriefs(ctx: SeedContext, client: ActiveClientKey, count: number): Promise<string[]> {
  const { db, ids, clock } = ctx;
  const pool = ids.events.filter((e) => e.client === client && e.route !== 'archive' && ageDays(ctx, e) > 7).sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  if (pool.length < count * 2) throw new Error(`seedBriefs: ${client} needs ${count * 2} older brief/alert events, has ${pool.length}`);
  const admin = ids.users.admin.userId;
  const owner = ids.users[client === 'loneStar' ? 'ownerLoneStar' : 'ownerBrazos'].userId;
  const trend: TrendSnapshot = { windowDays: 7, events: 0, businesses: await trendBusinesses(ctx, client) };
  const out: string[] = [];
  let n = 0;
  for (let i = 0; i < count; i++) {
    const deliveryDate = clock.pastMondays[i]!;
    const end = atUtc(deliveryDate);
    const start = new Date(end.getTime() - 7 * DAY);
    const events = pool.slice(2 * i, 2 * i + 2);
    const approvedAt = notAfter(new Date(end.getTime() - 14 * 3_600_000), clock.now);
    const sentAt = notAfter(new Date(end.getTime() + 12 * 3_600_000), clock.now);
    const [b] = await db.insert(brief).values({
      agencyId: ids.agencyId, clientId: ids.clients[client], deliveryDate, periodStart: start, periodEnd: end, kind: 'standard', status: 'sent',
      summary: `${events.length} notable competitor moves this week.`, trend: { ...trend, events: events.length }, dropped: { items: 1, sentences: 2 },
      generatedAt: new Date(start.getTime() + 4 * DAY), approvedAt, approvedBy: admin, sentAt, createdAt: new Date(start.getTime() + 4 * DAY), updatedAt: sentAt,
    }).returning({ id: brief.id });
    out.push(b!.id);
    const items = await db.insert(briefItem).values(events.map((e, k) => itemValues(ctx, client, b!.id, e, k + 1, 'active'))).returning({ id: briefItem.id, headline: briefItem.headline });
    for (const [k, item] of items.entries()) {
      const e = events[k]!;
      const status = STATUS_CYCLE[n++ % STATUS_CYCLE.length]!;
      const v = itemValues(ctx, client, b!.id, e, k + 1, 'active');
      const [rec] = await db.insert(recommendation).values({
        agencyId: ids.agencyId, clientId: ids.clients[client], title: v.recommendedAction, rationale: v.whyItMatters, evidenceIds: e.evidenceIds, eventIds: [e.id],
        moveId: v.moveId, briefItemId: item.id, playbookId: v.playbookId, effort: v.effort, impact: v.impact, owner: k % 2 === 0 ? 'client' : 'agency', status,
        dismissReason: status === 'dismissed' ? 'We already run a similar offer' : null, dueAt: status === 'todo' ? new Date(end.getTime() + 14 * DAY) : null,
        source: 'brief', createdAt: approvedAt, updatedAt: sentAt,
      }).returning({ id: recommendation.id });
      await db.insert(feedback).values({ agencyId: ids.agencyId, clientId: ids.clients[client], subjectType: 'brief_item', subjectId: item.id, kind: 'rating', after: { useful: true }, actor: admin, createdAt: approvedAt });
      if (status !== 'todo') {
        await db.insert(feedback).values({
          agencyId: ids.agencyId, clientId: ids.clients[client], subjectType: 'recommendation', subjectId: rec!.id, kind: 'status', before: { status: 'todo' }, after: { status },
          reason: status === 'dismissed' ? 'We already run a similar offer' : null, actor: k % 2 === 0 ? owner : admin, createdAt: sentAt,
        });
      }
    }
  }
  return out;
}

async function seedReadyBriefs(ctx: SeedContext): Promise<void> {
  const { db, ids, clock } = ctx;
  const end = atUtc(clock.nextMonday);
  const start = new Date(end.getTime() - 7 * DAY);
  const recent = ids.events.filter((e) => e.client === 'loneStar' && e.route !== 'archive' && ageDays(ctx, e) <= 7).sort((a, b) => b.score - a.score);
  if (recent.length < 4) throw new Error(`seedBriefs: Lone Star needs 4 brief/alert events in the last 7 days, has ${recent.length}`);
  const [ready] = await db.insert(brief).values({
    agencyId: ids.agencyId, clientId: ids.clients.loneStar, deliveryDate: clock.nextMonday, periodStart: start, periodEnd: end, kind: 'standard', status: 'ready',
    summary: 'Three competitors moved on price and ads this week.', trend: { windowDays: 7, events: recent.length, businesses: await trendBusinesses(ctx, 'loneStar') },
    dropped: { items: 0, sentences: 1 }, generatedAt: clock.daysAgo(0.25), createdAt: clock.daysAgo(0.25), updatedAt: clock.daysAgo(0.1),
  }).returning({ id: brief.id });
  ids.briefs.readyLoneStar = ready!.id;
  const values = recent.slice(0, 4).map((e, k) => itemValues(ctx, 'loneStar', ready!.id, e, k + 1, k === 3 ? 'dropped' : 'active'));
  const items = await db.insert(briefItem).values(values).returning({ id: briefItem.id, headline: briefItem.headline, status: briefItem.status });
  const admin = ids.users.admin.userId;
  const base = { agencyId: ids.agencyId, clientId: ids.clients.loneStar, subjectType: 'brief_item', actor: admin, createdAt: clock.daysAgo(0.1) };
  await db.insert(feedback).values([
    { ...base, subjectId: items[0]!.id, kind: 'edit', before: { headline: `${items[0]!.headline} this week` }, after: { headline: items[0]!.headline } },
    { ...base, subjectId: items.find((i) => i.status === 'dropped')!.id, kind: 'drop', reason: 'Too minor for this week' },
  ]);

  const [quiet] = await db.insert(brief).values({
    agencyId: ids.agencyId, clientId: ids.clients.brazos, deliveryDate: clock.nextMonday, periodStart: start, periodEnd: end, kind: 'quiet', status: 'ready',
    summary: 'No significant competitor changes this week.', trend: { windowDays: 7, events: 0, businesses: await trendBusinesses(ctx, 'brazos') },
    dropped: { items: 2, sentences: 3 }, generatedAt: clock.daysAgo(0.25), createdAt: clock.daysAgo(0.25), updatedAt: clock.daysAgo(0.25),
  }).returning({ id: brief.id });
  ids.briefs.quietBrazos = quiet!.id;
}

async function seedMoveRecommendations(ctx: SeedContext): Promise<void> {
  for (const m of ctx.ids.moves.filter((x) => x.open)) {
    const a = MOVE_ACTION[m.moveType] ?? { title: 'Review this competitor move with the client', playbookId: null };
    await ctx.db.insert(recommendation).values({
      agencyId: ctx.ids.agencyId, clientId: ctx.ids.clients[m.client], title: a.title, rationale: m.summary, moveId: m.id, playbookId: a.playbookId,
      effort: 'M', impact: 'H', owner: 'agency', status: 'todo', source: 'move', createdAt: ctx.clock.daysAgo(3), updatedAt: ctx.clock.daysAgo(3),
    });
  }
}

async function seedAlerts(ctx: SeedContext): Promise<void> {
  const { db, ids } = ctx;
  const byNewest = (client: ActiveClientKey) => ids.events.filter((e) => e.client === client && e.route === 'alert').sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  const [pending, delivered] = byNewest('loneStar');
  const [dismissed] = byNewest('brazos');
  if (!pending || !delivered || !dismissed) throw new Error('seedBriefs: needs 2 Lone Star and 1 Brazos alert-route events');
  const admin = ids.users.admin.userId;
  const insert = async (client: ActiveClientKey, e: DemoEvent, extra: Partial<typeof alert.$inferInsert>): Promise<string> => {
    const reviewedAt = new Date(e.occurredAt.getTime() + 2 * 3_600_000);
    const [row] = await db.insert(alert).values({
      agencyId: ids.agencyId, clientId: ids.clients[client], competitorId: e.competitorId, eventId: e.id, score: e.score, headline: e.summary,
      body: `${e.summary}. ${WHY[e.changeType] ?? ''}`.trim(), written: 'model', evidenceIds: e.evidenceIds, status: 'pending_review', mode: 'after_am_check',
      createdAt: new Date(e.occurredAt.getTime() + 3_600_000), updatedAt: reviewedAt, ...extra,
    }).returning({ id: alert.id });
    await db.insert(alertEvent).values({ alertId: row!.id, agencyId: ids.agencyId, clientId: ids.clients[client], eventId: e.id });
    return row!.id;
  };
  const deliveredAt = new Date(delivered.occurredAt.getTime() + 2.5 * 3_600_000);
  ids.alerts.pending = await insert('loneStar', pending, {});
  ids.alerts.delivered = await insert('loneStar', delivered, {
    status: 'delivered', delivery: 'immediate', reviewedBy: admin, reviewedAt: new Date(delivered.occurredAt.getTime() + 2 * 3_600_000), deliveredAt,
    deliveredLocalDate: deliveredAt.toISOString().slice(0, 10),
  });
  ids.alerts.dismissed = await insert('brazos', dismissed, {
    status: 'dismissed', reviewedBy: admin, reviewedAt: new Date(dismissed.occurredAt.getTime() + 2 * 3_600_000), dismissReason: 'Already covered in this week’s brief',
  });
}

async function seedTrendReport(ctx: SeedContext): Promise<void> {
  const { db, ids, clock } = ctx;
  const q = Math.floor(clock.now.getUTCMonth() / 3);
  const year = q === 0 ? clock.now.getUTCFullYear() - 1 : clock.now.getUTCFullYear();
  const pq = q === 0 ? 3 : q - 1;
  const periodStart = new Date(Date.UTC(year, pq * 3, 1));
  const periodEnd = new Date(Date.UTC(year, pq * 3 + 3, 1));
  const events = ids.events.filter((e) => e.client === 'loneStar');
  const eventsByType: Record<string, number> = {};
  for (const e of events) eventsByType[e.changeType] = (eventsByType[e.changeType] ?? 0) + 1;
  const recs = await db.select({ status: recommendation.status }).from(recommendation).where(eq(recommendation.clientId, ids.clients.loneStar));
  const data: TrendReportData = {
    quarter: `${year}-Q${pq + 1}`, windowDays: Math.round((periodEnd.getTime() - periodStart.getTime()) / DAY), businesses: await trendBusinesses(ctx, 'loneStar'), eventsByType,
    moves: ids.moves.filter((m) => m.client === 'loneStar').map((m) => ({
      moveType: m.moveType, competitorName: ids.competitors.loneStar.find((c) => c.id === m.competitorId)!.name, status: m.open ? 'active' : 'closed', firstDetectedAt: clock.daysAgo(60).toISOString(),
    })),
    briefsSent: ids.briefs.sentLoneStar.length, alertsDelivered: 1,
    recommendations: { created: recs.length, done: recs.filter((r) => r.status === 'done').length, inProgress: recs.filter((r) => r.status === 'in_progress').length, dismissed: recs.filter((r) => r.status === 'dismissed').length },
  };
  const [r] = await db.insert(trendReport).values({
    agencyId: ids.agencyId, clientId: ids.clients.loneStar, quarter: data.quarter, periodStart, periodEnd, data, status: 'sent',
    createdAt: notAfter(new Date(periodEnd.getTime() + DAY), clock.now), sentAt: notAfter(new Date(periodEnd.getTime() + 2 * DAY), clock.now),
  }).returning({ id: trendReport.id });
  ids.reportId = r!.id;
}

/** Owner decision: demo brief and report downloads work without the worker, so each gets a placeholder PDF. */
async function seedPdfs(ctx: SeedContext): Promise<void> {
  const { db, ids, store } = ctx;
  const put = async (id: string, title: string): Promise<string> => {
    const key = `demo/pdf/${id}.pdf`;
    await store.put(key, demoPdf(title, ['Brazos Digital - demo data', 'This placeholder stands in for the rendered PDF.']), 'application/pdf');
    return key;
  };
  for (const id of [...ids.briefs.sentLoneStar, ...ids.briefs.sentBrazos, ids.briefs.readyLoneStar]) {
    const pdfKey = await put(id, 'Weekly competitor brief (demo)');
    await db.update(brief).set({ pdfKey }).where(eq(brief.id, id));
  }
  const pdfKey = await put(ids.reportId, 'Quarterly competitor trends (demo)');
  await db.update(trendReport).set({ pdfKey }).where(eq(trendReport.id, ids.reportId));
}

/** Spec §4.7. */
export async function seedBriefs(ctx: SeedContext): Promise<void> {
  ctx.ids.briefs.sentLoneStar = await seedSentBriefs(ctx, 'loneStar', 4);
  ctx.ids.briefs.sentBrazos = await seedSentBriefs(ctx, 'brazos', 2);
  await seedReadyBriefs(ctx);
  await seedMoveRecommendations(ctx);
  await seedAlerts(ctx);
  await seedTrendReport(ctx);
  await seedPdfs(ctx);
}
