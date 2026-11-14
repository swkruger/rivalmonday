import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCatalog, loadVerticalPack } from '@cs/verticals';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { catalogRows } from './catalog';
import { openTestDbs } from '../test/helpers';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const BLOCKS = readFileSync(join(__dirname, '../migrations/0108_listing_fixes.sql'), 'utf8').split('--> statement-breakpoint');
const BACKFILL = BLOCKS.slice(BLOCKS.findIndex((b) => b.includes('-- backfill:start')));
const BLOCKS9 = readFileSync(join(__dirname, '../migrations/0109_events_venues.sql'), 'utf8').split('--> statement-breakpoint');
const BACKFILL9 = BLOCKS9.slice(BLOCKS9.findIndex((b) => b.includes('-- backfill:start')));
const BLOCKS10 = readFileSync(join(__dirname, '../migrations/0110_social_jev.sql'), 'utf8').split('--> statement-breakpoint');
const BACKFILL10 = BLOCKS10.slice(BLOCKS10.findIndex((b) => b.includes('-- backfill:start')));
const SHIPPED = ['generic', 'hvac_plumbing', 'dental'];
const OLD_TITLE = "Get listed on the directories you're missing";
const OLD_TEMPLATE = "Add your business to {{directories}} using each directory's sign-up page (links on the Listings page), with the same name and phone as your Google profile.";

async function backfill() {
  for (const s of BACKFILL) await dbs.owner.execute(sql.raw(s));
}
async function backfill9() {
  for (const s of BACKFILL9) await dbs.owner.execute(sql.raw(s));
}
async function backfill10() {
  for (const s of BACKFILL10) await dbs.owner.execute(sql.raw(s));
}
type Row = { id: string; config: Record<string, any>; updated_at: string };
async function rows(): Promise<Row[]> {
  return (await dbs.owner.execute(sql`SELECT id, config, updated_at::text AS updated_at FROM vertical ORDER BY id`)) as unknown as Row[];
}

// Put the shipped rows back in the v7 shape (what production holds before 0108).
beforeEach(async () => {
  await dbs.owner.execute(sql`
    UPDATE vertical SET config = jsonb_set(config, '{scoring,version}', '7'::jsonb)
    WHERE id IN ('generic', 'hvac_plumbing', 'dental')`);
  await dbs.owner.execute(sql`
    UPDATE vertical SET config = jsonb_set(config, '{playbooks}', (
      SELECT jsonb_agg(CASE WHEN r ->> 'id' = 'fix_citations' THEN r || jsonb_build_object('title', ${OLD_TITLE}::text, 'template', ${OLD_TEMPLATE}::text) ELSE r END)
      FROM jsonb_array_elements(config -> 'playbooks') r))
    WHERE id IN ('generic', 'hvac_plumbing', 'dental')`);
  await dbs.owner.execute(sql`
    UPDATE vertical SET config = config #- '{citations,directory_groups,general,0,claim_url}' #- '{citations,directory_groups,home_services,0,claim_url}'
    WHERE id = 'generic'`);
});
afterEach(async () => { await backfill(); await backfill9(); await backfill10(); }); // leave the shared test DB in the current (v10) shape

const count = (arr: any[], id: string) => arr.filter((x) => x.id === id).length;

describe('migration 0108 pack v8', () => {
  it('moves the shipped packs to v8, replaces (not appends) fix_citations, leaves updated_at, and is idempotent', async () => {
    const before = await rows();
    await backfill();
    const after = await rows();
    for (const id of SHIPPED) {
      const r = after.find((x) => x.id === id)!;
      expect(r.config.scoring.version).toBe(8);
      expect(count(r.config.playbooks, 'fix_citations')).toBe(1);
      expect(r.config.playbooks.length).toBe(before.find((x) => x.id === id)!.config.playbooks.length);
      expect(r.config.playbooks.find((p: any) => p.id === 'fix_citations')).toMatchObject({
        title: 'Fix your directory listings', trigger: 'citation_gap', effort: 'L', impact: 'M',
      });
      expect(r.updated_at).toBe(before.find((x) => x.id === id)!.updated_at);
    }
    const dg = after.find((x) => x.id === 'generic')!.config.citations.directory_groups;
    const claim = (g: string, host: string) => dg[g].find((d: any) => d.host === host).claim_url;
    expect(claim('general', 'facebook.com')).toBe('https://business.facebook.com/');
    expect(claim('home_services', 'angi.com')).toBe('https://office.angi.com/');
    expect(claim('dental_health', 'findadentist.ada.org')).toBe('https://www.ada.org/myada');
    expect(dg.general.find((d: any) => d.host === 'bbb.org').claim_url).toBeUndefined();
    await backfill();
    expect(await rows()).toEqual(after);
  });

  it('stored generic and the DB-inheriting verticals equal the YAML packs (after 0109 too)', async () => {
    await backfill();
    await backfill9();
    await backfill10();
    const cat = createCatalog(() => catalogRows(dbs.owner));
    const gy = await loadVerticalPack('generic');
    const g = (await rows()).find((x) => x.id === 'generic')!.config;
    expect(g.citations).toEqual(gy.citations);
    expect(g.playbooks.find((r: any) => r.id === 'fix_citations')).toEqual(gy.playbooks.find((r) => r.id === 'fix_citations'));
    for (const id of ['hvac_plumbing', 'dental']) {
      const yaml = await loadVerticalPack(id);
      const p = await cat.packs(id);
      expect(p.citations, id).toEqual({ ...yaml.citations, directory_groups: gy.citations.directory_groups });
      expect(p.playbooks, id).toEqual(yaml.playbooks);
      expect(p.scoring.version, id).toBe(10);
    }
  });
});
