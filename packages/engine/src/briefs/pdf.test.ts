import { brief, briefItem } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { day, seedScoredEvent } from '../../test/seed';
import { addContact } from '../delivery/contacts';
import { briefPdfKey, listBriefsMissingPdf, PDF_RETRY_HOURS, renderBriefPdf } from './pdf';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

async function seedBrief(status: 'ready' | 'approved' | 'sent', deliveryDate = '2026-10-05') {
  const ev = await seedScoredEvent(dbs.service, { competitorId: IDS.competitorX, clientId: IDS.clientA1, agencyId: IDS.agencyA, occurredAt: day(0) });
  const [b] = await dbs.service.insert(brief).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, deliveryDate, periodStart: day(-7), periodEnd: day(0), status, summary: 'S.' }).returning();
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

  it('the PDF has no feedback line even when the agency has a contact', async () => {
    await addContact(dbs.service, { agencyId: IDS.agencyA, role: 'account_manager', email: 'am@a.example', name: 'Sam' });
    const id = await seedBrief('sent');
    const calls: string[] = [];
    await renderBriefPdf({ db: dbs.service, store: createMemoryStore(), pdf: async (html: string) => (calls.push(html), new Uint8Array([1])) }, id);
    expect(calls[0]).not.toContain('Something look off?');
    expect(calls[0]).not.toContain('mailto:');
  });

  it('brief PDF re-render overwrites', async () => {
    const id = await seedBrief('sent');
    const store = createMemoryStore();
    await renderBriefPdf({ db: dbs.service, store, pdf: async () => new Uint8Array([1]) }, id);
    await renderBriefPdf({ db: dbs.service, store, pdf: async () => new Uint8Array([2]) }, id);
    expect(await store.get(briefPdfKey(IDS.agencyA, id))).toEqual(new Uint8Array([2]));
  });

  it('skips a brief that is not approved or sent', async () => {
    const id = await seedBrief('ready');
    expect(await renderBriefPdf({ db: dbs.service, store: createMemoryStore(), pdf: async () => new Uint8Array() }, id)).toEqual({ skipped: 'brief is ready' });
  });
});

describe('listBriefsMissingPdf', () => {
  it('lists sent briefs from the last 7 days that have no PDF yet', async () => {
    const missing = await seedBrief('sent', '2026-10-05');
    const done = await seedBrief('sent', '2026-10-12');
    const old = await seedBrief('sent', '2026-09-28');
    await seedBrief('approved', '2026-10-19');
    await dbs.owner.update(brief).set({ sentAt: new Date(day(10).getTime() - 8 * 3_600_000) }).where(eq(brief.status, 'sent'));
    await dbs.owner.update(brief).set({ pdfKey: 'k' }).where(eq(brief.id, done));
    await dbs.owner.update(brief).set({ sentAt: day(-3) }).where(eq(brief.id, old));
    expect(await listBriefsMissingPdf(dbs.service, day(10))).toEqual([missing]);
  });

  it('PDF re-enqueued at 1,2,4,8 h, not at 3 or 5 h', async () => {
    const id = await seedBrief('sent', '2026-10-05');
    const sent = day(0);
    await dbs.owner.update(brief).set({ sentAt: sent }).where(eq(brief.id, id));
    const at = (h: number, extraMin = 30) => new Date(sent.getTime() + h * 3_600_000 + extraMin * 60_000);
    for (const h of [1, 2, 4, 8, 128]) expect(await listBriefsMissingPdf(dbs.service, at(h))).toEqual([id]);
    for (const h of [0, 3, 5, 6, 7, 9, 100]) expect(await listBriefsMissingPdf(dbs.service, at(h))).toEqual([]);
    expect(PDF_RETRY_HOURS(1)).toBe(true);
    expect(PDF_RETRY_HOURS(0)).toBe(false);
    expect(PDF_RETRY_HOURS(6)).toBe(false);
  });
});
