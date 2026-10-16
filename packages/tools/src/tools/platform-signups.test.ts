import { type AccessContext, createAccessContext } from '@cs/core';
import { agency, agencyBilling, agencyOnboarding, platformAdmin, platformAuditLog, platformSetting } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import { signupsPaused } from '../access/signup';
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
    expect(await call(viewer, 'get_signup_funnel', { days: 30 })).toEqual({
      open: { signups: 2, profileDone: 2, firstClient: 1, cardAdded: 1 },
      invite: { signups: 1, profileDone: 1, firstClient: 1, cardAdded: 0 },
    });
    expect(((await call(viewer, 'get_signup_funnel', { days: 90 })) as { open: { signups: number } }).open.signups).toBe(3);
    await dbs.owner.delete(agencyOnboarding);
    expect(await call(viewer, 'get_signup_funnel', { days: 30 })).toEqual({ open: z, invite: z });
  });

  it('days must be 30 or 90', async () => {
    expect((await fails(call(viewer, 'get_signup_funnel', { days: 7 }))).code).toBe('invalid_input');
  });
});
