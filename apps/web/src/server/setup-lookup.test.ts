import type { Db } from '@cs/db';
import { describe, expect, it, vi } from 'vitest';
import { fixtureSetupLookup, setupLookupFor } from './setup-lookup';

const service = {} as Db;
const scope = { agencyId: 'a', clientId: null };
const q = { keyword: 'x', locationName: 'United States' };
const real = { DATAFORSEO_LOGIN: 'l', DATAFORSEO_PASSWORD: 'p' } as unknown as NodeJS.ProcessEnv;

describe('setupLookupFor', () => {
  it('uses the fixture (three places plus one same-listing twin) under the fake flag even with credentials', async () => {
    const f = setupLookupFor('dev', service, { fake: true, processEnv: real })!;
    expect(f).toBe(fixtureSetupLookup);
    const places = await f(q, scope);
    expect(places).toHaveLength(4);
    expect(new Set(places.map((p) => p.placeId))).toHaveProperty('size', 3);
  });
  it('uses the fixture in demo and test (R5: never a paid call)', () => {
    expect(setupLookupFor('demo', service, { fake: false, processEnv: real })).toBe(fixtureSetupLookup);
    expect(setupLookupFor('test', service, { fake: false, processEnv: real })).toBe(fixtureSetupLookup);
  });
  it('is absent in dev without DataForSEO credentials, present with them', () => {
    expect(setupLookupFor('dev', service, { fake: false, processEnv: {} as NodeJS.ProcessEnv })).toBeUndefined();
    const f = setupLookupFor('dev', service, { fake: false, processEnv: real });
    expect(f).toBeTypeOf('function');
    expect(f).not.toBe(fixtureSetupLookup);
  });
});
