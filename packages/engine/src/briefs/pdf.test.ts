import { randomUUID } from 'node:crypto';
import { brief, briefItem } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
    expect(calls[0]!.meta).toEqual({ title: 'A1 HVAC — weekly competitor report 2026-10-05', author: 'Agency A', subject: 'Weekly competitor report' });
    expect(calls[0]!.allowUrls).toEqual([]);
    // An old brief (no stored report): the cover over today's body.
    expect(html).toContain('Weekly competitor report');
    expect(html).toContain('data-section="legacy"');
  });

  it('renderBriefPdf uses the report document and the new title', async () => {
    const id = await seedBrief('sent');
    const [kept] = await dbs.owner.select().from(briefItem).where(eq(briefItem.headline, 'Kept first'));
    const live = await seedScoredEvent(dbs.service, { competitorId: IDS.competitorX, clientId: IDS.clientA1, agencyId: IDS.agencyA, occurredAt: day(-1), changeType: 'ad_started' });
    const line = (eventId: string, text: string) => ({
      grade: 'notable', topic: 'ads', competitorId: IDS.competitorX, competitorName: 'Smith HVAC', changeType: 'ad_started', channel: null, count: 1, text,
      firstAt: day(-1).toISOString(), lastAt: day(-1).toISOString(), eventIds: [eventId], evidenceIds: [],
    });
    const months = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`);
    const weeks = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(2026, 7, 2 + i * 7)).toISOString().slice(0, 10));
    const report = {
      v: 1, asOf: day(0).toISOString(),
      changes: { v: 1, threshold: 41.5, lines: [line(live.eventId, 'Live ad line'), line(randomUUID(), 'Gone ad line')], totals: { major: 1, notable: 2, minor: 0 } },
      kpis: { changes7d: 3, alerts7d: 0, priceMoves7d: 1, priceCuts7d: 1, activeAds: 2, activeAds7dAgo: 1, ratingSelf: null, ratingAvg: null, weekly: { changes: [0, 0, 0, 0, 0, 0, 0, 3], priceMoves: [0, 0, 0, 0, 0, 0, 0, 1], activeAds: [1, 1, 1, 1, 1, 1, 1, 2] } },
      pressure: [], rating: { months, series: [] }, ads: { weeks, series: [{ key: IDS.competitorX, name: 'Smith HVAC', points: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2] }] },
      rankings: null, moves: [], recommendations: [], alerts: [],
    };
    const scorecard = {
      asOf: day(0).toISOString(), baselineBriefId: null, evidenceIds: [], openFirstMoves: [],
      tiles: (['rating', 'reviews90d', 'replyRate', 'mapTop3Share'] as const).map((metric) => ({ metric, you: null, rivalMedian: null, deltaSinceStart: null })),
      rows: [{ competitorId: null, name: 'A1 HVAC', self: true, tier: null, values: { rating: 4.5, reviews90d: 3, replyRate: null, mapTop3Share: null, adsActive: null, metaAdsActive: null } }],
    };
    await dbs.owner.update(brief).set({ report, scorecard, kind: 'standard' }).where(eq(brief.id, id));
    await dbs.owner.update(briefItem).set({ eventIds: [live.eventId] }).where(eq(briefItem.id, kept!.id));
    const calls: { html: string; meta: unknown }[] = [];
    await renderBriefPdf({ db: dbs.service, store: createMemoryStore(), pdf: async (html: string, meta: unknown) => (calls.push({ html, meta }), new Uint8Array([1])) }, id);
    const html = calls[0]!.html;
    expect(calls[0]!.meta).toEqual({ title: 'A1 HVAC — weekly competitor report 2026-10-05', author: 'Agency A', subject: 'Weekly competitor report' });
    expect(html).toContain('data-section="summary"');
    expect(html).toContain('Where you stand'); // P7: shown on a standard week in the PDF
    // 'Kept first' cites an ad event, so it prints under Ads; the line whose event is gone never prints.
    expect(html.slice(html.indexOf('data-section="ads"'))).toContain('Kept first');
    expect(html).toContain('Live ad line');
    expect(html).not.toContain('Gone ad line');
    expect(html).not.toContain('Dropped one');
    expect(html).not.toMatch(/upsell|lsa|threshold|41\.5|rival\s*monday/i);
  });

  it('a starting point keeps its old document and title', async () => {
    const id = await seedBrief('sent');
    await dbs.owner.update(brief).set({ kind: 'starting_point' }).where(eq(brief.id, id));
    const calls: { html: string; meta: unknown }[] = [];
    await renderBriefPdf({ db: dbs.service, store: createMemoryStore(), pdf: async (html: string, meta: unknown) => (calls.push({ html, meta }), new Uint8Array([1])) }, id);
    expect(calls[0]!.meta).toEqual({ title: 'A1 HVAC — your starting point 2026-10-05', author: 'Agency A', subject: 'Your starting point' });
    expect(calls[0]!.html).not.toContain('Weekly competitor report');
    expect(calls[0]!.html).toContain('Your starting point');
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

describe('renderBriefPdf map image', () => {
  const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const JPEG_HEAD = [0xff, 0xd8, 0xff, 0xe0];
  const bytes = (head: number[], size: number) => Uint8Array.from({ length: size }, (_, i) => head[i] ?? 7);
  const KEY = `rank-map/${IDS.clientA1}/abc123.png`;

  let n = 0;
  async function seedWithMap(key = KEY): Promise<string> {
    const id = await seedBrief('sent', `2026-11-${String(++n).padStart(2, '0')}`);
    const months = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`);
    const weeks = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(2026, 7, 2 + i * 7)).toISOString().slice(0, 10));
    const report = {
      v: 1, asOf: day(0).toISOString(),
      changes: { v: 1, threshold: 41.5, lines: [], totals: { major: 0, notable: 0, minor: 0 } },
      kpis: { changes7d: 0, alerts7d: 0, priceMoves7d: 0, priceCuts7d: 0, activeAds: null, activeAds7dAgo: null, ratingSelf: null, ratingAvg: null, weekly: { changes: [0, 0, 0, 0, 0, 0, 0, 0], priceMoves: [0, 0, 0, 0, 0, 0, 0, 0], activeAds: [null, null, null, null, null, null, null, null] } },
      pressure: [], rating: { months, series: [] }, ads: { weeks, series: [] },
      rankings: {
        scanAt: day(-1).toISOString(), prevScanAt: null,
        keywords: [{ keyword: 'ac repair', you: { avgRank: 3.2, top3Share: 0.4, points: 3 }, prev: null, rivals: [] }],
        map: { keyword: 'ac repair', objectKey: key, bounds: { west: -97.1, south: 32.9, east: -96.9, north: 33.1 }, width: 600, height: 400, points: [{ lat: 33, lng: -97, rank: 3 }] },
      },
      moves: [], recommendations: [], alerts: [],
    };
    await dbs.owner.update(brief).set({ report, kind: 'standard' }).where(eq(brief.id, id));
    return id;
  }
  async function render(content: Uint8Array | null, key = KEY): Promise<string> {
    const id = await seedWithMap(key);
    const store = createMemoryStore();
    if (content) await store.put(key, content, 'image/png');
    const calls: string[] = [];
    await renderBriefPdf({ db: dbs.service, store, pdf: async (html: string) => (calls.push(html), new Uint8Array([1])) }, id);
    return calls[0]!;
  }

  it('inlines a stored PNG as a data: URI with the Stadia attribution and the rank dots', async () => {
    const html = await render(bytes(PNG_HEAD, 64));
    expect(html).toContain('data:image/png;base64,');
    expect(html).toContain('data-map-overlay');
    expect(html).toContain('© Stadia Maps');
  });

  it('a JPEG gets the image/jpeg mime', async () => {
    expect(await render(bytes(JPEG_HEAD, 64))).toContain('data:image/jpeg;base64,');
  });

  it('a key outside this client\'s rank-map prefix is never read', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      for (const key of [`rank-map/${IDS.clientB1}/abc123.png`, `evidence/${IDS.clientA1}/abc123.png`, `rank-map/${IDS.clientA1}/abc123.jpg`, `rank-map/${IDS.clientA1}/nested/abc123.png`]) {
        const html = await render(bytes(PNG_HEAD, 64), key); // a valid PNG sits at the key: only the shape check can refuse it
        expect(html).not.toContain('data:image');
        expect(html).toContain('Average map position by keyword');
      }
      expect(warn.mock.calls.filter((c) => String(c[0]).includes("not this client's rank-map key"))).toHaveLength(4);
    } finally {
      warn.mockRestore();
    }
  });

  it('oversized or non-image object ⇒ mapImage null', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      for (const content of [bytes(PNG_HEAD, 400 * 1024 + 1), new TextEncoder().encode('<html>not an image</html>'), null]) {
        const html = await render(content);
        expect(html).not.toContain('data:image');
        expect(html).not.toContain('data-map-overlay');
        expect(html).toContain('Average map position by keyword'); // the table still prints
      }
      expect(warn.mock.calls.filter((c) => String(c[0]).startsWith('[briefs] map image skipped'))).toHaveLength(3);
    } finally {
      warn.mockRestore();
    }
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
