import { afterEach, describe, expect, it } from 'vitest';
import { DomainVendorError } from './errors';
import { fakePostmarkDomains, fakeVercelDomains, resetFakeDomainVendors } from './fakes';
import { domainVendorsFor } from './vendors';

const tokens = { VERCEL_API_TOKEN: 'v_tok', VERCEL_PROJECT_ID: 'prj_1', POSTMARK_ACCOUNT_TOKEN: 'pm_tok' };
/** A production-like env: no Vitest marker, NODE_ENV production. */
const prod = (o: Record<string, string> = {}) => ({ NODE_ENV: 'production', ...o }) as unknown as NodeJS.ProcessEnv;

afterEach(() => resetFakeDomainVendors());

describe('domainVendorsFor', () => {
  it('fakes for test env and the E2E flag', () => {
    for (const envName of ['test', 'demo'] as const) {
      const r = domainVendorsFor(prod(tokens), envName);
      expect(r.fake).toBe(true);
      expect(r.vercel).toBe(fakeVercelDomains());
      expect(r.postmark).toBe(fakePostmarkDomains());
    }
    expect(domainVendorsFor(prod({ VITEST: 'true' }), 'dev').fake).toBe(true);
    expect(domainVendorsFor({ NODE_ENV: 'test' } as unknown as NodeJS.ProcessEnv, 'dev').fake).toBe(true);
    const flagged = domainVendorsFor(prod({ DOMAINS_FAKE_VENDORS: '1' }), 'dev');
    expect(flagged).toMatchObject({ fake: true });
    expect(flagged.vercel).not.toBeNull();
  });

  it('allowFakeFlag false ignores the flag', () => {
    expect(domainVendorsFor(prod({ DOMAINS_FAKE_VENDORS: '1' }), 'dev', { allowFakeFlag: false })).toEqual({ vercel: null, postmark: null, fake: false });
    const real = domainVendorsFor(prod({ ...tokens, DOMAINS_FAKE_VENDORS: '1' }), 'dev', { allowFakeFlag: false });
    expect(real.fake).toBe(false);
    expect(real.vercel).not.toBe(fakeVercelDomains());
    expect(real.vercel).not.toBeNull();
  });

  it('ignores the E2E flag on any VERCEL_ENV (defence in depth); test/demo/Vitest still get fakes', () => {
    for (const VERCEL_ENV of ['production', 'preview', 'development']) {
      expect(domainVendorsFor(prod({ DOMAINS_FAKE_VENDORS: '1', VERCEL_ENV }), 'dev')).toEqual({ vercel: null, postmark: null, fake: false });
      expect(domainVendorsFor(prod({ ...tokens, DOMAINS_FAKE_VENDORS: '1', VERCEL_ENV }), 'dev').fake).toBe(false);
      expect(domainVendorsFor(prod({ DOMAINS_FAKE_VENDORS: '1', VERCEL_ENV }), 'demo').fake).toBe(true);
    }
  });

  it('null without tokens', () => {
    expect(domainVendorsFor(prod(), 'dev')).toEqual({ vercel: null, postmark: null, fake: false });
    // Vercel needs its project id as well as the token; each vendor stands alone.
    const partial = domainVendorsFor(prod({ VERCEL_API_TOKEN: 'v_tok', POSTMARK_ACCOUNT_TOKEN: 'pm_tok' }), 'dev');
    expect(partial.vercel).toBeNull();
    expect(partial.postmark).not.toBeNull();
    expect(domainVendorsFor(prod({ DOMAINS_FAKE_VENDORS: 'true' }), 'dev').fake).toBe(false); // only '1'
  });
});

describe('fakes', () => {
  it('vercel fake: add → CNAME, setVerified → live, failNext, remove', async () => {
    const v = fakeVercelDomains();
    const s = await v.add('Intel.Agency.com');
    expect(s).toEqual({ verified: false, misconfigured: true, message: null, records: [{ type: 'CNAME', name: 'intel.agency.com', value: 'cname.vercel-dns.com.' }] });
    expect(await v.status('intel.agency.com')).toMatchObject({ verified: false, misconfigured: true });
    v.setVerified('intel.agency.com');
    expect(await v.status('intel.agency.com')).toMatchObject({ verified: true, misconfigured: false });
    v.failNext('in_use');
    const err = await v.add('other.agency.com').catch((e) => e);
    expect(err).toBeInstanceOf(DomainVendorError);
    expect(err.code).toBe('in_use');
    expect((await v.add('other.agency.com')).verified).toBe(false); // failNext is one-shot
    await v.remove('intel.agency.com');
    await v.remove('intel.agency.com');
    expect((await v.status('intel.agency.com').catch((e) => e)).code).toBe('invalid');
  });

  it('postmark fake: create, verify only after setVerified, failNext, remove', async () => {
    const pm = fakePostmarkDomains();
    const s = await pm.create('agency.com');
    expect(s.dkim.host).toMatch(/\._domainkey\.agency\.com$/);
    expect(s.returnPath).toEqual({ host: 'pm-bounces.agency.com', value: 'pm.mtasv.net', verified: false });
    expect((await pm.verifyDkim(s.id)).dkim.verified).toBe(false);
    pm.setVerified(s.id);
    expect((await pm.verifyDkim(s.id)).dkim.verified).toBe(true);
    expect((await pm.verifyReturnPath(s.id)).returnPath.verified).toBe(true);
    pm.failNext('unavailable');
    expect((await pm.verifyDkim(s.id).catch((e) => e)).code).toBe('unavailable');
    await pm.remove(s.id);
    expect((await pm.verifyDkim(s.id).catch((e) => e)).code).toBe('invalid');
  });

  it('postmark fake mirrors 512: an unverified domain already there is read back (existing), a verified one is in_use', async () => {
    const pm = fakePostmarkDomains();
    const s = await pm.create('agency.com');
    expect(await pm.create('Agency.com')).toMatchObject({ id: s.id, existing: true });
    pm.setVerified(s.id);
    await pm.verifyDkim(s.id);
    expect((await pm.create('agency.com').catch((e) => e)).code).toBe('in_use');
  });

  it('unknown names are deterministic across processes: verified unless they contain pending/fail; removed ones stay unknown', async () => {
    const v = fakeVercelDomains();
    expect(await v.status('Intel.Agency.com')).toMatchObject({ verified: true, misconfigured: false, message: null });
    expect(await v.status('pending.agency.com')).toMatchObject({ verified: false, misconfigured: true, message: null });
    expect((await v.status('fail.agency.com')).message).not.toBeNull();
    await v.remove('intel.agency.com');
    expect((await v.status('intel.agency.com').catch((e) => e)).code).toBe('invalid');
    const pm = fakePostmarkDomains();
    expect((await pm.verifyDkim(4242)).dkim.verified).toBe(true);
    expect((await pm.verifyReturnPath(4242)).returnPath.verified).toBe(true);
    await pm.remove(4242);
    expect((await pm.verifyDkim(4242).catch((e) => e)).code).toBe('invalid');
  });
});
