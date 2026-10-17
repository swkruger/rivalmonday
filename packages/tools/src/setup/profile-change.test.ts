import { type AccessContext, createAccessContext } from '@cs/core';
import { client, clientSetup } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnqueueJob, ToolDeps } from '../deps';
import { applyClientProfileChange } from './profile-change';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const enqueue = vi.fn<EnqueueJob>(async () => {});
const deps = { app: dbs.app, service: dbs.service, enqueue } as unknown as ToolDeps;
const ctx = (role: AccessContext['role'], scope: AccessContext['clientScope']) =>
  createAccessContext({ agencyId: IDS.agencyA, userId: `u-${role}`, role, clientScope: scope, features: [] });
const USER = '00000000-0000-4000-8000-0000000000f1';
const AREA = { center: { lat: 33.95, lng: -84.33 }, radiusKm: 15, zips: [] };

beforeEach(async () => {
  enqueue.mockClear();
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.insert(clientSetup).values({ clientId: IDS.clientA1, agencyId: IDS.agencyA });
});

describe('applyClientProfileChange', () => {
  it('records last_changed_* for a client-role actor', async () => {
    const c = ctx('client_owner', [IDS.clientA1]);
    await applyClientProfileChange(c, deps, IDS.clientA1, { name: 'Renamed HVAC' }, { userId: USER, role: 'client_owner' });
    const [row] = await dbs.owner.select().from(clientSetup).where(eq(clientSetup.clientId, IDS.clientA1));
    expect(row).toMatchObject({ lastChangedBy: USER, lastChangedRole: 'client_owner' });
    expect(row!.lastChangedAt).toBeInstanceOf(Date);
    const [cl] = await dbs.owner.select().from(client).where(eq(client.id, IDS.clientA1));
    expect(cl!.name).toBe('Renamed HVAC');
  });

  it('returns the SearchStart refusal when the auto start is refused', async () => {
    await dbs.owner.update(client).set({ pausedAt: new Date() }).where(eq(client.id, IDS.clientA1));
    const out = await applyClientProfileChange(ctx('agency_admin', 'all'), deps, IDS.clientA1, { keywords: ['ac repair'], serviceArea: AREA, placeId: 'ChIJa1hvacplace1' });
    expect(out.search).toEqual({ refused: 'service_paused' });
    expect(out.client.keywords).toEqual(['ac repair']);
  });

  it('returns search null when the change did not complete the search inputs, and runs recheck inside the tx', async () => {
    const recheck = vi.fn(async () => {});
    const out = await applyClientProfileChange(ctx('agency_admin', 'all'), deps, IDS.clientA1, { name: 'x' }, undefined, recheck);
    expect(out.search).toBeNull();
    expect(recheck).toHaveBeenCalledTimes(1);
    const [row] = await dbs.owner.select().from(clientSetup).where(eq(clientSetup.clientId, IDS.clientA1));
    expect(row!.lastChangedBy).toBeNull();
  });
});
