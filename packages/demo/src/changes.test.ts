import { capture, changeEvent, detectedChange, evidence, move, moveEvent } from '@cs/db';
import { openTestDbs } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedChanges } from './changes';
import { DAY } from './clock';
import { createSeedContext, type SeedContext } from './context';
import { seedTenancy } from './tenancy';
import { countRows, resetDemoTables, TEST_SALT } from './test-support';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const store = createMemoryStore();
let ctx: SeedContext;

beforeAll(async () => {
  await resetDemoTables(dbs.owner);
  ctx = createSeedContext({ db: dbs.owner, store, now: new Date(), salt: TEST_SALT });
  await seedTenancy(ctx);
  await seedChanges(ctx);
});

describe('seedChanges', () => {
  it('writes about 40 events over 90 days, each with a detected change, an event_change and an event_score', async () => {
    expect(ctx.ids.events).toHaveLength(40);
    expect(await countRows(dbs.owner, sql`select count(*)::int as n from event`)).toBe(40);
    expect(await countRows(dbs.owner, sql`select count(*)::int as n from event e where exists (select 1 from event_change ec where ec.event_id = e.id) and exists (select 1 from event_score s where s.event_id = e.id)`)).toBe(40);
    const now = ctx.clock.now.getTime();
    for (const e of ctx.ids.events) {
      expect(e.occurredAt.getTime()).toBeLessThan(now);
      expect(now - e.occurredAt.getTime()).toBeLessThan(91 * DAY);
    }
  });

  it('covers every severity and the web, ad, review, profile and jobs sources', () => {
    expect(new Set(ctx.ids.events.map((e) => e.route))).toEqual(new Set(['alert', 'brief', 'archive']));
    expect(new Set(ctx.ids.events.map((e) => e.source))).toEqual(new Set(['web', 'google_ads', 'meta_ads', 'google_reviews', 'google_business_profile', 'google_jobs']));
  });

  it('gives each web change a before and an after capture with html, text and a real WebP screenshot', async () => {
    const web = ctx.ids.events.filter((e) => e.source === 'web');
    expect(web.length).toBeGreaterThanOrEqual(15);
    for (const e of web.slice(0, 3)) {
      const [ch] = await dbs.owner.select().from(detectedChange).where(eq(detectedChange.id, e.changeId));
      const ev = await dbs.owner.select().from(evidence).where(inArray(evidence.captureId, [ch!.beforeCaptureId!, ch!.afterCaptureId!]));
      expect(ev.map((x) => x.kind).sort()).toEqual(['html', 'html', 'screenshot', 'screenshot', 'text', 'text']);
      const shot = ev.find((x) => x.kind === 'screenshot' && x.captureId === ch!.afterCaptureId)!;
      const bytes = await store.get(shot.objectKey);
      expect(Buffer.from(bytes!.slice(0, 4)).toString('ascii')).toBe('RIFF');
      expect(Buffer.from(bytes!.slice(8, 12)).toString('ascii')).toBe('WEBP');
      expect(shot.bytes).toBe(bytes!.byteLength);
      expect(e.evidenceIds).toEqual([shot.id]);
    }
  });

  it('records vendor events against a vendor capture with a JSON evidence file', async () => {
    const ad = ctx.ids.events.find((e) => e.source === 'google_ads')!;
    const [ch] = await dbs.owner.select().from(detectedChange).where(eq(detectedChange.id, ad.changeId));
    const [cap] = await dbs.owner.select().from(capture).where(eq(capture.id, ch!.afterCaptureId!));
    expect(cap!.source).toBe('google_ads');
    const [ev] = await dbs.owner.select().from(evidence).where(eq(evidence.captureId, cap!.id));
    expect(ev!.kind).toBe('vendor_json');
  });

  it('adds six moves, open and resolved, each linked to its events', async () => {
    const moves = await dbs.owner.select().from(move);
    expect(moves).toHaveLength(6);
    expect(moves.filter((m) => m.closedAt === null)).toHaveLength(4);
    for (const m of moves) {
      const links = await dbs.owner.select().from(moveEvent).where(eq(moveEvent.moveId, m.id));
      expect(links.length).toBeGreaterThan(0);
      const evs = await dbs.owner.select({ competitorId: changeEvent.competitorId }).from(changeEvent).where(inArray(changeEvent.id, links.map((l) => l.eventId)));
      expect(evs.every((x) => x.competitorId === m.competitorId)).toBe(true);
    }
  });

  it('never gives the no-pricing or no-ads competitors a pricing or ad event', () => {
    expect(ctx.ids.events.some((e) => e.competitorId === ctx.ids.noData.pricing && ['price_change', 'promo'].includes(e.changeType))).toBe(false);
    expect(ctx.ids.events.some((e) => e.competitorId === ctx.ids.noData.ads && e.source.endsWith('_ads'))).toBe(false);
  });
});
