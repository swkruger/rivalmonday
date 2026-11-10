import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCatalog, loadVerticalPack } from '@cs/verticals';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { catalogRows } from './catalog';
import { openTestDbs } from '../test/helpers';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const BLOCKS = readFileSync(join(__dirname, '../migrations/0107_citations.sql'), 'utf8').split('--> statement-breakpoint');
const BACKFILL = BLOCKS.slice(BLOCKS.findIndex((b) => b.includes('-- backfill:start')));
const SHIPPED = ['generic', 'hvac_plumbing', 'dental'];

async function backfill() {
  for (const s of BACKFILL) await dbs.owner.execute(sql.raw(s));
}
type Row = { id: string; config: Record<string, any>; updated_at: string };
async function rows(): Promise<Row[]> {
  return (await dbs.owner.execute(sql`SELECT id, config, updated_at::text AS updated_at FROM vertical ORDER BY id`)) as unknown as Row[];
}

// Put the shipped rows back in the v6 shape (what production holds before 0107).
beforeEach(async () => {
  await dbs.owner.execute(sql`
    UPDATE vertical SET config = jsonb_set(
      jsonb_set(config #- '{type_weights,citation_added}' #- '{citations}', '{scoring,version}', '6'::jsonb),
      '{self_rules}', coalesce((SELECT jsonb_agg(r) FROM jsonb_array_elements(config -> 'self_rules') r WHERE r ->> 'id' <> 'citation_gap'), '[]'::jsonb))
    WHERE id IN ('generic', 'hvac_plumbing', 'dental')`);
  await dbs.owner.execute(sql`
    UPDATE vertical SET config = jsonb_set(config, '{playbooks}',
      coalesce((SELECT jsonb_agg(r) FROM jsonb_array_elements(config -> 'playbooks') r WHERE r ->> 'id' <> 'fix_citations'), '[]'::jsonb))
    WHERE id IN ('generic', 'hvac_plumbing', 'dental')`);
});
afterEach(backfill); // leave the shared test DB in the current (v7) shape

const count = (arr: any[], id: string) => arr.filter((x) => x.id === id).length;

describe('migration 0107 pack v7', () => {
  it('moves the shipped packs to v7, appends the rule and play once, leaves updated_at, and is idempotent', async () => {
    const before = await rows();
    for (const id of SHIPPED) {
      const c = before.find((x) => x.id === id)!.config;
      expect(c.scoring.version).toBe(6);
      expect(count(c.self_rules, 'citation_gap')).toBe(0);
      expect(count(c.playbooks, 'fix_citations')).toBe(0);
    }
    await backfill();
    const after = await rows();
    for (const id of SHIPPED) {
      const r = after.find((x) => x.id === id)!;
      expect(r.config.scoring.version).toBe(7);
      expect(r.config.type_weights.citation_added).toBe(0.3);
      expect(r.config.citations).toBeDefined();
      expect(count(r.config.self_rules, 'citation_gap')).toBe(1);
      expect(count(r.config.playbooks, 'fix_citations')).toBe(1);
      expect(r.updated_at).toBe(before.find((x) => x.id === id)!.updated_at);
    }
    await backfill();
    expect(await rows()).toEqual(after);
  });

  it('assembled shipped packs equal the YAML packs on citations, self_rules and playbooks', async () => {
    await backfill();
    const cat = createCatalog(() => catalogRows(dbs.owner));
    const genericDirs = (await loadVerticalPack('generic')).citations.directory_groups;
    // generic is the inheritance base, not a pickable vertical: compare its stored row with the YAML.
    const g = (await rows()).find((x) => x.id === 'generic')!.config;
    const gy = await loadVerticalPack('generic');
    expect(g.citations).toEqual(gy.citations);
    expect(g.self_rules.find((r: any) => r.id === 'citation_gap')).toMatchObject({ weight: 0.6, playbook: 'fix_citations', params: { min_missing: 3 } });
    expect(g.playbooks.find((r: any) => r.id === 'fix_citations')).toEqual(gy.playbooks.find((r) => r.id === 'fix_citations'));
    for (const id of ['hvac_plumbing', 'dental']) {
      const yaml = await loadVerticalPack(id);
      const p = await cat.packs(id);
      expect(p.citations, id).toEqual({ ...yaml.citations, directory_groups: genericDirs });
      expect(p.self_rules, id).toEqual(yaml.self_rules);
      expect(p.playbooks, id).toEqual(yaml.playbooks);
      expect(p.scoring.version, id).toBe(7);
      expect(p.type_weights.citation_added, id).toBe(0.3);
    }
  });
});
