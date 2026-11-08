import { capture, detectedChange, stageRun, trackedPage } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { and, asc, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeAi } from '../../test/fake-ai';
import { day, fixture, seedPage, seedWebCapture } from '../../test/seed';
import { isStructuredChange } from '../tag/structured';
import { CHURN_MIN_CANDIDATES, CHURN_RATIO, churnCount, cosine, diffWebCapture, gateChange } from './diff-stage';

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
const htmlPage = (body: string) => `<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`;
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
    expect(r).toEqual({ ran: true, result: { baseline: true, changeIds: [], masked: 0, newlyMasked: [], suppressed: 0 } });
    expect(await changes()).toEqual([]);
    expect(ai.calls.embed).toEqual([]);
  });

  it('on whole-page churn (a redesign) keeps only the money changes, and warns', async () => {
    expect([CHURN_RATIO, CHURN_MIN_CANDIDATES]).toEqual([0.5, 20]);
    // Different wrappers give the paragraphs different keys, so they align as removed + added (a redesign).
    const paras = (cls: string, text: (i: number) => string) => `<section class="${cls}">${Array.from({ length: 30 }, (_, i) => `<p>${text(i)}</p>`).join('')}</section>`;
    const v1 = paras('about', (i) => `Legacy note about furnace upkeep, topic ${'q'.repeat(i + 1)}`) + `<div class="price">AC tune-up $89</div>`;
    const v2 = paras('story', (i) => `Fresh story covering duct cleaning, entry ${'z'.repeat(i + 1)}`) + `<div class="price">AC tune-up now $69</div>`;
    const { store, after } = await twoCaptures(htmlPage(v1), htmlPage(v2));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const r = await diffWebCapture({ db: dbs.service, store, ai: createFakeAi() }, after);
      expect(r.ran && r.result.changeIds).toHaveLength(1);
      expect(r.ran && r.result.suppressed).toBe(60);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toMatch(/heavy churn/);
    } finally {
      warn.mockRestore();
    }
    const rows = await changes();
    const pending = rows.filter((c) => c.status === 'pending');
    expect(pending.map((c) => [c.kind, c.blockKey, c.beforeText, c.afterText])).toEqual([['modified', 'div.price#0', 'AC tune-up $89', 'AC tune-up now $69']]);
    expect(pending[0]?.flags).toContain('numeric');
    expect(pending[0]?.numericChanges).toMatchObject([{ kind: 'price', pct: -22.5 }]);
    expect(rows.filter((c) => c.status === 'suppressed')).toHaveLength(60);
    expect(rows.filter((c) => c.status === 'suppressed').every((c) => c.flags?.includes('churn'))).toBe(true);
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

  it('embeds the NER pass over a person name mentioned by a reviewer-style blurb', async () => {
    const v1 = '<body><p class="desk">Welcome to our office</p></body>';
    const v2 = '<body><p class="desk">Jessica at the front desk was wonderful, thank you Jessica!</p></body>';
    const { store, after } = await twoCaptures(v1, v2);
    const ai = createFakeAi();
    await diffWebCapture({ db: dbs.service, store, ai }, after);
    expect(ai.calls.embed.flat().some((t) => t.includes('Jessica'))).toBe(false);
    expect(ai.calls.embed.flat().some((t) => t.includes('[name] at the front desk'))).toBe(true);
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
      // A downstream tag/review stage resolves a pending change well before the next day's diff runs; simulate
      // that here so the next iteration's volatile learner sees it as tagged, not still pending (Task 12).
      await dbs.service.update(detectedChange).set({ status: 'cosmetic' }).where(and(eq(detectedChange.trackedPageId, page), eq(detectedChange.status, 'pending')));
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

describe('churn guard (Phase 3d decision 16)', () => {
  const rows = (texts: string[]) => texts.map((t) => `<p>${t}</p>`).join('');
  const before = Array.from({ length: 24 }, (_, i) => `Our team has served Plano families for many years, paragraph number ${i} about comfort`);
  const after = Array.from({ length: 24 }, (_, i) => `Brand new marketing copy written by an agency for spring, section ${i} talks quality`);

  it('a full copy rewrite that keeps the DOM embeds and gates only the money change, and stores the rest as suppressed', async () => {
    const { store, after: cap } = await twoCaptures(
      htmlPage(rows([...before, 'AC tune-up only $89 per system'])),
      htmlPage(rows([...after, 'AC tune-up only $69 per system'])),
    );
    const ai = createFakeAi();
    const fallback = vi.fn(async () => []);
    const r = await diffWebCapture({ db: dbs.service, store, ai }, cap, { factFallback: fallback });
    expect(r.ran && r.result.suppressed).toBe(24);
    expect(fallback).not.toHaveBeenCalled();
    expect(ai.calls.embed.flat()).toEqual(['AC tune-up only $89 per system', 'AC tune-up only $69 per system']);
    const all = await changes();
    expect(all.filter((c) => c.status === 'pending').map((c) => c.afterText)).toEqual(['AC tune-up only $69 per system']);
    expect(all.filter((c) => c.status === 'suppressed')).toHaveLength(24);
    expect(all.find((c) => c.status === 'suppressed')?.flags).toEqual(['churn']);
  }, 30000);

  it('counts same-key rewrites as churn but not small edits', () => {
    const b = (t: string, key: string) => ({ id: key, ord: 0, path: 'p', blockKey: key, text: t, textSha: t, embedding: null });
    expect(churnCount([
      { kind: 'modified', before: b('Fast friendly AC repair in Plano', 'p#0'), after: b('Fast friendly AC repair in Frisco', 'p#0') },
      { kind: 'modified', before: b('Fast friendly AC repair in Plano', 'p#1'), after: b('Totally different words appear now', 'p#1') },
      { kind: 'added', before: null, after: b('New block', 'p#2') },
    ])).toBe(2);
  });
});

describe('new_page (Phase 18a-2 Task 11)', () => {
  const NEW = htmlPage('<main><h1>Heat Pump Installation</h1><h2>Why choose us</h2><h2>Financing</h2><h2>Third heading</h2><p>Body copy that is long enough.</p></main>');
  async function firstCapture(appearedDaysBeforeCapture: number | null, html = NEW) {
    const store = createMemoryStore();
    const page = await seedPage(dbs.service, IDS.competitorX, 'https://smithhvac.example/heat-pumps', 'service');
    if (appearedDaysBeforeCapture !== null) {
      await dbs.owner.update(trackedPage).set({ appearedAt: new Date(day(0).getTime() - appearedDaysBeforeCapture * 86_400_000) }).where(eq(trackedPage.id, page));
    }
    const cap = await seedWebCapture(dbs.service, store, { competitorId: IDS.competitorX, trackedPageId: page, html, capturedAt: day(0) });
    return { store, page, cap };
  }

  it('first capture of an appeared page writes one structured new_page change', async () => {
    const { store, page, cap } = await firstCapture(1);
    const r = await diffWebCapture({ db: dbs.service, store, ai: createFakeAi() }, cap);
    expect(r.ran && r.result.changeIds).toHaveLength(1);
    const rows = await changes();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'added', blockKey: `page:${page}`, afterCaptureId: cap, beforeCaptureId: null, status: 'pending', stageVersion: 1 });
    expect(rows[0]?.details).toMatchObject({ changeType: 'new_page', pageUrl: 'https://smithhvac.example/heat-pumps', pageType: 'service', pageKey: 'smithhvac.example/heat-pumps', items: [{ label: 'Heat Pump Installation' }] });
    expect(rows[0]?.afterText).toBe('/heat-pumps\nHeat Pump Installation\nWhy choose us\nFinancing');
    expect(isStructuredChange({ source: 'web', details: rows[0]!.details })).toBe(true);
  });

  it('falls back to <title> for the label when there is no h1', async () => {
    const { store, cap } = await firstCapture(1, '<html><head><title>Heat Pumps | Smith</title></head><body><main><h2>Why us</h2></main></body></html>');
    await diffWebCapture({ db: dbs.service, store, ai: createFakeAi() }, cap);
    expect((await changes())[0]?.details).toMatchObject({ items: [{ label: 'Heat Pumps | Smith' }] });
  });

  it('writes nothing without appeared_at, or when the page appeared 20 days earlier', async () => {
    for (const age of [null, 20]) {
      await truncateAll(dbs.owner);
      await seedTenancy(dbs.owner);
      const { store, cap } = await firstCapture(age);
      const r = await diffWebCapture({ db: dbs.service, store, ai: createFakeAi() }, cap);
      expect(r.ran && r.result).toMatchObject({ baseline: true, changeIds: [] });
      expect(await changes()).toEqual([]);
    }
  });

  it('a second capture gets the normal diff only, and a re-run adds no duplicate', async () => {
    const { store, page, cap } = await firstCapture(1);
    const ai = createFakeAi();
    await diffWebCapture({ db: dbs.service, store, ai }, cap);
    await diffWebCapture({ db: dbs.service, store, ai }, cap);
    expect(await changes()).toHaveLength(1);
    const second = await seedWebCapture(dbs.service, store, { competitorId: IDS.competitorX, trackedPageId: page, html: NEW.replace('Financing', 'Financing options and rebates today'), capturedAt: day(1) });
    await diffWebCapture({ db: dbs.service, store, ai }, second);
    const rows = await changes();
    expect(rows.filter((c) => (c.details as { changeType?: string }).changeType === 'new_page')).toHaveLength(1);
    expect(rows.filter((c) => c.afterCaptureId === second).every((c) => !(c.details as { changeType?: string }).changeType)).toBe(true);
  });
});
