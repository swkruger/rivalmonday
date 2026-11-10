import { describe, expect, it } from 'vitest';
import { assemblePack, splitPack, type BusinessAreaRow, type VerticalRow } from './catalog';
import { CITATION_CATALOGUE_MAX, citationCatalogue, isBannedHost, onHost } from './citations';
import { loadVerticalPack } from './loader';
import { verticalPackSchema, type VerticalPack } from './schema';

function toRows(pack: VerticalPack): { row: VerticalRow; areas: BusinessAreaRow[] } {
  const s = splitPack(pack);
  return {
    row: { ...s.row, status: 'reviewed', mergedInto: null, draftEvidence: null, createdByAgencyId: null },
    areas: s.areas.map((a) => ({ ...a, verticalId: pack.id, status: 'reviewed', mergedInto: null, evidence: null, createdByAgencyId: null })),
  };
}

async function assembled(id: string): Promise<VerticalPack> {
  const generic = toRows(await loadVerticalPack('generic'));
  const { row, areas } = toRows(await loadVerticalPack(id));
  return assemblePack(row, areas, generic.row);
}

const d = (host: string) => ({ host, label: host, add_listing_url: `https://${host}/add` });

async function withCitations(citations: unknown): Promise<ReturnType<typeof verticalPackSchema.safeParse>> {
  const generic = await loadVerticalPack('generic');
  return verticalPackSchema.safeParse({ ...generic, citations });
}

describe('citationCatalogue', () => {
  it('hvac_plumbing = general + home_services (11 hosts, no Bing/Apple)', async () => {
    const hosts = citationCatalogue(await assembled('hvac_plumbing')).map((x) => x.host);
    expect(hosts).toHaveLength(11);
    expect(hosts.slice(0, 6)).toEqual(['facebook.com', 'bbb.org', 'yellowpages.com', 'manta.com', 'foursquare.com', 'mapquest.com']);
    expect(hosts).toContain('angi.com');
  });

  it('dental = general + ADA (7 hosts) and never includes angi.com (RF3)', async () => {
    const hosts = citationCatalogue(await assembled('dental')).map((x) => x.host);
    expect(hosts).toHaveLength(7);
    expect(hosts).toContain('findadentist.ada.org');
    expect(hosts).not.toContain('angi.com');
  });

  it('a DB vertical with no own citations gets the general group only', async () => {
    const generic = toRows(await loadVerticalPack('generic')).row;
    const row: VerticalRow = { ...generic, id: 'vet', name: 'Veterinary', gbpCategories: ['Veterinarian'], gbpRelatedCategories: [], config: { audience_noun: 'pet owners' } };
    const area: BusinessAreaRow = { verticalId: 'vet', id: 'checkup', name: 'Checkup', aliases: [], status: 'reviewed', mergedInto: null, evidence: null, createdByAgencyId: null };
    expect(citationCatalogue(assemblePack(row, [area], generic)).map((x) => x.host)).toHaveLength(6);
  });

  it('is empty without directory_groups, and the first host wins across groups', () => {
    expect(citationCatalogue({ citations: { groups: ['general'], min_missing: 3 } })).toEqual([]);
    const one = { ...d('a.com'), label: 'first' };
    const out = citationCatalogue({ citations: { groups: ['general', 'home_services'], min_missing: 3, directory_groups: { general: [one], home_services: [d('a.com'), d('b.com')] } } });
    expect(out.map((x) => [x.host, x.label])).toEqual([['a.com', 'first'], ['b.com', 'b.com']]);
  });
});

describe('citations schema', () => {
  it('rejects banned hosts including subdomains (RF3)', async () => {
    for (const host of ['yelp.com', 'm.yelp.com']) {
      const r = await withCitations({ directory_groups: { general: [d(host)] }, groups: ['general'], min_missing: 3 });
      expect(r.success).toBe(false);
      expect(JSON.stringify(r.error?.issues)).toContain(`Directory ${host} is never allowed`);
    }
    expect(isBannedHost('www.zocdoc.com')).toBe(true);
    expect(isBannedHost('notyelp.com')).toBe(false);
    expect(onHost('a.b.com', 'b.com')).toBe(true);
  });

  it('rejects a catalogue above the maximum', async () => {
    const hosts = Array.from({ length: CITATION_CATALOGUE_MAX + 1 }, (_, i) => d(`h${i}.com`));
    const r = await withCitations({ directory_groups: { general: hosts }, groups: ['general'], min_missing: 3 });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain('<= 15');
    expect((await withCitations({ directory_groups: { general: hosts.slice(0, 15) }, groups: ['general'] })).success).toBe(true);
  });

  it('rejects a picked group missing from directory_groups', async () => {
    const r = await withCitations({ directory_groups: { general: [d('a.com')] }, groups: ['general', 'dental_health'] });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain('dental_health');
  });

  it('defaults to the general group and min_missing 3', async () => {
    const generic = await loadVerticalPack('hvac_plumbing');
    const { citations: _omit, ...rest } = generic;
    const r = verticalPackSchema.parse(rest);
    expect(r.citations).toEqual({ groups: ['general'], min_missing: 3 });
  });
});

describe('claim_url (18c-2)', () => {
  it('accepts an https claim_url and rejects http', async () => {
    const ok = await withCitations({ directory_groups: { general: [{ ...d('a.com'), claim_url: 'https://a.com/login' }] }, groups: ['general'], min_missing: 3 });
    expect(ok.success).toBe(true);
    const bad = await withCitations({ directory_groups: { general: [{ ...d('a.com'), claim_url: 'http://a.com/login' }] }, groups: ['general'], min_missing: 3 });
    expect(bad.success).toBe(false);
  });

  it('the catalogue carries claim_url for the 5 hosts and omits it elsewhere', async () => {
    const cat = citationCatalogue(await assembled('hvac_plumbing'));
    const claim = (h: string) => cat.find((x) => x.host === h)?.claim_url;
    expect(claim('facebook.com')).toBe('https://business.facebook.com/');
    expect(claim('angi.com')).toBe('https://office.angi.com/');
    expect(claim('homeadvisor.com')).toBe('https://pro.homeadvisor.com/pro/login');
    expect(claim('thumbtack.com')).toBe('https://www.thumbtack.com/login');
    expect(claim('bbb.org')).toBeUndefined();
    const dental = citationCatalogue(await assembled('dental'));
    expect(dental.find((x) => x.host === 'findadentist.ada.org')?.claim_url).toBe('https://www.ada.org/myada');
  });
});

describe('shipped packs (Phase 18c)', () => {
  it.each(['generic', 'hvac_plumbing', 'dental'])('%s carries version 8 scoring, citation_added 0.3, citation_gap and fix_citations', async (id) => {
    const p = await loadVerticalPack(id);
    expect(p.scoring.version).toBe(8);
    expect(p.type_weights.citation_added).toBe(0.3);
    expect(p.self_rules.find((r) => r.id === 'citation_gap')).toMatchObject({ weight: 0.6, playbook: 'fix_citations', params: { min_missing: 3 } });
    const pb = p.playbooks.find((x) => x.id === 'fix_citations');
    expect(pb).toMatchObject({ trigger: 'citation_gap', effort: 'L', impact: 'M', title: 'Fix your directory listings' });
    expect(pb?.template).toContain('{{directories}}');
  });

  it('only generic defines directory_groups', async () => {
    expect(Object.keys((await loadVerticalPack('generic')).citations.directory_groups ?? {})).toEqual(['general', 'home_services', 'dental_health']);
    expect((await loadVerticalPack('hvac_plumbing')).citations.directory_groups).toBeUndefined();
    expect((await loadVerticalPack('dental')).citations.directory_groups).toBeUndefined();
  });
});
