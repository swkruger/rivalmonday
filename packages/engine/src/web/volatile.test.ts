import { changeEvent, detectedChange, eventChange, volatileBlock } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { day, seedPage, seedWebCapture } from '../../test/seed';
import { ensureBlocks, loadBlocks, type StoredBlock } from './blocks';
import { blockChains, countChanges, isVolatile, learnVolatileBlocks, maskedBlockKeys, unmaskBlock } from './volatile';

describe('volatile rule', () => {
  it('counts changes including appearance and disappearance', () => {
    expect(countChanges(['a', 'a', 'b', null, 'b', 'c'])).toBe(4);
    expect(countChanges(['a'])).toBe(0);
  });

  it('masks 3+ changes in the last 5 transitions unless a change became an event', () => {
    expect(isVolatile(['a', 'b', 'c', 'd'], false)).toBe(true);
    expect(isVolatile(['a', 'b', 'b', 'c'], false)).toBe(false);
    expect(isVolatile(['a', 'b', 'c', 'd'], true)).toBe(false);
    expect(isVolatile(['a', 'b', 'c', 'd', 'd', 'd', 'd', 'd'], false)).toBe(false);
  });
});

const blk = (ord: number, text: string): StoredBlock => ({ id: `${text}@${ord}`, ord, path: 'body>ul>li', blockKey: `body>ul>li#${ord}`, text, textSha: text, embedding: null });
const list = (...items: string[]) => items.map((t, i) => blk(i, t));

describe('blockChains', () => {
  it('follows a block through an insertion at the top instead of seeing every key change', () => {
    const chains = blockChains([list('a', 'b', 'c'), list('new', 'a', 'b', 'c')]);
    const a = chains.find((c) => c.history[0] === 'a')!;
    expect(a.history).toEqual(['a', 'a']);
    expect(a.lastKey).toBe('body>ul>li#1');
    expect(chains.find((c) => c.history[1] === 'new')!.history).toEqual([null, 'new']);
  });

  it('records modifications and removals on the same chain', () => {
    const chains = blockChains([list('Quote A'), list('Quote B'), []]);
    expect(chains).toHaveLength(1);
    expect(chains[0]).toMatchObject({ history: ['Quote A', 'Quote B', null], lastKey: null });
  });
});

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

const html = (testimonial: string, price: string) =>
  `<body><h1>Smith HVAC</h1><section class="testimonial"><blockquote>${testimonial}</blockquote></section><div class="price">AC tune-up ${price}</div></body>`;

describe('learnVolatileBlocks', () => {
  it('masks a rotating testimonial but not a price block whose changes were events', async () => {
    const store = createMemoryStore();
    const page = await seedPage(dbs.service, IDS.competitorX);
    const quotes = ['Fast and friendly', 'Fixed it in an hour', 'Great price', 'Very clean work', 'On time', 'Polite tech'];
    const prices = ['$89', '$79', '$69', '$59', '$59', '$59'];
    const caps: string[] = [];
    for (let i = 0; i < 6; i++) {
      const id = await seedWebCapture(dbs.service, store, { competitorId: IDS.competitorX, trackedPageId: page, html: html(quotes[i]!, prices[i]!), capturedAt: day(i) });
      await ensureBlocks({ db: dbs.service, store }, id);
      caps.push(id);
    }
    // The price block's change on day 1 became an event.
    const [chg] = await dbs.service.insert(detectedChange).values({ competitorId: IDS.competitorX, trackedPageId: page, source: 'web', kind: 'modified', afterCaptureId: caps[1]!, blockKey: 'div.price#0', status: 'event', stageVersion: 1 }).returning({ id: detectedChange.id });
    const [ev] = await dbs.service.insert(changeEvent).values({ competitorId: IDS.competitorX, changeType: 'price_change', summary: 's', confidence: 1, occurredAt: day(1) }).returning({ id: changeEvent.id });
    await dbs.service.insert(eventChange).values({ eventId: ev!.id, changeId: chg!.id });

    expect(await learnVolatileBlocks(dbs.service, page)).toEqual({ masked: ['section.testimonial>blockquote#0'], unmasked: [] });
    expect(await maskedBlockKeys(dbs.service, page)).toEqual(new Set(['section.testimonial>blockquote#0']));
    expect(await learnVolatileBlocks(dbs.service, page)).toEqual({ masked: [], unmasked: [] });
  });

  it('needs at least four extracted captures before masking anything', async () => {
    const store = createMemoryStore();
    const page = await seedPage(dbs.service, IDS.competitorX);
    for (let i = 0; i < 3; i++) {
      const id = await seedWebCapture(dbs.service, store, { competitorId: IDS.competitorX, trackedPageId: page, html: html(`q${'abc'[i]}`, '$89'), capturedAt: day(i) });
      await ensureBlocks({ db: dbs.service, store }, id);
    }
    expect(await learnVolatileBlocks(dbs.service, page)).toEqual({ masked: [], unmasked: [] });
  });

  // tracked_page has a (competitor_id, url) unique constraint; a counter keeps repeated seedSeries calls in the same test from colliding.
  let seriesCounter = 0;
  const seedSeries = async (bodies: string[]) => {
    const store = createMemoryStore();
    const page = await seedPage(dbs.service, IDS.competitorX, `https://smithhvac.example/${seriesCounter++}`);
    const caps: string[] = [];
    for (const [i, b] of bodies.entries()) {
      const cap = await seedWebCapture(dbs.service, store, { competitorId: IDS.competitorX, trackedPageId: page, html: `<body>${b}</body>`, capturedAt: day(i) });
      await ensureBlocks({ db: dbs.service, store }, cap);
      caps.push(cap);
    }
    return { page, caps };
  };
  const ul = (...items: string[]) => `<ul>${items.map((t) => `<li>${t}</li>`).join('')}</ul>`;

  it('a list that grows at the top every day masks nothing (Review Focus 4)', async () => {
    const news = ['Mon news item here', 'Tue news item here', 'Wed news item here', 'Thu news item here', 'Fri news item here', 'Sat news item here'];
    const { page } = await seedSeries(news.map((_, i) => ul(...news.slice(0, i + 1).reverse(), 'Call us for AC repair today')));
    expect(await learnVolatileBlocks(dbs.service, page)).toEqual({ masked: [], unmasked: [] });
  });

  // The quote's block key as the extractor writes it (read back, never hard-coded).
  const quoteKey = async (cap: string) => (await loadBlocks(dbs.service, cap))[0]!.blockKey;

  it('does not mask a block whose changes are still pending', async () => {
    const quotes = ['Quote one is here', 'Quote two is here', 'Quote three is here', 'Quote four is here'];
    const { page, caps } = await seedSeries(quotes.map((q) => `<blockquote>${q}</blockquote>`));
    const key = await quoteKey(caps[0]!);
    for (const cap of caps.slice(1)) {
      await dbs.service.insert(detectedChange).values({ competitorId: IDS.competitorX, trackedPageId: page, source: 'web', kind: 'modified', afterCaptureId: cap, blockKey: key, status: 'pending', stageVersion: 1 });
    }
    expect((await learnVolatileBlocks(dbs.service, page)).masked).toEqual([]);
  });

  it('expires a mask whose block has been stable for the whole window, and never re-masks a manual unmask', async () => {
    const stable = await seedSeries(Array.from({ length: 6 }, () => '<blockquote>Same quote every day</blockquote>'));
    const key = await quoteKey(stable.caps[0]!);
    await dbs.service.insert(volatileBlock).values({ trackedPageId: stable.page, blockKey: key });
    expect(await learnVolatileBlocks(dbs.service, stable.page)).toEqual({ masked: [], unmasked: [key] });

    const quotes = ['Quote one is here', 'Quote two is here', 'Quote three is here', 'Quote four is here'];
    const rotating = await seedSeries(quotes.map((q) => `<blockquote>${q}</blockquote>`));
    await unmaskBlock(dbs.service, rotating.page, await quoteKey(rotating.caps[0]!));
    expect((await learnVolatileBlocks(dbs.service, rotating.page)).masked).toEqual([]);
    expect(await maskedBlockKeys(dbs.service, rotating.page)).toEqual(new Set());
  });

  it('keeps an existing mask when a list item is inserted above it (Review Focus 4)', async () => {
    const quotes = ['Quote one is here', 'Quote two is here', 'Quote three is here', 'Quote four is here', 'Quote five is here', 'Quote six is here'];
    // A rotating testimonial in a list; from capture 3 on, a new item sits above it, shifting its positional key.
    const { page, caps } = await seedSeries(quotes.map((q, i) => (i < 3 ? ul(q, 'Call us for AC repair today') : ul('Now hiring technicians in Plano', q, 'Call us for AC repair today'))));
    const original = await quoteKey(caps[0]!);
    await dbs.service.insert(volatileBlock).values({ trackedPageId: page, blockKey: original });
    expect((await learnVolatileBlocks(dbs.service, page)).unmasked).toEqual([]);
    expect(await maskedBlockKeys(dbs.service, page)).toContain(original);
  });
});
