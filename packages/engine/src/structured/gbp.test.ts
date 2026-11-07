import { detectedChange, observation } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { day, seedVendorCapture } from '../../test/seed';
import { diffGbpProfiles, guardedGbpDiff, implausibleVotesDrop, type GbpProfile } from './gbp';
import { diffVendorCapture, previousVendorCaptures } from './vendor-diff';
import { capture } from '@cs/db';

const base: GbpProfile = {
  title: 'Smith HVAC', category: 'HVAC contractor', additionalCategories: ['Air conditioning repair service'], rating: 4.6, votes: 120,
  phone: '(214) 555-0100', url: 'https://smithhvac.example/', domain: 'smithhvac.example', currentStatus: 'open', address: '1 Main St, Plano, TX 75023',
  services: [{ title: 'Ducts' }],
  workHours: { work_hours: { timetable: { monday: [{ open: { hour: 8, minute: 0 }, close: { hour: 17, minute: 0 } }] }, current_status: 'open' } },
};
const keys = (cs: ReturnType<typeof diffGbpProfiles>) => cs.map((c) => [c.kind, c.blockKey, c.details.changeType]);

describe('diffGbpProfiles', () => {
  it('reports added/removed categories and services as new_service / service_removed', () => {
    const after = { ...base, additionalCategories: ['Plumber'], services: [{ title: 'Ducts' }, { title: 'Water heater installation' }] };
    expect(keys(diffGbpProfiles(base, after))).toEqual([
      ['added', 'gbp:category:plumber', 'new_service'],
      ['removed', 'gbp:category:air conditioning repair service', 'service_removed'],
      ['added', 'gbp:service:water heater installation', 'new_service'],
    ]);
  });

  it('turns a moved address into a new_location change', () => {
    const [c] = diffGbpProfiles(base, { ...base, address: '900 Oak Ave, Frisco, TX 75034' });
    expect(c).toMatchObject({ kind: 'modified', blockKey: 'gbp:address', beforeText: '1 Main St, Plano, TX 75023', afterText: '900 Oak Ave, Frisco, TX 75034', details: { changeType: 'new_location', field: 'address' } });
  });

  it('reports a rating move of 0.1 or more as rating_change; ignores smaller moves and the open/closed-now status', () => {
    expect(diffGbpProfiles(base, { ...base, rating: 4.4, votes: 131 })).toEqual([
      expect.objectContaining({ blockKey: 'gbp:rating', details: { changeType: 'rating_change', field: 'rating', ratingBefore: 4.6, ratingAfter: 4.4, votesBefore: 120, votesAfter: 131 } }),
    ]);
    expect(diffGbpProfiles(base, { ...base, rating: 4.65, currentStatus: 'close' })).toEqual([]);
  });

  it('reports hours, name and a permanent closure as content changes, but not the phone number', () => {
    const after: GbpProfile = {
      ...base, title: 'Smith Heating & Air', phone: '(214) 555-0199', currentStatus: 'closed_forever',
      workHours: { work_hours: { timetable: { monday: [{ open: { hour: 9, minute: 0 }, close: { hour: 17, minute: 0 } }] } } },
    };
    const cs = diffGbpProfiles(base, after);
    expect(keys(cs)).toEqual([['modified', 'gbp:title', 'content'], ['modified', 'gbp:hours', 'content'], ['modified', 'gbp:status', 'content']]);
    expect(cs[1]?.afterText).toBe('hours: monday 09:00–17:00');
  });

  it('ignores a profile without the field on either side', () => {
    expect(diffGbpProfiles({ ...base, address: null, rating: null }, { ...base, address: '9 Elm St', rating: 4.1 })).toEqual([]);
  });

  it('does not flap services or additional categories when one pull omits them', () => {
    const omitted = { ...base, services: null, additionalCategories: null };
    expect(diffGbpProfiles(base, omitted)).toEqual([]);
    expect(diffGbpProfiles(omitted, base)).toEqual([]);
    expect(diffGbpProfiles({ ...base, category: null }, { ...base, category: 'Plumber' })).toEqual([]);
    // The primary category is still compared when both pulls have it, even if one omits the additional ones.
    expect(keys(diffGbpProfiles(omitted, { ...base, category: 'Plumber', additionalCategories: null }))).toEqual([
      ['added', 'gbp:category:plumber', 'new_service'],
      ['removed', 'gbp:category:hvac contractor', 'service_removed'],
    ]);
  });
});

/** Snapshots from oldest to newest, as written; guardedGbpDiff takes them newest first. */
const run = (...profiles: GbpProfile[]) => guardedGbpDiff(profiles.map((profile, i) => ({ captureId: `c${i}`, profile })).reverse());
const A = { ...base, address: '1 Main St, Plano, TX 75023' };
const B = { ...base, address: '900 Oak Ave, Frisco, TX 75034' };
const C = { ...base, address: '5 Pine Rd, Allen, TX 75002' };
const G = { ...base, address: '7 Glitch Ln, Plano, TX 75023' };

describe('guardedGbpDiff', () => {
  it('548 to 3 votes, 4.9 to 4.3: no change, implausible 1', () => {
    expect(run({ ...base, rating: 4.9, votes: 548 }, { ...base, rating: 4.3, votes: 3 })).toEqual({ changes: [], implausible: 1, held: 0 });
  });
  it('51 of 1000 votes lost suppresses', () => {
    expect(run({ ...base, rating: 4.9, votes: 1000 }, { ...base, rating: 4.3, votes: 949 })).toMatchObject({ changes: [], implausible: 1 });
    expect(implausibleVotesDrop({ votes: 1000 }, { votes: 950 })).toBe(false);
  });
  it('10 to 9 votes keeps it', () => {
    const r = run({ ...base, rating: 4.6, votes: 10 }, { ...base, rating: 4.3, votes: 9 });
    expect(r.implausible).toBe(0);
    expect(r.changes.map((c) => c.blockKey)).toEqual(['gbp:rating']);
  });
  it('unknown votes keep it', () => {
    const r = run({ ...base, rating: 4.6, votes: null }, { ...base, rating: 4.3, votes: 3 });
    expect(r.implausible).toBe(0);
    expect(r.changes).toHaveLength(1);
  });
  it('recovery A G A: no change', () => {
    const a = { ...base, rating: 4.9, votes: 548 };
    expect(run(a, { ...base, rating: 4.3, votes: 3 }, a)).toEqual({ changes: [], implausible: 0, held: 0 });
  });
  it('A,G,G2,A: no change (a two-capture glitch is not a baseline)', () => {
    const a = { ...base, rating: 4.9, votes: 548 };
    expect(run(a, { ...base, rating: 4.3, votes: 3 }, { ...base, rating: 4.2, votes: 5 }, a).changes).toEqual([]);
  });
  it('A,G,G2: no change', () => {
    const a = { ...base, rating: 4.9, votes: 548 };
    expect(run(a, { ...base, rating: 4.3, votes: 3 }, { ...base, rating: 4.2, votes: 5 }).changes).toEqual([]);
  });
  it('a real purge that persists (A,P,P,P) still diffs normally afterwards', () => {
    const a = { ...base, rating: 4.9, votes: 548 };
    const p = { ...base, rating: 4.3, votes: 3 };
    expect(run(a, p, p, p)).toEqual({ changes: [], implausible: 0, held: 0 });
    const next = run(a, p, p, { ...p, rating: 4.0 });
    expect(next.changes.map((c) => c.blockKey)).toEqual(['gbp:rating']);
  });
  it('real purge suppressed once, then diffs normally', () => {
    const a = { ...base, rating: 4.9, votes: 548 };
    const purged = { ...base, rating: 4.3, votes: 3 };
    expect(run(a, purged).implausible).toBe(1);
    expect(run(a, purged, purged)).toEqual({ changes: [], implausible: 0, held: 0 });
    const next = run(a, purged, purged, { ...purged, rating: 4.0 });
    expect(next.changes.map((c) => c.blockKey)).toEqual(['gbp:rating']);
    expect(next.changes[0]?.beforeCaptureId).toBeUndefined();
  });
  it('address A,B: held 1', () => {
    expect(run(A, B)).toEqual({ changes: [], implausible: 0, held: 1 });
  });
  it('A,B,B: A to B, beforeCaptureId of A', () => {
    const r = run(A, B, B);
    expect(r.changes).toHaveLength(1);
    expect(r.changes[0]).toMatchObject({ blockKey: 'gbp:address', beforeText: A.address, afterText: B.address, beforeCaptureId: 'c0' });
  });
  it('A,G,A,A: nothing', () => {
    expect(run(A, G, A, A)).toEqual({ changes: [], implausible: 0, held: 0 });
  });
  it('A,A,B,B then B: one change', () => {
    expect(run(A, A, B, B).changes).toHaveLength(1);
    expect(run(A, A, B, B, B).changes).toHaveLength(0);
  });
  it('A,A,B,C,C: A to C', () => {
    const r = run(A, A, B, C, C);
    expect(r.changes).toHaveLength(1);
    expect(r.changes[0]).toMatchObject({ beforeText: A.address, afterText: C.address, beforeCaptureId: 'c1' });
  });
  it('title and domain alike', () => {
    for (const [f, v] of [['title', 'Smith Heating & Air'], ['domain', 'smithair.example']] as const) {
      expect(run(base, { ...base, [f]: v })).toMatchObject({ changes: [], held: 1 });
      const r = run(base, { ...base, [f]: v }, { ...base, [f]: v });
      expect(r.changes.map((c) => c.blockKey)).toEqual([`gbp:${f}`]);
      expect(r.changes[0]?.beforeCaptureId).toBe('c0');
    }
  });
  it('missing value in prev2: nothing', () => {
    expect(run({ ...A, address: null }, B, B)).toEqual({ changes: [], implausible: 0, held: 0 });
  });
  it('category/service/hours/status unguarded', () => {
    const after = { ...base, category: 'Plumber', services: [{ title: 'Ducts' }, { title: 'Leaks' }], currentStatus: 'closed_forever',
      workHours: { work_hours: { timetable: { monday: [{ open: { hour: 9, minute: 0 }, close: { hour: 17, minute: 0 } }] } } } };
    const r = run(base, after);
    expect(r.changes.map((c) => c.blockKey).sort()).toEqual(['gbp:category:hvac contractor', 'gbp:category:plumber', 'gbp:hours', 'gbp:service:leaks', 'gbp:status']);
  });
});

describe('diffVendorCapture — google_business_profile', () => {
  const dbs = openTestDbs();
  afterAll(() => dbs.closeAll());
  beforeEach(async () => {
    await truncateAll(dbs.owner);
    await seedTenancy(dbs.owner);
  });

  it('diffs the gbp_profile observations of two captures', async () => {
    const cap0 = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'google_business_profile', capturedAt: day(0) });
    const cap1 = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'google_business_profile', capturedAt: day(7) });
    await dbs.service.insert(observation).values([
      { competitorId: IDS.competitorX, captureId: cap0, kind: 'gbp_profile', key: 'profile', data: { ...base } },
      { competitorId: IDS.competitorX, captureId: cap1, kind: 'gbp_profile', key: 'profile', data: { ...base, rating: 4.3 } },
    ]);
    await diffVendorCapture({ db: dbs.service }, cap1, { now: day(30) });
    expect((await dbs.service.select().from(detectedChange)).map((c) => [c.blockKey, c.source, c.beforeCaptureId])).toEqual([['gbp:rating', 'google_business_profile', cap0]]);
  });
  it('stage output carries implausible 0 and held 0 for an ordinary diff', async () => {
    const cap0 = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'google_business_profile', capturedAt: day(0) });
    const cap1 = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'google_business_profile', capturedAt: day(7) });
    await dbs.service.insert(observation).values([
      { competitorId: IDS.competitorX, captureId: cap0, kind: 'gbp_profile', key: 'profile', data: { ...base } },
      { competitorId: IDS.competitorX, captureId: cap1, kind: 'gbp_profile', key: 'profile', data: { ...base, rating: 4.3 } },
    ]);
    const out = await diffVendorCapture({ db: dbs.service }, cap1, { now: day(30) });
    expect(out).toMatchObject({ ran: true, result: { baseline: false, implausible: 0, held: 0 } });
  });

  it('previousVendorCaptures returns ok captures of the same competitor/source/url, newest first, at most limit', async () => {
    const src = 'google_business_profile';
    const ids = [];
    for (const d of [0, 7, 14, 21]) ids.push(await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: src, capturedAt: day(d) }));
    await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'google_reviews', capturedAt: day(10) });
    await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: src, capturedAt: day(11), url: 'https://other.example/' });
    await dbs.service.insert(capture).values({ competitorId: IDS.competitorX, source: src, url: null, status: 'failed', collectorVersion: 'test/1', capturedAt: day(12) });
    const [latest] = await dbs.service.select().from(capture).where(eq(capture.id, ids[3]!));
    expect((await previousVendorCaptures(dbs.service, latest!, 3)).map((c) => c.id)).toEqual([ids[2], ids[1], ids[0]]);
    expect((await previousVendorCaptures(dbs.service, latest!, 2)).map((c) => c.id)).toEqual([ids[2], ids[1]]);
  });

  it('four GBP captures store the confirmed address change with before_capture_id of the from capture', async () => {
    const src = 'google_business_profile';
    const ids: string[] = [];
    const profiles = [A, A, B, B];
    for (const [i, d] of [0, 7, 14, 21].entries()) {
      const id = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: src, capturedAt: day(d) });
      ids.push(id);
      await dbs.service.insert(observation).values({ competitorId: IDS.competitorX, captureId: id, kind: 'gbp_profile', key: 'profile', data: { ...profiles[i]! } });
    }
    const mid = await diffVendorCapture({ db: dbs.service }, ids[2]!, { now: day(30) });
    expect(mid).toMatchObject({ result: { changeIds: [], held: 1 } });
    await diffVendorCapture({ db: dbs.service }, ids[3]!, { now: day(30) });
    expect((await dbs.service.select().from(detectedChange).where(eq(detectedChange.afterCaptureId, ids[3]!))).map((c) => [c.blockKey, c.beforeCaptureId])).toEqual([['gbp:address', ids[1]]]);
  });

  const seedRun = async (profiles: (GbpProfile | null)[]) => {
    const ids: string[] = [];
    for (const [i, pr] of profiles.entries()) {
      const id = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'google_business_profile', capturedAt: day(i * 7) });
      ids.push(id);
      if (pr) await dbs.service.insert(observation).values({ competitorId: IDS.competitorX, captureId: id, kind: 'gbp_profile', key: 'profile', data: { ...pr } });
    }
    return ids;
  };
  const changesAt = async (id: string) => (await dbs.service.select().from(detectedChange).where(eq(detectedChange.afterCaptureId, id))).map((c) => [c.blockKey, c.beforeCaptureId]);

  it('a profile-less capture between a glitch and its recovery emits nothing', async () => {
    const good = { ...base, rating: 4.9, votes: 548 };
    const ids = await seedRun([good, null, { ...base, rating: 4.3, votes: 3 }, good]);
    await diffVendorCapture({ db: dbs.service }, ids[3]!, { now: day(60) });
    expect(await changesAt(ids[3]!)).toEqual([]);
  });
  it('a profile-less capture between two agreeing address captures still confirms', async () => {
    const ids = await seedRun([A, B, null, B]);
    await diffVendorCapture({ db: dbs.service }, ids[3]!, { now: day(60) });
    expect(await changesAt(ids[3]!)).toEqual([['gbp:address', ids[0]]]);
  });
  it('fewer than 2 profile snapshots: no change', async () => {
    const ids = await seedRun([null, null, B]);
    const out = await diffVendorCapture({ db: dbs.service }, ids[2]!, { now: day(60) });
    expect(out).toMatchObject({ result: { changeIds: [], implausible: 0, held: 0 } });
  });
});
