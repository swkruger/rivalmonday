import { client, competitorSuggestion } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { dfsTask, fakeDfs } from '../../test/fake-dfs';
import { suggestCompetitors } from './suggest';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.service.update(client).set({ keywords: ['ac repair', 'furnace repair'], placeId: 'self', serviceArea: { center: { lat: 33.9, lng: -84.3 }, radiusKm: 10, zips: [] } }).where(eq(client.id, IDS.clientA1));
});

describe('suggestCompetitors', () => {
  it('aggregates places across grid points and keywords, excluding the client itself', async () => {
    const dfs = fakeDfs(() => [dfsTask([{ items: [
      { type: 'maps_search', rank_absolute: 1, title: 'Me', place_id: 'self' },
      { type: 'maps_search', rank_absolute: 2, title: 'Smith HVAC', place_id: 'p1', domain: 'smithhvac.example', rating: { value: 4.6, votes_count: 210 } },
    ] }])]);
    const r = await suggestCompetitors({ db: dbs.service, dfs }, IDS.clientA1, { gridSize: 1, maxKeywords: 2 });
    expect(r).toEqual({ suggested: 1, searches: 2, failed: 0 });
    const rows = await dbs.service.select().from(competitorSuggestion);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ agencyId: IDS.agencyA, clientId: IDS.clientA1, placeId: 'p1', appearances: 2, bestRank: 2, overlapScore: 1, status: 'suggested' });
    // Idempotent
    await suggestCompetitors({ db: dbs.service, dfs }, IDS.clientA1, { gridSize: 1, maxKeywords: 2 });
    expect(await dbs.service.select().from(competitorSuggestion)).toHaveLength(1);
  });

  it('skips a grid point whose search fails and keeps the other points\' results', async () => {
    let n = 0;
    const dfs = fakeDfs(() => (++n === 1
      ? [dfsTask([], { statusCode: 40102, statusMessage: 'No Search Results.' })]
      : [dfsTask([{ items: [{ type: 'maps_search', rank_absolute: 3, title: 'Smith HVAC', place_id: 'p1' }] }])]));
    const r = await suggestCompetitors({ db: dbs.service, dfs }, IDS.clientA1, { gridSize: 1, maxKeywords: 2 });
    expect(r).toEqual({ suggested: 1, searches: 1, failed: 1 });
    const rows = await dbs.service.select().from(competitorSuggestion);
    expect(rows).toHaveLength(1);
    // Overlap is measured against the searches that returned, not the ones that failed.
    expect(rows[0]).toMatchObject({ placeId: 'p1', appearances: 1, overlapScore: 1 });
  });

  it('fails when every search fails, so the job reports it instead of an empty success', async () => {
    const dfs = fakeDfs(() => [dfsTask([], { statusCode: 40102, statusMessage: 'No Search Results.' })]);
    await expect(suggestCompetitors({ db: dbs.service, dfs }, IDS.clientA1, { gridSize: 1, maxKeywords: 2 })).rejects.toThrow(/No Search Results/);
    expect(await dbs.service.select().from(competitorSuggestion)).toHaveLength(0);
  });

  it('refuses clients without keywords or service area', async () => {
    await expect(suggestCompetitors({ db: dbs.service, dfs: fakeDfs(() => []) }, IDS.clientA2)).rejects.toThrow(/keywords|service area/i);
  });

  it('caps gridSize at 7 and maxKeywords at 5 to bound paid live calls', async () => {
    const dfs = fakeDfs(() => [dfsTask([{ items: [] }])]);
    const r = await suggestCompetitors({ db: dbs.service, dfs }, IDS.clientA1, { gridSize: 99, maxKeywords: 1 });
    expect(r.searches).toBe(7 * 7 * 1);
  });
});
