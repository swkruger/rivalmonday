import { catalogRows } from '@cs/db';
import { openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createCatalog } from '@cs/verticals';
import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { ToolDeps } from '../deps';
import { packFor } from '../setup/profile-change';
import { catalogOf, catalogPacks, packsOf } from './access';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const deps = (extra: Partial<ToolDeps> = {}): ToolDeps => ({ app: dbs.app, service: dbs.service, ...extra });

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('catalogue access', () => {
  it('packsOf prefers deps.packs', () => {
    const packs = async () => {
      throw new Error('custom');
    };
    expect(packsOf(deps({ packs }))).toBe(packs);
  });

  it('catalogOf prefers deps.catalog, else falls back to the DB catalogue (one per service connection)', async () => {
    const own = createCatalog(() => catalogRows(dbs.service));
    expect(catalogOf(deps({ catalog: own }))).toBe(own);
    const d = deps();
    expect(catalogOf(d)).toBe(catalogOf(d));
    expect((await packsOf(d)('hvac_plumbing')).id).toBe('hvac_plumbing');
  });

  it('catalogPacks lists the selectable packs (no generic)', async () => {
    const ids = (await catalogPacks(deps({ catalog: createCatalog(() => catalogRows(dbs.service)) }))).map((p) => p.id).sort();
    expect(ids).toEqual(['dental', 'hvac_plumbing']);
  });

  it('packFor resolves a merged id to its target and refuses unknown ids', async () => {
    await dbs.owner.execute(sql`
      insert into vertical (id, name, status, merged_into, gbp_categories, gbp_related_categories, config)
      select 'old_hvac', 'Old HVAC', 'merged', 'hvac_plumbing', gbp_categories, gbp_related_categories, config from vertical where id = 'hvac_plumbing'`);
    const d = deps({ catalog: createCatalog(() => catalogRows(dbs.service)) });
    expect((await packFor(d, 'old_hvac')).id).toBe('hvac_plumbing');
    await expect(packFor(d, 'nope')).rejects.toMatchObject({ code: 'invalid_input' });
  });
});
