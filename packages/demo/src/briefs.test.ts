import { alert, alertEvent, brief, briefItem, client, feedback, recommendation, trendReport } from '@cs/db';
import { Scorecard } from '@cs/engine';
import { openTestDbs } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedAds } from './ads';
import { seedBriefs } from './briefs';
import { seedChanges } from './changes';
import { createSeedContext, type SeedContext } from './context';
import { seedReviews } from './reviews';
import { FRESH_CLIENT_NAME } from './starting-point';
import { seedTenancy } from './tenancy';
import { resetDemoTables, TEST_SALT } from './test-support';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
let ctx: SeedContext;

beforeAll(async () => {
  await resetDemoTables(dbs.owner);
  ctx = createSeedContext({ db: dbs.owner, store: createMemoryStore(), now: new Date(), salt: TEST_SALT });
  await seedTenancy(ctx);
  await seedChanges(ctx);
  await seedAds(ctx);
  await seedReviews(ctx);
  await seedBriefs(ctx);
});

describe('seedBriefs', () => {
  it('sends Lone Star’s briefs for the past 4 Mondays and holds one ready for approval', async () => {
    const rows = await dbs.owner.select().from(brief).where(eq(brief.clientId, ctx.ids.clients.loneStar));
    expect(rows.filter((b) => b.status === 'sent').map((b) => b.deliveryDate).sort().reverse()).toEqual(ctx.clock.pastMondays);
    const ready = rows.find((b) => b.status === 'ready')!;
    expect([ready.deliveryDate, ready.kind]).toEqual([ctx.clock.nextMonday, 'standard']);
    const items = await dbs.owner.select().from(briefItem).where(eq(briefItem.briefId, ready.id));
    expect(items.filter((i) => i.status === 'active')).toHaveLength(3);
    expect(items.filter((i) => i.status === 'dropped')).toHaveLength(1);
    for (const i of items) expect(i.evidenceIds.length).toBeGreaterThan(0);
  });

  it('holds a quiet brief for Brazos and sends two earlier ones', async () => {
    const rows = await dbs.owner.select().from(brief).where(eq(brief.clientId, ctx.ids.clients.brazos));
    expect(rows.filter((b) => b.status === 'sent' && b.kind === 'standard')).toHaveLength(2);
    const quiet = rows.find((b) => b.id === ctx.ids.briefs.quietBrazos)!;
    expect([quiet.kind, quiet.status]).toEqual(['quiet', 'ready']);
    expect(await dbs.owner.select().from(briefItem).where(eq(briefItem.briefId, quiet.id))).toHaveLength(0);
  });

  it('puts recommendations on the board with every status, a dismissal reason and feedback', async () => {
    const recs = await dbs.owner.select().from(recommendation);
    expect(new Set(recs.map((r) => r.status))).toEqual(new Set(['todo', 'in_progress', 'done', 'dismissed']));
    expect(recs.filter((r) => r.status === 'dismissed').every((r) => r.dismissReason)).toBe(true);
    expect(recs.filter((r) => r.source === 'move').length).toBe(ctx.ids.moves.filter((m) => m.open).length);
    const kinds = new Set((await dbs.owner.select().from(feedback)).map((f) => f.kind));
    expect(kinds).toEqual(new Set(['rating', 'status', 'edit', 'drop']));
  });

  it('has a delivered, a pending and a dismissed alert, each with its primary alert_event', async () => {
    const rows = await dbs.owner.select().from(alert);
    expect(rows.map((a) => a.status).sort()).toEqual(['delivered', 'dismissed', 'pending_review']);
    expect(rows.find((a) => a.status === 'dismissed')!.dismissReason).toBeTruthy();
    for (const a of rows) expect(await dbs.owner.select().from(alertEvent).where(eq(alertEvent.alertId, a.id))).toEqual([expect.objectContaining({ eventId: a.eventId })]);
  });

  it('sends a trend report for last quarter with counts from the seeded data', async () => {
    const [r] = await dbs.owner.select().from(trendReport);
    expect(r!.status).toBe('sent');
    expect(r!.quarter).toMatch(/^\d{4}-Q[1-4]$/);
    expect(r!.data!.businesses.length).toBeGreaterThan(1);
    expect(Object.values(r!.data!.eventsByType).reduce((a, b) => a + b, 0)).toBe(ctx.ids.events.filter((e) => e.client === 'loneStar').length);
  });

  it('stores a placeholder PDF for every sent brief, the ready brief and the report, but not the quiet brief', async () => {
    const briefIds = [...ctx.ids.briefs.sentLoneStar, ...ctx.ids.briefs.sentBrazos, ctx.ids.briefs.startingPointBrazos, ctx.ids.briefs.readyLoneStar];
    const keys: (string | null)[] = [];
    for (const id of briefIds) keys.push((await dbs.owner.select().from(brief).where(eq(brief.id, id)))[0]!.pdfKey);
    keys.push((await dbs.owner.select().from(trendReport).where(eq(trendReport.id, ctx.ids.reportId)))[0]!.pdfKey);
    for (const key of keys) {
      expect(key).not.toBeNull();
      const bytes = (await ctx.store.get(key!))!;
      expect(new TextDecoder('latin1').decode(bytes.slice(0, 4))).toBe('%PDF');
    }
    const [quiet] = await dbs.owner.select().from(brief).where(eq(brief.id, ctx.ids.briefs.quietBrazos));
    expect(quiet!.pdfKey).toBeNull();
  });

  it('sends Brazos a starting point with three self findings (one strength), a scorecard and recommendations', async () => {
    const [sp] = await dbs.owner.select().from(brief).where(eq(brief.id, ctx.ids.briefs.startingPointBrazos));
    expect([sp!.kind, sp!.status]).toEqual(['starting_point', 'sent']);
    const card = Scorecard.parse(sp!.scorecard);
    expect(card.baselineBriefId).toBeNull();
    expect(card.rows.filter((r) => r.self)).toHaveLength(1);
    const items = await dbs.owner.select().from(briefItem).where(eq(briefItem.briefId, sp!.id));
    expect(items).toHaveLength(3);
    for (const i of items) expect([i.subject, i.competitorId, i.upsellTag]).toEqual(['self', null, null]);
    for (const i of items) expect(i.evidenceIds.length).toBeGreaterThan(0);
    expect(items.some((i) => i.playbookId === 'promote_strength')).toBe(true);
    const recs = await dbs.owner.select().from(recommendation).where(eq(recommendation.clientId, ctx.ids.clients.brazos));
    expect(recs.filter((r) => items.some((i) => i.id === r.briefItemId))).toHaveLength(3);
  });

  it('gives the quiet Brazos brief a scorecard with deltas since the starting point and two open first moves', async () => {
    const [quiet] = await dbs.owner.select().from(brief).where(eq(brief.id, ctx.ids.briefs.quietBrazos));
    const card = Scorecard.parse(quiet!.scorecard);
    expect(card.baselineBriefId).toBe(ctx.ids.briefs.startingPointBrazos);
    const deltas = card.tiles.map((t) => t.deltaSinceStart!);
    expect(deltas.some((d) => d > 0)).toBe(true);
    expect(deltas.some((d) => d < 0)).toBe(true);
    expect(card.openFirstMoves).toHaveLength(2);
  });

  it('adds a fresh active client with no briefs, whose starting point is still being prepared', async () => {
    const [c] = await dbs.owner.select().from(client).where(eq(client.id, ctx.ids.startingPointFresh));
    expect([c!.name, c!.status]).toEqual([FRESH_CLIENT_NAME, 'active']);
    expect(await dbs.owner.select().from(brief).where(eq(brief.clientId, c!.id))).toHaveLength(0);
  });
});
