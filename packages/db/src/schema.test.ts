import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { client, competitor } from './schema';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('tenancy schema', () => {
  it('stores clients with default empty features', async () => {
    const rows = await dbs.owner.select().from(client);
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.id === IDS.clientA1)?.features).toEqual([]);
  });

  it('enforces unique competitor domains', async () => {
    await expect(dbs.owner.insert(competitor).values({ name: 'Dup', domain: 'smithhvac.example' })).rejects.toThrow();
  });
});
