import { detectedChange, observation } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { day, seedVendorCapture } from '../../test/seed';
import { diffVendorCapture } from './vendor-diff';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const now = day(30);
let cap0: string;
let cap1: string;

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  cap0 = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'google_jobs', capturedAt: day(0) });
  cap1 = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'google_jobs', capturedAt: day(7) });
});

const jobs = (captureId: string, keys: string[]) =>
  dbs.service.insert(observation).values(
    keys.map((key) => ({ competitorId: IDS.competitorX, captureId, kind: 'job_posting', key, data: { title: `HVAC Technician ${key}`, employer: 'Smith HVAC', location: 'Plano, TX 75023' } })),
  );

describe('diffVendorCapture — jobs', () => {
  it('groups postings new since the previous pulls into one hiring change', async () => {
    await jobs(cap0, ['j1', 'j2']);
    await jobs(cap1, ['j1', 'j3', 'j4']);
    await diffVendorCapture({ db: dbs.service }, cap1, { now });
    const [c] = await dbs.service.select().from(detectedChange);
    expect(c).toMatchObject({ kind: 'added', blockKey: 'jobs:new', source: 'google_jobs' });
    expect(c?.details).toMatchObject({ changeType: 'hiring', count: 2, items: [{ id: 'j3', label: 'HVAC Technician j3 — Plano, TX 75023' }, { id: 'j4' }] });
  });

  it('does not count a posting any pull listed in the last 60 days (postings flicker between pulls)', async () => {
    const older = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'google_jobs', capturedAt: day(-20) });
    await jobs(older, ['j5']);
    await jobs(cap0, ['j1']);
    await jobs(cap1, ['j1', 'j5']);
    await diffVendorCapture({ db: dbs.service }, cap1, { now });
    expect(await dbs.service.select().from(detectedChange)).toEqual([]);
  });

  it('never reports removed postings', async () => {
    await jobs(cap0, ['j1', 'j2']);
    await jobs(cap1, ['j1']);
    await diffVendorCapture({ db: dbs.service }, cap1, { now });
    expect(await dbs.service.select().from(detectedChange)).toEqual([]);
  });
});
