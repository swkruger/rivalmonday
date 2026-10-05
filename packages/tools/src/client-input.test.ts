import { loadVerticalPack } from '@cs/verticals';
import { describe, expect, it } from 'vitest';
import { type ClientInput, cleanClientInput, clientInputProblems } from './client-input';

const pack = await loadVerticalPack('hvac_plumbing');
const ok: ClientInput = {
  name: 'Comfort Air', services: ['ac_tune_up'], keywords: ['ac repair', 'hvac'], placeId: null, features: [],
  serviceArea: { center: { lat: 33.95, lng: -84.33 }, radiusKm: 15, zips: ['30338'], towns: ['Dunwoody'] },
};

describe('client input', () => {
  it('accepts a valid profile and trims/dedupes it', () => {
    const c = cleanClientInput({ ...ok, name: '  Comfort Air ', keywords: [' AC repair', 'ac repair', 'hvac', ''] });
    expect(c.name).toBe('Comfort Air');
    expect(c.keywords).toEqual(['AC repair', 'hvac']);
    expect(clientInputProblems(c, pack)).toEqual([]);
  });

  it('reports every problem in one pass', () => {
    const problems = clientInputProblems(
      { ...ok, name: '', services: ['not_a_service'], keywords: ['a', 'b2', 'c3', 'd4', 'e5', 'f6'], placeId: 'bad id!',
        serviceArea: { center: { lat: 91, lng: 0 }, radiusKm: 0, zips: ['1234'], towns: [] } },
      pack,
    );
    expect(problems).toEqual(expect.arrayContaining([
      'Name is required (up to 120 characters)', 'Unknown service: not_a_service', 'Use at most 5 keywords',
      'Keywords must be 2–60 characters', 'Google place id looks wrong', 'Latitude must be between -90 and 90',
      'Radius must be 1–80 km', 'ZIP codes must be 5 digits: 1234',
    ]));
  });

  it('allows no service area and no keywords at creation', () => {
    expect(clientInputProblems({ ...ok, serviceArea: null, keywords: [] }, pack)).toEqual([]);
  });
});
