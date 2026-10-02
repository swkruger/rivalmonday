import { capture, detectedChange, stageRun } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { and, asc, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createFakeAi } from '../../test/fake-ai';
import { day, fixture, seedPage, seedWebCapture } from '../../test/seed';
import { cosine, diffWebCapture, gateChange } from './diff-stage';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

async function twoCaptures(v1: string, v2: string) {
  const store = createMemoryStore();
  const page = await seedPage(dbs.service, IDS.competitorX);
  const before = await seedWebCapture(dbs.service, store, { competitorId: IDS.competitorX, trackedPageId: page, html: v1, capturedAt: day(0) });
  const after = await seedWebCapture(dbs.service, store, { competitorId: IDS.competitorX, trackedPageId: page, html: v2, capturedAt: day(1) });
  return { store, page, before, after };
}
const changes = () => dbs.owner.select().from(detectedChange).orderBy(asc(detectedChange.blockKey));

describe('cosine and gate', () => {
  it('cosine handles zero vectors', () => {
    expect(cosine([1, 0], [1, 0])).toBe(1);
    expect(cosine([0, 0], [0, 0])).toBe(1);
    expect(cosine([0, 0], [1, 0])).toBe(0);
  });

  it('never masks a money change', () => {
    const b = { id: 'b', ord: 0, path: 'p', blockKey: 'p#0', text: 'Only $89', textSha: 'x', embedding: null };
    const a = { ...b, id: 'a', text: 'Only $69' };
    const numeric = [{ kind: 'price' as const, before: null, after: null, pct: -22.5 }];
    expect(gateChange({ kind: 'modified', before: b, after: a }, numeric, 1, new Set(['p#0']))).toEqual(['numeric', 'masked']);
    expect(gateChange({ kind: 'modified', before: b, after: { ...a, text: 'Only today' } }, [], 0.5, new Set(['p#0']))).toBeNull();
  });
});

describe('diffWebCapture (golden fixtures)', () => {
  it('HVAC home: cookie banner, nav, footer year and an Oxford comma produce nothing; the price cut is one numeric change', async () => {
    const { store, after, before } = await twoCaptures(await fixture('hvac-home-v1.html'), await fixture('hvac-home-v2.html'));
    const ai = createFakeAi();
    const r = await diffWebCapture({ db: dbs.service, store, ai }, after);
    expect(r.ran && r.result.changeIds).toHaveLength(1);
    const [c] = await changes();
    expect(c).toMatchObject({
      kind: 'modified', blockKey: 'main>section.services>a.card#0', beforeCaptureId: before, afterCaptureId: after, status: 'pending', flags: ['numeric'],
      beforeText: 'AC Tune-Up Only $89 per system', afterText: 'AC Tune-Up Only $69 per system',
    });
    expect(c?.numericChanges).toMatchObject([{ kind: 'price', before: { value: 89, unit: 'USD/system' }, after: { value: 69, unit: 'USD/system' }, pct: -22.5 }]);
    expect(c?.similarity).toBeCloseTo(1, 5);
  });

  it('dental home: reordering and "!!" are ignored; the new service is one structural change', async () => {
    const { store, after } = await twoCaptures(await fixture('dental-home-v1.html'), await fixture('dental-home-v2.html'));
    await diffWebCapture({ db: dbs.service, store, ai: createFakeAi() }, after);
    const rows = await changes();
    expect(rows.map((c) => [c.kind, c.afterText, c.flags])).toEqual([['added', 'Invisalign clear aligners now offered at our Frisco office', ['structural']]]);
  });

  it('treats the first capture of a page as a silent baseline', async () => {
    const store = createMemoryStore();
    const page = await seedPage(dbs.service, IDS.competitorX);
    const only = await seedWebCapture(dbs.service, store, { competitorId: IDS.competitorX, trackedPageId: page, html: await fixture('hvac-home-v1.html'), capturedAt: day(0) });
    const ai = createFakeAi();
    const r = await diffWebCapture({ db: dbs.service, store, ai }, only);
    expect(r).toEqual({ ran: true, result: { baseline: true, changeIds: [], masked: 0, newlyMasked: [] } });
    expect(await changes()).toEqual([]);
    expect(ai.calls.embed).toEqual([]);
  });

  it('is idempotent: a re-delivered job writes nothing new', async () => {
    const { store, after } = await twoCaptures(await fixture('hvac-home-v1.html'), await fixture('hvac-home-v2.html'));
    await diffWebCapture({ db: dbs.service, store, ai: createFakeAi() }, after);
    expect(await diffWebCapture({ db: dbs.service, store, ai: createFakeAi() }, after)).toEqual({ ran: false });
    expect(await changes()).toHaveLength(1);
  });

  it('embeds redacted text only, and stores block embeddings for reuse', async () => {
    const v1 = '<body><p class="cta">Call 972-555-0100 for a quote today</p></body>';
    const v2 = '<body><p class="cta">Email quotes@smith.example for a fast quote</p></body>';
    const { store, after } = await twoCaptures(v1, v2);
    const ai = createFakeAi();
    await diffWebCapture({ db: dbs.service, store, ai }, after);
    expect(ai.calls.embed.flat().join(' ')).not.toMatch(/555-0100|quotes@smith/);
    const [c] = await changes();
    expect(c?.flags).toEqual(['semantic']);
  });

  it('stops recording a rotating block once it is learned volatile', async () => {
    const store = createMemoryStore();
    const page = await seedPage(dbs.service, IDS.competitorX);
    const html = (q: string) => `<body><h1>Smith HVAC</h1><section class="quote"><blockquote>${q}</blockquote></section></body>`;
    const quotes = ['Fast and friendly crew', 'Fixed our furnace quickly', 'Honest upfront pricing', 'Very clean careful work', 'Arrived right on schedule', 'Polite helpful technician'];
    const results = [];
    for (let i = 0; i < quotes.length; i++) {
      const id = await seedWebCapture(dbs.service, store, { competitorId: IDS.competitorX, trackedPageId: page, html: html(quotes[i]!), capturedAt: day(i) });
      const r = await diffWebCapture({ db: dbs.service, store, ai: createFakeAi() }, id);
      results.push(r.ran ? r.result : null);
    }
    expect(results.map((r) => r?.changeIds.length)).toEqual([0, 1, 1, 1, 0, 0]);
    expect(results[3]?.newlyMasked).toEqual(['section.quote>blockquote#0']);
    expect(results[4]?.masked).toBe(1);
  });

  it('fails the stage, writing nothing, when embeddings are unavailable', async () => {
    const { store, after } = await twoCaptures('<body><p class="a">Old words here today</p></body>', '<body><p class="a">Completely different sentence now</p></body>');
    const ai = { ...createFakeAi(), embed: async () => { throw new Error('embeddings down'); } };
    await expect(diffWebCapture({ db: dbs.service, store, ai }, after)).rejects.toThrow('embeddings down');
    expect(await changes()).toEqual([]);
    // The same capture also has a (done) web_extract run, so filter by stage.
    expect((await dbs.owner.select().from(stageRun).where(and(eq(stageRun.subjectId, after), eq(stageRun.stage, 'web_diff'))))[0]).toMatchObject({ status: 'failed' });
  });

  it('refuses non-web captures', async () => {
    await dbs.service.insert(capture).values({ id: '00000000-0000-4000-8000-0000000000c9', competitorId: IDS.competitorX, source: 'google_ads', status: 'ok', collectorVersion: 'dfs/1' });
    await expect(diffWebCapture({ db: dbs.service, store: createMemoryStore(), ai: createFakeAi() }, '00000000-0000-4000-8000-0000000000c9')).rejects.toThrow(/not an ok web page/);
  });
});
