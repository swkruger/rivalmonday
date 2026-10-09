import { alert, alertEvent, brief, briefItem, feedback, recommendation, trendReport } from '@cs/db';
import { openTestDbs } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedAds } from './ads';
import { seedBriefs } from './briefs';
import { seedChanges } from './changes';
import { createSeedContext, type SeedContext } from './context';
import { seedReviews } from './reviews';
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
    expect(rows.filter((b) => b.status === 'sent')).toHaveLength(2);
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
    const briefIds = [...ctx.ids.briefs.sentLoneStar, ...ctx.ids.briefs.sentBrazos, ctx.ids.briefs.readyLoneStar];
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
});
