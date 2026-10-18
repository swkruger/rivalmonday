import { describe, expect, it, vi } from 'vitest';
import {
  GENERIC_VERTICAL_ID,
  assemblePack,
  createCatalog,
  splitPack,
  type BusinessAreaRow,
  type VerticalRow,
} from './catalog';
import { loadVerticalPack } from './loader';
import type { VerticalPack } from './schema';

function toRows(pack: VerticalPack): { row: VerticalRow; areas: BusinessAreaRow[] } {
  const s = splitPack(pack);
  return {
    row: { ...s.row, status: 'reviewed', mergedInto: null, draftEvidence: null, createdByAgencyId: null },
    areas: s.areas.map((a) => ({ ...a, verticalId: pack.id, status: 'reviewed', mergedInto: null, evidence: null, createdByAgencyId: null })),
  };
}

// assemblePack orders services by name (spec), YAML order is hand-curated: normalise the expected side.
const byName = (p: VerticalPack): VerticalPack => ({ ...p, services: [...p.services].sort((a, b) => a.name.localeCompare(b.name)) });

describe('splitPack / assemblePack', () => {
  it.each(['hvac_plumbing', 'dental', 'generic'])('round-trips the %s YAML pack (services ordered by name)', async (id) => {
    const generic = toRows(await loadVerticalPack('generic'));
    const { row, areas } = toRows(await loadVerticalPack(id));
    expect(assemblePack(row, areas, generic.row)).toEqual(byName(await loadVerticalPack(id)));
  });

  it('splitPack keeps the full config minus the columns', async () => {
    const { row } = toRows(await loadVerticalPack('dental'));
    expect(row.config).not.toHaveProperty('id');
    expect(row.config).not.toHaveProperty('services');
    expect(row.config.discovery).not.toHaveProperty('categories');
    expect(row.config.discovery).toHaveProperty('shortlist');
    expect(row.gbpCategories).toContain('Dental clinic');
  });

  it('merges a text-only config with generic: type_weights from generic, audience_noun from the row', async () => {
    const generic = toRows(await loadVerticalPack('generic')).row;
    const row: VerticalRow = {
      ...generic, id: 'vet', name: 'Veterinary', version: 1, gbpCategories: ['Veterinarian'], gbpRelatedCategories: [],
      config: { audience_noun: 'pet owners' },
    };
    const area: BusinessAreaRow = { verticalId: 'vet', id: 'checkup', name: 'Checkup', aliases: [], status: 'unreviewed', mergedInto: null, evidence: null, createdByAgencyId: null };
    const merged: BusinessAreaRow = { ...area, id: 'old', name: 'Old', status: 'merged', mergedInto: 'checkup' };
    const pack = assemblePack(row, [merged, area], generic);
    expect(pack.type_weights).toEqual((await loadVerticalPack('generic')).type_weights);
    expect(pack.audience_noun).toBe('pet owners');
    expect(pack.id).toBe('vet');
    expect(pack.services.map((s) => s.id)).toEqual(['checkup']);
    expect(pack.discovery.categories).toEqual(['Veterinarian']);
    expect(pack.discovery.shortlist).toBe(20);
  });

  it('deep merge replaces arrays and merges objects', async () => {
    const generic = toRows(await loadVerticalPack('generic')).row;
    const row: VerticalRow = { ...generic, id: 'x', name: 'X', gbpCategories: ['X'], config: { themes: [{ id: 't', name: 'T', description: 'D' }], scoring: { routing: { alert: 80 } } } };
    const area: BusinessAreaRow = { verticalId: 'x', id: 'a', name: 'A', aliases: [], status: 'reviewed', mergedInto: null, evidence: null, createdByAgencyId: null };
    const pack = assemblePack(row, [area], generic);
    expect(pack.themes).toEqual([{ id: 't', name: 'T', description: 'D' }]);
    expect(pack.scoring.routing).toEqual({ alert: 80, brief: 40 });
    expect(pack.scoring.size.default).toBe(0.6);
  });
});

async function fixture() {
  const generic = toRows(await loadVerticalPack('generic'));
  const dental = toRows(await loadVerticalPack('dental'));
  const hvac = toRows(await loadVerticalPack('hvac_plumbing'));
  const merged: VerticalRow = { ...hvac.row, id: 'old_hvac', name: 'Old HVAC', status: 'merged', mergedInto: 'hvac_plumbing' };
  const bad: VerticalRow = { ...dental.row, id: 'broken', name: 'Broken', config: { type_weights: { price_change: 'lots' } } };
  const verticals = [generic.row, dental.row, hvac.row, merged, bad];
  const areas = [...generic.areas, ...dental.areas, ...hvac.areas];
  return { verticals, areas };
}

describe('createCatalog', () => {
  it('lists non-generic, non-merged, valid verticals sorted by name; warns once per invalid row', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cat = createCatalog(fixture, { ttlMs: 0 });
    const list = await cat.list();
    expect(list.map((v) => v.id)).toEqual(['dental', 'hvac_plumbing']);
    expect(list[0]!.services.length).toBeGreaterThan(5);
    await cat.list();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('follows merged chains, rejects generic and invalid rows', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cat = createCatalog(fixture);
    expect((await cat.packs('old_hvac')).id).toBe('hvac_plumbing');
    expect(await cat.resolveId('old_hvac')).toBe('hvac_plumbing');
    expect(await cat.resolveId('dental')).toBe('dental');
    expect(await cat.resolveId('nope')).toBeNull();
    expect(await cat.resolveId(GENERIC_VERTICAL_ID)).toBeNull();
    await expect(cat.packs('generic')).rejects.toThrow('Unknown vertical: generic');
    await expect(cat.packs('broken')).rejects.toThrow('Unknown vertical: broken');
    await expect(cat.packs('nope')).rejects.toThrow('Unknown vertical: nope');
    warn.mockRestore();
  });

  it('caps merge chains at depth 5', async () => {
    const f = await fixture();
    const base = f.verticals[1]!;
    const chain = Array.from({ length: 7 }, (_, i): VerticalRow => ({ ...base, id: `c${i}`, status: 'merged', mergedInto: i === 6 ? 'dental' : `c${i + 1}` }));
    const cat = createCatalog(async () => ({ verticals: [...f.verticals, ...chain], areas: f.areas }));
    expect(await cat.resolveId('c0')).toBeNull();
    expect(await cat.resolveId('c3')).toBe('dental');
  });

  it('caches within the TTL, refetches after invalidate or expiry, and retries a failed fetch', async () => {
    let t = 0;
    const source = vi.fn(fixture);
    const cat = createCatalog(source, { ttlMs: 1000, now: () => t });
    await Promise.all([cat.list(), cat.list(), cat.packs('dental')]);
    expect(source).toHaveBeenCalledTimes(1);
    t = 999;
    await cat.list();
    expect(source).toHaveBeenCalledTimes(1);
    t = 1000;
    await cat.list();
    expect(source).toHaveBeenCalledTimes(2);
    cat.invalidate();
    await cat.list();
    expect(source).toHaveBeenCalledTimes(3);

    const flaky = vi.fn().mockRejectedValueOnce(new Error('db down')).mockImplementation(fixture);
    const cat2 = createCatalog(flaky);
    await expect(cat2.list()).rejects.toThrow('db down');
    expect((await cat2.list()).length).toBe(2);
    expect(flaky).toHaveBeenCalledTimes(2);
  });

  it('reloads once on a miss when the snapshot is older than the miss threshold (cross-process create)', async () => {
    let t = 0;
    const f = await fixture();
    const extra: VerticalRow = { ...f.verticals[1]!, id: 'newv', name: 'Newv' };
    const extraAreas = f.areas.filter((a) => a.verticalId === 'dental').map((a) => ({ ...a, verticalId: 'newv' }));
    let created = false;
    const source = vi.fn(async () => ({ verticals: created ? [...f.verticals, extra] : f.verticals, areas: created ? [...f.areas, ...extraAreas] : f.areas }));
    const cat = createCatalog(source, { ttlMs: 60_000, missRefreshMs: 1000, now: () => t });
    await cat.list();
    created = true;
    expect(await cat.resolveId('newv')).toBeNull(); // snapshot is fresh: no reload
    expect(source).toHaveBeenCalledTimes(1);
    t = 1000;
    expect(await cat.resolveId('newv')).toBe('newv');
    expect(source).toHaveBeenCalledTimes(2);
    t = 2000;
    expect((await cat.packs('newv')).id).toBe('newv'); // found in the snapshot, no reload
    expect(source).toHaveBeenCalledTimes(2);
  });

  it('a truly unknown id reloads at most once per threshold window, shared across concurrent misses', async () => {
    let t = 0;
    const source = vi.fn(fixture);
    const cat = createCatalog(source, { ttlMs: 60_000, missRefreshMs: 1000, now: () => t });
    await cat.list();
    t = 1500;
    await Promise.all([cat.resolveId('nope'), cat.resolveId('nope'), cat.packs('nope').catch(() => null)]);
    expect(source).toHaveBeenCalledTimes(2);
    await expect(cat.packs('nope')).rejects.toThrow('Unknown vertical: nope');
    expect(source).toHaveBeenCalledTimes(2);
    t = 2600;
    expect(await cat.resolveId('nope')).toBeNull();
    expect(source).toHaveBeenCalledTimes(3);
  });
});
