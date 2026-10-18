import type { MapsPlace } from '@cs/collectors';
import type { VerticalPack } from '@cs/verticals';
import { describe, expect, it } from 'vitest';
import { collapseSameListing, domainKey, haversineKm, phoneKey, possibleDuplicates, preselectVertical, toSetupLookup } from './lookup';

const pack = (id: string, categories: string[], related: string[] = []) => ({ id, discovery: { categories, related_categories: related } }) as unknown as VerticalPack;
const packs = [pack('hvac', ['HVAC contractor', 'Plumber'], ['Electrician']), pack('dental', ['Dentist'], ['Orthodontist', 'Plumber'])];

const place = (over: Partial<MapsPlace> = {}): MapsPlace => ({
  placeId: 'p1', cid: '9', title: 'Acme', domain: 'acme.com', url: 'https://acme.com', rank: 1, rating: 4.5, votes: 10, category: 'Plumber', address: '1 Main St, Austin, TX',
  lat: 30.1, lng: -97.7, city: 'Austin', phone: '555', ...over,
});

describe('preselectVertical', () => {
  it('matches category, then related, else null', () => {
    expect(preselectVertical(packs, ['dentist'])).toBe('dental');
    expect(preselectVertical(packs, ['Other', 'HVAC CONTRACTOR'])).toBe('hvac');
    expect(preselectVertical(packs, ['orthodontist'])).toBe('dental'); // related only
    expect(preselectVertical(packs, ['Plumber'])).toBe('hvac'); // primary beats an earlier-or-later related hit
    expect(preselectVertical(packs, ['Bakery'])).toBeNull();
    expect(preselectVertical(packs, [])).toBeNull();
  });
});

describe('toSetupLookup', () => {
  it('maps a place', () => {
    expect(toSetupLookup(place())).toEqual({ placeId: 'p1', cid: '9', title: 'Acme', address: '1 Main St, Austin, TX', city: 'Austin', category: 'Plumber', phone: '555', domain: 'acme.com', rating: 4.5, votes: 10, lat: 30.1, lng: -97.7 });
  });
  it('returns null without coordinates', () => {
    expect(toSetupLookup(place({ lat: null }))).toBeNull();
    expect(toSetupLookup(place({ lng: null }))).toBeNull();
  });
});

describe('collapseSameListing', () => {
  const r = (placeId: string, cid: string | null, isClaimed: boolean | null, tag = placeId) => ({ placeId, cid, isClaimed, tag });
  it('collapses by placeId and keeps the first', () => {
    expect(collapseSameListing([r('a', null, null, 'first'), r('b', null, null), r('a', null, null, 'second')]).map((x) => x.tag)).toEqual(['first', 'b']);
  });
  it('collapses by non-null cid; null cids never match', () => {
    expect(collapseSameListing([r('a', '1', null), r('b', '1', null), r('c', null, null), r('d', null, null)]).map((x) => x.placeId)).toEqual(['a', 'c', 'd']);
  });
  it("carries a twin's isClaimed=true over", () => {
    expect(collapseSameListing([r('a', null, false), r('a', null, true)])).toEqual([r('a', null, true)]);
    expect(collapseSameListing([r('a', null, null), r('a', null, false)])[0]!.isClaimed).toBeNull();
  });
});

describe('phoneKey / domainKey', () => {
  it('normalises phones; short numbers are null', () => {
    expect(phoneKey('+1817-286-3655')).toBe('8172863655');
    expect(phoneKey('(817) 286-3655')).toBe('8172863655');
    expect(phoneKey('555')).toBeNull();
    expect(phoneKey(null)).toBeNull();
  });
  it('normalises domains', () => {
    expect(domainKey(' WWW.Acme.com ')).toBe('acme.com');
    expect(domainKey('')).toBeNull();
    expect(domainKey(null)).toBeNull();
  });
});

describe('haversineKm', () => {
  it('known distance within 1%', () => {
    expect(haversineKm({ lat: 51.5074, lng: -0.1278 }, { lat: 48.8566, lng: 2.3522 })).toBeGreaterThan(343 * 0.99);
    expect(haversineKm({ lat: 51.5074, lng: -0.1278 }, { lat: 48.8566, lng: 2.3522 })).toBeLessThan(343 * 1.01);
  });
});

describe('possibleDuplicates', () => {
  const row = (o: Partial<{ phone: string | null; domain: string | null; lat: number | null; lng: number | null }> = {}) => ({ phone: null, domain: null, lat: 30, lng: -97, ...o });
  it('a shared phone flags regardless of format or distance', () => {
    expect(possibleDuplicates([row({ phone: '+1817-286-3655', lat: 30 }), row({ phone: '(817) 286 3655', lat: 40 }), row({ phone: '555-0100-999' })])).toEqual([true, true, false]);
  });
  it('same domain (www stripped) within 0.5 km flags', () => {
    expect(possibleDuplicates([row({ domain: 'www.a.com' }), row({ domain: 'a.com', lat: 30.002 })])).toEqual([true, true]);
  });
  it('chain locations more than 0.5 km apart are not flagged', () => {
    expect(possibleDuplicates([row({ domain: 'a.com' }), row({ domain: 'a.com', lat: 30.05 })])).toEqual([false, false]);
  });
  it('same domain with a missing coordinate is not flagged', () => {
    expect(possibleDuplicates([row({ domain: 'a.com' }), row({ domain: 'a.com', lat: null })])).toEqual([false, false]);
    expect(possibleDuplicates([row({ domain: 'a.com', lng: null }), row({ domain: 'a.com' })])).toEqual([false, false]);
  });
  it('distinct rows and null phone/domain never match', () => {
    expect(possibleDuplicates([row({ phone: '8172863655', domain: 'a.com' }), row({ phone: '8175790177', domain: 'b.com' }), row(), row()])).toEqual([false, false, false, false]);
  });
});
