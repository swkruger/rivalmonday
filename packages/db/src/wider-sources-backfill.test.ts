import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCatalog } from '@cs/verticals';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { catalogRows } from './catalog';
import { openTestDbs } from '../test/helpers';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const BLOCKS = readFileSync(join(__dirname, '../migrations/0100_wider_sources_gbp_meta.sql'), 'utf8').split('--> statement-breakpoint');
const BACKFILL = BLOCKS.slice(BLOCKS.findIndex((b) => b.includes('-- backfill:start')));
const SHIPPED = ['generic', 'hvac_plumbing', 'dental'];

const BLOCKS_0101 = readFileSync(join(__dirname, '../migrations/0101_web_readiness_pack_v6.sql'), 'utf8').split('--> statement-breakpoint');
const BACKFILL_0101 = BLOCKS_0101.slice(BLOCKS_0101.findIndex((b) => b.includes('-- backfill:start')));

async function backfill() {
  for (const s of BACKFILL) await dbs.owner.execute(sql.raw(s));
}
type Row = { id: string; config: Record<string, any>; updated_at: string };
async function rows(): Promise<Row[]> {
  return (await dbs.owner.execute(sql`SELECT id, config, updated_at::text AS updated_at FROM vertical ORDER BY id`)) as unknown as Row[];
}
async function cleanup() {
  await dbs.owner.execute(sql`DELETE FROM business_area WHERE vertical_id = 'ws_created'`);
  await dbs.owner.execute(sql`DELETE FROM vertical WHERE id = 'ws_created'`);
}
afterEach(async () => {
  await cleanup();
  await backfill();
  for (const s of BACKFILL_0101) await dbs.owner.execute(sql.raw(s)); // leave the shared test DB in the current shape
});
beforeEach(async () => {
  await dbs.owner.execute(sql`
    UPDATE vertical SET config = jsonb_set(
      config #- '{type_weights,status_change}' #- '{type_weights,profile_change}' #- '{type_weights,audience_growth}' #- '{scoring,size,audience_pct_for_full}',
      '{scoring,version}', '4'::jsonb)
    WHERE id IN ('generic', 'hvac_plumbing', 'dental')`);
  await cleanup();
  await dbs.owner.execute(sql`INSERT INTO vertical (id, name, status, config, gbp_categories, gbp_related_categories)
    SELECT 'ws_created', 'WS Created', 'reviewed', config - 'scoring' - 'type_weights', gbp_categories, gbp_related_categories FROM vertical WHERE id = 'dental'`);
  await dbs.owner.execute(sql`INSERT INTO business_area (vertical_id, id, name, status) VALUES ('ws_created', 'ws_area', 'WS Area', 'reviewed')`);
});

describe('migration 0101 web readiness', () => {
  it('adds the web weights and version 6 to the shipped packs, idempotently', async () => {
    await backfill();
    await dbs.owner.execute(sql`UPDATE vertical SET config = jsonb_set(config #- '{type_weights,site_feature}' #- '{type_weights,new_page}', '{scoring,version}', '5'::jsonb) WHERE id IN ('generic', 'hvac_plumbing', 'dental')`);
    const before = await rows();
    for (const s of BACKFILL_0101) await dbs.owner.execute(sql.raw(s));
    const after = await rows();
    for (const id of SHIPPED) {
      const r = after.find((x) => x.id === id)!;
      expect(r.config.scoring.version).toBe(6);
      expect(r.config.type_weights).toMatchObject({ site_feature: 0.7, new_page: 0.7 });
      expect(r.updated_at).toBe(before.find((x) => x.id === id)!.updated_at);
    }
    for (const s of BACKFILL_0101) await dbs.owner.execute(sql.raw(s));
    expect(await rows()).toEqual(after);
  });
});

describe('migration 0100 wider sources', () => {
  it('backfills the shipped packs only, leaves updated_at alone, and is idempotent', async () => {
    const before = await rows();
    for (const id of SHIPPED) expect(before.find((x) => x.id === id)!.config.scoring.version).toBe(4);
    await backfill();
    const after = await rows();
    for (const id of SHIPPED) {
      const r = after.find((x) => x.id === id)!;
      expect(r.config.scoring.version).toBe(5);
      expect(r.config.scoring.size.audience_pct_for_full).toBe(20);
      expect(r.config.type_weights).toMatchObject({ status_change: 1.0, profile_change: 0.8, audience_growth: 0.7 });
      expect(r.updated_at).toBe(before.find((x) => x.id === id)!.updated_at);
    }
    const created = after.find((x) => x.id === 'ws_created')!;
    expect(JSON.stringify(created.config)).toBe(JSON.stringify(before.find((x) => x.id === 'ws_created')!.config));
    await backfill();
    expect(await rows()).toEqual(after);
  });

  it('createCatalog assembles the new weights and version 5 for all four', async () => {
    await backfill();
    const cat = createCatalog(() => catalogRows(dbs.owner));
    for (const id of ['hvac_plumbing', 'dental', 'ws_created']) {
      const p = await cat.packs(id);
      expect(p.scoring.version, id).toBe(5);
      expect(p.type_weights.status_change, id).toBe(1.0);
      expect(p.scoring.size.audience_pct_for_full, id).toBe(20);
    }
  });
});
