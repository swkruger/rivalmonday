import type { MapsPlace } from '@cs/collectors';
import { type AccessContext, type CallScope, createAccessContext } from '@cs/core';
import { vendorCall } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { FIND_BUSINESS_DAILY_CAP } from '../setup/lookup';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const mk = (role: AccessContext['role'], scope: AccessContext['clientScope'] = 'all') => createAccessContext({ agencyId: IDS.agencyA, userId: `u-${role}`, role, clientScope: scope, features: [] });
const admin = mk('agency_admin');
const OP = '/serp/google/maps/live/advanced';

const place = (i: number, over: Partial<MapsPlace> = {}): MapsPlace => ({
  placeId: `p${i}`, cid: `c${i}`, title: `Biz ${i}`, domain: null, url: null, rank: i, rating: 4, votes: 5, category: 'Dentist', address: 'x', lat: 1, lng: 2, city: 'Austin', phone: null, ...over,
});
let calls: { q: { keyword: string; locationName: string }; scope: CallScope }[];
let results: MapsPlace[];
let registry: ReturnType<typeof createToolRegistry>;
const find = (ctx: AccessContext = admin) => registry.invoke(ctx, 'find_business', { name: 'Smile', location: 'Austin, TX' }) as Promise<{ places: (MapsPlace & { suggestedVerticalId: string | null })[] }>;
const fails = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { return e as { code?: string; message: string; userFacing?: boolean }; }
  throw new Error('expected a failure');
};
const seed = (n: number, over: Partial<typeof vendorCall.$inferInsert> = {}) =>
  dbs.owner.insert(vendorCall).values(Array.from({ length: n }, () => ({ agencyId: IDS.agencyA, clientId: null, vendor: 'dataforseo', operation: OP, units: 1, latencyMs: 1, ok: true, ...over })));

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  calls = [];
  results = [place(1)];
  registry = createToolRegistry(
    { app: dbs.app, service: dbs.service, setupLookup: async (q, scope) => { calls.push({ q, scope }); return results; } },
    { audit: { record: async () => {} } },
  );
});

describe('find_business', () => {
  it('refuses client-scoped staff', async () => {
    expect((await fails(find(mk('account_manager', [IDS.clientA1])))).code).toBe('permission_denied');
    expect(calls).toHaveLength(0);
  });

  it('refuses (rate_limited, user-facing copy) once 30 calls exist today', async () => {
    await seed(FIND_BUSINESS_DAILY_CAP);
    const e = await fails(find());
    expect(e.code).toBe('rate_limited');
    expect(e.message).toBe("You've reached today's limit of 30 business searches. Try again tomorrow or enter the details by hand.");
    expect(e.userFacing).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('allows the 30th call and ignores yesterday, other operations and other agencies', async () => {
    await seed(FIND_BUSINESS_DAILY_CAP - 1);
    await seed(5, { createdAt: new Date(Date.now() - 2 * 86_400_000) });
    await seed(5, { operation: '/other' });
    await seed(5, { agencyId: IDS.agencyB });
    await expect(find()).resolves.toBeTruthy();
  });

  it('client-scoped maps calls do not count toward the cap', async () => {
    await seed(FIND_BUSINESS_DAILY_CAP, { clientId: IDS.clientA1 });
    await expect(find()).resolves.toBeTruthy();
  });

  it('ledgers with clientId null', async () => {
    await find();
    expect(calls).toEqual([{ q: { keyword: 'Smile Austin, TX', locationName: 'United States' }, scope: { agencyId: IDS.agencyA, clientId: null } }]);
  });

  it('hides closed places and caps at 5', async () => {
    results = [place(1, { closed: true }), place(2, { lat: null }), ...[3, 4, 5, 6, 7, 8, 9].map((i) => place(i))];
    const { places } = await find();
    expect(places.map((p) => p.placeId)).toEqual(['p3', 'p4', 'p5', 'p6', 'p7']);
    expect(places[0]!.suggestedVerticalId).toBe('dental');
  });

  it('refuses with a user-facing message when no lookup is configured', async () => {
    registry = createToolRegistry({ app: dbs.app, service: dbs.service }, { audit: { record: async () => {} } });
    const e = await fails(find());
    expect(e.code).toBe('internal');
    expect(e.message).toBe('Business search is not configured');
    expect(e.userFacing).toBe(true);
  });
});
