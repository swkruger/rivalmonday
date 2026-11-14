import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCatalog, loadVerticalPack } from '@cs/verticals';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { catalogRows } from './catalog';
import { openTestDbs } from '../test/helpers';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const BLOCKS = readFileSync(join(__dirname, '../migrations/0110_social_jev.sql'), 'utf8').split('--> statement-breakpoint');
const BACKFILL = BLOCKS.slice(BLOCKS.findIndex((b) => b.includes('-- backfill:start')));
const PACKS = ['generic', 'hvac_plumbing', 'dental', 'venues_attractions'];

async function backfill() {
  for (const s of BACKFILL) await dbs.owner.execute(sql.raw(s));
}
type Row = { id: string; config: Record<string, any>; updated_at: string };
async function rows(): Promise<Row[]> {
  return (await dbs.owner.execute(sql`SELECT id, config, updated_at::text AS updated_at FROM vertical ORDER BY id`)) as unknown as Row[];
}
const count = (arr: any[], id: string) => arr.filter((x) => x.id === id).length;

// Put the four shipped rows back in the v9 shape (what production holds before 0110).
beforeEach(async () => {
  await dbs.owner.execute(sql`
    UPDATE vertical SET config = jsonb_set(
      jsonb_set(
        jsonb_set(config #- '{social}', '{scoring,version}', '9'::jsonb),
        '{self_rules}', coalesce((SELECT jsonb_agg(r) FROM jsonb_array_elements(config -> 'self_rules') r WHERE r ->> 'id' <> 'social_gap'), '[]'::jsonb)),
      '{playbooks}', coalesce((SELECT jsonb_agg(r) FROM jsonb_array_elements(config -> 'playbooks') r WHERE r ->> 'id' <> 'post_weekly'), '[]'::jsonb))
    WHERE id IN ('generic', 'hvac_plumbing', 'dental', 'venues_attractions')`);
});
afterEach(backfill); // leave the shared test DB in the current (v10) shape

describe('migration 0110 pack v10', () => {
  it('moves the four shipped packs to v10 with social on, appends rule and play once, leaves updated_at, and is idempotent', async () => {
    const before = await rows();
    for (const id of PACKS) {
      const c = before.find((x) => x.id === id)!.config;
      expect(c.scoring.version).toBe(9);
      expect(c.social).toBeUndefined();
      expect(count(c.self_rules, 'social_gap')).toBe(0);
      expect(count(c.playbooks, 'post_weekly')).toBe(0);
    }
    await backfill();
    const after = await rows();
    for (const id of PACKS) {
      const r = after.find((x) => x.id === id)!;
      expect(r.config.scoring.version).toBe(10);
      expect(r.config.social).toBe(true);
      expect(count(r.config.self_rules, 'social_gap')).toBe(1);
      expect(count(r.config.playbooks, 'post_weekly')).toBe(1);
      const rule = r.config.self_rules.find((x: any) => x.id === 'social_gap');
      expect(rule.playbook).toBe('post_weekly');
      expect(r.config.playbooks.find((x: any) => x.id === 'post_weekly').trigger).toBe('social_gap');
      expect(r.updated_at).toBe(before.find((x) => x.id === id)!.updated_at);
    }
    await backfill();
    expect(await rows()).toEqual(after);
  });

  it('assembled packs equal the YAML packs on social flag, social_gap rule and post_weekly play', async () => {
    await backfill();
    const cat = createCatalog(() => catalogRows(dbs.owner));
    for (const id of PACKS) {
      const yaml = await loadVerticalPack(id);
      const p = id === 'generic' ? await cat.generic() : await cat.packs(id);
      expect(p.social, id).toBe(true);
      expect(p.scoring.version, id).toBe(10);
      expect(p.self_rules.find((r) => r.id === 'social_gap'), id).toEqual(yaml.self_rules.find((r) => r.id === 'social_gap'));
      expect(p.playbooks.find((r) => r.id === 'post_weekly'), id).toEqual(yaml.playbooks.find((r) => r.id === 'post_weekly'));
    }
  });

  it('seeds the ai_decision_mode platform setting as jev_only', async () => {
    // The test DB is emptied between runs (platform_setting is not re-seeded), so run the migration's own INSERT.
    const insert = BLOCKS.find((b) => /INSERT INTO platform_setting/i.test(b))!;
    await dbs.owner.execute(sql.raw(insert));
    await dbs.owner.execute(sql.raw(insert)); // idempotent
    const [r] = (await dbs.owner.execute(sql`SELECT value FROM platform_setting WHERE key = 'ai_decision_mode'`)) as unknown as { value: unknown }[];
    expect(r.value).toEqual({ mode: 'jev_only', reevalUntil: null });
  });
});
