import type { MapsPlace } from '@cs/collectors';
import type { SetupLookup } from '@cs/db';
import { describe, expect, it } from 'vitest';
import { buildSnapshot, snapshotFacts, validateSummary } from './preview';

const self: SetupLookup = { placeId: 'me', cid: null, title: 'Smith Dental', address: null, city: 'Austin', category: 'Dentist', phone: null, domain: null, rating: 4.6, votes: 12, lat: 30, lng: -97 };
const place = (over: Partial<MapsPlace>): MapsPlace => ({ placeId: 'x', cid: null, title: 'X', domain: null, url: null, rank: 1, rating: 4, votes: 10, category: null, address: null, lat: 30.01, lng: -97, ...over });

describe('buildSnapshot', () => {
  it('excludes self and sorts by distance', () => {
    const s = buildSnapshot(self, [place({ placeId: 'far', title: 'Far Dental', lat: 30.1 }), place({ placeId: 'me', title: 'Smith Dental', lat: 30 }), place({ placeId: 'near', title: 'Near Dental', lat: 30.01 }), place({ placeId: 'nocoord', lat: null })]);
    expect(s?.nearby.map((b) => b.name)).toEqual(['Near Dental', 'Far Dental']);
    expect(s?.nearby[0]?.distanceKm).toBe(1.1);
    expect(s?.self).toEqual({ name: 'Smith Dental', rating: 4.6, votes: 12 });
    expect(s?.category).toBe('Dentist');
    expect(s?.summary).toBeNull();
  });
  it('keeps the nearest five and returns null with none usable', () => {
    const many = Array.from({ length: 8 }, (_, i) => place({ placeId: `p${i}`, title: `B${i}`, lat: 30 + (i + 1) / 100 }));
    expect(buildSnapshot(self, many)?.nearby).toHaveLength(5);
    expect(buildSnapshot(self, [place({ placeId: 'me' }), place({ lat: null })])).toBeNull();
  });
});

describe('snapshotFacts', () => {
  it('states review rank, rating rank and the closest competitor', () => {
    const facts = snapshotFacts({
      self: { name: 'Smith Dental', rating: 4.6, votes: 12 }, category: 'Dentist',
      nearby: [{ name: 'Near Dental', rating: 4.8, votes: 40, distanceKm: 1.1 }, { name: 'Far Dental', rating: 4.1, votes: 5, distanceKm: 9.8 }],
    });
    expect(facts).toEqual([
      'You rank 2 of 3 for review count among you and the nearby dentist businesses that show one.',
      'You rank 2 of 3 for Google rating among you and the nearby dentist businesses that show one.',
      'The closest competitor is Near Dental, 1.1 km away.',
    ]);
  });
  it('skips the review and rating facts when the business has no votes or rating', () => {
    const facts = snapshotFacts({ self: { name: 'A', rating: null, votes: null }, category: '', nearby: [{ name: 'B', rating: 4, votes: 3, distanceKm: 2 }] });
    expect(facts).toEqual(['The closest competitor is B, 2.0 km away.']);
  });
  it('ranks only against competitors that have the value and keeps acronym casing', () => {
    const facts = snapshotFacts({
      self: { name: 'A', rating: 4.5, votes: 10 }, category: 'HVAC',
      nearby: [{ name: 'B', rating: null, votes: null, distanceKm: 1 }, { name: 'C', rating: 4.9, votes: 50, distanceKm: 2 }],
    });
    expect(facts[0]).toBe('You rank 2 of 2 for review count among you and the nearby HVAC businesses that show one.');
    expect(facts[1]).toBe('You rank 2 of 2 for Google rating among you and the nearby HVAC businesses that show one.');
  });
});

describe('validateSummary', () => {
  const snap = {
    self: { name: 'Smith Dental', rating: 4.6, votes: 12 },
    nearby: [
      { name: 'Near Dental', rating: 4.8, votes: 40, distanceKm: 1.1 },
      { name: 'Far Dental', rating: 4, votes: 5, distanceKm: 9.8 },
    ],
  };
  it('passes a clean summary, trimmed', () => {
    expect(validateSummary(' Smith Dental has 12 reviews at 4.6, while Near Dental has 40 at 4.8 and sits 1.1 km away. ', snap)).toMatch(/^Smith Dental has 12/);
  });
  it('passes 4.6 / 12 / rounded forms', () => {
    expect(validateSummary('Your rating is 4.6 (about 5) from 12 reviews; Far Dental has 4.0.', snap)).not.toBeNull();
  });
  it('fails an unknown number', () => expect(validateSummary('You have 13 reviews.', snap)).toBeNull());
  it('fails an unknown multi-word name', () => expect(validateSummary('Bright Smiles Clinic has 12 reviews.', snap)).toBeNull());
  it('fails deny-listed words and long text', () => {
    expect(validateSummary('You are the best with 12 reviews.', snap)).toBeNull();
    expect(validateSummary('We guarantee 12 reviews.', snap)).toBeNull();
    expect(validateSummary('a'.repeat(601), snap)).toBeNull();
  });
});
