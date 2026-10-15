import { MOVE_TYPES, SELF_RULE_IDS } from '@cs/core';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PACKS_DIR, listVerticalPacks, loadVerticalPack } from './loader';

describe('pilot vertical packs', () => {
  it('ships exactly the pilot packs', async () => {
    expect(await listVerticalPacks()).toEqual(['dental', 'hvac_plumbing']);
  });

  it.each(['hvac_plumbing', 'dental'])('%s loads with a playbook for every move type', async (id) => {
    const pack = await loadVerticalPack(id);
    expect(pack.services.length).toBeGreaterThanOrEqual(10);
    expect(pack.themes.length).toBeGreaterThanOrEqual(6);
    expect(pack.type_weights.cosmetic).toBe(0);
    const triggers = new Set(pack.playbooks.map((p) => p.trigger));
    for (const move of MOVE_TYPES) expect(triggers).toContain(move);
    expect(pack.scoring.routing).toEqual({ alert: 70, brief: 40 });
    expect(pack.scoring.size.price_pct_for_full).toBeGreaterThan(0);
  });

  it('rejects unknown ids and mismatched declared ids', async () => {
    await expect(loadVerticalPack('../etc/passwd')).rejects.toThrow(/invalid vertical id/i);
    const dir = await mkdtemp(join(tmpdir(), 'packs-'));
    await writeFile(join(dir, 'other.yaml'), await readFile(join(PACKS_DIR, 'dental.yaml'), 'utf8'));
    await expect(loadVerticalPack('other', dir)).rejects.toThrow(/declares id "dental"/);
  });
});

describe('pack discovery config (Phase 12a)', () => {
  it('dental carries the discovery categories, keywords and tiers', async () => {
    const d = (await loadVerticalPack('dental')).discovery;
    expect(d.seed_keywords).toEqual(['dentist', 'dental implants', 'emergency dentist']);
    expect(d.categories).toContain('Dental clinic');
    expect(d.related_categories).toEqual(['Orthodontist', 'Oral and maxillofacial surgeon', 'Oral surgeon', 'Periodontist', 'Endodontist']);
    expect(d).toMatchObject({ grid: { size: 7, fallback_size: 5 }, shortlist: 20, cost_cap_usd: 3 });
    expect(d.tiers).toEqual({ top: { overlap: 0.55, activity: 0.25 }, watch: { overlap: 0.35, activity: 0.6 } });
  });

  it('hvac_plumbing carries the discovery categories, keywords and tiers', async () => {
    const d = (await loadVerticalPack('hvac_plumbing')).discovery;
    expect(d.seed_keywords).toEqual(['hvac contractor', 'ac repair', 'plumber']);
    expect(d.categories).toContain('Air conditioning repair service');
    expect(d.related_categories).toEqual(['Electrician', 'Mechanical contractor', 'Appliance repair service', 'Insulation contractor']);
    expect(d).toMatchObject({ grid: { size: 7, fallback_size: 5 }, shortlist: 20, cost_cap_usd: 3 });
    expect(d.tiers).toEqual({ top: { overlap: 0.55, activity: 0.25 }, watch: { overlap: 0.35, activity: 0.6 } });
  });

  it('bumps both pilot packs to version 3 (Phase 12b self rules)', async () => {
    expect((await loadVerticalPack('dental')).version).toBe(3);
    expect((await loadVerticalPack('hvac_plumbing')).version).toBe(3);
  });
});

describe('pack self rules (Phase 12b)', () => {
  it.each([['dental', 'patients'], ['hvac_plumbing', 'customers']])('%s declares every self rule with an existing playbook, plus the audience noun', async (id, noun) => {
    const pack = await loadVerticalPack(id);
    expect(pack.audience_noun).toBe(noun);
    expect(pack.self_rules.map((r) => r.id).sort()).toEqual([...SELF_RULE_IDS].sort());
    for (const rule of pack.self_rules) {
      const pb = pack.playbooks.find((p) => p.id === rule.playbook);
      expect(pb?.trigger).toBe(rule.id);
      expect(pb?.effort).toMatch(/^[LMH]$/);
      expect(pb?.impact).toMatch(/^[LMH]$/);
    }
    expect(pack.self_rules.filter((r) => r.strength).map((r) => r.id)).toEqual(['theme_strength']);
  });
});

describe('Phase 3b pack knobs', () => {
  it.each(['hvac_plumbing', 'dental'])('%s weights rank_change and carries the structured size curves, age cap and move thresholds', async (id) => {
    const p = await loadVerticalPack(id);
    expect(p.type_weights.rank_change).toBe(0.5);
    expect(p.scoring.version).toBe(2);
    expect(p.scoring.size).toMatchObject({ ads_for_full: 5, jobs_for_full: 5, review_z_for_full: 4, rating_delta_for_full: 0.3, rank_delta_for_full: 5, structured_min: 0.3 });
    expect(p.scoring.alert_max_age_days).toBe(7);
    expect(p.move_thresholds).toMatchObject({ price_war_cuts_90d: 2, ad_burst_starts_30d: 3, promo_blitz_window_days: 14 });
  });
});
