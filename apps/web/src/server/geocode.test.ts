import type { Db } from '@cs/db';
import { describe, expect, it } from 'vitest';
import { fixtureGeocode, geocodeFor } from './geocode';

const service = {} as Db;
const scope = { agencyId: 'a', clientId: null };

describe('geocodeFor', () => {
  it('uses the fixture under the fake flag, in demo and in test', () => {
    expect(geocodeFor('dev', service, { fake: true, apiKey: 'k' })).toBe(fixtureGeocode);
    expect(geocodeFor('demo', service, { fake: false, apiKey: 'k' })).toBe(fixtureGeocode);
    expect(geocodeFor('test', service, { fake: false })).toBe(fixtureGeocode);
  });
  it('is absent without a key and present with one', () => {
    expect(geocodeFor('dev', service, { fake: false })).toBeUndefined();
    expect(geocodeFor('dev', service, { fake: false, apiKey: 'k' })).toBeTypeOf('function');
  });
  it('fixture answers Austin for a ZIP or a city and null for nowhere', async () => {
    expect((await fixtureGeocode({ postalCode: '78664' }, scope))?.label).toBe('Austin, TX, USA');
    expect((await fixtureGeocode({ city: 'Round Rock', region: 'TX' }, scope))?.lat).toBeCloseTo(30.2672);
    expect(await fixtureGeocode({ text: 'nowhere' }, scope)).toBeNull();
    expect(await fixtureGeocode({}, scope)).toBeNull();
  });
});
