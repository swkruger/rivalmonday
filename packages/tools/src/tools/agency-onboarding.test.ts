import { createHash } from 'node:crypto';
import { type AccessContext, createAccessContext } from '@cs/core';
import { agency, agencyOnboarding, agencyProfile, catalogRows } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createCatalog } from '@cs/verticals';
import { eq, sql } from 'drizzle-orm';
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
const status = () => registry.invoke(admin, 'get_onboarding_status', {}) as Promise<{ steps: Record<string, string>; dismissed: boolean; completed: boolean; redirected: boolean; source: string }>;
const mark = (step: string, action: string, c = admin) => registry.invoke(c, 'mark_onboarding_step', { step, action });

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.insert(agencyOnboarding).values({ agencyId: IDS.agencyA, source: 'open' });
  await dbs.owner.insert(agencyProfile).values({ agencyId: IDS.agencyA });
});

describe('get_onboarding_status', () => {
  it('shows every step open at the start, for admin and account manager', async () => {
    const expected = { steps: { profile: 'open', team: 'open', plan: 'open', branding: 'open', first_client: 'open' }, dismissed: false, completed: false, redirected: false, source: 'open' };
    expect(await status()).toEqual(expected);
    expect(await registry.invoke(am, 'get_onboarding_status', {})).toEqual(expected);
  });
  it('refuses client users (404)', async () => {
    await expect(registry.invoke(owner, 'get_onboarding_status', {})).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(viewer, 'get_onboarding_status', {})).rejects.toMatchObject({ code: 'not_found' });
  });
  it('an agency with no onboarding row (admin CLI, seeds) reads as completed legacy, all done, redirected (R25)', async () => {
    const r = await registry.invoke(ctx('agency_admin', IDS.agencyB), 'get_onboarding_status', {});
    expect(r).toEqual({ steps: { profile: 'done', team: 'done', plan: 'done', branding: 'done', first_client: 'done' }, dismissed: false, completed: true, redirected: true, source: 'legacy' });
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
    expect(await status()).toMatchObject({ redirected: true });
  });
  it('dismiss / mark / redirect on a missing row insert it as completed legacy (R25)', async () => {
    const b = ctx('agency_admin', IDS.agencyB);
    const rowB = async () => (await dbs.owner.select().from(agencyOnboarding).where(eq(agencyOnboarding.agencyId, IDS.agencyB)))[0]!;
    await registry.invoke(b, 'dismiss_onboarding_checklist', {});
    const r = await rowB();
    expect(r).toMatchObject({ source: 'legacy' });
    expect(r.completedAt).toBeInstanceOf(Date);
    expect(r.redirectedAt).toBeInstanceOf(Date);
    expect(await registry.invoke(b, 'get_onboarding_status', {})).toMatchObject({ completed: true, redirected: true, source: 'legacy' });
    await dbs.owner.delete(agencyOnboarding).where(eq(agencyOnboarding.agencyId, IDS.agencyB));
    await registry.invoke(b, 'mark_onboarding_step', { step: 'team', action: 'skip' });
    expect((await rowB()).completedAt).toBeInstanceOf(Date);
    await dbs.owner.delete(agencyOnboarding).where(eq(agencyOnboarding.agencyId, IDS.agencyB));
    await registry.invoke(b, 'mark_onboarding_redirected', {});
    expect((await rowB()).completedAt).toBeInstanceOf(Date);
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
    await bad({ website: 'javascript:alert(1)' });
    await bad({ website: 'ftp://acme.co' });
    await bad({ billingSameAsPostal: false, billingCountry: 'USA' });
    await bad({ billingSameAsPostal: false, billingCountry: 'U' });
    await expect(registry.invoke(admin, 'update_agency_profile', { ...PROFILE, phone: '+1 404-555-0100', postalCode: '30338-1234' })).resolves.toBeTruthy();
    // the ZIP rule only applies to US addresses
    await expect(registry.invoke(admin, 'update_agency_profile', { ...PROFILE, country: 'CA', postalCode: 'M5V 2T6' })).resolves.toBeTruthy();
    // address and billing are optional
    await expect(registry.invoke(admin, 'update_agency_profile', { name: 'Min', contactName: 'A', contactEmail: 'a@b.co', phone: '404-555-0100', timezone: 'America/Chicago', verticals: [] })).resolves.toBeTruthy();
  });
  it('accepts UTC (offered by the time zone dropdown)', async () => {
    await registry.invoke(admin, 'update_agency_profile', { ...PROFILE, timezone: 'UTC' });
    const [p] = await dbs.owner.select().from(agencyProfile).where(eq(agencyProfile.agencyId, IDS.agencyA));
    expect(p!.timezone).toBe('UTC');
  });
  it('accepts a DB-only vertical id, resolves a merged id to its target, refuses an unknown id', async () => {
    await dbs.owner.execute(sql`
      insert into vertical (id, name, status, gbp_categories, gbp_related_categories, config)
      select 'distillery', 'Distillery', 'reviewed', gbp_categories, gbp_related_categories, config from vertical where id = 'dental'`);
    await dbs.owner.execute(sql`insert into business_area (vertical_id, id, name, status) values ('distillery', 'spirits', 'Spirits', 'reviewed')`);
    await dbs.owner.execute(sql`
      insert into vertical (id, name, status, merged_into, gbp_categories, gbp_related_categories, config)
      select 'old_dental', 'Old dental', 'merged', 'dental', gbp_categories, gbp_related_categories, config from vertical where id = 'dental'`);
    const reg = createToolRegistry({ app: dbs.app, service: dbs.service, catalog: createCatalog(() => catalogRows(dbs.service)) }, { audit: { record: async () => undefined } });
    await reg.invoke(admin, 'update_agency_profile', { ...PROFILE, verticals: ['distillery', 'old_dental', 'dental'] });
    const [p] = await dbs.owner.select().from(agencyProfile).where(eq(agencyProfile.agencyId, IDS.agencyA));
    expect(p!.verticals).toEqual(['distillery', 'dental']);
    await expect(reg.invoke(admin, 'update_agency_profile', { ...PROFILE, verticals: ['nope'] })).rejects.toMatchObject({ code: 'invalid_input', message: 'Unknown business type.' });
  });
  it('upper-cases billingCountry, keeps http(s) websites and dedupes verticals', async () => {
    await registry.invoke(admin, 'update_agency_profile', { ...PROFILE, website: 'http://acme.co', billingSameAsPostal: false, billingCountry: 'ca', billingPostalCode: 'M5V 2T6', verticals: ['dental', 'dental', 'hvac_plumbing'] });
    const [p] = await dbs.owner.select().from(agencyProfile).where(eq(agencyProfile.agencyId, IDS.agencyA));
    expect(p).toMatchObject({ website: 'http://acme.co', billingCountry: 'CA', verticals: ['dental', 'hvac_plumbing'] });
  });
});

describe('upload_agency_logo', () => {
  const objects = new Map<string, { body: Uint8Array; contentType: string }>();
  const evidenceStore = {
    get: async (k: string) => objects.get(k)?.body ?? null,
    // Mirrors the real store: an existing key without `overwrite` throws ObjectExistsError (code 'object_exists').
    put: async (k: string, body: Uint8Array, contentType: string, opts?: { overwrite?: boolean }) => {
      if (!opts?.overwrite && objects.has(k)) throw Object.assign(new Error('object already exists'), { code: 'object_exists' });
      objects.set(k, { body, contentType });
    },
  };
  const APP = 'https://app.example';
  const logoRegistry = createToolRegistry({ app: dbs.app, service: dbs.service, evidenceStore, appUrl: APP }, { audit: { record: async () => undefined } });
  // A PNG signature + arbitrary tail is enough here: decoding/normalising is the web route's job (normalizeLogo).
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5]);
  const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
  const input = (b = PNG, h = sha(b)) => ({ png: Buffer.from(b).toString('base64'), sha256: h });
  const branding = async () => (await dbs.owner.select({ b: agency.branding }).from(agency).where(eq(agency.id, IDS.agencyA)))[0]!.b;
  beforeEach(() => objects.clear());

  it('logo re-upload of the same bytes succeeds', async () => {
    await logoRegistry.invoke(admin, 'upload_agency_logo', input());
    const again = await logoRegistry.invoke(admin, 'upload_agency_logo', input());
    expect(again).toEqual({ logoUrl: `${APP}/files/logo/${IDS.agencyA}/${sha(PNG)}.png` });
  });

  it('stores logos/<agency>/<sha>.png as image/png and sets branding.logoUrl, keeping other branding keys', async () => {
    await dbs.owner.update(agency).set({ branding: { primary: '#112233', logoUrl: 'https://old.example/l.png' } }).where(eq(agency.id, IDS.agencyA));
    const h = sha(PNG);
    const r = await logoRegistry.invoke(admin, 'upload_agency_logo', input());
    const logoUrl = `${APP}/files/logo/${IDS.agencyA}/${h}.png`;
    expect(r).toEqual({ logoUrl });
    expect(objects.get(`logos/${IDS.agencyA}/${h}.png`)).toEqual({ body: PNG, contentType: 'image/png' });
    expect(await branding()).toEqual({ primary: '#112233', logoUrl });
    expect((await onboarding()).brandingDoneAt).toBeNull(); // the wizard marks the step itself
  });

  it('works when the agency has no branding yet', async () => {
    await dbs.owner.update(agency).set({ branding: null }).where(eq(agency.id, IDS.agencyA));
    const { logoUrl } = (await logoRegistry.invoke(admin, 'upload_agency_logo', input())) as { logoUrl: string };
    expect(await branding()).toEqual({ logoUrl });
  });

  it('refuses a sha256 that does not match the bytes, non-PNG bytes and malformed input (invalid_input); nothing is stored', async () => {
    await expect(logoRegistry.invoke(admin, 'upload_agency_logo', input(PNG, 'a'.repeat(64)))).rejects.toMatchObject({ code: 'invalid_input' });
    const gif = new TextEncoder().encode('GIF89a-not-a-png');
    await expect(logoRegistry.invoke(admin, 'upload_agency_logo', input(gif))).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(logoRegistry.invoke(admin, 'upload_agency_logo', { png: Buffer.from(PNG).toString('base64'), sha256: '../../etc' })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(logoRegistry.invoke(admin, 'upload_agency_logo', { png: 'not base64!', sha256: sha(PNG) })).rejects.toMatchObject({ code: 'invalid_input' });
    expect(objects.size).toBe(0);
  });

  it('is agency-admin only: account manager permission_denied, client roles not_found', async () => {
    await expect(logoRegistry.invoke(am, 'upload_agency_logo', input())).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(logoRegistry.invoke(owner, 'upload_agency_logo', input())).rejects.toMatchObject({ code: 'not_found' });
    await expect(logoRegistry.invoke(viewer, 'upload_agency_logo', input())).rejects.toMatchObject({ code: 'not_found' });
    expect(objects.size).toBe(0);
  });

  it('fails closed (internal) without a store or APP_URL', async () => {
    await expect(registry.invoke(admin, 'upload_agency_logo', input())).rejects.toMatchObject({ code: 'internal' });
    const noUrl = createToolRegistry({ app: dbs.app, service: dbs.service, evidenceStore }, { audit: { record: async () => undefined } });
    await expect(noUrl.invoke(admin, 'upload_agency_logo', input())).rejects.toMatchObject({ code: 'internal' });
    expect(objects.size).toBe(0);
  });
});
