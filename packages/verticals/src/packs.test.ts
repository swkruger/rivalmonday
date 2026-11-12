import { MOVE_TYPES, SELF_RULE_IDS } from '@cs/core';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assemblePack, splitPack, type BusinessAreaRow, type VerticalRow } from './catalog';
import type { VerticalPack } from './schema';
import { PACKS_DIR, listVerticalPacks, loadVerticalPack } from './loader';

function toRows(pack: VerticalPack): { row: VerticalRow; areas: BusinessAreaRow[] } {
  const s = splitPack(pack);
  return {
    row: { ...s.row, status: 'reviewed', mergedInto: null, draftEvidence: null, createdByAgencyId: null },
    areas: s.areas.map((a) => ({ ...a, verticalId: pack.id, status: 'reviewed', mergedInto: null, evidence: null, createdByAgencyId: null })),
  };
}

describe('pilot vertical packs', () => {
  it('ships exactly the pilot packs and the venues pack', async () => {
    expect(await listVerticalPacks()).toEqual(['dental', 'generic', 'hvac_plumbing', 'venues_attractions']);
  });

  it.each(['hvac_plumbing', 'dental'])('%s loads with a playbook for every move type', async (id) => {
    const pack = await loadVerticalPack(id);
    expect(pack.services.length).toBeGreaterThanOrEqual(10);
    expect(pack.topics.length).toBeGreaterThanOrEqual(6);
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
    expect(pack.self_rules.filter((r) => r.strength).map((r) => r.id)).toEqual(['topic_strength']);
  });
});

describe('Phase 3b pack knobs', () => {
  it.each(['hvac_plumbing', 'dental'])('%s weights rank_change and carries the structured size curves, age cap and move thresholds', async (id) => {
    const p = await loadVerticalPack(id);
    expect(p.type_weights.rank_change).toBe(0.5);
    expect(p.scoring.version).toBe(9);
    expect(p.type_weights.tier_change).toBe(0.6);
    expect(p.scoring.size).toMatchObject({ ads_for_full: 5, jobs_for_full: 5, review_z_for_full: 4, rating_delta_for_full: 0.3, rank_delta_for_full: 5, structured_min: 0.3 });
    expect(p.scoring.alert_max_age_days).toBe(7);
    expect(p.move_thresholds).toMatchObject({ price_war_cuts_90d: 2, ad_burst_starts_30d: 3, promo_blitz_window_days: 14 });
  });
});

describe('brief-signal whole_business', () => {
  it('every shipped pack has whole_business 1 and scoring version 9', async () => {
    for (const id of await listVerticalPacks()) {
      const p = await loadVerticalPack(id);
      expect(p.scoring.relevance.whole_business, id).toBe(1);
      expect(p.scoring.version, id).toBe(9);
    }
  });

  it('every shipped pack has the 18a-2 web weights and version 9', async () => {
    for (const id of await listVerticalPacks()) {
      const p = await loadVerticalPack(id);
      expect(p.type_weights, id).toMatchObject({ site_feature: 0.7, new_page: 0.7 });
      expect(p.scoring.version, id).toBe(9);
    }
  });

  it('every shipped pack has the Phase 18a-1 weights and version 9', async () => {
    for (const id of await listVerticalPacks()) {
      const p = await loadVerticalPack(id);
      expect(p.type_weights, id).toMatchObject({ status_change: 1.0, profile_change: 0.8, audience_growth: 0.7 });
      expect(p.scoring.version, id).toBe(9);
      expect(p.scoring.size.audience_pct_for_full, id).toBe(20);
    }
  });

  it('a pack without the field defaults to 1', async () => {
    const raw = await readFile(join(PACKS_DIR, 'generic.yaml'), 'utf8');
    const dir = await mkdtemp(join(tmpdir(), 'wb-'));
    await writeFile(join(dir, 'generic.yaml'), raw.replace(', whole_business: 1.0', ''), 'utf8');
    const p = await loadVerticalPack('generic', dir);
    expect(p.scoring.relevance.whole_business).toBe(1);
  });
});

describe('topic naming', () => {
  it.each(['hvac_plumbing', 'dental', 'generic'])('%s has unique topic ids and no theme keys', async (id) => {
    const pack = await loadVerticalPack(id);
    expect(pack.topics.length).toBeGreaterThan(0);
    expect(new Set(pack.topics.map((t) => t.id)).size).toBe(pack.topics.length);
    const raw = await readFile(join(PACKS_DIR, `${id}.yaml`), 'utf8');
    expect(raw).not.toMatch(/theme/i);
  });
});

describe('catalogue seed', () => {
  it('is regenerated with topics, not themes', async () => {
    const sql = await readFile(join(PACKS_DIR, '../../db/src/catalog-seed.sql.ts'), 'utf8');
    expect(sql).toContain('\\"topics\\":');
    expect(sql).not.toMatch(/theme/i);
  });

  it.each(['hvac_plumbing', 'dental', 'generic', 'venues_attractions'])('%s seed matches the pack scoring version and weights', async (id) => {
    const sql = await readFile(join(PACKS_DIR, '../../db/src/catalog-seed.sql.ts'), 'utf8');
    const pack = await loadVerticalPack(id);
    const row = sql.split('INSERT INTO vertical (').find((r) => r.includes(`VALUES ('${id}'`)) ?? '';
    expect(row, 'seed row missing; run pnpm --filter @cs/verticals seed-sql').not.toBe('');
    expect(row).toContain(`\\"version\\":${pack.scoring.version}}`);
    for (const k of Object.keys(pack.type_weights)) expect(row).toContain(`\\"${k}\\":`);
  });
});

describe('Phase 18d packs (events and venues)', () => {
  const generic = async () => toRows(await loadVerticalPack('generic'));
  const assembled = async (id: string) => {
    const g = await generic();
    const { row, areas } = toRows(await loadVerticalPack(id));
    return assemblePack(row, areas, g.row);
  };

  it.each([['generic', 0.5], ['hvac_plumbing', 0.35], ['dental', 0.35]] as const)('%s weights event_listed %s, scores v9 and carries event_gap + list_your_events', async (id, w) => {
    for (const p of [await loadVerticalPack(id), await assembled(id)]) {
      expect(p.type_weights.event_listed).toBe(w);
      expect(p.scoring.version).toBe(9);
      expect(p.scoring.size.events_for_full).toBe(5);
      expect(p.self_rules.find((r) => r.id === 'event_gap')).toEqual({ id: 'event_gap', weight: 0.4, playbook: 'list_your_events', strength: false, params: { min_rival_events: 2 } });
      expect(p.playbooks.find((x) => x.id === 'list_your_events')).toEqual({
        id: 'list_your_events', trigger: 'event_gap', effort: 'L', impact: 'M', title: 'Put your events where customers look',
        template: "Post each event on your Google profile with its date, and list it on your website's events page.",
      });
      expect(p.events).toEqual({ menu: false, panel: false });
      expect(p.tripadvisor).toBe(false);
    }
  });

  it('venues_attractions parses standalone and assembled with generic', async () => {
    for (const p of [await loadVerticalPack('venues_attractions'), await assembled('venues_attractions')]) {
      expect(p).toMatchObject({ id: 'venues_attractions', name: 'Venues & attractions', audience_noun: 'guests', version: 1, tripadvisor: true, events: { menu: true, panel: true } });
      expect(p.scoring.version).toBe(9);
      expect(p.type_weights).toMatchObject({ event_listed: 0.8, rating_change: 0.8, price_change: 1.0 });
      expect(p.citations.groups).toEqual(['general', 'events_venues']);
      expect(p.services.map((s) => s.id).sort()).toEqual(['corporate_events', 'food_drink', 'group_packages', 'live_music', 'private_events', 'tickets_admission', 'tours_tastings', 'weddings']);
      expect(p.topics.map((t) => t.id)).toEqual(['atmosphere', 'staff', 'value', 'sound_comfort', 'cleanliness', 'booking_ease']);
      expect(p.topics.find((t) => t.id === 'sound_comfort')?.name).toBe('Sound & comfort');
      expect(p.discovery.seed_keywords).toEqual(['event venue', 'live music', 'wedding venue', 'escape room', 'things to do']);
      expect(p.discovery.categories).toHaveLength(8);
      expect(p.discovery.related_categories).toEqual(['Bar', 'Brewery', 'Distillery', 'Winery']);
      expect(p.self_rules.map((r) => r.id).sort()).toEqual([...SELF_RULE_IDS].sort());
      for (const rule of p.self_rules) {
        const pb = p.playbooks.find((x) => x.id === rule.playbook);
        expect(pb?.trigger).toBe(rule.id);
      }
    }
  });

  it('venues plays carry the decided triggers, copy and effort/impact', async () => {
    const p = await loadVerticalPack('venues_attractions');
    const play = (id: string) => p.playbooks.find((x) => x.id === id)!;
    expect(play('counter_programme')).toMatchObject({ trigger: 'event_listed', title: 'Counter-programme their event', effort: 'L', impact: 'M' });
    expect(play('early_bird')).toMatchObject({ trigger: 'promo', title: 'Sell early with an early-bird price', effort: 'M', impact: 'M' });
    expect(play('sold_out_waitlist')).toMatchObject({ trigger: 'event_listed', title: 'Catch the sold-out crowd', effort: 'L', impact: 'M' });
    expect(play('early_bird').template).toBe('Open bookings for your next event with a limited early-bird price and announce it on Google.');
    expect(play('sold_out_waitlist').template).toBe('{{competitor}} sold out {{event}}. Offer a similar night soon and promote it in posts and ads.');
  });
});
