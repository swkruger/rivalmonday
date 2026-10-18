import type { MapsPlace } from '@cs/collectors';
import type { VerticalPack } from '@cs/verticals';
import { describe, expect, it } from 'vitest';
import { preselectVertical, toSetupLookup } from './lookup';

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
