import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { errorText, openTestDbs, truncateAll } from '../test/helpers';
import { catalogRows, seedVerticalCatalog } from './catalog';
import { businessArea, vertical, verticalCategory, verticalDraft } from './schema';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedVerticalCatalog(dbs.owner);
});

describe('vertical catalogue tables', () => {
  it('app_user is denied on all four tables', async () => {
    for (const t of [vertical, businessArea, verticalCategory, verticalDraft]) {
      expect(await errorText(dbs.app.select().from(t))).toMatch(/permission denied/);
    }
  });

  it('app_service reads the seeded catalogue', async () => {
    const { verticals, areas } = await catalogRows(dbs.service);
    expect(verticals.map((v) => v.id).sort()).toEqual(['dental', 'generic', 'hvac_plumbing']);
    expect(verticals.every((v) => v.status === 'reviewed' && v.version >= 1)).toBe(true);
    expect(areas.some((a) => a.verticalId === 'hvac_plumbing')).toBe(true);
    expect(areas.some((a) => a.verticalId === 'generic' && a.id === 'general')).toBe(true);
    const cats = await dbs.service.select().from(verticalCategory);
    expect(cats.some((c) => c.verticalId === 'dental' && c.kind === 'primary')).toBe(true);
    expect(cats.some((c) => c.verticalId === 'generic')).toBe(false);
  });

  it('seedVerticalCatalog restores three verticals after truncateAll and is idempotent', async () => {
    for (const t of ['vertical_draft', 'vertical_category', 'business_area', 'vertical']) await dbs.owner.execute(sql.raw(`delete from ${t}`));
    expect((await catalogRows(dbs.service)).verticals).toHaveLength(0);
    await seedVerticalCatalog(dbs.owner);
    await seedVerticalCatalog(dbs.owner);
    expect((await catalogRows(dbs.service)).verticals).toHaveLength(3);
  });

  it('rejects status=merged without merged_into', async () => {
    const text = await errorText(dbs.owner.execute(sql`insert into vertical (id, name, status) values ('plumb_only', 'Plumbing only', 'merged')`));
    expect(text).toMatch(/check constraint/i);
  });

  it('rejects merged_into on a non-merged row and a self-merge', async () => {
    expect(
      await errorText(dbs.owner.execute(sql`insert into vertical (id, name, status, merged_into) values ('abc', 'Abc', 'reviewed', 'dental')`)),
    ).toMatch(/check constraint/i);
    expect(
      await errorText(dbs.owner.execute(sql`insert into vertical (id, name, status, merged_into) values ('abc', 'Abc', 'merged', 'abc')`)),
    ).toMatch(/violates/i);
  });
});
