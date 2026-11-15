import { agencyDomain, agencySendingDomain, contact } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostmarkDomainState, PostmarkDomains, VercelDomainState, VercelDomains } from './errors';
import { DomainVendorError } from './errors';
import {
  createDomainProbe, type DomainNotice, domainNoticeRecipients, expireStaleDomains, listDomainsToVerify, VERIFY_COPY, verifyAgencyDomain, verifySendingDomain,
} from './verify';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const A = IDS.agencyA;
const H = 'intel.agency-a.com';
const NOW = new Date('2026-11-14T12:00:00Z');
const HOUR = 3_600_000;
const CNAME = { type: 'CNAME', name: H, value: 'cname.vercel-dns.com.' };
const TXT = { type: 'TXT', name: '_vercel.agency-a.com', value: 'vc-domain-verify=abc' };

const vstate = (o: Partial<VercelDomainState> = {}): VercelDomainState => ({ verified: false, misconfigured: true, records: [CNAME, TXT], message: null, ...o });
const vercelOf = (status: (h: string) => Promise<VercelDomainState>): VercelDomains & { status: ReturnType<typeof vi.fn> } => ({
  add: async () => { throw new Error('unused'); },
  remove: async () => { throw new Error('unused'); },
  status: vi.fn(status),
}) as never;

let notices: DomainNotice[];
const notify = async (n: DomainNotice) => { notices.push(n); };

async function insertDomain(o: Partial<typeof agencyDomain.$inferInsert> = {}) {
  const [row] = await dbs.owner.insert(agencyDomain).values({ agencyId: A, hostname: H, status: 'pending', createdAt: new Date(NOW.getTime() - HOUR), ...o }).returning();
  return row!;
}
const domainRow = async (id: string) => (await dbs.owner.select().from(agencyDomain).where(eq(agencyDomain.id, id)))[0]!;

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  notices = [];
});

describe('verifyAgencyDomain', () => {
  it('pending + unverified → again, records updated', async () => {
    const row = await insertDomain();
    const probe = vi.fn(async () => true);
    const r = await verifyAgencyDomain({ service: dbs.service, vercel: vercelOf(async () => vstate()), probe, notify }, row.id, NOW);
    expect(r).toBe('again');
    const after = await domainRow(row.id);
    expect(after.status).toBe('pending');
    expect(after.dnsRecords).toEqual([CNAME, TXT]);
    expect(after.lastCheckedAt?.toISOString()).toBe(NOW.toISOString());
    expect(probe).not.toHaveBeenCalled();
    expect(notices).toEqual([]);
  });

  it('verified + probe fails → verifying, again', async () => {
    const row = await insertDomain();
    const probe = vi.fn(async () => false);
    const r = await verifyAgencyDomain({ service: dbs.service, vercel: vercelOf(async () => vstate({ verified: true, misconfigured: false, records: [CNAME] })), probe, notify }, row.id, NOW);
    expect(r).toBe('again');
    expect(probe).toHaveBeenCalledWith(H);
    const after = await domainRow(row.id);
    expect(after.status).toBe('verifying');
    expect(after.dnsRecords).toEqual([CNAME]);
    expect(notices).toEqual([]);
  });

  it('verified but misconfigured → no probe, stays pending', async () => {
    const row = await insertDomain();
    const probe = vi.fn(async () => true);
    expect(await verifyAgencyDomain({ service: dbs.service, vercel: vercelOf(async () => vstate({ verified: true, misconfigured: true })), probe, notify }, row.id, NOW)).toBe('again');
    expect(probe).not.toHaveBeenCalled();
    expect((await domainRow(row.id)).status).toBe('pending');
  });

  it('probe ok → live, one notice', async () => {
    const row = await insertDomain({ status: 'verifying' });
    const r = await verifyAgencyDomain({ service: dbs.service, vercel: vercelOf(async () => vstate({ verified: true, misconfigured: false })), probe: async () => true, notify }, row.id, NOW);
    expect(r).toBe('done');
    const after = await domainRow(row.id);
    expect(after.status).toBe('live');
    expect(after.liveAt?.toISOString()).toBe(NOW.toISOString());
    expect(after.error).toBeNull();
    expect(notices).toEqual([{ agencyId: A, kind: 'domain_live', name: H }]);
  });

  it('live row re-run → done, no notice', async () => {
    const row = await insertDomain({ status: 'live', liveAt: NOW });
    const vercel = vercelOf(async () => vstate({ verified: true, misconfigured: false }));
    expect(await verifyAgencyDomain({ service: dbs.service, vercel, probe: async () => true, notify }, row.id, NOW)).toBe('done');
    expect(vercel.status).not.toHaveBeenCalled();
    expect(notices).toEqual([]);
  });

  it('unknown id → done', async () => {
    const vercel = vercelOf(async () => vstate());
    expect(await verifyAgencyDomain({ service: dbs.service, vercel, probe: async () => true, notify }, '00000000-0000-4000-8000-0000000000ff', NOW)).toBe('done');
    expect(vercel.status).not.toHaveBeenCalled();
  });

  it('72 h → failed with Vercel message (mapped to decided copy, never vendor text)', async () => {
    const row = await insertDomain({ createdAt: new Date(NOW.getTime() - 72 * HOUR) });
    const message = 'Verification pending (missing_txt_record): TXT record not found or not matching';
    const r = await verifyAgencyDomain({ service: dbs.service, vercel: vercelOf(async () => vstate({ message })), probe: async () => true, notify }, row.id, NOW);
    expect(r).toBe('done');
    const after = await domainRow(row.id);
    expect(after.status).toBe('failed');
    expect(after.error).toBe(VERIFY_COPY.txtMissing);
    expect(after.error).not.toContain('missing_txt_record');
    expect(notices).toEqual([{ agencyId: A, kind: 'domain_failed', name: H, error: VERIFY_COPY.txtMissing }]);
  });

  it('72 h without a Vercel message → the timeout copy', async () => {
    const row = await insertDomain({ status: 'verifying', createdAt: new Date(NOW.getTime() - 73 * HOUR) });
    await verifyAgencyDomain({ service: dbs.service, vercel: vercelOf(async () => vstate({ verified: true, misconfigured: false })), probe: async () => false, notify }, row.id, NOW);
    expect((await domainRow(row.id)).error).toBe("We couldn't verify this domain within 72 hours.");
    expect(notices.map((n) => n.kind)).toEqual(['domain_failed']);
  });

  it('vendor failure → again inside the window (no write), failed with the timeout copy past it', async () => {
    const row = await insertDomain();
    const failing = vercelOf(async () => { throw new DomainVendorError('unavailable', 'Vercel GET /v9/x: HTTP 500'); });
    expect(await verifyAgencyDomain({ service: dbs.service, vercel: failing, probe: async () => true, notify }, row.id, NOW)).toBe('again');
    expect((await domainRow(row.id)).status).toBe('pending');
    const old = await insertDomain({ hostname: 'old.agency-b.com', agencyId: IDS.agencyB, createdAt: new Date(NOW.getTime() - 80 * HOUR) });
    expect(await verifyAgencyDomain({ service: dbs.service, vercel: failing, probe: async () => true, notify }, old.id, NOW)).toBe('done');
    expect(await domainRow(old.id)).toMatchObject({ status: 'failed', error: VERIFY_COPY.timeout });
    expect(notices).toEqual([{ agencyId: IDS.agencyB, kind: 'domain_failed', name: 'old.agency-b.com', error: VERIFY_COPY.timeout }]);
  });

  it('removed meanwhile → done, no write', async () => {
    const row = await insertDomain();
    const vercel = vercelOf(async () => {
      await dbs.owner.update(agencyDomain).set({ status: 'removed', removedAt: NOW }).where(eq(agencyDomain.id, row.id));
      return vstate({ verified: true, misconfigured: false });
    });
    expect(await verifyAgencyDomain({ service: dbs.service, vercel, probe: async () => true, notify }, row.id, NOW)).toBe('done');
    const after = await domainRow(row.id);
    expect(after.status).toBe('removed');
    expect(after.lastCheckedAt).toBeNull();
    expect(after.dnsRecords).toEqual([]);
    expect(notices).toEqual([]);
  });

  it('removed between the probe and the live write → done, never revived', async () => {
    const row = await insertDomain({ status: 'verifying' });
    const probe = async () => {
      await dbs.owner.update(agencyDomain).set({ status: 'removed', removedAt: NOW }).where(eq(agencyDomain.id, row.id));
      return true;
    };
    expect(await verifyAgencyDomain({ service: dbs.service, vercel: vercelOf(async () => vstate({ verified: true, misconfigured: false })), probe, notify }, row.id, NOW)).toBe('done');
    expect((await domainRow(row.id)).status).toBe('removed');
    expect(notices).toEqual([]);
  });
});

describe('createDomainProbe', () => {
  it('probe refuses a hostname resolving to 10.0.0.1', async () => {
    const fetch = vi.fn(async () => new Response('ok'));
    const probe = createDomainProbe({ lookup: async () => ['10.0.0.1'], fetch });
    expect(await probe('intel.agency-a.com')).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('2xx on https://<host>/health with redirect manual = ok; 3xx, 5xx and errors = not ok', async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response('ok', { status: 200 }));
    const probe = createDomainProbe({ lookup: async () => ['93.184.216.34'], fetch });
    expect(await probe('intel.agency-a.com')).toBe(true);
    expect(String(fetch.mock.calls[0]![0])).toBe('https://intel.agency-a.com/health');
    expect(fetch.mock.calls[0]![1]).toMatchObject({ redirect: 'manual' });
    expect(fetch.mock.calls[0]![1]?.signal).toBeInstanceOf(AbortSignal);
    fetch.mockResolvedValueOnce(new Response(null, { status: 307, headers: { location: 'http://10.0.0.1/' } }));
    expect(await probe('intel.agency-a.com')).toBe(false);
    fetch.mockResolvedValueOnce(new Response('down', { status: 503 }));
    expect(await probe('intel.agency-a.com')).toBe(false);
    fetch.mockRejectedValueOnce(new Error('certificate has expired'));
    expect(await probe('intel.agency-a.com')).toBe(false);
  });

  it('lookup failure or a bad hostname = not ok', async () => {
    const fetch = vi.fn(async () => new Response('ok'));
    expect(await createDomainProbe({ lookup: async () => { throw new Error('ENOTFOUND'); }, fetch })('intel.agency-a.com')).toBe(false);
    expect(await createDomainProbe({ lookup: async () => ['93.184.216.34'], fetch })('localhost')).toBe(false);
    expect(await createDomainProbe({ lookup: async () => ['93.184.216.34'], fetch })('a.com/../x?y')).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('verifySendingDomain', () => {
  const D = 'agency-a.com';
  const pmState = (id: number, dkim: boolean, returnPath: boolean): PostmarkDomainState => ({
    id, dkim: { host: `pm._domainkey.${D}`, value: 'k=rsa;p=X', verified: dkim }, returnPath: { host: `pm-bounces.${D}`, value: 'pm.mtasv.net', verified: returnPath },
  });
  const postmarkOf = (dkim: boolean, returnPath: boolean): PostmarkDomains => ({
    create: async () => { throw new Error('unused'); },
    remove: async () => { throw new Error('unused'); },
    verifyDkim: vi.fn(async (id: number) => pmState(id, dkim, returnPath)),
    verifyReturnPath: vi.fn(async (id: number) => pmState(id, dkim, returnPath)),
  });
  async function insertSending(o: Partial<typeof agencySendingDomain.$inferInsert> = {}) {
    const [row] = await dbs.owner.insert(agencySendingDomain).values({ agencyId: A, domain: D, postmarkDomainId: 1234, status: 'pending', createdAt: new Date(NOW.getTime() - HOUR), ...o }).returning();
    return row!;
  }
  const sendingRow = async (id: string) => (await dbs.owner.select().from(agencySendingDomain).where(eq(agencySendingDomain.id, id)))[0]!;

  it('both verified → verified + dmarc_ok true', async () => {
    const row = await insertSending();
    const resolveTxt = vi.fn(async () => [['v=spf1 -all'], ['v=DMARC1; ', 'p=none']]);
    const r = await verifySendingDomain({ service: dbs.service, postmark: postmarkOf(true, true), resolveTxt, notify }, row.id, NOW);
    expect(r).toBe('done');
    expect(resolveTxt).toHaveBeenCalledWith(`_dmarc.${D}`);
    expect(await sendingRow(row.id)).toMatchObject({ status: 'verified', dmarcOk: true, error: null });
    expect((await sendingRow(row.id)).verifiedAt?.toISOString()).toBe(NOW.toISOString());
    expect(notices).toEqual([{ agencyId: A, kind: 'sender_verified', name: D }]);
  });

  it('no DMARC → dmarc_ok false, still verified', async () => {
    const row = await insertSending();
    await verifySendingDomain({ service: dbs.service, postmark: postmarkOf(true, true), resolveTxt: async () => [['v=spf1 -all']], notify }, row.id, NOW);
    expect(await sendingRow(row.id)).toMatchObject({ status: 'verified', dmarcOk: false });
    const other = await insertSending({ agencyId: IDS.agencyB, domain: 'agency-b.com' });
    await verifySendingDomain({ service: dbs.service, postmark: postmarkOf(true, true), resolveTxt: async () => { throw Object.assign(new Error('queryTxt ENODATA'), { code: 'ENODATA' }); }, notify }, other.id, NOW);
    expect(await sendingRow(other.id)).toMatchObject({ status: 'verified', dmarcOk: false });
    expect(notices.map((n) => n.kind)).toEqual(['sender_verified', 'sender_verified']);
  });

  it('one record missing → again, last_checked_at set, still pending', async () => {
    const row = await insertSending();
    expect(await verifySendingDomain({ service: dbs.service, postmark: postmarkOf(true, false), resolveTxt: async () => [], notify }, row.id, NOW)).toBe('again');
    const after = await sendingRow(row.id);
    expect(after.status).toBe('pending');
    expect(after.lastCheckedAt?.toISOString()).toBe(NOW.toISOString());
    expect(notices).toEqual([]);
  });

  it('72 h → failed', async () => {
    const row = await insertSending({ createdAt: new Date(NOW.getTime() - 72 * HOUR) });
    expect(await verifySendingDomain({ service: dbs.service, postmark: postmarkOf(false, false), resolveTxt: async () => [], notify }, row.id, NOW)).toBe('done');
    expect(await sendingRow(row.id)).toMatchObject({ status: 'failed', error: VERIFY_COPY.timeout });
    expect(notices).toEqual([{ agencyId: A, kind: 'sender_failed', name: D, error: VERIFY_COPY.timeout }]);
  });

  it('verified / removed rows → done, no vendor call; removed meanwhile → no write', async () => {
    const pm = postmarkOf(true, true);
    const v = await insertSending({ status: 'verified' });
    expect(await verifySendingDomain({ service: dbs.service, postmark: pm, resolveTxt: async () => [], notify }, v.id, NOW)).toBe('done');
    expect(pm.verifyDkim).not.toHaveBeenCalled();
    const row = await insertSending({ agencyId: IDS.agencyB, domain: 'agency-b.com' });
    const racing: PostmarkDomains = {
      ...pm,
      verifyDkim: async (id) => {
        await dbs.owner.update(agencySendingDomain).set({ status: 'removed' }).where(eq(agencySendingDomain.id, row.id));
        return pmState(id, true, true);
      },
    };
    expect(await verifySendingDomain({ service: dbs.service, postmark: racing, resolveTxt: async () => [], notify }, row.id, NOW)).toBe('done');
    expect(await sendingRow(row.id)).toMatchObject({ status: 'removed', verifiedAt: null, lastCheckedAt: null });
    expect(notices).toEqual([]);
  });
});

describe('sweep helpers', () => {
  it('listDomainsToVerify: pending/verifying custom and pending sending rows younger than 72 h', async () => {
    const young = await insertDomain();
    await insertDomain({ agencyId: IDS.agencyB, hostname: 'x.agency-b.com', status: 'live' });
    const [s] = await dbs.owner.insert(agencySendingDomain).values({ agencyId: A, domain: 'agency-a.com', status: 'pending', createdAt: new Date(NOW.getTime() - HOUR) }).returning();
    await dbs.owner.insert(agencySendingDomain).values({ agencyId: IDS.agencyB, domain: 'agency-b.com', status: 'pending', createdAt: new Date(NOW.getTime() - 80 * HOUR) });
    expect(await listDomainsToVerify(dbs.service, NOW)).toEqual({ domainIds: [young.id], sendingDomainIds: [s!.id] });
  });

  it('expireStaleDomains: old pending/verifying rows → failed with the timeout copy, one notice each; removed rows untouched', async () => {
    const old = await insertDomain({ status: 'verifying', createdAt: new Date(NOW.getTime() - 73 * HOUR) });
    const removed = await insertDomain({ agencyId: IDS.agencyB, hostname: 'gone.agency-b.com', status: 'removed', createdAt: new Date(NOW.getTime() - 99 * HOUR) });
    const [s] = await dbs.owner.insert(agencySendingDomain).values({ agencyId: IDS.agencyB, domain: 'agency-b.com', status: 'pending', createdAt: new Date(NOW.getTime() - 80 * HOUR) }).returning();
    const r = await expireStaleDomains({ service: dbs.service, notify }, NOW);
    expect(r).toEqual({ domains: 1, sendingDomains: 1 });
    expect(await domainRow(old.id)).toMatchObject({ status: 'failed', error: VERIFY_COPY.timeout });
    expect((await domainRow(removed.id)).status).toBe('removed');
    expect(notices).toEqual(expect.arrayContaining([
      { agencyId: A, kind: 'domain_failed', name: H, error: VERIFY_COPY.timeout },
      { agencyId: IDS.agencyB, kind: 'sender_failed', name: 'agency-b.com', error: VERIFY_COPY.timeout },
    ]));
    expect(notices).toHaveLength(2);
    expect(s).toBeDefined();
    expect(await expireStaleDomains({ service: dbs.service, notify }, NOW)).toEqual({ domains: 0, sendingDomains: 0 });
  });

  it('domainNoticeRecipients: active agency-admin contacts of that agency only, de-duplicated', async () => {
    await dbs.owner.insert(contact).values([
      { agencyId: A, role: 'agency_admin', email: 'Boss@agency-a.example' },
      { agencyId: A, role: 'agency_admin', email: 'old@agency-a.example', active: false },
      { agencyId: A, role: 'account_manager', email: 'am@agency-a.example' },
      { agencyId: IDS.agencyB, role: 'agency_admin', email: 'boss@agency-b.example' },
    ]);
    const got = await domainNoticeRecipients(dbs.service, A);
    expect(got).toContain('boss@agency-a.example');
    expect(got).not.toContain('old@agency-a.example');
    expect(got).not.toContain('am@agency-a.example');
    expect(got).not.toContain('boss@agency-b.example');
    expect(new Set(got).size).toBe(got.length);
  });
});
