import { type AccessContext, createAccessContext } from '@cs/core';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { plan } from '@cs/db';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeGateway } from '@cs/billing';

vi.mock('@cs/billing', async (orig) => ({ ...(await orig<typeof import('@cs/billing')>()), syncSeats: vi.fn(async () => { throw new Error('db down'); }) }));
const { createToolRegistry } = await import('../registry');

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const registry = createToolRegistry({ app: dbs.app, service: dbs.service, billing: fakeGateway() }, { audit: { record: async () => {} } });
const admin: AccessContext = createAccessContext({ agencyId: IDS.agencyA, userId: 'u', role: 'agency_admin', clientScope: 'all', features: [] });

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.insert(plan).values({ code: 'standard', version: 1, name: 'Standard', basePriceCents: 22900, includedSeats: 10, seatPriceCents: 9900, trialDays: 30, isCurrent: true, createdBy: 'test' });
});

describe('a syncSeats rejection after commit', () => {
  it('does not fail create_client or convert_prospect', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = (await registry.invoke(admin, 'create_client', { name: 'Z', verticalId: 'hvac_plumbing', services: [], keywords: [], serviceArea: null, placeId: null })) as { clientId: string };
    expect(c.clientId).toBeTruthy();
    const p = (await registry.invoke(admin, 'create_client', { name: 'P', verticalId: 'hvac_plumbing', services: [], keywords: [], serviceArea: null, placeId: null, status: 'prospect' })) as { clientId: string };
    await expect(registry.invoke(admin, 'convert_prospect', { clientId: p.clientId })).resolves.toEqual({ clientId: p.clientId });
    expect(spy).toHaveBeenCalledWith('[billing] post-commit seat sync failed', { agencyId: IDS.agencyA }, 'Error');
    spy.mockRestore();
  });
});
