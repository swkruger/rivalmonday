import { type AccessContext, createAccessContext } from '@cs/core';
import { agency, agencyDomain, agencySendingDomain, type HostEnv } from '@cs/db';
import { IDS, openTestDbs, pauseAgency, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolDeps } from '../deps';
import { type FakePostmarkDomains, type FakeVercelDomains, fakePostmarkDomains, fakeVercelDomains, resetFakeDomainVendors } from '../domains/fakes';
import { createToolRegistry } from '../registry';
import { DOMAIN_COPY } from './domains';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const HOST_ENV: HostEnv = { appUrl: 'https://app.test', neutralDomain: 'clients.example', extraPlatformHosts: [] };
const A = IDS.agencyA;
const B = IDS.agencyB;
const mk = (role: AccessContext['role'], agencyId: string = A, scope: AccessContext['clientScope'] = 'all') =>
  createAccessContext({ agencyId, userId: `u-${role}-${agencyId.slice(-1)}`, role, clientScope: scope, features: [] });
const admin = mk('agency_admin');
const adminB = mk('agency_admin', B);

let vercel: FakeVercelDomains;
let postmark: FakePostmarkDomains;
let enqueued: { job: string; data: Record<string, string>; singletonKey: string }[];
let registry: ReturnType<typeof createToolRegistry>;
const audit = { audit: { record: async () => {} } };
const build = (over: Partial<ToolDeps> = {}) => createToolRegistry({
  app: dbs.app, service: dbs.service, appUrl: HOST_ENV.appUrl, hostEnv: HOST_ENV, domains: { vercel, postmark },
  enqueue: async (job, data, singletonKey) => { enqueued.push({ job, data, singletonKey }); },
  ...over,
}, audit);
const call = (ctx: AccessContext, name: string, input: unknown = {}) => registry.invoke(ctx, name, input);
const fails = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { return e as { code?: string; message: string; userFacing?: boolean }; }
  throw new Error('expected a failure');
};
const domainRows = (agencyId: string = A) => dbs.owner.select().from(agencyDomain).where(eq(agencyDomain.agencyId, agencyId));
const sendingRows = (agencyId: string = A) => dbs.owner.select().from(agencySendingDomain).where(eq(agencySendingDomain.agencyId, agencyId));

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  resetFakeDomainVendors();
  vercel = fakeVercelDomains();
  postmark = fakePostmarkDomains();
  enqueued = [];
  registry = build();
});

describe('get_agency_domains', () => {
  it('returns fallbackHost, fromAddress and nulls', async () => {
    expect(await call(admin, 'get_agency_domains')).toEqual({
      fallbackHost: 'agency-a.clients.example', fromAddress: 'agency-a@mail.clients.example', custom: null, sending: null,
    });
  });

  it('shows the current rows (never removed ones) and the verified From', async () => {
    await dbs.owner.insert(agencyDomain).values([
      { agencyId: A, hostname: 'old.agency-a.com', status: 'removed', removedAt: new Date() },
      { agencyId: A, hostname: 'intel.agency-a.com', status: 'live', liveAt: new Date('2026-11-01T00:00:00Z'), dnsRecords: [{ type: 'CNAME', name: 'intel.agency-a.com', value: 'cname.vercel-dns.com.' }] },
    ]);
    await dbs.owner.insert(agencySendingDomain).values({ agencyId: A, domain: 'agency-a.com', localPart: 'news', status: 'verified', dkimHost: 'pm._domainkey.agency-a.com', dkimValue: 'k=rsa', returnPathHost: 'pm-bounces.agency-a.com', returnPathValue: 'pm.mtasv.net', dmarcOk: false });
    expect(await call(admin, 'get_agency_domains')).toEqual({
      fallbackHost: 'agency-a.clients.example',
      fromAddress: 'news@agency-a.com',
      custom: { hostname: 'intel.agency-a.com', status: 'live', dnsRecords: [{ type: 'CNAME', name: 'intel.agency-a.com', value: 'cname.vercel-dns.com.' }], error: null, liveAt: '2026-11-01T00:00:00.000Z' },
      sending: { domain: 'agency-a.com', localPart: 'news', status: 'verified', dkim: { host: 'pm._domainkey.agency-a.com', value: 'k=rsa' }, returnPath: { host: 'pm-bounces.agency-a.com', value: 'pm.mtasv.net' }, dmarcOk: false, error: null },
    });
  });
});

describe('roles', () => {
  const WRITES: [string, unknown][] = [
    ['set_custom_domain', { hostname: 'intel.agency-a.com' }], ['remove_custom_domain', {}],
    ['set_sending_domain', { domain: 'agency-a.com' }], ['remove_sending_domain', {}],
  ];
  it('account_manager and client roles cannot call the writes (not_found)', async () => {
    for (const who of [mk('account_manager'), mk('client_owner', A, [IDS.clientA1]), mk('client_viewer', A, [IDS.clientA1])]) {
      for (const [name, input] of [...WRITES, ['get_agency_domains', {}] as [string, unknown]]) {
        // permission_denied and not_found both become a 404 on the web
        expect(['permission_denied', 'not_found'], `${who.role} ${name}`).toContain((await fails(call(who, name, input))).code);
      }
    }
    expect(await domainRows()).toEqual([]);
    expect(await sendingRows()).toEqual([]);
    expect(enqueued).toEqual([]);
  });
});

describe('set_custom_domain / remove_custom_domain', () => {
  it('set stores Vercel records, pending, enqueues one verify job', async () => {
    expect(await call(admin, 'set_custom_domain', { hostname: '  Intel.Agency-A.com.  ' })).toEqual({ ok: true });
    const [row] = await domainRows();
    expect(row).toMatchObject({ hostname: 'intel.agency-a.com', status: 'pending', dnsRecords: [{ type: 'CNAME', name: 'intel.agency-a.com', value: 'cname.vercel-dns.com.' }], error: null });
    expect(enqueued).toEqual([{ job: 'domain-verify', data: { domainId: row!.id }, singletonKey: `domain:${row!.id}` }]);
    expect((await vercel.status('intel.agency-a.com')).verified).toBe(false); // added to the project
  });

  it('apex refused with decided copy (and invalid / reserved)', async () => {
    const cases: [string, string][] = [
      ['agency-a.com', 'Use a subdomain such as intel.youragency.com.'],
      ['not a domain', 'Enter a domain such as intel.youragency.com.'],
      ['intel.agency.com/path', 'Enter a domain such as intel.youragency.com.'],
      ['x.clients.example', "That domain can't be used."],
      ['evil.rivalmonday.app', "That domain can't be used."],
    ];
    for (const [hostname, msg] of cases) {
      expect(await fails(call(admin, 'set_custom_domain', { hostname })), hostname).toMatchObject({ code: 'invalid_input', message: msg, userFacing: true });
    }
    expect(await domainRows()).toEqual([]);
    expect(enqueued).toEqual([]);
  });

  it('live for another agency → in use', async () => {
    await dbs.owner.insert(agencyDomain).values({ agencyId: B, hostname: 'intel.shared.com', status: 'live' });
    const add = vi.spyOn(vercel, 'add');
    expect(await fails(call(admin, 'set_custom_domain', { hostname: 'INTEL.shared.com' }))).toMatchObject({ code: 'conflict', message: 'This domain is already in use.', userFacing: true });
    expect(add).not.toHaveBeenCalled();
    expect(await domainRows()).toEqual([]);
  });

  it('Vercel in_use → in use, no row left', async () => {
    vercel.failNext('in_use');
    expect(await fails(call(admin, 'set_custom_domain', { hostname: 'intel.agency-a.com' }))).toMatchObject({ code: 'conflict', message: DOMAIN_COPY.inUse });
    expect(await domainRows()).toEqual([]);
    expect(enqueued).toEqual([]);
  });

  it('Vercel unavailable → retry copy (never the vendor text), no row left', async () => {
    vercel.failNext('unavailable');
    const e = await fails(call(admin, 'set_custom_domain', { hostname: 'intel.agency-a.com' }));
    expect(e).toMatchObject({ message: DOMAIN_COPY.unavailable, userFacing: true });
    expect(e.message).not.toMatch(/fake|vercel/i);
    expect(await domainRows()).toEqual([]);
  });

  it('second set while pending → refused', async () => {
    await call(admin, 'set_custom_domain', { hostname: 'intel.agency-a.com' });
    expect(await fails(call(admin, 'set_custom_domain', { hostname: 'portal.agency-a.com' }))).toMatchObject({ code: 'conflict', message: 'Remove the current domain first.', userFacing: true });
    expect(await domainRows()).toHaveLength(1);
    expect(enqueued).toHaveLength(1);
  });

  it('remove calls Vercel and marks removed; a new set then works', async () => {
    await call(admin, 'set_custom_domain', { hostname: 'intel.agency-a.com' });
    const remove = vi.spyOn(vercel, 'remove');
    expect(await call(admin, 'remove_custom_domain')).toEqual({ ok: true });
    expect(remove).toHaveBeenCalledWith('intel.agency-a.com');
    const [row] = await domainRows();
    expect(row).toMatchObject({ status: 'removed' });
    expect(row!.removedAt).toBeInstanceOf(Date);
    expect((await call(admin, 'get_agency_domains') as { custom: unknown }).custom).toBeNull();
    // the same hostname can come back (here: for another agency), and A can set a new one
    expect(await call(adminB, 'set_custom_domain', { hostname: 'intel.agency-a.com' })).toEqual({ ok: true });
    expect(await call(admin, 'set_custom_domain', { hostname: 'portal.agency-a.com' })).toEqual({ ok: true });
    expect((await domainRows()).map((r) => r.status).sort()).toEqual(['pending', 'removed']);
  });

  it('remove with no domain is a no-op; a Vercel failure keeps the row', async () => {
    expect(await call(admin, 'remove_custom_domain')).toEqual({ ok: true });
    await call(admin, 'set_custom_domain', { hostname: 'intel.agency-a.com' });
    vercel.failNext('unavailable');
    expect(await fails(call(admin, 'remove_custom_domain'))).toMatchObject({ message: DOMAIN_COPY.unavailable });
    expect((await domainRows())[0]).toMatchObject({ status: 'pending' });
  });

  it('a failed enqueue keeps the pending domain (the page shows it; set again is refused)', async () => {
    registry = build({ enqueue: async () => { throw new Error('queue down'); } });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await call(admin, 'set_custom_domain', { hostname: 'intel.agency-a.com' })).toEqual({ ok: true });
    expect((await domainRows())[0]).toMatchObject({ status: 'pending' });
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});

describe('set_sending_domain / remove_sending_domain', () => {
  it('sending create/remove', async () => {
    expect(await call(admin, 'set_sending_domain', { domain: 'Agency-A.com', localPart: 'news' })).toEqual({ ok: true });
    const [row] = await sendingRows();
    expect(row).toMatchObject({
      domain: 'agency-a.com', localPart: 'news', status: 'pending', postmarkDomainId: 1000,
      dkimHost: '20261114pm._domainkey.agency-a.com', dkimValue: 'k=rsa;p=FAKEDKIM1000', returnPathHost: 'pm-bounces.agency-a.com', returnPathValue: 'pm.mtasv.net',
    });
    expect(enqueued).toEqual([{ job: 'sender-verify', data: { sendingDomainId: row!.id }, singletonKey: `sender:${row!.id}` }]);
    expect(await fails(call(admin, 'set_sending_domain', { domain: 'other-a.com' }))).toMatchObject({ code: 'conflict', message: DOMAIN_COPY.oneAtATime });

    // verified → the From moves; remove → the fallback sender immediately
    await dbs.owner.update(agencySendingDomain).set({ status: 'verified' }).where(eq(agencySendingDomain.id, row!.id));
    expect((await call(admin, 'get_agency_domains') as { fromAddress: string }).fromAddress).toBe('news@agency-a.com');
    const remove = vi.spyOn(postmark, 'remove');
    expect(await call(admin, 'remove_sending_domain')).toEqual({ ok: true });
    expect(remove).toHaveBeenCalledWith(1000);
    expect((await sendingRows())[0]).toMatchObject({ status: 'removed' });
    expect(await call(admin, 'get_agency_domains')).toMatchObject({ fromAddress: 'agency-a@mail.clients.example', sending: null });
  });

  it('localPart default briefs; a bad local part gets the copy', async () => {
    await call(admin, 'set_sending_domain', { domain: 'agency-a.com' });
    expect((await sendingRows())[0]).toMatchObject({ localPart: 'briefs' });
    const e = await fails(call(adminB, 'set_sending_domain', { domain: 'agency-b.com', localPart: 'Big Boss' }));
    expect(e.code).toBe('invalid_input');
    expect(e.message).toContain('Use lower-case letters, digits, dots, hyphens or underscores.');
  });

  it('invalid / reserved / in use (DB or Postmark) refusals; vendor failure leaves no row', async () => {
    expect(await fails(call(admin, 'set_sending_domain', { domain: 'nope' }))).toMatchObject({ code: 'invalid_input', message: 'Enter a domain such as youragency.com.' });
    expect(await fails(call(admin, 'set_sending_domain', { domain: 'mail.clients.example' }))).toMatchObject({ code: 'invalid_input', message: DOMAIN_COPY.reserved });
    await dbs.owner.insert(agencySendingDomain).values({ agencyId: B, domain: 'shared.com', status: 'pending' });
    expect(await fails(call(admin, 'set_sending_domain', { domain: 'shared.com' }))).toMatchObject({ code: 'conflict', message: DOMAIN_COPY.inUse });
    postmark.failNext('in_use');
    expect(await fails(call(admin, 'set_sending_domain', { domain: 'agency-a.com' }))).toMatchObject({ code: 'conflict', message: DOMAIN_COPY.inUse });
    postmark.failNext('unavailable');
    expect(await fails(call(admin, 'set_sending_domain', { domain: 'agency-a.com' }))).toMatchObject({ message: DOMAIN_COPY.unavailable });
    expect(await sendingRows()).toEqual([]);
    expect(enqueued).toEqual([]);
  });
});

describe('configuration and hold', () => {
  it('vendors null → not configured', async () => {
    registry = build({ domains: { vercel: null, postmark: null } });
    for (const [name, input] of [['set_custom_domain', { hostname: 'intel.agency-a.com' }], ['set_sending_domain', { domain: 'agency-a.com' }], ['remove_custom_domain', {}], ['remove_sending_domain', {}]] as [string, unknown][]) {
      expect(await fails(call(admin, name, input)), name).toMatchObject({ code: 'invalid_input', message: 'Custom domains are not set up on this server yet.', userFacing: true });
    }
    registry = build({ domains: undefined, hostEnv: undefined });
    expect(await fails(call(admin, 'set_custom_domain', { hostname: 'intel.agency-a.com' }))).toMatchObject({ message: DOMAIN_COPY.notConfigured });
    expect(await fails(call(admin, 'get_agency_domains'))).toMatchObject({ message: DOMAIN_COPY.notConfigured });
    expect(await domainRows()).toEqual([]);
  });

  it('held agency → service_paused', async () => {
    await pauseAgency(dbs.owner, A);
    for (const [name, input] of [['set_custom_domain', { hostname: 'intel.agency-a.com' }], ['set_sending_domain', { domain: 'agency-a.com' }], ['remove_custom_domain', {}], ['remove_sending_domain', {}]] as [string, unknown][]) {
      expect((await fails(call(admin, name, input))).code, name).toBe('service_paused');
    }
    expect(await call(admin, 'get_agency_domains')).toMatchObject({ custom: null });
    // an operator hold (agency.suspended_*) refuses too
    await dbs.owner.update(agency).set({ suspendedAt: new Date(), suspendedReason: 'Hold check', suspendedBy: 'op' }).where(eq(agency.id, B));
    expect((await fails(call(adminB, 'set_custom_domain', { hostname: 'intel.agency-b.com' }))).code).toBe('service_paused');
    expect(await domainRows()).toEqual([]);
    expect(await domainRows(B)).toEqual([]);
  });
});
