import { describe, expect, it } from 'vitest';
import { filterCandidates } from './filters';
import { area, candidates, pack, self } from './test/helpers';

const run = () => filterCandidates(candidates(), { pack, area, self: { ...self, placeId: null } });
const reasonOf = (name: string) => run().hidden.find((h) => h.candidate.name === name)?.reason;

describe('filterCandidates', () => {
  it('drops Dollar General as wrong_category', () => expect(reasonOf('Dollar General')).toBe('wrong_category'));
  it('drops equine hospital', () => expect(reasonOf('Reata Equine Hospital')).toBe('wrong_category'));
  it('drops vet, urologist and property manager', () => {
    for (const n of ['Godley Animal Clinic', 'Vasectomy Pro', 'Charger Properties']) expect(reasonOf(n)).toBe('wrong_category');
  });
  it('drops the client itself by phone', () => expect(reasonOf('Michael A McCoy DDS')).toBe('self'));
  it('drops the client itself by placeId', () => {
    const r = filterCandidates(candidates(), { pack, area, self: { placeId: 'p-self', cid: null, domain: null, phone: null } });
    expect(r.hidden.find((h) => h.candidate.name === 'Michael A McCoy DDS')?.reason).toBe('self');
  });
  it('keeps orthodontist as related (0.5)', () => {
    expect(run().kept.find((k) => k.name === 'Granbury Orthodontics')?.categoryMatch).toBe('related');
  });
  it('treats an additional category match as related when the main one is not listed', () => {
    const c = { ...candidates()[0]!, placeId: 'x', category: 'Medical clinic', additionalCategories: ['dentist'] };
    expect(filterCandidates([c], { pack, area, self }).kept[0]?.categoryMatch).toBe('related');
  });
  it('keeps Granbury Dental Center and Archstone as main', () => {
    const k = run().kept;
    expect(k.find((c) => c.name === 'Granbury Dental Center')?.categoryMatch).toBe('main');
    expect(k.find((c) => c.name.startsWith('Archstone'))?.categoryMatch).toBe('main');
  });
  it('drops far, closed and thin candidates; distance is computed', () => {
    expect(reasonOf('Weatherford Dental')).toBe('outside_area');
    expect(reasonOf('Old Smiles Dental')).toBe('closed');
    expect(reasonOf('Thin Dental')).toBe('thin');
    expect(run().kept.find((c) => c.name === 'Granbury Dental Center')?.distanceKm).toBeGreaterThan(5);
  });
  it('dedupes by placeId and merges ranks', () => {
    const a = candidates().find((c) => c.name === 'Granbury Dental Center')!;
    const r = filterCandidates([a, { ...a, ranks: [3] }], { pack, area, self });
    expect(r.kept).toHaveLength(1);
    expect(r.kept[0]!.ranks).toEqual([...a.ranks, 3]);
  });
});
