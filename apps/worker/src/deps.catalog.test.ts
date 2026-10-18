import { client } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, testUrls, truncateAll } from '@cs/db/test-helpers';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createWorkerDeps } from './deps';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('worker pack loader', () => {
  it('reads a DB-only vertical (no YAML pack exists for it)', async () => {
    await dbs.service.execute(sql`
      insert into vertical (id, name, status, gbp_categories, gbp_related_categories, config)
      select 'distillery', 'Distillery', 'reviewed', gbp_categories, gbp_related_categories, config from vertical where id = 'hvac_plumbing'`);
    await dbs.service.execute(sql`
      insert into business_area (vertical_id, id, name, aliases, status)
      select 'distillery', id, name, aliases, status from business_area where vertical_id = 'hvac_plumbing'`);
    await dbs.service.update(client).set({ verticalId: 'distillery' }).where(eq(client.id, IDS.clientA1));
    const deps = createWorkerDeps({ SERVICE_DATABASE_URL: testUrls.service } as NodeJS.ProcessEnv);
    await expect(deps.updateMoves(IDS.clientA1)).resolves.toBeDefined();
  });
});
