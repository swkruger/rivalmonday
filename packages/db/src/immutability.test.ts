import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { errorText, IDS, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { capture, competitor, evidence, trackedPage } from './schema';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const PAGE = '00000000-0000-4000-8000-0000000000e1';
const CAP = '00000000-0000-4000-8000-0000000000c1';

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.service.insert(trackedPage).values({ id: PAGE, competitorId: IDS.competitorX, url: 'https://smithhvac.example/pricing', pageType: 'pricing', source: 'sitemap', cadence: 'daily' });
  await dbs.service.insert(capture).values({ id: CAP, competitorId: IDS.competitorX, trackedPageId: PAGE, source: 'web', url: 'https://smithhvac.example/pricing', status: 'ok', httpStatus: 200, collectorVersion: 'web/1' });
  await dbs.service.insert(evidence).values({ captureId: CAP, kind: 'text', objectKey: `evidence/${IDS.competitorX}/${CAP}/text.txt`, sha256: 'a'.repeat(64), bytes: 10, contentType: 'text/plain' });
});

describe('evidence immutability (spec §4.4)', () => {
  it('new captures are not on legal hold', async () => {
    expect((await dbs.owner.select().from(capture))[0]?.legalHold).toBe(false);
  });

  it('denies the service role any update or delete of captures and evidence', async () => {
    expect(await errorText(dbs.service.update(capture).set({ status: 'blocked' }).where(eq(capture.id, CAP)))).toMatch(/permission denied/i);
    expect(await errorText(dbs.service.delete(capture).where(eq(capture.id, CAP)))).toMatch(/permission denied/i);
    expect(await errorText(dbs.service.update(evidence).set({ bytes: 1 }).where(eq(evidence.captureId, CAP)))).toMatch(/permission denied/i);
    expect(await errorText(dbs.service.delete(evidence).where(eq(evidence.captureId, CAP)))).toMatch(/permission denied/i);
  });

  it('blocks even the table owner, through triggers', async () => {
    expect(await errorText(dbs.owner.update(capture).set({ status: 'blocked' }).where(eq(capture.id, CAP)))).toMatch(/immutable/i);
    expect(await errorText(dbs.owner.delete(capture).where(eq(capture.id, CAP)))).toMatch(/immutable/i);
    expect(await errorText(dbs.owner.update(evidence).set({ bytes: 1 }).where(eq(evidence.captureId, CAP)))).toMatch(/immutable/i);
    expect(await errorText(dbs.owner.delete(evidence).where(eq(evidence.captureId, CAP)))).toMatch(/immutable/i);
  });

  it('lets the service role set and clear legal_hold, but not change anything else alongside it', async () => {
    await dbs.service.update(capture).set({ legalHold: true }).where(eq(capture.id, CAP));
    expect((await dbs.owner.select().from(capture))[0]?.legalHold).toBe(true);
    await dbs.service.update(capture).set({ legalHold: false }).where(eq(capture.id, CAP));
    expect((await dbs.owner.select().from(capture))[0]?.legalHold).toBe(false);
    expect(await errorText(dbs.owner.update(capture).set({ legalHold: true, error: 'x' }).where(eq(capture.id, CAP)))).toMatch(/immutable/i);
  });

  it('refuses to delete a tracked page or competitor that still has captures', async () => {
    expect(await errorText(dbs.owner.delete(trackedPage).where(eq(trackedPage.id, PAGE)))).toMatch(/foreign key/i);
    expect(await errorText(dbs.owner.delete(competitor).where(eq(competitor.id, IDS.competitorX)))).toMatch(/foreign key/i);
  });
});
