import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCatalog } from '@cs/verticals';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { catalogRows } from './catalog';
import { openTestDbs } from '../test/helpers';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const BLOCKS = readFileSync(join(__dirname, '../migrations/0099_vertical_whole_business.sql'), 'utf8').split('--> statement-breakpoint');
const BACKFILL = BLOCKS.slice(BLOCKS.findIndex((b) => b.includes('-- backfill:start')));
const SHIPPED = ['generic', 'hvac_plumbing', 'dental'];

async function backfill() {
  for (const s of BACKFILL) await dbs.owner.execute(sql.raw(s));
}
type Row = { id: string; config: Record<string, any>; updated_at: string };
async function rows(): Promise<Row[]> {
  return (await dbs.owner.execute(sql`SELECT id, config, updated_at::text AS updated_at FROM vertical ORDER BY id`)) as unknown as Row[];
}

async function cleanup() {
  await dbs.owner.execute(sql`DELETE FROM business_area WHERE vertical_id = 'wb_created'`);
  await dbs.owner.execute(sql`DELETE FROM vertical WHERE id = 'wb_created'`);
}
afterEach(async () => {
  await cleanup();
  await backfill(); // leave the shared test DB in the current shape
});

beforeEach(async () => {
  // old shape: no whole_business, version 3
  await dbs.owner.execute(sql`
    UPDATE vertical SET config = jsonb_set(config #- '{scoring,relevance,whole_business}', '{scoring,version}', '3'::jsonb)
    WHERE id IN ('generic', 'hvac_plumbing', 'dental')`);
  await cleanup();
  await dbs.owner.execute(sql`INSERT INTO vertical (id, name, status, config, gbp_categories, gbp_related_categories)
    SELECT 'wb_created', 'WB Created', 'reviewed', config - 'scoring', gbp_categories, gbp_related_categories FROM vertical WHERE id = 'dental'`);
  await dbs.owner.execute(sql`INSERT INTO business_area (vertical_id, id, name, status) VALUES ('wb_created', 'wb_area', 'WB Area', 'reviewed')`);
});

describe('migration 0099 whole_business', () => {
  it('backfills the shipped packs only, leaves updated_at alone, and is idempotent', async () => {
    const before = await rows();
    for (const id of SHIPPED) {
      const r = before.find((x) => x.id === id)!;
      expect(r.config.scoring.version).toBe(3);
      expect(r.config.scoring.relevance).not.toHaveProperty('whole_business');
    }
    await backfill();
    const after = await rows();
    for (const id of SHIPPED) {
      const r = after.find((x) => x.id === id)!;
      expect(r.config.scoring.version).toBe(4);
      expect(r.config.scoring.relevance.whole_business).toBe(1);
      expect(r.updated_at).toBe(before.find((x) => x.id === id)!.updated_at);
    }
    const created = after.find((x) => x.id === 'wb_created')!;
    expect(JSON.stringify(created.config)).toBe(JSON.stringify(before.find((x) => x.id === 'wb_created')!.config));
    expect(created.updated_at).toBe(before.find((x) => x.id === 'wb_created')!.updated_at);
    await backfill();
    expect(await rows()).toEqual(after);
  });

  it('createCatalog assembles whole_business 1 and version 4 for all four (generic inheritance)', async () => {
    await backfill();
    const cat = createCatalog(() => catalogRows(dbs.owner));
    for (const id of ['hvac_plumbing', 'dental', 'wb_created']) {
      const p = await cat.packs(id);
      expect(p.scoring.relevance.whole_business, id).toBe(1);
      expect(p.scoring.version, id).toBe(4);
    }
    const g = await cat.generic();
    expect(g.scoring.relevance.whole_business).toBe(1);
    expect(g.scoring.version).toBe(4);
  });
});
