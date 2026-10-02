import { client, competitor } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { competitorVerticals } from './tag-stage';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const SELF = '00000000-0000-4000-8000-0000000000f9';

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.insert(competitor).values({ id: SELF, name: 'Bright Dental Self', placeId: 'p-self' });
});

describe('competitorVerticals', () => {
  it('includes verticals of clients owning the competitor as their own business', async () => {
    expect(await competitorVerticals(dbs.service, SELF)).toEqual([]);
    await dbs.owner.update(client).set({ selfCompetitorId: SELF }).where(eq(client.id, IDS.clientA2));
    expect(await competitorVerticals(dbs.service, SELF)).toEqual(['dental']);
    await dbs.owner.update(client).set({ selfCompetitorId: IDS.competitorX }).where(eq(client.id, IDS.clientA2));
    expect(await competitorVerticals(dbs.service, IDS.competitorX)).toEqual(['dental', 'hvac_plumbing']);
  });
});
