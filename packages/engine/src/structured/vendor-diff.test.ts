import { detectedChange } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { day, seedVendorCapture } from '../../test/seed';
import { diffVendorCapture } from './vendor-diff';

const stub = vi.hoisted(() => ({ diffGbp: vi.fn() }));
vi.mock('./gbp', () => stub);

describe('diffVendorCapture — before capture', () => {
  const dbs = openTestDbs();
  afterAll(() => dbs.closeAll());
  beforeEach(async () => {
    await truncateAll(dbs.owner);
    await seedTenancy(dbs.owner);
  });

  it('a change with beforeCaptureId stores it as before_capture_id', async () => {
    const src = 'google_business_profile';
    const cap0 = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: src, capturedAt: day(0) });
    await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: src, capturedAt: day(7) });
    const cap2 = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: src, capturedAt: day(14) });
    stub.diffGbp.mockResolvedValue({
      changes: [{ kind: 'modified', blockKey: 'gbp:title', beforeText: 'a', afterText: 'b', details: { changeType: 'content' }, beforeCaptureId: cap0 }], implausible: 1, held: 2,
    });
    const out = await diffVendorCapture({ db: dbs.service }, cap2, { now: day(30) });
    expect(out).toMatchObject({ ran: true, result: { baseline: false, implausible: 1, held: 2 } });
    expect((await dbs.service.select().from(detectedChange)).map((c) => c.beforeCaptureId)).toEqual([cap0]);
    expect(stub.diffGbp.mock.calls[0]?.[3]).toHaveLength(1);
  });

  it('a venue-panel capture (gbp:events) diffs to no changes, without calling the profile differ', async () => {
    const src = 'google_business_profile';
    await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: src, url: 'gbp:events', capturedAt: day(0) });
    const cap = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: src, url: 'gbp:events', capturedAt: day(7) });
    stub.diffGbp.mockClear();
    const out = await diffVendorCapture({ db: dbs.service }, cap, { now: day(30) });
    expect(out).toMatchObject({ ran: true, result: { baseline: false, changeIds: [] } });
    expect(stub.diffGbp).not.toHaveBeenCalled();
    expect(await dbs.service.select().from(detectedChange)).toEqual([]);
  });
});
