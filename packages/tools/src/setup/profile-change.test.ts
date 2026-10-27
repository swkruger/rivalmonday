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

  it('keywords plus a centre start the first search without a place id (P5)', async () => {
    await dbs.owner.update(client).set({ pausedAt: new Date() }).where(eq(client.id, IDS.clientA1));
    const out = await applyClientProfileChange(ctx('agency_admin', 'all'), deps, IDS.clientA1, { keywords: ['ac repair'], serviceArea: AREA });
    expect(out.search).toEqual({ refused: 'service_paused' }); // reached the start (a missing-profile refusal would read 'missing_profile')
  });

  it('returns search null when the change did not complete the search inputs, and runs recheck inside the tx', async () => {
    const recheck = vi.fn(async () => {});
    const out = await applyClientProfileChange(ctx('agency_admin', 'all'), deps, IDS.clientA1, { name: 'x' }, undefined, recheck);
    expect(out.search).toBeNull();
    expect(recheck).toHaveBeenCalledTimes(1);
    const [row] = await dbs.owner.select().from(clientSetup).where(eq(clientSetup.clientId, IDS.clientA1));
    expect(row!.lastChangedBy).toBeNull();
  });

  it('enqueues rank-map-refresh after commit only when the centre or radius changes', async () => {
    const admin = ctx('agency_admin', 'all');
    const refreshes = () => enqueue.mock.calls.filter((c) => c[0] === 'rank-map-refresh');
    await applyClientProfileChange(admin, deps, IDS.clientA1, { serviceArea: AREA });
    expect(refreshes()).toEqual([['rank-map-refresh', { clientId: IDS.clientA1 }, `rank-map:${IDS.clientA1}`]]);
    await applyClientProfileChange(admin, deps, IDS.clientA1, { serviceArea: { ...AREA, zips: ['30022'] }, name: 'Same area' });
    expect(refreshes()).toHaveLength(1);
    await applyClientProfileChange(admin, deps, IDS.clientA1, { serviceArea: { ...AREA, center: { lat: 34, lng: -84.33 } } });
    expect(refreshes()).toHaveLength(2);
    await applyClientProfileChange(admin, deps, IDS.clientA1, { serviceArea: null });
    expect(refreshes()).toHaveLength(2);
  });

  it('a failed map-refresh enqueue is logged, not thrown, and the change still commits', async () => {
    enqueue.mockRejectedValueOnce(new Error('queue down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = await applyClientProfileChange(ctx('agency_admin', 'all'), deps, IDS.clientA1, { serviceArea: AREA });
    expect(out.client.serviceArea).toMatchObject({ radiusKm: 15 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[rank-map] refresh enqueue'));
    warn.mockRestore();
  });
});
