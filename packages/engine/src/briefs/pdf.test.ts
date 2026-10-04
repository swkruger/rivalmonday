import { brief, briefItem } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { day, seedScoredEvent } from '../../test/seed';
import { briefPdfKey, renderBriefPdf } from './pdf';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

async function seedBrief(status: 'ready' | 'approved' | 'sent') {
  const ev = await seedScoredEvent(dbs.service, { competitorId: IDS.competitorX, clientId: IDS.clientA1, agencyId: IDS.agencyA, occurredAt: day(0) });
  const [b] = await dbs.service.insert(brief).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, deliveryDate: '2026-10-05', periodStart: day(-7), periodEnd: day(0), status, summary: 'S.' }).returning();
  for (const [ord, headline, s] of [[4, 'Kept second', 'active'], [1, 'Kept first', 'active'], [2, 'Dropped one', 'dropped']] as const) {
    await dbs.service.insert(briefItem).values({ briefId: b!.id, agencyId: IDS.agencyA, clientId: IDS.clientA1, ord, competitorId: IDS.competitorX, headline, whatChanged: 'w', whyItMatters: 'y', recommendedAction: 'r', confidence: 0.9, effort: 'L', impact: 'M', eventIds: [ev.eventId], upsellTag: 'lsa', status: s });
  }
  return b!.id;
}

describe('renderBriefPdf', () => {
  it('renders the client view (active items in ord order, no upsell), stores it and records the key', async () => {
    const id = await seedBrief('sent');
    const store = createMemoryStore();
    const calls: { html: string; meta: unknown; allowUrls: string[] }[] = [];
    const pdf = async (html: string, meta: unknown, opts: { allowUrls: string[] }) => (calls.push({ html, meta, allowUrls: opts.allowUrls }), new Uint8Array([37, 80, 68, 70]));
    expect(await renderBriefPdf({ db: dbs.service, store, pdf }, id)).toEqual({ key: briefPdfKey(IDS.agencyA, id) });
    expect(await store.get(briefPdfKey(IDS.agencyA, id))).toEqual(new Uint8Array([37, 80, 68, 70]));
    expect((await dbs.owner.select().from(brief).where(eq(brief.id, id)))[0]!.pdfKey).toBe(briefPdfKey(IDS.agencyA, id));
    const html = calls[0]!.html;
    expect(html.indexOf('Kept first')).toBeLessThan(html.indexOf('Kept second'));
    expect(html).not.toContain('Dropped one');
    expect(html).not.toMatch(/upsell|\blsa\b/i);
    expect(calls[0]!.meta).toEqual({ title: 'A1 HVAC — weekly competitor brief 2026-10-05', author: 'Agency A', subject: 'Weekly competitor brief' });
    expect(calls[0]!.allowUrls).toEqual([]);
  });

  it('skips a brief that is not approved or sent', async () => {
    const id = await seedBrief('ready');
    expect(await renderBriefPdf({ db: dbs.service, store: createMemoryStore(), pdf: async () => new Uint8Array() }, id)).toEqual({ skipped: 'brief is ready' });
  });
});
