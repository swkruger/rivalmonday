import { changeEvent, detectedChange, eventChange, volatileBlock } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
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
    // Seeds one more capture, the day after the last one (for steps that must happen between captures).
    const add = async (b: string) => {
      const cap = await seedWebCapture(dbs.service, store, { competitorId: IDS.competitorX, trackedPageId: page, html: `<body>${b}</body>`, capturedAt: day(caps.length) });
      await ensureBlocks({ db: dbs.service, store }, cap);
      caps.push(cap);
      return cap;
    };
    for (const b of bodies) await add(b);
    return { page, caps, add };
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

  it('moves an existing mask onto its block\'s current key when a list item is inserted above it (Review Focus 4)', async () => {
    const quotes = ['Quote one is here', 'Quote two is here', 'Quote three is here', 'Quote three is here', 'Quote four is here', 'Quote five is here'];
    // A rotating testimonial in a list; from capture 3 on, a new item sits above it, shifting its positional key.
    // Day 3 repeats day 2's text so alignBlocks ties the identity to this block by its (position-independent)
    // exact-text match on the day of the insertion, rather than by the coincidence of the vacated key.
    const { page, caps } = await seedSeries(quotes.map((q, i) => (i < 3 ? ul(q, 'Call us for AC repair today') : ul('Now hiring technicians in Plano', q, 'Call us for AC repair today'))));
    const original = await quoteKey(caps[0]!);
    await dbs.service.insert(volatileBlock).values({ trackedPageId: page, blockKey: original });
    const current = (await loadBlocks(dbs.service, caps[5]!)).find((b) => b.text === quotes[5])!.blockKey;
    expect(current).not.toBe(original);
    // The returned lists describe the rows: the vacated key is no longer masked, the block's new key is.
    expect(await learnVolatileBlocks(dbs.service, page)).toEqual({ masked: [current], unmasked: [original] });
    // The mask followed the block to its new position — it is not left behind on the inserted item's key.
    expect(await maskedBlockKeys(dbs.service, page)).toEqual(new Set([current]));
  });

  it('never re-masks a manual unmask after its key shifts (Review Focus 4)', async () => {
    const quotes = ['Quote one is here', 'Quote two is here', 'Quote three is here', 'Quote three is here', 'Quote four is here', 'Quote five is here'];
    const bodies = quotes.map((q, i) => (i < 3 ? ul(q, 'Call us for AC repair today') : ul('Now hiring technicians in Plano', q, 'Call us for AC repair today')));
    // The AM unmasks the quote at its key as of the newest capture then (day 2), before the insertion shifts it.
    const { page, caps, add } = await seedSeries(bodies.slice(0, 3));
    const original = await quoteKey(caps[0]!);
    await unmaskBlock(dbs.service, page, original);
    for (const b of bodies.slice(3)) await add(b);
    expect((await learnVolatileBlocks(dbs.service, page)).masked).toEqual([]);
    expect(await maskedBlockKeys(dbs.service, page)).toEqual(new Set());
  });

  it('resolves a masked key to the chain holding it now, not the first chain that ever held it, across a removal above it (fix round 2)', async () => {
    const store = createMemoryStore();
    const page = await seedPage(dbs.service, IDS.competitorX, `https://smithhvac.example/${seriesCounter++}`);
    const a = 'Alpha item stays the same';
    const b = 'Beta item stays the same';
    const quotes = ['Quote zero is here', 'Quote one is here', 'Quote two is here', 'Quote two is here', 'Quote four is here', 'Quote five is here'];
    // Days 0-2: [A, B, Q]; day 3 removes B. Q's day-3 text repeats day 2's so alignBlocks ties Q's own identity
    // through the removal by exact text (position-independent), not by colliding with B's vacated key — the
    // same precedent as the insertion test above. Days 4-5 are two further captures after the removal.
    const bodies = quotes.map((q, i) => (i < 3 ? ul(a, b, q) : ul(a, q)));
    const caps: string[] = [];
    const seedCapture = async (i: number) => {
      const cap = await seedWebCapture(dbs.service, store, { competitorId: IDS.competitorX, trackedPageId: page, html: `<body>${bodies[i]}</body>`, capturedAt: day(i) });
      await ensureBlocks({ db: dbs.service, store }, cap);
      caps.push(cap);
    };
    for (let i = 0; i <= 4; i++) await seedCapture(i);

    const originalKey = (await loadBlocks(dbs.service, caps[0]!)).find((blk) => blk.text === quotes[0])!.blockKey;
    await dbs.service.insert(volatileBlock).values({ trackedPageId: page, blockKey: originalKey });

    // Call 1: the mask moves from Q's pre-removal key onto its post-removal key (B never shared that key yet).
    expect((await learnVolatileBlocks(dbs.service, page)).unmasked).toEqual([originalKey]);
    let current = (await loadBlocks(dbs.service, caps[4]!)).find((blk) => blk.text === quotes[4])!.blockKey;
    expect(await maskedBlockKeys(dbs.service, page)).toEqual(new Set([current]));

    // Call 2, one capture later: B's dead chain and Q's live chain now both carry that same key, at different
    // captures. A lookup that returns the first chain created to ever hold the key (array order) resolves to
    // B's dead chain and wrongly expires the mask; it must resolve to whichever chain holds the key now.
    await seedCapture(5);
    expect((await learnVolatileBlocks(dbs.service, page)).unmasked).toEqual([]);
    current = (await loadBlocks(dbs.service, caps[5]!)).find((blk) => blk.text === quotes[5])!.blockKey;
    expect(await maskedBlockKeys(dbs.service, page)).toEqual(new Set([current]));
  });

  it('moves two adjacent masked blocks together when a removal above them shifts both keys (fix round 2)', async () => {
    const x = 'Removed filler item';
    const p1 = 'First steady block';
    const p2 = 'Second steady block';
    const { page, caps } = await seedSeries([ul(x, p1, p2), ul(x, p1, p2), ul(x, p1, p2), ul(p1, p2)]);
    const key1 = (await loadBlocks(dbs.service, caps[0]!)).find((blk) => blk.text === p1)!.blockKey;
    const key2 = (await loadBlocks(dbs.service, caps[0]!)).find((blk) => blk.text === p2)!.blockKey;
    await dbs.service.insert(volatileBlock).values([
      { trackedPageId: page, blockKey: key1 },
      { trackedPageId: page, blockKey: key2 },
    ]);

    // P1 moves onto X's old key and P2 onto P1's: only P2's old key is left unmasked.
    expect((await learnVolatileBlocks(dbs.service, page)).unmasked).toEqual([key2]);

    const currentKey1 = (await loadBlocks(dbs.service, caps[3]!)).find((blk) => blk.text === p1)!.blockKey;
    const currentKey2 = (await loadBlocks(dbs.service, caps[3]!)).find((blk) => blk.text === p2)!.blockKey;
    expect(currentKey1).not.toBe(key1);
    expect(currentKey2).not.toBe(key2);
    // p2's new key (currentKey2) is p1's OLD key (key1) — a key that is both a "from" and a "to" in the same
    // move batch. Both masks must land on their new keys; neither is lost to a delete that treats a key still
    // in use by the OTHER move as abandoned.
    expect(await maskedBlockKeys(dbs.service, page)).toEqual(new Set([currentKey1, currentKey2]));
  });

  it('keeps a mask on its block across a removal directly above it, over two calls on the same window (fix round 3)', async () => {
    const b = 'Beta item stays the same';
    const quotes = ['Quote zero is here', 'Quote one is here', 'Quote two is here', 'Quote two is here', 'Quote four is here', 'Quote five is here'];
    // Day 3 removes B; Q's day-3 text repeats day 2's so alignBlocks ties Q's own identity through the removal
    // by exact text (position-independent), not by colliding with B's vacated key.
    const bodies = quotes.map((q, i) => (i < 3 ? ul(b, q) : ul(q)));
    const { page, caps } = await seedSeries(bodies);
    const original = (await loadBlocks(dbs.service, caps[0]!)).find((blk) => blk.text === quotes[0])!.blockKey;
    await dbs.service.insert(volatileBlock).values({ trackedPageId: page, blockKey: original });

    expect((await learnVolatileBlocks(dbs.service, page)).unmasked).toEqual([original]);
    let current = (await loadBlocks(dbs.service, caps[5]!)).find((blk) => blk.text === quotes[5])!.blockKey;
    expect(await maskedBlockKeys(dbs.service, page)).toEqual(new Set([current]));

    // Second call, same window: still correctly resolved, not dropped or moved again.
    expect((await learnVolatileBlocks(dbs.service, page)).unmasked).toEqual([]);
    current = (await loadBlocks(dbs.service, caps[5]!)).find((blk) => blk.text === quotes[5])!.blockKey;
    expect(await maskedBlockKeys(dbs.service, page)).toEqual(new Set([current]));
  });

  it('keeps a mask on its block, not a stable block two positions above sharing its old key, across a removal above both (fix round 3)', async () => {
    const x = 'Removed filler item';
    const a = 'Alpha item stays the same';
    const quotes = ['Quote zero is here', 'Quote one is here', 'Quote two is here', 'Quote two is here'];
    // [X, A, Q]; day 3 removes X, shifting A onto X's old key and Q onto A's old key. Q's day-3 text repeats
    // day 2's so alignBlocks ties its identity through by exact text, not by the vacated-key coincidence.
    const bodies = quotes.map((q, i) => (i < 3 ? ul(x, a, q) : ul(a, q)));
    const { page, caps } = await seedSeries(bodies);
    const original = (await loadBlocks(dbs.service, caps[0]!)).find((blk) => blk.text === quotes[0])!.blockKey;
    await dbs.service.insert(volatileBlock).values({ trackedPageId: page, blockKey: original });

    expect((await learnVolatileBlocks(dbs.service, page)).unmasked).toEqual([original]);
    const current = (await loadBlocks(dbs.service, caps[3]!)).find((blk) => blk.text === quotes[3])!.blockKey;
    expect(current).not.toBe(original);
    // If the mask had jumped onto A instead, this would be A's current key, not Q's.
    expect(await maskedBlockKeys(dbs.service, page)).toEqual(new Set([current]));

    // Second call, same window: A is alive and was present at Q's new key back at the window's first capture
    // (it was the second item then, before shifting too) — a "window-start owner, if alive" rule would wrongly
    // steal the mask onto A here. It must stay resolved to Q.
    expect((await learnVolatileBlocks(dbs.service, page)).unmasked).toEqual([]);
    expect(await maskedBlockKeys(dbs.service, page)).toEqual(new Set([current]));
  });

  it('keeps a mask on its block, not a stable block below it that used to hold its new key, across an insertion above it (fix round 3)', async () => {
    const r = 'Romeo item stays the same';
    const n = 'Now hiring technicians in Plano';
    const quotes = ['Quote zero is here', 'Quote one is here', 'Quote two is here', 'Quote two is here'];
    // [A, Q, R]; day 3 inserts N above Q, shifting Q onto R's OLD key (R itself shifts further down). Q's
    // day-3 text repeats day 2's so alignBlocks ties its identity through by exact text, not by the collision.
    const a = 'Alpha item stays the same';
    const bodies = quotes.map((q, i) => (i < 3 ? ul(a, q, r) : ul(a, n, q, r)));
    const { page, caps } = await seedSeries(bodies);
    const original = (await loadBlocks(dbs.service, caps[0]!)).find((blk) => blk.text === quotes[0])!.blockKey;
    await dbs.service.insert(volatileBlock).values({ trackedPageId: page, blockKey: original });

    expect((await learnVolatileBlocks(dbs.service, page)).unmasked).toEqual([original]);
    const current = (await loadBlocks(dbs.service, caps[3]!)).find((blk) => blk.text === quotes[3])!.blockKey;
    expect(current).not.toBe(original);
    // If the mask had jumped onto R instead, this would be R's current key, not Q's.
    expect(await maskedBlockKeys(dbs.service, page)).toEqual(new Set([current]));

    // Second call, same window: R held Q's new key back at the window's first capture (before shifting further
    // down itself) and is still alive — the mask must stay resolved to Q, not jump onto R.
    expect((await learnVolatileBlocks(dbs.service, page)).unmasked).toEqual([]);
    expect(await maskedBlockKeys(dbs.service, page)).toEqual(new Set([current]));
  });

  it('keeps both masks on two adjacent blocks across a removal above them, over two calls on the same window (fix round 3)', async () => {
    const x = 'Removed filler item';
    const p1 = 'First steady block';
    const p2 = 'Second steady block';
    const { page, caps } = await seedSeries([ul(x, p1, p2), ul(x, p1, p2), ul(x, p1, p2), ul(p1, p2)]);
    const key1 = (await loadBlocks(dbs.service, caps[0]!)).find((blk) => blk.text === p1)!.blockKey;
    const key2 = (await loadBlocks(dbs.service, caps[0]!)).find((blk) => blk.text === p2)!.blockKey;
    await dbs.service.insert(volatileBlock).values([
      { trackedPageId: page, blockKey: key1 },
      { trackedPageId: page, blockKey: key2 },
    ]);

    expect((await learnVolatileBlocks(dbs.service, page)).unmasked).toEqual([key2]);
    const currentKey1 = (await loadBlocks(dbs.service, caps[3]!)).find((blk) => blk.text === p1)!.blockKey;
    const currentKey2 = (await loadBlocks(dbs.service, caps[3]!)).find((blk) => blk.text === p2)!.blockKey;
    expect(await maskedBlockKeys(dbs.service, page)).toEqual(new Set([currentKey1, currentKey2]));

    // Second call, same window: P1 is alive and sat at P2's new key back at the window's first capture — this
    // must not cost P2 its mask (the insert/delete must also not treat P2's key as P1's abandoned leftover).
    expect((await learnVolatileBlocks(dbs.service, page)).unmasked).toEqual([]);
    expect(await maskedBlockKeys(dbs.service, page)).toEqual(new Set([currentKey1, currentKey2]));
  });

  it('masks a volatile block inserted mid-window immediately and keeps it masked, without flapping (fix round 3)', async () => {
    const stable = 'Stable item never changes';
    const store = createMemoryStore();
    const page = await seedPage(dbs.service, IDS.competitorX, `https://smithhvac.example/${seriesCounter++}`);
    const bodies = [ul(stable), ul(stable, 'New item v1'), ul(stable, 'New item v2'), ul(stable, 'New item v3'), ul(stable, 'New item v4')];
    const caps: string[] = [];
    for (const [i, b] of bodies.entries()) {
      const cap = await seedWebCapture(dbs.service, store, { competitorId: IDS.competitorX, trackedPageId: page, html: `<body>${b}</body>`, capturedAt: day(i) });
      await ensureBlocks({ db: dbs.service, store }, cap);
      caps.push(cap);
    }

    // First call sees the new block from capture 1 onward, already changing every day it has existed.
    const newKey = (await loadBlocks(dbs.service, caps[3]!)).find((blk) => blk.text === 'New item v3')!.blockKey;
    expect(await learnVolatileBlocks(dbs.service, page)).toEqual({ masked: [newKey], unmasked: [] });

    // One more capture, same key, no structural change: it must stay masked — not be dropped and re-learned.
    const cap4 = await seedWebCapture(dbs.service, store, { competitorId: IDS.competitorX, trackedPageId: page, html: `<body>${bodies[4]}</body>`, capturedAt: day(4) });
    await ensureBlocks({ db: dbs.service, store }, cap4);
    expect(await learnVolatileBlocks(dbs.service, page)).toEqual({ masked: [], unmasked: [] });
    expect(await maskedBlockKeys(dbs.service, page)).toEqual(new Set([newKey]));
  });

  it('keeps a mask on a block that moves onto another, now-eventful block\'s old key (fix round 3)', async () => {
    const x = 'Removed filler item';
    const p1 = 'First steady block';
    const p2 = 'Second steady block';
    const { page, caps } = await seedSeries([ul(x, p1, p2), ul(x, p1, p2), ul(x, p1, p2), ul(p1, p2)]);
    const key1 = (await loadBlocks(dbs.service, caps[0]!)).find((blk) => blk.text === p1)!.blockKey;
    const key2 = (await loadBlocks(dbs.service, caps[0]!)).find((blk) => blk.text === p2)!.blockKey;
    await dbs.service.insert(volatileBlock).values([
      { trackedPageId: page, blockKey: key1 },
      { trackedPageId: page, blockKey: key2 },
    ]);
    // P1's original change (day 0 → day 1, still key1) became an event — its own mask should lift.
    await dbs.service.insert(detectedChange).values({ competitorId: IDS.competitorX, trackedPageId: page, source: 'web', kind: 'modified', afterCaptureId: caps[1]!, blockKey: key1, status: 'event', stageVersion: 1 });

    // P2's new key after the removal is exactly P1's old key — the one just expired for P1's own sake.
    const currentKey2 = (await loadBlocks(dbs.service, caps[3]!)).find((blk) => blk.text === p2)!.blockKey;
    expect(currentKey2).toBe(key1);

    // key1 stays masked (now for P2), so only key2 — P2's vacated key — is reported unmasked.
    expect(await learnVolatileBlocks(dbs.service, page)).toEqual({ masked: [], unmasked: [key2] });
    expect(await maskedBlockKeys(dbs.service, page)).toEqual(new Set([currentKey2]));

    // Second call, same window: still resolved to P2, not re-expired because the key was P1's.
    expect((await learnVolatileBlocks(dbs.service, page)).unmasked).toEqual([]);
    expect(await maskedBlockKeys(dbs.service, page)).toEqual(new Set([currentKey2]));
  });

  it('masks when only the newest change is pending, then lifts the mask once that change is confirmed an event', async () => {
    const quotes = ['Quote one is here', 'Quote two is here', 'Quote three is here', 'Quote four is here'];
    const { page, caps } = await seedSeries(quotes.map((q) => `<blockquote>${q}</blockquote>`));
    const key = await quoteKey(caps[0]!);
    const [chg] = await dbs.service
      .insert(detectedChange)
      .values({ competitorId: IDS.competitorX, trackedPageId: page, source: 'web', kind: 'modified', afterCaptureId: caps[3]!, blockKey: key, status: 'pending', stageVersion: 1 })
      .returning({ id: detectedChange.id });
    // The only pending change is on the capture just diffed — it never blocks masking (the narrowing's boundary).
    expect(await learnVolatileBlocks(dbs.service, page)).toEqual({ masked: [key], unmasked: [] });

    // The change is later confirmed a genuine event; the mask lifts even though the capture window is unchanged.
    await dbs.service.update(detectedChange).set({ status: 'event' }).where(eq(detectedChange.id, chg!.id));
    expect((await learnVolatileBlocks(dbs.service, page)).unmasked).toEqual([key]);
  });

  it('a manual unmask stays on the block that held the key when the AM unmasked it, across later shifts (fix round 4)', async () => {
    const x = 'Removed filler item';
    const d = ['Delta text version 0', 'Delta text version 1', 'Delta text version 2', 'Delta text version 2', 'Delta text version 4', 'Delta text version 5'];
    const b = ['Bravo text version 0', 'Bravo text version 1', 'Bravo text version 2', 'Bravo text version 2', 'Bravo text version 4', 'Bravo text version 4'];
    const n = 'Now hiring technicians in Plano';
    // Days 0-2: [X, D, B]; day 3 removes X (D and B hold their text so alignment ties them through by exact
    // text). Day 5 inserts N between D and B, shifting B again (B holds its text that day).
    const { page, caps, add } = await seedSeries([ul(x, d[0]!, b[0]!), ul(x, d[1]!, b[1]!), ul(x, d[2]!, b[2]!), ul(d[3]!, b[3]!)]);
    const keyOf = async (cap: string, text: string) => (await loadBlocks(dbs.service, cap)).find((blk) => blk.text === text)!.blockKey;
    const dOld = await keyOf(caps[0]!, d[0]!);
    const bOld = await keyOf(caps[0]!, b[0]!);
    await dbs.service.insert(volatileBlock).values([
      { trackedPageId: page, blockKey: dOld },
      { trackedPageId: page, blockKey: bOld },
    ]);
    const dNow = await keyOf(caps[3]!, d[3]!);
    const bNow = await keyOf(caps[3]!, b[3]!);
    expect(bNow).toBe(dOld); // B now sits on D's key at the window's oldest capture
    expect(await learnVolatileBlocks(dbs.service, page)).toEqual({ masked: [dNow], unmasked: [bOld] });

    // The AM unmasks B at the key it has now.
    await unmaskBlock(dbs.service, page, bNow);
    expect(await learnVolatileBlocks(dbs.service, page)).toEqual({ masked: [], unmasked: [] });
    expect(await maskedBlockKeys(dbs.service, page)).toEqual(new Set([dNow]));

    // B changes again (now volatile): it is never auto-masked, and no stripped key is reported masked.
    await add(ul(d[4]!, b[4]!));
    expect(await learnVolatileBlocks(dbs.service, page)).toEqual({ masked: [], unmasked: [] });
    expect(await maskedBlockKeys(dbs.service, page)).toEqual(new Set([dNow]));

    // A further shift moves B off the manually unmasked key: still never re-masked, and D keeps its mask.
    const cap5 = await add(ul(d[5]!, n, b[5]!));
    expect(await keyOf(cap5, b[5]!)).not.toBe(bNow);
    expect(await learnVolatileBlocks(dbs.service, page)).toEqual({ masked: [], unmasked: [] });
    expect(await maskedBlockKeys(dbs.service, page)).toEqual(new Set([dNow]));
  }, 60_000); // six captures and four learns against the remote test DB

  it('an event on a removed block resolves to that block, never to the block that shifted into its key (fix round 4)', async () => {
    const x = 'Removed filler item';
    const p1 = 'First steady block';
    const p2 = 'Second steady block';
    const { page, caps } = await seedSeries([ul(x, p1, p2), ul(x, p1, p2), ul(x, p1, p2), ul(p1, p2)]);
    const [key0, key1, key2] = await Promise.all([x, p1, p2].map(async (t) => (await loadBlocks(dbs.service, caps[0]!)).find((blk) => blk.text === t)!.blockKey));
    await dbs.service.insert(volatileBlock).values([key0!, key1!, key2!].map((blockKey) => ({ trackedPageId: page, blockKey })));
    // X's removal (day 2 → day 3) became an event; diff-stage records a removal under X's BEFORE key, which
    // P1 occupies at the after capture.
    await dbs.service.insert(detectedChange).values({
      competitorId: IDS.competitorX, trackedPageId: page, source: 'web', kind: 'removed', beforeCaptureId: caps[2]!, afterCaptureId: caps[3]!, blockKey: key0!, status: 'event', stageVersion: 1,
    });
    expect((await loadBlocks(dbs.service, caps[3]!)).find((blk) => blk.text === p1)!.blockKey).toBe(key0);

    // X's own mask goes (X is gone); P1 and P2 keep theirs on their shifted keys — the event lifts nobody else's.
    expect(await learnVolatileBlocks(dbs.service, page)).toEqual({ masked: [], unmasked: [key2] });
    expect(await maskedBlockKeys(dbs.service, page)).toEqual(new Set([key0, key1]));
    expect(await learnVolatileBlocks(dbs.service, page)).toEqual({ masked: [], unmasked: [] });
    expect(await maskedBlockKeys(dbs.service, page)).toEqual(new Set([key0, key1]));
  });
});
