import { detectedChange, observation } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { day, seedVendorCapture } from '../../test/seed';
import { loadVerticalPack } from '@cs/verticals';
import { scoreForClient } from '../score/score';
import { buildStructuredSummary } from '../tag/structured';
import { diffGbpProfiles, guardedGbpDiff, humanizeAttribute, implausibleVotesDrop, PHOTO_PUSH_MIN, type GbpProfile } from './gbp';
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
    expect(keys(cs)).toEqual([['modified', 'gbp:title', 'profile_change'], ['modified', 'gbp:hours', 'profile_change'], ['modified', 'gbp:status', 'status_change']]);
    expect(cs[2]?.details).toMatchObject({ direction: 'closed', statusBefore: 'open', statusAfter: 'closed_forever' });
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
const run = (...profiles: GbpProfile[]) => guardedGbpDiff(profiles.map((profile, i) => ({ captureId: `c${i}`, profile, capturedAt: day(i * 7) })).reverse());
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
  it('A,G,G2: a drop that persists is real; the later move G to G2 is reported', () => {
    const a = { ...base, rating: 4.9, votes: 548 };
    const r = run(a, { ...base, rating: 4.3, votes: 3 }, { ...base, rating: 4.2, votes: 5 });
    expect(r.implausible).toBe(0);
    expect(r.changes).toHaveLength(1);
    expect(r.changes[0]).toMatchObject({ blockKey: 'gbp:rating', details: { ratingBefore: 4.3, ratingAfter: 4.2 } });
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
  it('category/service unguarded; hours and status held until seen twice', () => {
    const after = { ...base, category: 'Plumber', services: [{ title: 'Ducts' }, { title: 'Leaks' }], currentStatus: 'closed_forever',
      workHours: { work_hours: { timetable: { monday: [{ open: { hour: 9, minute: 0 }, close: { hour: 17, minute: 0 } }] } } } };
    const r = run(base, after);
    expect(r.changes.map((c) => c.blockKey).sort()).toEqual(['gbp:category:hvac contractor', 'gbp:category:plumber', 'gbp:service:leaks']);
    expect(r.held).toBe(2);
  });
  const closed = { ...base, currentStatus: 'closed_forever' };
  const hrs = (h: number): GbpProfile => ({ ...base, workHours: { work_hours: { timetable: { monday: [{ open: { hour: h, minute: 0 }, close: { hour: 17, minute: 0 } }] } } } });
  it('open/close flips never emit', () => {
    expect(run(base, { ...base, currentStatus: 'close' }, { ...base, currentStatus: 'open' }, { ...base, currentStatus: 'closing_soon' })).toEqual({ changes: [], implausible: 0, held: 0 });
  });
  it('closed_forever seen once is held', () => {
    expect(run(base, closed)).toMatchObject({ changes: [], held: 1 });
  });
  it('closed_forever seen twice emits status_change direction closed from the last open capture', () => {
    const r = run(base, base, closed, closed);
    expect(r.changes).toHaveLength(1);
    expect(r.changes[0]).toMatchObject({ blockKey: 'gbp:status', beforeCaptureId: 'c1', details: { changeType: 'status_change', direction: 'closed', statusBefore: 'open', statusAfter: 'closed_forever' } });
  });
  it('closed → open twice emits reopened', () => {
    const r = run(closed, closed, base, base);
    expect(r.changes[0]).toMatchObject({ blockKey: 'gbp:status', details: { changeType: 'status_change', direction: 'reopened', statusBefore: 'closed_forever', statusAfter: 'open' } });
  });
  it('missing work_time between closed pulls emits nothing', () => {
    const missing = { ...base, currentStatus: null, workHours: null };
    expect(run(closed, missing, closed)).toEqual({ changes: [], implausible: 0, held: 0 });
    expect(run(closed, missing, missing, closed)).toEqual({ changes: [], implausible: 0, held: 0 });
  });
  it('unknown status never emits', () => {
    const u = { ...base, currentStatus: 'unknown' };
    expect(run(base, u, u, u)).toEqual({ changes: [], implausible: 0, held: 0 });
    expect(diffGbpProfiles(base, { ...base, currentStatus: 'CLOSED_TEMPORARILY' })).toEqual([]);
  });
  it('CLOSED_FOREVER (upper case) emits closed', () => {
    const up = { ...base, currentStatus: 'CLOSED_FOREVER' };
    expect(run(base, base, up, up).changes[0]?.details).toMatchObject({ direction: 'closed', statusAfter: 'CLOSED_FOREVER' });
  });
  it('open, closed, missing, closed, closed emits once, on the pull where closed is first confirmed', () => {
    const missing = { ...base, currentStatus: null, workHours: null };
    const r = run(base, closed, missing, closed);
    expect(r.changes).toHaveLength(1);
    expect(r.changes[0]).toMatchObject({ beforeCaptureId: 'c0', details: { direction: 'closed' } });
    expect(run(base, closed, missing, closed, closed).changes).toEqual([]);
  });
  it('hours change needs two pulls', () => {
    expect(run(hrs(8), hrs(9))).toMatchObject({ changes: [], held: 1 });
    const r = run(hrs(8), hrs(9), hrs(9));
    expect(r.changes).toHaveLength(1);
    expect(r.changes[0]).toMatchObject({ blockKey: 'gbp:hours', beforeCaptureId: 'c0', details: { changeType: 'profile_change', field: 'hours' } });
  });
  it('description rewrite emits profile_change truncated to 300', () => {
    const d0 = { ...base, description: 'Family owned since 1990. ' + 'x'.repeat(400) };
    const d1 = { ...base, description: 'Now with 24/7 service. ' + 'y'.repeat(400) };
    expect(run(d0, d1)).toMatchObject({ changes: [], held: 1 });
    const r = run(d0, d1, d1);
    expect(r.changes).toHaveLength(1);
    const c = r.changes[0]!;
    expect(c.details).toMatchObject({ changeType: 'profile_change', field: 'description' });
    expect(c.beforeText).toBe(`description: ${d0.description.slice(0, 300)}`);
    expect(c.afterText).toBe(`description: ${d1.description.slice(0, 300)}`);
  });
  it('title change emits profile_change (was content)', () => {
    const r = run(base, { ...base, title: 'Smith Heating & Air' }, { ...base, title: 'Smith Heating & Air' });
    expect(r.changes[0]?.details.changeType).toBe('profile_change');
  });
});

describe('profile leftovers (18b-1 T5)', () => {
  const attrs = (...names: string[]) => ({
    available_attributes: names.reduce<Record<string, string[]>>((acc, n) => {
      const [g, a] = n.split('/') as [string, string];
      (acc[g] ??= []).push(a);
      return acc;
    }, {}),
    unavailable_attributes: null,
  });
  const noBook: GbpProfile = { ...base, bookOnlineUrl: '' };
  const book = (u: string): GbpProfile => ({ ...base, bookOnlineUrl: u });
  const photos = (n: number): GbpProfile => ({ ...base, totalPhotos: n });

  it('humanizeAttribute strips has_/is_, keeps offers as a word', () => {
    expect(humanizeAttribute('has_wheelchair_accessible_entrance')).toBe('wheelchair accessible entrance');
    expect(humanizeAttribute('offers_online_estimates')).toBe('offers online estimates');
    expect(humanizeAttribute('is_owned_by_veterans')).toBe('owned by veterans');
    expect(humanizeAttribute('accessibility/has_wheelchair_accessible_parking')).toBe('wheelchair accessible parking');
  });

  it('old profile without bookOnlineUrl, new with one: nothing', () => {
    expect(run(base, book('https://book.example/smith'), book('https://book.example/smith'))).toEqual({ changes: [], implausible: 0, held: 0 });
  });

  it('booking added: held once, then one profile_change booking added', () => {
    expect(run(noBook, book('https://book.example/smith'))).toMatchObject({ changes: [], held: 1 });
    const r = run(noBook, book('https://book.example/smith'), book('https://Book.example/smith?utm=1'));
    expect(r.changes).toHaveLength(1);
    expect(r.changes[0]).toMatchObject({ kind: 'added', blockKey: 'gbp:booking', beforeCaptureId: 'c0', details: { changeType: 'profile_change', field: 'booking' } });
    expect(typeof r.changes[0]?.details.after).toBe('string');
    expect(buildStructuredSummary({ source: 'google_business_profile', ...r.changes[0]! })).toBe('Added an online booking link to its Google profile');
  });

  it('booking removed and changed', () => {
    const removed = run(book('https://book.example/a'), noBook, noBook).changes;
    expect(removed.map((c) => [c.kind, c.blockKey])).toEqual([['removed', 'gbp:booking']]);
    expect(buildStructuredSummary({ source: 'google_business_profile', ...removed[0]! })).toBe('Removed the online booking link from its Google profile');
    const changed = run(book('https://book.example/a'), book('https://other.example/b'), book('https://other.example/b')).changes;
    expect(changed.map((c) => [c.kind, c.blockKey])).toEqual([['modified', 'gbp:booking']]);
    expect(buildStructuredSummary({ source: 'google_business_profile', ...changed[0]! })).toBe('Changed the online booking link on its Google profile');
    // A query string or fragment alone is not a change.
    expect(run(book('https://book.example/a?x=1'), book('https://book.example/a#y'), book('https://book.example/a')).changes).toEqual([]);
  });

  it('attribute seen once is held; seen twice emits added with the humanised label', () => {
    const a0 = { ...base, attributes: attrs('accessibility/has_wheelchair_accessible_entrance') };
    const a1 = { ...base, attributes: attrs('accessibility/has_wheelchair_accessible_entrance', 'service_options/offers_online_estimates') };
    expect(run(a0, a1)).toMatchObject({ changes: [], held: 1 });
    const r = run(a0, a1, a1);
    expect(r.changes.map((c) => [c.kind, c.blockKey, c.details.field, c.beforeCaptureId])).toEqual([
      ['added', 'gbp:attribute:service_options/offers_online_estimates', 'attribute', 'c0'],
    ]);
    expect(buildStructuredSummary({ source: 'google_business_profile', ...r.changes[0]! })).toBe('Google profile now shows "offers online estimates"');
  });

  it('attribute removed emits one removed per attribute', () => {
    const a0 = { ...base, attributes: attrs('accessibility/has_wheelchair_accessible_entrance', 'crowd/is_owned_by_veterans') };
    const a1 = { ...base, attributes: attrs('accessibility/has_wheelchair_accessible_entrance') };
    const r = run(a0, a1, a1);
    expect(r.changes.map((c) => [c.kind, c.blockKey])).toEqual([['removed', 'gbp:attribute:crowd/is_owned_by_veterans']]);
    expect(buildStructuredSummary({ source: 'google_business_profile', ...r.changes[0]! })).toBe('Google profile no longer shows "owned by veterans"');
  });

  it('a pull with no attributes between two equal pulls says nothing', () => {
    const a = { ...base, attributes: attrs('accessibility/has_wheelchair_accessible_entrance') };
    expect(run(a, { ...base, attributes: null }, a)).toEqual({ changes: [], implausible: 0, held: 0 });
    expect(run(a, { ...base, attributes: { available_attributes: null, unavailable_attributes: null } }, a)).toEqual({ changes: [], implausible: 0, held: 0 });
  });

  it('photos 100 → 125 over 28 days: a photos change with count and days', () => {
    // The day-7 pull carries no count, so the newest 21–35-day base is day 0.
    const r = run(photos(100), base, photos(110), photos(118), photos(125));
    expect(r.changes).toHaveLength(1);
    expect(r.changes[0]).toMatchObject({ blockKey: 'gbp:photos', beforeCaptureId: 'c0', details: { changeType: 'profile_change', field: 'photos', count: 25, days: 28, after: '2026-10' } });
    expect(buildStructuredSummary({ source: 'google_business_profile', ...r.changes[0]! })).toBe('Added 25 photos to its Google profile in 28 days');
    expect(PHOTO_PUSH_MIN).toBe(20);
    // The newest base wins: day 7 (21 days back) at 105 gives exactly 20.
    expect(run(photos(100), photos(105), photos(110), photos(118), photos(125)).changes[0]).toMatchObject({ beforeCaptureId: 'c1', details: { count: 20, days: 21 } });
  });

  it('photos 100 → 110: nothing; no 21–35-day base: nothing; a drop: nothing', () => {
    expect(run(photos(100), photos(102), photos(104), photos(106), photos(110)).changes).toEqual([]);
    // Only 14 days of history.
    expect(run(photos(100), photos(110), photos(150)).changes).toEqual([]);
    expect(run(photos(150), photos(140), photos(130), photos(120), photos(100)).changes).toEqual([]);
    // Old profiles without totalPhotos are no base.
    expect(run(base, base, base, base, photos(300)).changes).toEqual([]);
  });

  /** Runs the differ at every pull of a weekly series (oldest first); returns the pull indexes that emitted a photo push. */
  const photoPulls = (counts: number[]) =>
    counts.map((_, n) => n).filter((n) => run(...counts.slice(0, n + 1).map(photos)).changes.some((c) => c.blockKey === 'gbp:photos'));

  it('one burst emits exactly once across the following pulls (28-day cooldown)', () => {
    // Burst of +30 lands just before pull 5; pulls 5..8 all see a 21–35-day base at 100.
    expect(photoPulls([100, 100, 100, 100, 100, 130, 130, 130, 130, 130])).toEqual([5]);
  });

  it('steady +10/week emits at most once per 28 days', () => {
    const pulls = photoPulls(Array.from({ length: 16 }, (_, i) => 100 + 10 * i));
    expect(pulls.length).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < pulls.length; i++) expect((pulls[i]! - pulls[i - 1]!) * 7).toBeGreaterThanOrEqual(28);
  });

  it('booking, attribute and photo changes score below the pack alert bar with the default size', async () => {
    const pack = await loadVerticalPack('hvac_plumbing');
    for (const details of [{ field: 'booking' }, { field: 'attribute' }, { field: 'photos', count: 40, days: 28 }]) {
      const r = scoreForClient(
        { changeType: 'profile_change', facts: [], serviceId: null, zips: [], needsReview: false, maxSimilarity: null, details: { changeType: 'profile_change', ...details }, ageDays: 0 },
        { services: ['ac_tune_up'], zips: ['75024'], thresholds: null }, pack,
      );
      expect(r.score).toBeLessThan(pack.scoring.routing.alert);
      expect(r.route).not.toBe('alert');
    }
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
  it('photo push looks back past 4 snapshots to a 28-day base (18b-1 T5)', async () => {
    const ids = await seedRun([{ ...base, totalPhotos: 100 }, base, { ...base, totalPhotos: 110 }, { ...base, totalPhotos: 118 }, { ...base, totalPhotos: 125 }]);
    await diffVendorCapture({ db: dbs.service }, ids[4]!, { now: day(60) });
    expect(await changesAt(ids[4]!)).toEqual([['gbp:photos', ids[0]]]);
  });
  it('fewer than 2 profile snapshots: no change', async () => {
    const ids = await seedRun([null, null, B]);
    const out = await diffVendorCapture({ db: dbs.service }, ids[2]!, { now: day(60) });
    expect(out).toMatchObject({ result: { changeIds: [], implausible: 0, held: 0 } });
  });
});
