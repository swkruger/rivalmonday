import { type AccessContext, type AuditEvent, createAccessContext } from '@cs/core';
import { client } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const audit: AuditEvent[] = [];
const registry = createToolRegistry({ app: dbs.app, service: dbs.service }, { audit: { record: async (e) => void audit.push(e) } });
const ctx = (role: AccessContext['role'], scope: AccessContext['clientScope'], agencyId: string = IDS.agencyA) =>
  createAccessContext({ agencyId, userId: `u-${role}`, role, clientScope: scope, features: [] });
const admin = ctx('agency_admin', 'all');
const amAll = ctx('account_manager', 'all');
const amA1 = ctx('account_manager', [IDS.clientA1]);
const owner = ctx('client_owner', [IDS.clientA1]);
const input = {
  name: 'Comfort Air', verticalId: 'hvac_plumbing', services: ['ac_tune_up'], keywords: ['ac repair'], placeId: null,
  serviceArea: { center: { lat: 33.95, lng: -84.33 }, radiusKm: 15, zips: ['30338'] }, timezone: 'America/New_York',
};

beforeEach(async () => {
  audit.length = 0;
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('create_client', () => {
  it('creates a client for admins and unrestricted AMs, audited', async () => {
    const { clientId } = (await registry.invoke(admin, 'create_client', input)) as { clientId: string };
    const [row] = await dbs.owner.select().from(client).where(eq(client.id, clientId));
    expect(row).toMatchObject({ agencyId: IDS.agencyA, name: 'Comfort Air', services: ['ac_tune_up'], timezone: 'America/New_York', alertMode: 'after_am_check' });
    expect(audit.at(-1)).toMatchObject({ tool: 'create_client', outcome: 'ok' });
    await expect(registry.invoke(amAll, 'create_client', { ...input, name: 'Second' })).resolves.toBeTruthy();
  });

  it('refuses restricted AMs, client roles, unknown verticals and bad input', async () => {
    await expect(registry.invoke(amA1, 'create_client', input)).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(registry.invoke(owner, 'create_client', input)).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(registry.invoke(admin, 'create_client', { ...input, verticalId: 'bakery' })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(registry.invoke(admin, 'create_client', { ...input, services: ['nope'] })).rejects.toMatchObject({ code: 'invalid_input', message: expect.stringContaining('Unknown service') });
    await expect(registry.invoke(admin, 'create_client', { ...input, timezone: 'Mars/Base' })).rejects.toMatchObject({ code: 'invalid_input' });
  });
});

describe('update_client_profile', () => {
  it('patches only the given fields through RLS', async () => {
    await registry.invoke(amA1, 'update_client_profile', { clientId: IDS.clientA1, keywords: ['furnace repair'], serviceArea: input.serviceArea });
    const [row] = await dbs.owner.select().from(client).where(eq(client.id, IDS.clientA1));
    expect(row).toMatchObject({ name: 'A1 HVAC', keywords: ['furnace repair'], serviceArea: { radiusKm: 15, zips: ['30338'] } });
    const profile = (await registry.invoke(amA1, 'get_client_profile', { clientId: IDS.clientA1 })) as { serviceArea: { radiusKm: number } | null };
    expect(profile.serviceArea?.radiusKm).toBe(15);
  });

  it('refuses clients out of scope (Review Focus 1), client roles and invalid services', async () => {
    await expect(registry.invoke(amA1, 'update_client_profile', { clientId: IDS.clientA2, name: 'x' })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(ctx('agency_admin', 'all', IDS.agencyB), 'update_client_profile', { clientId: IDS.clientA1, name: 'x' })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(owner, 'update_client_profile', { clientId: IDS.clientA1, name: 'x' })).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(registry.invoke(admin, 'update_client_profile', { clientId: IDS.clientA1, services: ['root_canal'] })).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('drops an unknown legacy feature string on an unrelated patch, keeping valid ones', async () => {
    await dbs.owner.update(client).set({ features: ['dashboard', 'legacy_flag'] }).where(eq(client.id, IDS.clientA1));
    await registry.invoke(amA1, 'update_client_profile', { clientId: IDS.clientA1, name: 'A1 HVAC' });
    const [row] = await dbs.owner.select().from(client).where(eq(client.id, IDS.clientA1));
    expect(row!.features).toEqual(['dashboard']);
  });
});
