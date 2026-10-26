import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { IDS, errorText, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { agencyInviteLink, agencyOnboarding, agencyProfile, client, clientSetup, pendingSignup } from './schema';
import { withTenant } from './tenant';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

type Role = 'agency_admin' | 'account_manager' | 'client_owner' | 'client_viewer';
const scopeFor = (agencyId: string, role: Role) => ({ agencyId, clientScope: 'all' as const, userId: 'u1', role });

const signup = (email: string, extra: Partial<typeof pendingSignup.$inferInsert> = {}) => ({
  email,
  agencyName: 'Acme',
  source: 'open' as const,
  ipHash: 'h',
  expiresAt: new Date(Date.now() + 86_400_000),
  ...extra,
});

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.service.insert(agencyProfile).values([{ agencyId: IDS.agencyA, legalName: 'A Inc' }, { agencyId: IDS.agencyB }]);
  await dbs.service.insert(agencyOnboarding).values([
    { agencyId: IDS.agencyA, source: 'open' },
    { agencyId: IDS.agencyB, source: 'open' },
  ]);
});

describe('pending_signup', () => {
  it('app_user cannot read or write it', async () => {
    await dbs.service.insert(pendingSignup).values(signup('a@x.com'));
    const scope = scopeFor(IDS.agencyA, 'agency_admin');
    expect(await errorText(withTenant(dbs.app, scope, (tx) => tx.select().from(pendingSignup)))).toMatch(/permission denied/);
    expect(await errorText(withTenant(dbs.app, scope, (tx) => tx.insert(pendingSignup).values(signup('b@x.com'))))).toMatch(/permission denied/);
  });

  it('allows one open pending sign-up per email, but a completed one does not block', async () => {
    await dbs.service.insert(pendingSignup).values(signup('a@x.com'));
    expect(await errorText(dbs.service.insert(pendingSignup).values(signup('a@x.com')))).toMatch(/pending_signup_open_email_uq|unique/);
    await dbs.service.update(pendingSignup).set({ completedAt: new Date() }).where(eq(pendingSignup.email, 'a@x.com'));
    await dbs.service.insert(pendingSignup).values(signup('a@x.com'));
  });

  it('CHECKs reject a bad source and an empty agency name; invite link FK is enforced', async () => {
    expect(await errorText(dbs.service.insert(pendingSignup).values(signup('a@x.com', { source: 'legacy' as never })))).toMatch(/check/);
    expect(await errorText(dbs.service.insert(pendingSignup).values(signup('b@x.com', { agencyName: '' })))).toMatch(/check/);
    const [link] = await dbs.service
      .insert(agencyInviteLink)
      .values({ tokenHash: 't', tokenPrefix: 'p', offer: 'trial', expiresAt: new Date(Date.now() + 1000), createdBy: 'u' })
      .returning();
    await dbs.service.insert(pendingSignup).values(signup('c@x.com', { source: 'invite', inviteLinkId: link!.id }));
    expect(await errorText(dbs.service.insert(pendingSignup).values(signup('d@x.com', { inviteLinkId: IDS.agencyA })))).toMatch(/foreign key/);
  });
});

describe('agency_profile RLS', () => {
  const read = (scope: ReturnType<typeof scopeFor>) =>
    withTenant(dbs.app, scope, (tx) => tx.select({ id: agencyProfile.agencyId }).from(agencyProfile));

  it('admin and account manager read only their own agency; client users read nothing', async () => {
    expect((await read(scopeFor(IDS.agencyA, 'agency_admin'))).map((r) => r.id)).toEqual([IDS.agencyA]);
    expect((await read(scopeFor(IDS.agencyA, 'account_manager'))).map((r) => r.id)).toEqual([IDS.agencyA]);
    expect(await read(scopeFor(IDS.agencyA, 'client_owner'))).toEqual([]);
    expect(await read(scopeFor(IDS.agencyA, 'client_viewer'))).toEqual([]);
  });

  it('account manager cannot update; admin updates own agency only', async () => {
    const upd = (scope: ReturnType<typeof scopeFor>, agencyId: string) =>
      withTenant(dbs.app, scope, (tx) => tx.update(agencyProfile).set({ phone: '555' }).where(eq(agencyProfile.agencyId, agencyId)).returning());
    expect(await upd(scopeFor(IDS.agencyA, 'account_manager'), IDS.agencyA)).toEqual([]);
    expect(await upd(scopeFor(IDS.agencyA, 'agency_admin'), IDS.agencyA)).toHaveLength(1);
    expect(await upd(scopeFor(IDS.agencyA, 'agency_admin'), IDS.agencyB)).toEqual([]);
    const [b] = await dbs.service.select().from(agencyProfile).where(eq(agencyProfile.agencyId, IDS.agencyB));
    expect(b!.phone).toBeNull();
  });

  it('admin cannot insert a profile for another agency', async () => {
    await dbs.service.delete(agencyProfile).where(eq(agencyProfile.agencyId, IDS.agencyA));
    const admin = scopeFor(IDS.agencyA, 'agency_admin');
    expect(await errorText(withTenant(dbs.app, admin, (tx) => tx.insert(agencyProfile).values({ agencyId: IDS.agencyB })))).toMatch(
      /row-level security|already exists|duplicate/,
    );
    await withTenant(dbs.app, admin, (tx) => tx.insert(agencyProfile).values({ agencyId: IDS.agencyA }));
  });

  it('defaults: country US, timezone America/New_York, empty verticals', async () => {
    const [p] = await dbs.service.select().from(agencyProfile).where(eq(agencyProfile.agencyId, IDS.agencyB));
    expect([p!.country, p!.timezone, p!.verticals, p!.billingSameAsPostal]).toEqual(['US', 'America/New_York', [], true]);
  });
});

describe('agency_onboarding RLS', () => {
  it('admin and account manager read own row; client user reads nothing; no app_user writes', async () => {
    const read = (role: Role) =>
      withTenant(dbs.app, scopeFor(IDS.agencyA, role), (tx) => tx.select({ id: agencyOnboarding.agencyId }).from(agencyOnboarding));
    expect((await read('agency_admin')).map((r) => r.id)).toEqual([IDS.agencyA]);
    expect((await read('account_manager')).map((r) => r.id)).toEqual([IDS.agencyA]);
    expect(await read('client_owner')).toEqual([]);
    const scope = scopeFor(IDS.agencyA, 'agency_admin');
    expect(await errorText(withTenant(dbs.app, scope, (tx) => tx.update(agencyOnboarding).set({ nudgesSent: 1 })))).toMatch(/permission denied/);
    expect(await errorText(withTenant(dbs.app, scope, (tx) => tx.insert(agencyOnboarding).values({ agencyId: IDS.agencyA, source: 'open' })))).toMatch(
      /permission denied/,
    );
  });

  it('CHECKs: source and nudges_sent range', async () => {
    expect(await errorText(dbs.service.update(agencyOnboarding).set({ nudgesSent: 4 }))).toMatch(/check/);
    expect(await errorText(dbs.service.update(agencyOnboarding).set({ source: 'x' as never }))).toMatch(/check/);
  });
});

describe('phase 16 columns (0095)', () => {
  it('round-trips agency wizard_finished_at', async () => {
    const at = new Date('2026-10-26T12:00:00.000Z');
    await dbs.service.update(agencyOnboarding).set({ wizardFinishedAt: at }).where(eq(agencyOnboarding.agencyId, IDS.agencyA));
    const [row] = await dbs.service.select().from(agencyOnboarding).where(eq(agencyOnboarding.agencyId, IDS.agencyA));
    expect(row?.wizardFinishedAt?.toISOString()).toBe(at.toISOString());
    const [b] = await dbs.service.select().from(agencyOnboarding).where(eq(agencyOnboarding.agencyId, IDS.agencyB));
    expect(b?.wizardFinishedAt).toBeNull();
  });

  it('round-trips client phone/address/logo_url', async () => {
    const address = { line1: '1 Main St', city: 'Austin', region: 'TX', postalCode: '78701', country: 'US' as const };
    await dbs.service.update(client).set({ phone: '+15125550100', address, logoUrl: '/files/logo/abc' }).where(eq(client.id, IDS.clientA1));
    const [row] = await dbs.service.select().from(client).where(eq(client.id, IDS.clientA1));
    expect(row).toMatchObject({ phone: '+15125550100', address, logoUrl: '/files/logo/abc' });
  });

  it('client_setup owner_pick_requested_at and location_source; CHECK rejects others', async () => {
    await dbs.service.delete(clientSetup).where(eq(clientSetup.clientId, IDS.clientA1));
    const at = new Date('2026-10-26T12:00:00.000Z');
    await dbs.service.insert(clientSetup).values({ clientId: IDS.clientA1, agencyId: IDS.agencyA, ownerPickRequestedAt: at, locationSource: 'geocoded' });
    const [row] = await dbs.service.select().from(clientSetup).where(eq(clientSetup.clientId, IDS.clientA1));
    expect(row?.ownerPickRequestedAt?.toISOString()).toBe(at.toISOString());
    expect(row?.locationSource).toBe('geocoded');
    expect(await errorText(dbs.service.update(clientSetup).set({ locationSource: 'x' as never }).where(eq(clientSetup.clientId, IDS.clientA1)))).toMatch(/check/);
  });
});

describe('backfill', () => {
  it('gives every pre-existing agency a legacy completed onboarding row and an empty profile; idempotent', async () => {
    await truncateAll(dbs.owner);
    await seedTenancy(dbs.owner);
    const dir = join(__dirname, '..', 'migrations');
    const file = readdirSync(dir).find((f) => /^0066_.*\.sql$/.test(f))!;
    const stmts = readFileSync(join(dir, file), 'utf8')
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter((s) => /^INSERT INTO agency_(onboarding|profile)/.test(s));
    expect(stmts).toHaveLength(2);
    for (let i = 0; i < 2; i++) for (const s of stmts) await dbs.owner.execute(sql.raw(s));
    const ob = await dbs.service.select().from(agencyOnboarding);
    expect(ob.map((r) => r.agencyId).sort()).toEqual([IDS.agencyA, IDS.agencyB]);
    for (const r of ob) {
      expect(r.source).toBe('legacy');
      expect(r.completedAt).not.toBeNull();
    }
    const pr = await dbs.service.select().from(agencyProfile);
    expect(pr).toHaveLength(2);
    expect(pr[0]!.legalName).toBeNull();
  });
});
