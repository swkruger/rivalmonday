import { type AccessContext, type AuditEvent, createAccessContext } from '@cs/core';
import { claimDueSources, ensureSelfCompetitor } from '@cs/collectors';
import { agencyOnboarding, client, clientSetup, competitorSource, contact, plan } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnqueueJob, ToolDeps } from '../deps';
import { createToolRegistry } from '../registry';
import { getSetupState } from '../setup/state';

const STD_PLAN = { code: 'standard', version: 1, name: 'Standard', basePriceCents: 22900, includedSeats: 10, seatPriceCents: 9900, trialDays: 30, isCurrent: true, createdBy: 'test' };
const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const audit: AuditEvent[] = [];
const enqueue = vi.fn<EnqueueJob>(async () => {});
const registry = createToolRegistry({ app: dbs.app, service: dbs.service, enqueue }, { audit: { record: async (e) => void audit.push(e) } });
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
  await dbs.owner.insert(plan).values(STD_PLAN); // the seat cap needs a current plan (truncateAll wipes it)
});

describe('create_client', () => {
  it('create_client refuses radius 1 (service-area radius is 2-40 km)', async () => {
    await expect(registry.invoke(admin, 'create_client', { ...input, serviceArea: { ...input.serviceArea, radiusKm: 1 } })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(registry.invoke(admin, 'create_client', { ...input, serviceArea: { ...input.serviceArea, radiusKm: 41 } })).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('creates a client for admins and unrestricted AMs, audited', async () => {
    const { clientId } = (await registry.invoke(admin, 'create_client', input)) as { clientId: string };
    const [row] = await dbs.owner.select().from(client).where(eq(client.id, clientId));
    expect(row).toMatchObject({ agencyId: IDS.agencyA, name: 'Comfort Air', services: ['ac_tune_up'], timezone: 'America/New_York', alertMode: 'after_am_check' });
    expect(audit.at(-1)).toMatchObject({ tool: 'create_client', outcome: 'ok' });
    expect(row!.activatedAt).toBeInstanceOf(Date);
    const { clientId: pid } = (await registry.invoke(admin, 'create_client', { ...input, name: 'Pitch', status: 'prospect' })) as { clientId: string };
    const [p] = await dbs.owner.select().from(client).where(eq(client.id, pid));
    expect(p!.activatedAt).toBeNull();
    await expect(registry.invoke(amAll, 'create_client', { ...input, name: 'Second' })).resolves.toBeTruthy();
  });

  it('refuses restricted AMs, client roles, unknown verticals and bad input', async () => {
    await expect(registry.invoke(amA1, 'create_client', input)).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(registry.invoke(owner, 'create_client', input)).rejects.toMatchObject({ code: 'not_found' });
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
    await expect(registry.invoke(owner, 'update_client_profile', { clientId: IDS.clientA1, name: 'x' })).rejects.toMatchObject({ code: 'not_found' });
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

describe('update_client_profile askReviewAllowed', () => {
  it('askReviewAllowed admin-only', async () => {
    expect((await dbs.owner.select().from(client).where(eq(client.id, IDS.clientA1)))[0]!.askReviewAllowed).toBe(true);
    await registry.invoke(admin, 'update_client_profile', { clientId: IDS.clientA1, askReviewAllowed: false });
    expect((await dbs.owner.select().from(client).where(eq(client.id, IDS.clientA1)))[0]!.askReviewAllowed).toBe(false);
    await expect(registry.invoke(amAll, 'update_client_profile', { clientId: IDS.clientA1, askReviewAllowed: true })).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(registry.invoke(owner, 'update_client_profile', { clientId: IDS.clientA1, askReviewAllowed: true })).rejects.toMatchObject({ code: 'not_found' });
    expect((await dbs.owner.select().from(client).where(eq(client.id, IDS.clientA1)))[0]!.askReviewAllowed).toBe(false);
    // other profile edits by an AM stay allowed and leave the flag alone
    await registry.invoke(amAll, 'update_client_profile', { clientId: IDS.clientA1, name: 'Renamed' });
    expect((await dbs.owner.select().from(client).where(eq(client.id, IDS.clientA1)))[0]).toMatchObject({ name: 'Renamed', askReviewAllowed: false });
  });
});

describe('create_client sets agency_onboarding.first_client_at (R8)', () => {
  it('only once, prospects count, and a client after four steps completes onboarding', async () => {
    await dbs.owner.insert(agencyOnboarding).values({ agencyId: IDS.agencyA, source: 'open', profileDoneAt: new Date(), teamDoneAt: new Date(), planSkippedAt: new Date(), brandingDoneAt: new Date() });
    const row = async () => (await dbs.owner.select().from(agencyOnboarding).where(eq(agencyOnboarding.agencyId, IDS.agencyA)))[0]!;
    expect((await row()).firstClientAt).toBeNull();
    await registry.invoke(admin, 'create_client', { ...input, name: 'Pitch', status: 'prospect' });
    const first = (await row()).firstClientAt;
    expect(first).toBeInstanceOf(Date);
    expect((await row()).completedAt).toBeInstanceOf(Date);
    await registry.invoke(admin, 'create_client', { ...input, name: 'Second' });
    expect((await row()).firstClientAt).toEqual(first);
  });
  it('is a no-op when the agency has no onboarding row', async () => {
    await expect(registry.invoke(admin, 'create_client', input)).resolves.toBeTruthy();
  });
});

const LOOKUP = { placeId: 'ChIJlookup1', cid: '123', title: 'Lookup Heating & Air', address: '1 Main St, Atlanta, GA', city: 'Atlanta', category: 'HVAC contractor', phone: null, domain: null, rating: 4.6, votes: 80, lat: 33.7, lng: -84.4 };
const bare = { name: '', verticalId: 'hvac_plumbing', services: [], keywords: ['stale kw'], serviceArea: null, placeId: null };

describe('create_client with lookup (11a)', () => {
  beforeEach(() => enqueue.mockClear());

  it('create_client with lookup stores place, area, empty keywords and a pending setup row', async () => {
    const { clientId } = (await registry.invoke(admin, 'create_client', { ...bare, lookup: LOOKUP })) as { clientId: string };
    const [row] = await dbs.owner.select().from(client).where(eq(client.id, clientId));
    expect(row).toMatchObject({ name: 'Lookup Heating & Air', placeId: 'ChIJlookup1', keywords: [], serviceArea: { center: { lat: 33.7, lng: -84.4 }, radiusKm: 15, zips: [] } });
    const [setup] = await dbs.owner.select().from(clientSetup).where(eq(clientSetup.clientId, clientId));
    expect(setup).toMatchObject({ agencyId: IDS.agencyA, source: 'staff', lookup: LOOKUP, suggestions: { status: 'pending' } });
  });

  it('create_client with lookup enqueues setup-suggestions and does not start a search', async () => {
    const { clientId } = (await registry.invoke(admin, 'create_client', { ...bare, lookup: LOOKUP })) as { clientId: string };
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith('setup-suggestions', { clientId }, `setup-suggestions:${clientId}`);
  });

  it('keeps an explicit name and truncates a long lookup title to 120 chars', async () => {
    const a = (await registry.invoke(admin, 'create_client', { ...bare, name: 'My Name', lookup: LOOKUP })) as { clientId: string };
    expect((await dbs.owner.select().from(client).where(eq(client.id, a.clientId)))[0]!.name).toBe('My Name');
    const b = (await registry.invoke(admin, 'create_client', { ...bare, lookup: { ...LOOKUP, title: 'x'.repeat(150) } })) as { clientId: string };
    expect((await dbs.owner.select().from(client).where(eq(client.id, b.clientId)))[0]!.name).toHaveLength(120);
  });

  it('create_client without lookup creates a setup row with status none', async () => {
    const { clientId } = (await registry.invoke(admin, 'create_client', { ...bare, name: 'Plain' })) as { clientId: string };
    const [setup] = await dbs.owner.select().from(clientSetup).where(eq(clientSetup.clientId, clientId));
    expect(setup).toMatchObject({ lookup: null, suggestions: { status: 'none' }, source: 'staff' });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('create_client with lookup marks suggestions failed when the enqueue fails', async () => {
    enqueue.mockRejectedValueOnce(new Error('queue down'));
    const { clientId } = (await registry.invoke(admin, 'create_client', { ...bare, lookup: LOOKUP })) as { clientId: string };
    const [setup] = await dbs.owner.select().from(clientSetup).where(eq(clientSetup.clientId, clientId));
    expect(setup!.suggestions).toEqual({ status: 'failed' });
  });

  it('create_client still returns the client when the enqueue and the failed fallback both fail', async () => {
    // The client (and its seat) committed already: throwing now would make a retry create a duplicate billed client.
    const brokenService = new Proxy(dbs.service, {
      get(target, prop) {
        if (prop === 'update') return () => { throw new Error('db down'); };
        const v = Reflect.get(target, prop) as unknown;
        return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v;
      },
    });
    const failing = vi.fn<EnqueueJob>(async () => { throw new Error('queue down'); });
    const reg = createToolRegistry({ app: dbs.app, service: brokenService, enqueue: failing }, { audit: { record: async () => {} } });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { clientId } = (await reg.invoke(admin, 'create_client', { ...bare, lookup: LOOKUP })) as { clientId: string };
      expect((await dbs.owner.select().from(client).where(eq(client.id, clientId)))).toHaveLength(1);
      expect(failing).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls.map((c) => String(c[0])).join(' ')).not.toContain(LOOKUP.title);
    } finally {
      warn.mockRestore();
    }
  });
});

describe('create_client details and geocoding (Phase 16 O13)', () => {
  const ADDRESS = { line1: '12 Peachtree St', city: 'Atlanta', region: 'GA', postalCode: '30303', country: 'US' as const };
  const details = { phone: '(404) 555-0100', address: ADDRESS, contact: { name: 'Pat Owner', email: 'Pat.Owner@Example.com' } };
  const noArea = { name: 'Comfort Air', verticalId: 'hvac_plumbing', services: [], keywords: [], placeId: null, serviceArea: null };
  const geocode = vi.fn<NonNullable<ToolDeps['geocode']>>(async () => ({ lat: 33.75, lng: -84.39, label: '12 Peachtree St', precision: 'address' as const }));
  const geoRegistry = createToolRegistry({ app: dbs.app, service: dbs.service, enqueue, geocode }, { audit: { record: async () => {} } });
  beforeEach(() => { geocode.mockReset(); geocode.mockResolvedValue({ lat: 33.75, lng: -84.39, label: '12 Peachtree St', precision: 'address' }); });

  it('create_client stores phone, address and owner contact', async () => {
    const { clientId } = (await geoRegistry.invoke(admin, 'create_client', { ...noArea, details })) as { clientId: string };
    const [row] = await dbs.owner.select().from(client).where(eq(client.id, clientId));
    expect(row).toMatchObject({ phone: '(404) 555-0100', address: ADDRESS });
    const contacts = await dbs.owner.select().from(contact).where(eq(contact.clientId, clientId));
    expect(contacts).toEqual([expect.objectContaining({ email: 'pat.owner@example.com', name: 'Pat Owner', role: 'client_owner', active: false, agencyId: IDS.agencyA })]);
    const [setup] = await dbs.owner.select().from(clientSetup).where(eq(clientSetup.clientId, clientId));
    expect(setup!.invitedContactId).toBeNull();
  });

  it('create_client without lookup geocodes the address', async () => {
    const { clientId } = (await geoRegistry.invoke(admin, 'create_client', { ...noArea, details })) as { clientId: string };
    expect(geocode).toHaveBeenCalledTimes(1);
    expect(geocode.mock.calls[0]![0]).toEqual({ line1: '12 Peachtree St', city: 'Atlanta', region: 'GA', postalCode: '30303' });
    expect(geocode.mock.calls[0]![1]).toEqual({ agencyId: IDS.agencyA, clientId: null });
    const [row] = await dbs.owner.select().from(client).where(eq(client.id, clientId));
    expect(row!.serviceArea).toEqual({ center: { lat: 33.75, lng: -84.39 }, radiusKm: 16.1, zips: [] });
    const [setup] = await dbs.owner.select().from(clientSetup).where(eq(clientSetup.clientId, clientId));
    expect(setup!.locationSource).toBe('geocoded');
  });

  it('create_client geocodes "City or ZIP" when there is no street address', async () => {
    await geoRegistry.invoke(admin, 'create_client', { ...noArea, details: { phone: details.phone, locality: ' 30303 ', contact: details.contact } });
    expect(geocode.mock.calls[0]![0]).toEqual({ text: '30303' });
  });

  it('geocode miss returns needs_location (state)', async () => {
    geocode.mockResolvedValue(null);
    const { clientId } = (await geoRegistry.invoke(admin, 'create_client', { ...noArea, keywords: ['ac repair'], details })) as { clientId: string };
    const [row] = await dbs.owner.select().from(client).where(eq(client.id, clientId));
    expect(row!.serviceArea).toBeNull();
    const [setup] = await dbs.owner.select().from(clientSetup).where(eq(clientSetup.clientId, clientId));
    expect(setup!.locationSource).toBe('geocoded');
    expect((await getSetupState(dbs.service, clientId)).steps.profile).toBe('todo'); // no centre: Task 7 shows needs_location
    // No geocoder at all (no STADIA_API_KEY) reads the same as a miss.
    const { clientId: c2 } = (await registry.invoke(admin, 'create_client', { ...noArea, name: 'No Key', details })) as { clientId: string };
    expect((await dbs.owner.select().from(client).where(eq(client.id, c2)))[0]!.serviceArea).toBeNull();
  });

  it('legacy create_client without details unchanged', async () => {
    const { clientId } = (await geoRegistry.invoke(admin, 'create_client', input)) as { clientId: string };
    expect(geocode).not.toHaveBeenCalled();
    const [row] = await dbs.owner.select().from(client).where(eq(client.id, clientId));
    expect(row).toMatchObject({ phone: null, address: null, serviceArea: input.serviceArea });
    const [setup] = await dbs.owner.select().from(clientSetup).where(eq(clientSetup.clientId, clientId));
    expect(setup!.locationSource).toBeNull();
    expect(await dbs.owner.select().from(contact).where(eq(contact.clientId, clientId))).toEqual([]);
  });

  it('create_client geocodes outside the transaction', async () => {
    geocode.mockRejectedValueOnce(new Error('stadia down'));
    await expect(geoRegistry.invoke(admin, 'create_client', { ...noArea, name: 'Half Written', details })).rejects.toThrow();
    expect(await dbs.owner.select().from(client).where(eq(client.name, 'Half Written'))).toEqual([]);
    expect(await dbs.owner.select().from(contact)).toEqual([]);
  });

  it('create_client rejects a bad phone or ZIP', async () => {
    await expect(geoRegistry.invoke(admin, 'create_client', { ...noArea, details: { ...details, phone: '12' } })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(geoRegistry.invoke(admin, 'create_client', { ...noArea, details: { ...details, address: { ...ADDRESS, postalCode: 'abc' } } })).rejects.toMatchObject({ code: 'invalid_input' });
  });
});
