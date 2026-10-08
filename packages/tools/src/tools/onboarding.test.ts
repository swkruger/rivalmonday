import { type AccessContext, type AuditEvent, createAccessContext } from '@cs/core';
import { claimDueSources, ensureSelfCompetitor } from '@cs/collectors';
import { client, competitorSource } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq, sql } from 'drizzle-orm';
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

  it('creates active clients by default, prospects on request, and returns status on the profile', async () => {
    const { clientId } = (await registry.invoke(admin, 'create_client', { name: 'Plain HVAC', verticalId: 'hvac_plumbing', services: [], keywords: [], serviceArea: null, placeId: null })) as { clientId: string };
    expect(await registry.invoke(admin, 'get_client_profile', { clientId })).toMatchObject({ status: 'active' });
    const prospect = (await registry.invoke(admin, 'create_client', { ...input, name: 'Pitch HVAC', status: 'prospect' })) as { clientId: string };
    expect(await registry.invoke(admin, 'get_client_profile', { clientId: prospect.clientId })).toMatchObject({ status: 'prospect' });
    await expect(registry.invoke(admin, 'create_client', { ...input, status: 'archived' })).rejects.toMatchObject({ code: 'invalid_input' });
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

  // Final review: the self business was found by place id, so a corrected or cleared place id must unlink it.
  describe('own-business link on a place id change', () => {
    const selfOf = async () => (await dbs.owner.select({ s: client.selfCompetitorId }).from(client).where(eq(client.id, IDS.clientA1)))[0]?.s ?? null;
    const linkSelf = async () => {
      await dbs.owner.update(client).set({ placeId: 'place-a1-wrong' }).where(eq(client.id, IDS.clientA1));
      const r = (await ensureSelfCompetitor(dbs.service, IDS.clientA1)) as { competitorId: string };
      expect(await selfOf()).toBe(r.competitorId);
      return r.competitorId;
    };

    it('unlinks the self competitor when the place id changes, so its gbp/reviews are no longer claimed', async () => {
      const selfId = await linkSelf();
      await registry.invoke(amA1, 'update_client_profile', { clientId: IDS.clientA1, placeId: 'place-a1-right' });
      expect(await selfOf()).toBeNull();
      expect((await dbs.owner.select({ p: client.placeId }).from(client).where(eq(client.id, IDS.clientA1)))[0]?.p).toBe('place-a1-right');
      // Nobody else uses the old row as self business or tracks it: its paid sources stay due but unclaimed.
      await dbs.service.update(competitorSource).set({ nextDueAt: sql`now() - interval '1 minute'` }).where(eq(competitorSource.competitorId, selfId));
      expect((await claimDueSources(dbs.service, 1000)).filter((c) => c.competitorId === selfId)).toEqual([]);
    });

    it('unlinks when the place id is cleared', async () => {
      await linkSelf();
      await registry.invoke(amA1, 'update_client_profile', { clientId: IDS.clientA1, placeId: null });
      expect(await selfOf()).toBeNull();
    });

    it('keeps the link when the place id is unchanged or not part of the patch', async () => {
      const selfId = await linkSelf();
      await registry.invoke(amA1, 'update_client_profile', { clientId: IDS.clientA1, placeId: 'place-a1-wrong', name: 'A1 HVAC Co' });
      await registry.invoke(amA1, 'update_client_profile', { clientId: IDS.clientA1, keywords: ['furnace repair'] });
      expect(await selfOf()).toBe(selfId);
    });
  });
});
