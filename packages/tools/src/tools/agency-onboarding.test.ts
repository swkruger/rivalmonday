import { type AccessContext, createAccessContext } from '@cs/core';
import { agency, agencyOnboarding, agencyProfile } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const registry = createToolRegistry({ app: dbs.app, service: dbs.service }, { audit: { record: async () => undefined } });
const ctx = (role: AccessContext['role'], agencyId: string = IDS.agencyA) =>
  createAccessContext({ agencyId, userId: `u-${role}`, role, clientScope: role.startsWith('client') ? [IDS.clientA1] : 'all', features: [] });
const admin = ctx('agency_admin');
const am = ctx('account_manager');
const owner = ctx('client_owner');
const viewer = ctx('client_viewer');

const PROFILE = {
  name: 'Acme Marketing', contactName: 'Pat Owner', contactEmail: 'pat@acme.co', phone: '(404) 555-0100', website: 'https://acme.co',
  line1: '1 Main St', city: 'Atlanta', region: 'GA', postalCode: '30338', country: 'US', timezone: 'America/New_York', verticals: ['hvac_plumbing'],
  billingEmail: 'bill@acme.co', taxId: '12-3456789',
};
const onboarding = async () => (await dbs.owner.select().from(agencyOnboarding).where(eq(agencyOnboarding.agencyId, IDS.agencyA)))[0]!;
const status = () => registry.invoke(admin, 'get_onboarding_status', {}) as Promise<{ steps: Record<string, string>; dismissed: boolean; completed: boolean; source: string }>;
const mark = (step: string, action: string, c = admin) => registry.invoke(c, 'mark_onboarding_step', { step, action });

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.insert(agencyOnboarding).values({ agencyId: IDS.agencyA, source: 'open' });
  await dbs.owner.insert(agencyProfile).values({ agencyId: IDS.agencyA });
});

describe('get_onboarding_status', () => {
  it('shows every step open at the start, for admin and account manager', async () => {
    const expected = { steps: { profile: 'open', team: 'open', plan: 'open', branding: 'open', first_client: 'open' }, dismissed: false, completed: false, source: 'open' };
    expect(await status()).toEqual(expected);
    expect(await registry.invoke(am, 'get_onboarding_status', {})).toEqual(expected);
  });
  it('refuses client users (404)', async () => {
    await expect(registry.invoke(owner, 'get_onboarding_status', {})).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(viewer, 'get_onboarding_status', {})).rejects.toMatchObject({ code: 'not_found' });
  });
  it('an agency with no onboarding row reads as all open / legacy', async () => {
    const r = (await registry.invoke(ctx('agency_admin', IDS.agencyB), 'get_onboarding_status', {})) as { source: string; steps: Record<string, string> };
    expect(r.source).toBe('legacy');
    expect(r.steps.profile).toBe('open');
  });
});

describe('mark_onboarding_step', () => {
  it('done / skip set the step state; done after skip clears the skip', async () => {
    await mark('team', 'skip');
    expect((await status()).steps.team).toBe('skipped');
    await mark('team', 'done');
    expect((await status()).steps.team).toBe('done');
    expect((await onboarding()).teamSkippedAt).toBeNull();
    await mark('team', 'done'); // idempotent
    expect((await status()).steps.team).toBe('done');
  });
  it('is admin-only: account manager permission_denied, client not_found, bad step invalid_input', async () => {
    await expect(mark('team', 'done', am)).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(mark('team', 'done', owner)).rejects.toMatchObject({ code: 'not_found' });
    await expect(mark('nope', 'done')).rejects.toMatchObject({ code: 'invalid_input' });
  });
  it('completes when all four are done/skipped AND a client exists', async () => {
    await dbs.owner.update(agencyOnboarding).set({ firstClientAt: new Date() }).where(eq(agencyOnboarding.agencyId, IDS.agencyA));
    await mark('profile', 'done'); await mark('team', 'skip'); await mark('plan', 'skip');
    expect((await status()).completed).toBe(false);
    await mark('branding', 'done');
    expect(await status()).toMatchObject({ completed: true });
    expect((await onboarding()).completedAt).toBeInstanceOf(Date);
  });
  it('completes when all four are done/skipped AND the checklist is dismissed', async () => {
    for (const s of ['profile', 'team', 'plan']) await mark(s, 'done');
    await registry.invoke(admin, 'dismiss_onboarding_checklist', {});
    expect((await status()).completed).toBe(false);
    await mark('branding', 'skip');
    expect(await status()).toMatchObject({ completed: true, dismissed: true });
  });
  it('three steps + a client is not complete', async () => {
    await dbs.owner.update(agencyOnboarding).set({ firstClientAt: new Date() }).where(eq(agencyOnboarding.agencyId, IDS.agencyA));
    for (const s of ['profile', 'team', 'plan']) await mark(s, 'done');
    expect((await status()).completed).toBe(false);
  });
});

describe('dismiss_onboarding_checklist / mark_onboarding_redirected', () => {
  it('dismiss is admin-only and idempotent', async () => {
    await expect(registry.invoke(am, 'dismiss_onboarding_checklist', {})).rejects.toMatchObject({ code: 'permission_denied' });
    await registry.invoke(admin, 'dismiss_onboarding_checklist', {});
    const first = (await onboarding()).dismissedAt;
    expect(first).toBeInstanceOf(Date);
    await registry.invoke(admin, 'dismiss_onboarding_checklist', {});
    expect((await onboarding()).dismissedAt).toEqual(first);
  });
  it('redirected sets redirected_at once; admin only', async () => {
    await expect(registry.invoke(am, 'mark_onboarding_redirected', {})).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(registry.invoke(owner, 'mark_onboarding_redirected', {})).rejects.toMatchObject({ code: 'not_found' });
    await registry.invoke(admin, 'mark_onboarding_redirected', {});
    const first = (await onboarding()).redirectedAt;
    expect(first).toBeInstanceOf(Date);
    await registry.invoke(admin, 'mark_onboarding_redirected', {});
    expect((await onboarding()).redirectedAt).toEqual(first);
  });
});

describe('get_agency_profile', () => {
  it('admin gets billing + tax; account manager does not; clients are refused', async () => {
    await registry.invoke(admin, 'update_agency_profile', PROFILE);
    const a = (await registry.invoke(admin, 'get_agency_profile', {})) as Record<string, unknown>;
    expect(a).toMatchObject({ name: 'Acme Marketing', contactEmail: 'pat@acme.co', billingEmail: 'bill@acme.co', taxId: '12-3456789' });
    const m = (await registry.invoke(am, 'get_agency_profile', {})) as Record<string, unknown>;
    expect(m).toMatchObject({ name: 'Acme Marketing', contactEmail: 'pat@acme.co' });
    for (const k of Object.keys(m)) expect(k, k).not.toMatch(/^billing|^taxId$/);
    await expect(registry.invoke(owner, 'get_agency_profile', {})).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('update_agency_profile', () => {
  it('writes agency.name + profile, marks the profile step done, and mirrors postal into billing', async () => {
    await mark('profile', 'skip');
    await registry.invoke(admin, 'update_agency_profile', { ...PROFILE, billingSameAsPostal: true });
    const [a] = await dbs.owner.select().from(agency).where(eq(agency.id, IDS.agencyA));
    expect(a!.name).toBe('Acme Marketing');
    const [p] = await dbs.owner.select().from(agencyProfile).where(eq(agencyProfile.agencyId, IDS.agencyA));
    expect(p).toMatchObject({ contactName: 'Pat Owner', phone: '(404) 555-0100', billingSameAsPostal: true, billingLine1: '1 Main St', billingCity: 'Atlanta', billingPostalCode: '30338', billingCountry: 'US', verticals: ['hvac_plumbing'] });
    const o = await onboarding();
    expect(o.profileDoneAt).toBeInstanceOf(Date);
    expect(o.profileSkippedAt).toBeNull();
  });
  it('keeps a separate billing address when not same as postal', async () => {
    await registry.invoke(admin, 'update_agency_profile', { ...PROFILE, billingSameAsPostal: false, billingLine1: '9 Bill Rd', billingCity: 'Macon', billingRegion: 'GA', billingPostalCode: '31201', billingCountry: 'US' });
    const [p] = await dbs.owner.select().from(agencyProfile).where(eq(agencyProfile.agencyId, IDS.agencyA));
    expect(p).toMatchObject({ billingLine1: '9 Bill Rd', billingCity: 'Macon', line1: '1 Main St' });
  });
  it('refuses non-admins', async () => {
    await expect(registry.invoke(am, 'update_agency_profile', PROFILE)).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(registry.invoke(owner, 'update_agency_profile', PROFILE)).rejects.toMatchObject({ code: 'not_found' });
  });
  it('validates name, contact fields, phone, ZIP, timezone, verticals, website', async () => {
    const bad = (patch: Record<string, unknown>) => expect(registry.invoke(admin, 'update_agency_profile', { ...PROFILE, ...patch })).rejects.toMatchObject({ code: 'invalid_input' });
    await bad({ name: '' });
    await bad({ name: 'x'.repeat(121) });
    await bad({ contactName: '' });
    await bad({ contactEmail: 'nope' });
    await bad({ phone: '' });
    await bad({ phone: '12345' });
    await bad({ postalCode: '3033' });
    await bad({ timezone: 'Mars/Base' });
    await bad({ verticals: ['bakery'] });
    await bad({ website: 'not a url' });
    await expect(registry.invoke(admin, 'update_agency_profile', { ...PROFILE, phone: '+1 404-555-0100', postalCode: '30338-1234' })).resolves.toBeTruthy();
    // the ZIP rule only applies to US addresses
    await expect(registry.invoke(admin, 'update_agency_profile', { ...PROFILE, country: 'CA', postalCode: 'M5V 2T6' })).resolves.toBeTruthy();
    // address and billing are optional
    await expect(registry.invoke(admin, 'update_agency_profile', { name: 'Min', contactName: 'A', contactEmail: 'a@b.co', phone: '404-555-0100', timezone: 'America/Chicago', verticals: [] })).resolves.toBeTruthy();
  });
});
