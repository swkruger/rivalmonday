import { changeEvent, detectedChange, eventChange } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { day, seedPage, seedWebCapture } from '../../test/seed';
import { ensureBlocks } from './blocks';
import { countChanges, isVolatile, learnVolatileBlocks, maskedBlockKeys } from './volatile';

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

    expect(await learnVolatileBlocks(dbs.service, page)).toEqual(['section.testimonial>blockquote#0']);
    expect(await maskedBlockKeys(dbs.service, page)).toEqual(new Set(['section.testimonial>blockquote#0']));
    expect(await learnVolatileBlocks(dbs.service, page)).toEqual([]);
  });

  it('needs at least four extracted captures before masking anything', async () => {
    const store = createMemoryStore();
    const page = await seedPage(dbs.service, IDS.competitorX);
    for (let i = 0; i < 3; i++) {
      const id = await seedWebCapture(dbs.service, store, { competitorId: IDS.competitorX, trackedPageId: page, html: html(`q${'abc'[i]}`, '$89'), capturedAt: day(i) });
      await ensureBlocks({ db: dbs.service, store }, id);
    }
    expect(await learnVolatileBlocks(dbs.service, page)).toEqual([]);
  });
});
