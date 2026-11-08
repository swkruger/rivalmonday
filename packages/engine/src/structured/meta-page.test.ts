import { detectedChange, observation } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { day, seedVendorCapture } from '../../test/seed';
import { diffVendorCapture } from './vendor-diff';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const now = day(90);
const PAGE = '12345';
const url = `https://www.facebook.com/ads/library/?view_all_page_id=${PAGE}`;

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

/** A Meta capture at `at` with a page reading of `likes` (null = no reading). */
async function metaCapture(at: Date, likes: number | null): Promise<string> {
  const id = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'meta_ads', capturedAt: at, url });
  if (likes !== null) {
    await dbs.service.insert(observation).values({ competitorId: IDS.competitorX, captureId: id, kind: 'meta_page', key: PAGE, data: { pageId: PAGE, pageName: 'Smith HVAC', likes }, observedAt: at });
  }
  return id;
}

const changes = () => dbs.service.select().from(detectedChange);

describe('diffVendorCapture — audience_growth', () => {
  it('+20 % and +80 likes over 28 d emits', async () => {
    const base = await metaCapture(day(0), 400);
    await metaCapture(day(14), 430);
    const cap = await metaCapture(day(28), 480);
    await diffVendorCapture({ db: dbs.service }, cap, { now });
    const [c] = await changes();
    expect(c).toMatchObject({ kind: 'modified', blockKey: `meta:likes:${PAGE}`, source: 'meta_ads', beforeText: 'Facebook Page likes: 400', afterText: 'Facebook Page likes: 480', beforeCaptureId: base, afterCaptureId: cap });
    expect(c?.details).toMatchObject({ changeType: 'audience_growth', pageId: PAGE, likesBefore: 400, likesAfter: 480, pct: 20, days: 28 });
  });

  it('+20 % but +30 likes does not', async () => {
    await metaCapture(day(0), 150);
    const cap = await metaCapture(day(28), 180);
    await diffVendorCapture({ db: dbs.service }, cap, { now });
    expect(await changes()).toEqual([]);
  });

  it('+10 % does not', async () => {
    await metaCapture(day(0), 1000);
    const cap = await metaCapture(day(28), 1100);
    await diffVendorCapture({ db: dbs.service }, cap, { now });
    expect(await changes()).toEqual([]);
  });

  it('no reading 21–35 d back does not', async () => {
    await metaCapture(day(-12), 500); // 40 d back
    await metaCapture(day(18), 900); // 10 d back
    const cap = await metaCapture(day(28), 1500);
    await diffVendorCapture({ db: dbs.service }, cap, { now });
    expect(await changes()).toEqual([]);
  });

  it('a glitchy low base reading among normal readings emits nothing', async () => {
    await metaCapture(day(0), 480); // vendor blip: 10x too low
    await metaCapture(day(3), 4800);
    await metaCapture(day(5), 4820);
    const cap = await metaCapture(day(28), 4900);
    await diffVendorCapture({ db: dbs.service }, cap, { now });
    expect(await changes()).toEqual([]);
  });

  it('a rise above 100 % is implausible: no event, counted as implausible', async () => {
    await metaCapture(day(0), 400);
    const cap = await metaCapture(day(28), 1000); // +150 %
    const out = await diffVendorCapture({ db: dbs.service }, cap, { now });
    expect(await changes()).toEqual([]);
    expect(out).toMatchObject({ result: { implausible: 1 } });
  });

  it('a drop does not', async () => {
    await metaCapture(day(0), 1000);
    const cap = await metaCapture(day(28), 700);
    await diffVendorCapture({ db: dbs.service }, cap, { now });
    expect(await changes()).toEqual([]);
  });

  it('second rise within 28 d of an emitted one does not', async () => {
    await metaCapture(day(0), 1000);
    await metaCapture(day(7), 1000);
    const first = await metaCapture(day(28), 1220);
    await diffVendorCapture({ db: dbs.service }, first, { now });
    expect(await changes()).toHaveLength(1);
    await dbs.service.update(detectedChange).set({ detectedAt: day(28) }).where(eq(detectedChange.afterCaptureId, first));
    const second = await metaCapture(day(35), 1500); // base day 7 (1000): +50 %
    await diffVendorCapture({ db: dbs.service }, second, { now });
    expect(await changes()).toHaveLength(1);
  });

  it('emits again once the 28-day cooldown has passed', async () => {
    await metaCapture(day(0), 1000);
    const first = await metaCapture(day(28), 1220);
    await diffVendorCapture({ db: dbs.service }, first, { now });
    await dbs.service.update(detectedChange).set({ detectedAt: day(28) }).where(eq(detectedChange.afterCaptureId, first));
    await metaCapture(day(40), 1230);
    const later = await metaCapture(day(60), 1500); // 21–35 d back holds only the day-28 reading (1220): +23 %
    await diffVendorCapture({ db: dbs.service }, later, { now });
    expect(await changes()).toHaveLength(2);
  });

  it('uses the highest reading in the 21–35 d window as the base', async () => {
    await metaCapture(day(-6), 100); // 34 d back
    await metaCapture(day(2), 1000); // 26 d back  <- highest
    await metaCapture(day(6), 120); // 22 d back
    const cap = await metaCapture(day(28), 1250);
    await diffVendorCapture({ db: dbs.service }, cap, { now });
    const [c] = await changes();
    expect(c?.details).toMatchObject({ likesBefore: 1000, likesAfter: 1250, pct: 25, days: 26 });
  });
});
