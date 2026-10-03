import { capture, captureBlock, stageRun } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { day, seedPage, seedWebCapture } from '../../test/seed';
import { EXTRACT_STAGE, ensureBlocks, loadBlocks } from './blocks';
import { EXTRACTOR_VERSION } from './extract';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('ensureBlocks', () => {
  it('extracts blocks from the gzipped html evidence once', async () => {
    const store = createMemoryStore();
    const page = await seedPage(dbs.service, IDS.competitorX);
    const cap = await seedWebCapture(dbs.service, store, { competitorId: IDS.competitorX, trackedPageId: page, html: '<body><h1>AC Repair</h1><p>Only $89</p></body>', capturedAt: day(0) });
    expect(await ensureBlocks({ db: dbs.service, store }, cap)).toBe('extracted');
    expect(await ensureBlocks({ db: dbs.service, store }, cap)).toBe('already');
    const blocks = await loadBlocks(dbs.service, cap);
    expect(blocks.map((b) => [b.ord, b.blockKey, b.text, b.embedding])).toEqual([[0, 'h1#0', 'AC Repair', null], [1, 'p#0', 'Only $89', null]]);
    expect(blocks[0]?.textSha).toMatch(/^[0-9a-f]{64}$/);
  });

  it('fails the stage when the html object is missing from the store', async () => {
    const page = await seedPage(dbs.service, IDS.competitorX);
    const cap = await seedWebCapture(dbs.service, createMemoryStore(), { competitorId: IDS.competitorX, trackedPageId: page, html: '<p>x</p>', capturedAt: day(0) });
    await expect(ensureBlocks({ db: dbs.service, store: createMemoryStore() }, cap)).rejects.toThrow(/missing from the store/);
    expect((await dbs.owner.select().from(stageRun).where(eq(stageRun.subjectId, cap)))[0]?.status).toBe('failed');
  });

  it('refuses captures that are not ok web pages', async () => {
    await dbs.service.insert(capture).values({ id: '00000000-0000-4000-8000-0000000000c9', competitorId: IDS.competitorX, source: 'google_ads', status: 'ok', collectorVersion: 'dfs/1' });
    await expect(ensureBlocks({ db: dbs.service, store: createMemoryStore() }, '00000000-0000-4000-8000-0000000000c9')).rejects.toThrow(/html evidence|not an ok web page/);
  });

  it('replaces blocks extracted under an older EXTRACTOR_VERSION instead of keeping them', async () => {
    const store = createMemoryStore();
    const page = await seedPage(dbs.service, IDS.competitorX);
    const cap = await seedWebCapture(dbs.service, store, { competitorId: IDS.competitorX, trackedPageId: page, html: '<body><p>AC tune-up $79 this spring</p></body>', capturedAt: day(1) });
    await dbs.service.insert(captureBlock).values([
      { captureId: cap, competitorId: IDS.competitorX, trackedPageId: page, ord: 0, blockKey: 'old#0', path: 'old', text: 'stale v1 block', textSha: 'x' },
      { captureId: cap, competitorId: IDS.competitorX, trackedPageId: page, ord: 5, blockKey: 'old#5', path: 'old', text: 'another stale block', textSha: 'y' },
    ]);
    await dbs.service.insert(stageRun).values({ stage: EXTRACT_STAGE, stageVersion: EXTRACTOR_VERSION - 1, subjectId: cap, status: 'done' });
    expect(await ensureBlocks({ db: dbs.service, store }, cap)).toBe('extracted');
    expect((await loadBlocks(dbs.service, cap)).map((b) => b.text)).toEqual(['AC tune-up $79 this spring']);
  });
});
