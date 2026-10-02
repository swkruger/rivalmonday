import { detectedChange, observation } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { day, seedVendorCapture } from '../../test/seed';
import { diffGbpProfiles, type GbpProfile } from './gbp';
import { diffVendorCapture } from './vendor-diff';

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
});
