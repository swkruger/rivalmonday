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
    expect(r).toEqual({ suggested: 1, searches: 2 });
    const rows = await dbs.service.select().from(competitorSuggestion);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ agencyId: IDS.agencyA, clientId: IDS.clientA1, placeId: 'p1', appearances: 2, bestRank: 2, overlapScore: 1, status: 'suggested' });
    // Idempotent
    await suggestCompetitors({ db: dbs.service, dfs }, IDS.clientA1, { gridSize: 1, maxKeywords: 2 });
    expect(await dbs.service.select().from(competitorSuggestion)).toHaveLength(1);
  });

  it('refuses clients without keywords or service area', async () => {
    await expect(suggestCompetitors({ db: dbs.service, dfs: fakeDfs(() => []) }, IDS.clientA2)).rejects.toThrow(/keywords|service area/i);
  });
});
