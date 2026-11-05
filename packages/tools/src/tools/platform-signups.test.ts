import { type AccessContext, createAccessContext } from '@cs/core';
import { agency, agencyBilling, agencyOnboarding, agencyProfile, client, competitor, platformAdmin, platformAuditLog, platformSetting } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import { signupsPaused } from '../access/signup';
import { pilotMode } from '../waitlist/settings';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const ctxOf = (userId: string) => createAccessContext({ agencyId: IDS.agencyA, userId, role: 'agency_admin', clientScope: 'all', features: [] });
const owner = ctxOf('op');
const staff = ctxOf('staff');
const viewer = ctxOf('viewer');
const admin = ctxOf('admin');
let registry: ReturnType<typeof createToolRegistry>;
const call = (ctx: AccessContext, name: string, input: unknown = {}) => registry.invoke(ctx, name, input);
const fails = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { return e as { code?: string; message: string }; }
  throw new Error('expected a failure');
};

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  for (const u of ['op', 'staff', 'viewer', 'admin']) await seedUser(dbs.owner, u, `${u}@example.com`);
  await seedTenancy(dbs.owner);
  await dbs.owner.insert(platformAdmin).values([
    { userId: 'staff', role: 'staff', createdBy: 'test' },
    { userId: 'viewer', role: 'viewer', createdBy: 'test' },
  ]);
  registry = createToolRegistry({ app: dbs.app, service: dbs.service, platformAdmins: ['op@example.com'] }, { audit: { record: async () => {} } });
});

describe('role minimums', () => {
  it('only owners pause; staff and agency admins are refused', async () => {
    for (const ctx of [viewer, staff, admin]) expect((await fails(call(ctx, 'set_signups_paused', { paused: true }))).code).toBe('permission_denied');
    expect(await signupsPaused(dbs.service)).toBe(false);
    expect(await dbs.owner.select().from(platformAuditLog)).toEqual([]);
  });

  it('viewers read the switch and the funnel; agency admins cannot', async () => {
    expect(await call(viewer, 'get_signups_paused', {})).toEqual({ paused: false });
    await call(viewer, 'get_signup_funnel', { days: 30 });
    expect((await fails(call(admin, 'get_signups_paused', {}))).code).toBe('permission_denied');
    expect((await fails(call(admin, 'get_signup_funnel', { days: 30 }))).code).toBe('permission_denied');
  });
});

describe('set_signups_paused', () => {
  it('stores the switch under the signups_paused key and audits each change', async () => {
    expect(await call(owner, 'set_signups_paused', { paused: true })).toEqual({ paused: true });
    expect(await signupsPaused(dbs.service)).toBe(true);
    const [row] = await dbs.owner.select().from(platformSetting).where(eq(platformSetting.key, 'signups_paused'));
    expect(row!.value).toEqual({ paused: true });
    expect(await call(viewer, 'get_signups_paused', {})).toEqual({ paused: true });
    await call(owner, 'set_signups_paused', { paused: false });
    expect(await signupsPaused(dbs.service)).toBe(false);
    const audits = await dbs.owner.select().from(platformAuditLog);
    expect(audits.filter((a) => a.tool === 'set_signups_paused')).toHaveLength(2);
  });
});

describe('get_signup_funnel', () => {
  it('counts agencies created in the window by source; legacy and old rows are excluded', async () => {
    const day = 86_400_000;
    const mk = async (id: string, source: 'open' | 'invite' | 'legacy', ageDays: number, o: { profile?: boolean; client?: boolean; card?: boolean } = {}) => {
      await dbs.owner.insert(agency).values({ id, name: `A ${id.slice(0, 4)}` }).onConflictDoNothing();
      await dbs.owner.insert(agencyOnboarding).values({
        agencyId: id, source, createdAt: new Date(Date.now() - ageDays * day),
        profileDoneAt: o.profile ? new Date() : null, firstClientAt: o.client ? new Date() : null,
      });
      if (o.card) await dbs.owner.insert(agencyBilling).values({ agencyId: id, state: 'active' });
    };
    await mk('00000000-0000-4000-8000-0000000000a1', 'open', 1, { profile: true, client: true, card: true });
    await mk('00000000-0000-4000-8000-0000000000a2', 'open', 5, { profile: true });
    await mk('00000000-0000-4000-8000-0000000000a3', 'open', 60);
    await mk('00000000-0000-4000-8000-0000000000a4', 'invite', 2, { profile: true, client: true });
    await mk('00000000-0000-4000-8000-0000000000a5', 'legacy', 2, { profile: true });
    const z = { signups: 0, profileDone: 0, firstClient: 0, cardAdded: 0 };
    expect(await call(viewer, 'get_signup_funnel', { days: 30 })).toMatchObject({
      open: { signups: 2, profileDone: 2, firstClient: 1, cardAdded: 1 },
      invite: { signups: 1, profileDone: 1, firstClient: 1, cardAdded: 0 },
    });
    expect(((await call(viewer, 'get_signup_funnel', { days: 90 })) as { open: { signups: number } }).open.signups).toBe(3);
    await dbs.owner.delete(agencyOnboarding);
    expect(await call(viewer, 'get_signup_funnel', { days: 30 })).toEqual({ open: z, invite: z, recent: [] });
  });

  describe('Check flag (D9)', () => {
    type Recent = { agencyId: string; website: string | null; clientsServed: string | null; check: boolean };
    const A = (n: number) => `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;
    const mk = async (n: number, o: { website?: string | null; served?: '0' | '1-5' | '6-20' | '21+' | null; clientSite?: string | null; laterClientSite?: string } = {}) => {
      await dbs.owner.insert(agency).values({ id: A(n), name: `Fence ${n}` });
      await dbs.owner.insert(agencyOnboarding).values({ agencyId: A(n), source: 'open', createdAt: new Date(), clientsServed: o.served ?? null });
      if (o.website !== undefined) await dbs.owner.insert(agencyProfile).values({ agencyId: A(n), website: o.website });
      const addClient = async (k: number, site: string | null, ageMs: number) => {
        let selfId: string | null = null;
        if (site) {
          const [c] = await dbs.owner.insert(competitor).values({ name: `c${n}${k}`, domain: site }).returning({ id: competitor.id });
          selfId = c!.id;
        }
        await dbs.owner.insert(client).values({ agencyId: A(n), name: `Client ${n}-${k}`, verticalId: 'hvac', selfCompetitorId: selfId, createdAt: new Date(Date.now() - ageMs) });
      };
      if (o.clientSite !== undefined) await addClient(1, o.clientSite, 5000);
      if (o.laterClientSite) await addClient(2, o.laterClientSite, 1000);
    };
    const rowOf = async (n: number) => ((await call(viewer, 'get_signup_funnel', { days: 30 })) as { recent: Recent[] }).recent.find((r) => r.agencyId === A(n))!;

    it("'0' clients served is flagged, with no website or client at all", async () => {
      await mk(1, { served: '0' });
      expect(await rowOf(1)).toMatchObject({ website: null, clientsServed: '0', check: true });
    });
    it('first client sharing the agency host (case and www. ignored) is flagged', async () => {
      await mk(2, { served: '1-5', website: 'https://WWW.Acme-HVAC.com/about', clientSite: 'acme-hvac.com' });
      expect(await rowOf(2)).toMatchObject({ website: 'https://WWW.Acme-HVAC.com/about', clientsServed: '1-5', check: true });
    });
    it('a different host is not flagged; only the EARLIEST client counts', async () => {
      await mk(3, { served: '6-20', website: 'https://agency.example', clientSite: 'someclient.com' });
      await mk(4, { served: '6-20', website: 'https://agency.example', clientSite: 'other.com', laterClientSite: 'agency.example' });
      expect((await rowOf(3)).check).toBe(false);
      expect((await rowOf(4)).check).toBe(false);
    });
    it('without a website or client website only the 0 rule applies', async () => {
      await mk(5, { served: '21+', website: null, clientSite: 'x.com' });
      await mk(6, { served: '1-5', website: 'https://y.com', clientSite: null });
      await mk(7, { served: null });
      expect((await rowOf(5)).check).toBe(false);
      expect((await rowOf(6)).check).toBe(false);
      expect(await rowOf(7)).toMatchObject({ clientsServed: null, check: false });
    });
  });

  it('days must be 30 or 90', async () => {
    expect((await fails(call(viewer, 'get_signup_funnel', { days: 7 }))).code).toBe('invalid_input');
  });
});

describe('pilot settings tools', () => {
  it('set_pilot_mode is owner-only', async () => {
    for (const ctx of [viewer, staff, admin]) expect((await fails(call(ctx, 'set_pilot_mode', { on: true }))).code).toBe('permission_denied');
    expect((await fails(call(staff, 'set_sample_brief_limit', { n: 5 }))).code).toBe('permission_denied');
    expect(await pilotMode(dbs.service)).toBe(false);
    expect(await dbs.owner.select().from(platformAuditLog)).toEqual([]);
  });

  it('writes platform_setting and one platform audit row', async () => {
    expect(await call(owner, 'set_pilot_mode', { on: true })).toEqual({ on: true });
    expect(await call(owner, 'set_sample_brief_limit', { n: 3 })).toEqual({ n: 3 });
    const [pm] = await dbs.owner.select().from(platformSetting).where(eq(platformSetting.key, 'pilot_mode'));
    expect(pm!.value).toEqual({ on: true });
    const [lim] = await dbs.owner.select().from(platformSetting).where(eq(platformSetting.key, 'sample_brief_monthly_limit'));
    expect(lim!.value).toEqual({ n: 3 });
    const audits = await dbs.owner.select().from(platformAuditLog);
    expect(audits.filter((a) => a.tool === 'set_pilot_mode')).toHaveLength(1);
    expect(audits.filter((a) => a.tool === 'set_sample_brief_limit')).toHaveLength(1);
  });

  it('viewers read both settings; defaults are off and 10; the limit is bounded', async () => {
    expect(await call(viewer, 'get_pilot_settings', {})).toEqual({ pilotMode: false, sampleBriefMonthlyLimit: 10 });
    await call(owner, 'set_pilot_mode', { on: true });
    expect(await call(viewer, 'get_pilot_settings', {})).toEqual({ pilotMode: true, sampleBriefMonthlyLimit: 10 });
    expect((await fails(call(admin, 'get_pilot_settings', {}))).code).toBe('permission_denied');
    expect((await fails(call(owner, 'set_sample_brief_limit', { n: 101 }))).code).toBe('invalid_input');
    expect((await fails(call(owner, 'set_sample_brief_limit', { n: -1 }))).code).toBe('invalid_input');
  });
});
