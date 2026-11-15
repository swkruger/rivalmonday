import { DomainVendorError, type DomainVendorErrorCode, type PostmarkDomainState, type PostmarkDomains, type VercelDomainState, type VercelDomains } from './errors';
import { VERCEL_DEFAULT_CNAME } from './vercel';
import { returnPathFor } from './postmark';

/**
 * In-memory Vercel/Postmark stand-ins (13a1 R8): DEMO/TEST databases, Vitest and the E2E flag. One instance per process, so
 * a tool call and a later worker/test step see the same domains. Nothing is persisted.
 */
export interface FakeVercelDomains extends VercelDomains {
  /** The next call (any method) throws `DomainVendorError(code)`; one-shot. */
  failNext(code: DomainVendorErrorCode): void;
  /** DNS + ownership done: the hostname reports verified and not misconfigured. */
  setVerified(hostname: string): void;
}
export interface FakePostmarkDomains extends PostmarkDomains {
  failNext(code: DomainVendorErrorCode): void;
  /** DKIM and Return-Path records published: the next verify calls report them verified. */
  setVerified(id: number): void;
}

function oneShot() {
  let next: DomainVendorErrorCode | null = null;
  return {
    set: (c: DomainVendorErrorCode) => { next = c; },
    check: (what: string) => {
      if (!next) return;
      const c = next;
      next = null;
      throw new DomainVendorError(c, `Fake ${what}: forced ${c}`);
    },
  };
}

function createFakeVercel(): FakeVercelDomains {
  const domains = new Map<string, { verified: boolean }>();
  const fail = oneShot();
  const state = (h: string): VercelDomainState => {
    const d = domains.get(h);
    if (!d) throw new DomainVendorError('invalid', `Fake Vercel: unknown domain ${h}`);
    return { verified: d.verified, misconfigured: !d.verified, records: [{ type: 'CNAME', name: h, value: VERCEL_DEFAULT_CNAME }], message: null };
  };
  return {
    failNext: fail.set,
    setVerified: (hostname) => { domains.set(hostname.toLowerCase(), { verified: true }); },
    async add(hostname) {
      fail.check('Vercel add');
      const h = hostname.toLowerCase();
      if (!domains.has(h)) domains.set(h, { verified: false });
      return state(h);
    },
    async status(hostname) {
      fail.check('Vercel status');
      return state(hostname.toLowerCase());
    },
    async remove(hostname) {
      fail.check('Vercel remove');
      domains.delete(hostname.toLowerCase());
    },
  };
}

function createFakePostmark(): FakePostmarkDomains {
  const domains = new Map<number, { name: string; published: boolean; dkim: boolean; returnPath: boolean }>();
  let nextId = 1000;
  const fail = oneShot();
  const get = (id: number) => {
    const d = domains.get(id);
    if (!d) throw new DomainVendorError('invalid', `Fake Postmark: unknown domain ${id}`);
    return d;
  };
  const state = (id: number): PostmarkDomainState => {
    const d = get(id);
    return {
      id,
      dkim: { host: `20261114pm._domainkey.${d.name}`, value: `k=rsa;p=FAKEDKIM${id}`, verified: d.dkim },
      returnPath: { host: returnPathFor(d.name), value: 'pm.mtasv.net', verified: d.returnPath },
    };
  };
  return {
    failNext: fail.set,
    setVerified: (id) => { get(id).published = true; },
    async create(domain) {
      fail.check('Postmark create');
      const id = nextId++;
      domains.set(id, { name: domain.toLowerCase(), published: false, dkim: false, returnPath: false });
      return state(id);
    },
    async verifyDkim(id) {
      fail.check('Postmark verifyDkim');
      const d = get(id);
      d.dkim = d.published;
      return state(id);
    },
    async verifyReturnPath(id) {
      fail.check('Postmark verifyReturnPath');
      const d = get(id);
      d.returnPath = d.published;
      return state(id);
    },
    async remove(id) {
      fail.check('Postmark remove');
      domains.delete(id);
    },
  };
}

let vercel: FakeVercelDomains | null = null;
let postmark: FakePostmarkDomains | null = null;
export const fakeVercelDomains = (): FakeVercelDomains => (vercel ??= createFakeVercel());
export const fakePostmarkDomains = (): FakePostmarkDomains => (postmark ??= createFakePostmark());
/** Tests: drop the process-wide fakes (the next call starts empty). */
export function resetFakeDomainVendors(): void {
  vercel = null;
  postmark = null;
}
