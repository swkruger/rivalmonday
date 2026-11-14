import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { IDS, errorText, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { agency, agencyDomain, agencySendingDomain, intakeLink } from './schema';
import { withTenant } from './tenant';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

type Role = 'agency_admin' | 'account_manager' | 'client_owner' | 'client_viewer';
const scopeFor = (agencyId: string, role: Role) => ({ agencyId, clientScope: 'all' as const, userId: 'u1', role });

const rows = <T>(r: unknown) => r as unknown as T[];
const newAgency = async (name: string, hostSlug?: string) => {
  const [a] = await dbs.owner.insert(agency).values(hostSlug ? { name, hostSlug } : { name }).returning({ id: agency.id, hostSlug: agency.hostSlug });
  return a!;
};
const slugFor = async (name: string, self: string | null = null) =>
  rows<{ s: string }>(await dbs.owner.execute(sql`SELECT agency_host_slug_for(${name}, ${self}::uuid) AS s`))[0]!.s;
const HOST_SLUG_CHECK = /^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$/;

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('agency.host_slug (0111)', () => {
  it('name "E2E Agency" → e2e-agency; duplicates → -2, -3', async () => {
    expect((await newAgency('E2E Agency')).hostSlug).toBe('e2e-agency');
    expect((await newAgency('E2E Agency')).hostSlug).toBe('e2e-agency-2');
    expect((await newAgency('e2e  agency!')).hostSlug).toBe('e2e-agency-3');
  });

  it('"A" → a-agency, "Mail" → mail-agency, "Café Ünïon" → cafe-union', async () => {
    expect(await slugFor('A')).toBe('a-agency');
    expect(await slugFor('Mail')).toBe('mail-agency');
    expect(await slugFor('Café Ünïon')).toBe('cafe-union');
    expect(await slugFor('')).toBe('agency');
  });

  it('60-char name → ≤ 40 chars, passes the check', async () => {
    const name = 'Superlative Heating and Cooling Marketing Partners of Texas!';
    expect(name).toHaveLength(60);
    const a = await newAgency(name);
    expect(a.hostSlug.length).toBeLessThanOrEqual(40);
    expect(a.hostSlug).toMatch(HOST_SLUG_CHECK);
    const b = await newAgency(name);
    expect(b.hostSlug.length).toBeLessThanOrEqual(40);
    expect(b.hostSlug).toMatch(/-2$/);
  });

  it('intake slug wins when present and free', async () => {
    await dbs.owner.insert(intakeLink).values({ agencyId: IDS.agencyA, slug: 'my-intake' });
    expect(await slugFor('Agency A', IDS.agencyA)).toBe('my-intake');
    // taken as another agency's host slug → the name
    await newAgency('Other', 'my-intake');
    expect(await slugFor('Agency A', IDS.agencyA)).toBe('agency-a');
  });

  it('reserved intake slug "mail" falls back to the name', async () => {
    await dbs.owner.insert(intakeLink).values({ agencyId: IDS.agencyA, slug: 'mail' });
    expect(await slugFor('Agency A', IDS.agencyA)).toBe('agency-a');
  });

  it('backfill gives intake agencies their slug before name-derived agencies', async () => {
    // "Acme" (no intake link, created first) and "Zed" (intake slug "acme"): the 0111 backfill block, re-run.
    const acme = await newAgency('Acme', 'tmp-acme');
    const zed = await newAgency('Zed', 'tmp-zed');
    await dbs.owner.insert(intakeLink).values({ agencyId: zed.id, slug: 'acme' });
    const migration = readFileSync(join(__dirname, '..', 'migrations', '0111_hosts.sql'), 'utf8');
    const backfill = migration.split('--> statement-breakpoint').find((s) => s.includes('DO $$'));
    expect(backfill).toBeDefined();
    await dbs.owner.execute(sql.raw(backfill!));
    const slug = async (id: string) => (await dbs.owner.select({ s: agency.hostSlug }).from(agency).where(eq(agency.id, id)))[0]!.s;
    expect(await slug(zed.id)).toBe('acme');
    expect(await slug(acme.id)).toBe('acme-2');
    expect(await slug(IDS.agencyA)).toBe('agency-a');
  });

  it('insert without host_slug gets one from the trigger', async () => {
    const [a] = await dbs.owner.select({ s: agency.hostSlug }).from(agency).where(eq(agency.id, IDS.agencyA));
    expect(a!.s).toBe('agency-a');
    expect((await newAgency('Fresh Co')).hostSlug).toBe('fresh-co');
  });

  it("explicit 'www' rejected", async () => {
    expect(await errorText(newAgency('Www', 'www'))).toMatch(/agency_host_slug_check/);
    expect(await errorText(newAgency('Bad', 'Bad_Slug'))).toMatch(/agency_host_slug_check/);
  });

  it('duplicate violates agency_host_slug_unique', async () => {
    expect(await errorText(newAgency('Copy', 'agency-a'))).toMatch(/agency_host_slug_unique/);
  });

  it('app_user cannot UPDATE agency.host_slug', async () => {
    const text = await errorText(
      withTenant(dbs.app, scopeFor(IDS.agencyA, 'agency_admin'), (tx) => tx.update(agency).set({ hostSlug: 'stolen' }).where(eq(agency.id, IDS.agencyA))),
    );
    expect(text).toMatch(/permission denied/i);
  });
});

describe('agency_domain / agency_sending_domain (0111, 0112)', () => {
  it('second non-removed agency_domain per agency violates agency_domain_one_per_agency', async () => {
    await dbs.service.insert(agencyDomain).values({ agencyId: IDS.agencyA, hostname: 'intel.a.test' });
    expect(await errorText(dbs.service.insert(agencyDomain).values({ agencyId: IDS.agencyA, hostname: 'other.a.test' }))).toMatch(/agency_domain_one_per_agency/);
    await dbs.service.update(agencyDomain).set({ status: 'removed', removedAt: new Date() }).where(eq(agencyDomain.agencyId, IDS.agencyA));
    await dbs.service.insert(agencyDomain).values({ agencyId: IDS.agencyA, hostname: 'other.a.test' });
  });

  it("same live hostname for two agencies violates agency_domain_hostname_active; removed rows don't count", async () => {
    await dbs.service.insert(agencyDomain).values({ agencyId: IDS.agencyA, hostname: 'intel.shared.test', status: 'live' });
    expect(await errorText(dbs.service.insert(agencyDomain).values({ agencyId: IDS.agencyB, hostname: 'intel.shared.test', status: 'live' }))).toMatch(
      /agency_domain_hostname_active/,
    );
    await dbs.service.update(agencyDomain).set({ status: 'removed' }).where(eq(agencyDomain.agencyId, IDS.agencyA));
    await dbs.service.insert(agencyDomain).values({ agencyId: IDS.agencyB, hostname: 'intel.shared.test', status: 'pending' });
  });

  it('account_manager reads own rows, client_owner sees none, other agency none', async () => {
    await dbs.service.insert(agencyDomain).values([
      { agencyId: IDS.agencyA, hostname: 'intel.a.test', dnsRecords: [{ type: 'CNAME', name: 'intel', value: 'cname.vercel-dns.com' }] },
      { agencyId: IDS.agencyB, hostname: 'intel.b.test' },
    ]);
    await dbs.service.insert(agencySendingDomain).values([
      { agencyId: IDS.agencyA, domain: 'a.test' },
      { agencyId: IDS.agencyB, domain: 'b.test' },
    ]);
    const read = (agencyId: string, role: Role) =>
      withTenant(dbs.app, scopeFor(agencyId, role), async (tx) => ({
        d: (await tx.select({ id: agencyDomain.agencyId, recs: agencyDomain.dnsRecords }).from(agencyDomain)),
        s: (await tx.select({ id: agencySendingDomain.agencyId, lp: agencySendingDomain.localPart }).from(agencySendingDomain)),
      }));
    const am = await read(IDS.agencyA, 'account_manager');
    expect(am.d).toEqual([{ id: IDS.agencyA, recs: [{ type: 'CNAME', name: 'intel', value: 'cname.vercel-dns.com' }] }]);
    expect(am.s).toEqual([{ id: IDS.agencyA, lp: 'briefs' }]);
    expect((await read(IDS.agencyA, 'agency_admin')).d.map((r) => r.id)).toEqual([IDS.agencyA]);
    expect(await read(IDS.agencyA, 'client_owner')).toEqual({ d: [], s: [] });
    expect(await read(IDS.agencyA, 'client_viewer')).toEqual({ d: [], s: [] });
    expect((await read(IDS.agencyB, 'agency_admin')).d.map((r) => r.id)).toEqual([IDS.agencyB]);
  });

  it('app_user cannot insert either table', async () => {
    const scope = scopeFor(IDS.agencyA, 'agency_admin');
    expect(await errorText(withTenant(dbs.app, scope, (tx) => tx.insert(agencyDomain).values({ agencyId: IDS.agencyA, hostname: 'x.a.test' })))).toMatch(
      /permission denied/,
    );
    expect(await errorText(withTenant(dbs.app, scope, (tx) => tx.insert(agencySendingDomain).values({ agencyId: IDS.agencyA, domain: 'a.test' })))).toMatch(
      /permission denied/,
    );
    await dbs.service.insert(agencyDomain).values({ agencyId: IDS.agencyA, hostname: 'x.a.test' });
    expect(await errorText(withTenant(dbs.app, scope, (tx) => tx.update(agencyDomain).set({ status: 'live' })))).toMatch(/permission denied/);
  });

  it('bad status / local_part rejected', async () => {
    expect(await errorText(dbs.service.insert(agencyDomain).values({ agencyId: IDS.agencyA, hostname: 'x.a.test', status: 'verified' as never }))).toMatch(
      /agency_domain_status_check/,
    );
    expect(await errorText(dbs.service.insert(agencySendingDomain).values({ agencyId: IDS.agencyA, domain: 'a.test', status: 'live' as never }))).toMatch(
      /agency_sending_domain_status_check/,
    );
    expect(await errorText(dbs.service.insert(agencySendingDomain).values({ agencyId: IDS.agencyA, domain: 'a.test', localPart: 'Briefs' }))).toMatch(
      /agency_sending_domain_local_part_check/,
    );
    expect(await errorText(dbs.service.insert(agencySendingDomain).values({ agencyId: IDS.agencyA, domain: 'a.test', localPart: '.briefs' }))).toMatch(
      /agency_sending_domain_local_part_check/,
    );
    await dbs.service.insert(agencySendingDomain).values({ agencyId: IDS.agencyA, domain: 'a.test', localPart: 'hello.team_1' });
    expect(await errorText(dbs.service.insert(agencySendingDomain).values({ agencyId: IDS.agencyA, domain: 'b.test' }))).toMatch(
      /agency_sending_domain_one_per_agency/,
    );
  });
});
