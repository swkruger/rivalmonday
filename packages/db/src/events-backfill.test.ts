import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCatalog, loadVerticalPack } from '@cs/verticals';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { catalogRows } from './catalog';
import { openTestDbs } from '../test/helpers';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const BLOCKS = readFileSync(join(__dirname, '../migrations/0109_events_venues.sql'), 'utf8').split('--> statement-breakpoint');
const BACKFILL = BLOCKS.slice(BLOCKS.findIndex((b) => b.includes('-- backfill:start')));
const SHIPPED = ['generic', 'hvac_plumbing', 'dental'];

async function backfill() {
  for (const s of BACKFILL) await dbs.owner.execute(sql.raw(s));
}
type Row = { id: string; config: Record<string, any>; updated_at: string };
async function rows(): Promise<Row[]> {
  return (await dbs.owner.execute(sql`SELECT id, config, updated_at::text AS updated_at FROM vertical ORDER BY id`)) as unknown as Row[];
}
const count = (arr: any[], id: string) => arr.filter((x) => x.id === id).length;

// Put the shipped rows back in the v8 shape (what production holds before 0109).
beforeEach(async () => {
  await dbs.owner.execute(sql`
    UPDATE vertical SET config = jsonb_set(
      jsonb_set(
        jsonb_set(
          (config #- '{type_weights,event_listed}' #- '{scoring,size,events_for_full}' #- '{events}' #- '{citations,directory_groups,events_venues}'),
          '{scoring,version}', '8'::jsonb),
        '{self_rules}', coalesce((SELECT jsonb_agg(r) FROM jsonb_array_elements(config -> 'self_rules') r WHERE r ->> 'id' <> 'event_gap'), '[]'::jsonb)),
      '{playbooks}', coalesce((SELECT jsonb_agg(r) FROM jsonb_array_elements(config -> 'playbooks') r WHERE r ->> 'id' <> 'list_your_events'), '[]'::jsonb))
    WHERE id IN ('generic', 'hvac_plumbing', 'dental')`);
});
afterEach(backfill); // leave the shared test DB in the current (v9) shape

describe('migration 0109 pack v9', () => {
  it('moves the shipped packs to v9, appends rule and play once, leaves updated_at, and is idempotent', async () => {
    const before = await rows();
    for (const id of SHIPPED) {
      const c = before.find((x) => x.id === id)!.config;
      expect(c.scoring.version).toBe(8);
      expect(c.type_weights.event_listed).toBeUndefined();
      expect(c.scoring.size.events_for_full).toBeUndefined();
      expect(c.events).toBeUndefined();
      expect(count(c.self_rules, 'event_gap')).toBe(0);
      expect(count(c.playbooks, 'list_your_events')).toBe(0);
    }
    expect(before.find((x) => x.id === 'generic')!.config.citations.directory_groups.events_venues).toBeUndefined();
    await backfill();
    const after = await rows();
    for (const id of SHIPPED) {
      const r = after.find((x) => x.id === id)!;
      expect(r.config.scoring.version).toBe(9);
      expect(r.config.type_weights.event_listed).toBe(id === 'generic' ? 0.5 : 0.35);
      expect(r.config.scoring.size.events_for_full).toBe(5);
      expect(r.config.events).toEqual({ menu: false, panel: false });
      expect(count(r.config.self_rules, 'event_gap')).toBe(1);
      expect(count(r.config.playbooks, 'list_your_events')).toBe(1);
      expect(r.updated_at).toBe(before.find((x) => x.id === id)!.updated_at);
    }
    expect(after.find((x) => x.id === 'generic')!.config.citations.directory_groups.events_venues).toHaveLength(5);
    await backfill();
    expect(await rows()).toEqual(after);
  });

  it('assembled shipped packs equal the YAML packs on event weight, events, self_rules, playbooks and citations', async () => {
    await backfill();
    const cat = createCatalog(() => catalogRows(dbs.owner));
    const gy = await loadVerticalPack('generic');
    const g = (await rows()).find((x) => x.id === 'generic')!.config;
    expect(g.citations).toEqual(gy.citations);
    expect(g.type_weights.event_listed).toBe(gy.type_weights.event_listed);
    expect(g.events).toEqual(gy.events);
    expect(g.self_rules).toMatchObject(gy.self_rules.map(({ strength: _s, ...r }) => r));
    expect(g.playbooks).toEqual(gy.playbooks);
    expect(g.playbooks.find((p: any) => p.id === 'list_your_events')).toEqual(gy.playbooks.find((p) => p.id === 'list_your_events'));
    for (const id of ['hvac_plumbing', 'dental']) {
      const yaml = await loadVerticalPack(id);
      const p = await cat.packs(id);
      expect(p.type_weights.event_listed, id).toBe(yaml.type_weights.event_listed);
      expect(p.events, id).toEqual(yaml.events);
      expect(p.self_rules, id).toEqual(yaml.self_rules);
      expect(p.playbooks, id).toEqual(yaml.playbooks);
      expect(p.citations, id).toEqual({ ...yaml.citations, directory_groups: gy.citations.directory_groups });
      expect(p.scoring.size.events_for_full, id).toBe(yaml.scoring.size.events_for_full);
      expect(p.scoring.version, id).toBe(9);
    }
  });

  it('seeds the venues_attractions vertical and its category map', async () => {
    await backfill();
    const yaml = await loadVerticalPack('venues_attractions');
    const cat = createCatalog(() => catalogRows(dbs.owner));
    const p = await cat.packs('venues_attractions');
    expect(p.scoring.version).toBe(9);
    expect(p.events).toEqual(yaml.events);
    expect(p.self_rules).toEqual(yaml.self_rules);
    const [v] = (await dbs.owner.execute(sql`SELECT version, status FROM vertical WHERE id = 'venues_attractions'`)) as unknown as { version: number; status: string }[];
    expect(v).toEqual({ version: 1, status: 'reviewed' });
    const cats = (await dbs.owner.execute(sql`SELECT category_lc, kind FROM vertical_category WHERE vertical_id = 'venues_attractions' AND category_lc IN ('event venue', 'bar')`)) as unknown as { category_lc: string; kind: string }[];
    expect(Object.fromEntries(cats.map((c) => [c.category_lc, c.kind]))).toEqual({ 'event venue': 'primary', bar: 'related' });
  });
});
