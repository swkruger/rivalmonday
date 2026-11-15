import { type TimedFetch, timedFetch } from '@cs/core/server';
import { DOMAIN_VENDOR_TIMEOUT_MS, DomainVendorError, type PostmarkDomainState, type PostmarkDomains, safeCode } from './errors';

const API = 'https://api.postmarkapp.com';
/**
 * Postmark API error codes (422), confirmed against https://postmarkapp.com/developer/api/overview (2026-11-14):
 * 510 "This domain was not found.", 512 "Domain already exists.", 513 "You do not own this Domain."
 */
const PM_DOMAIN_NOT_FOUND = 510;
const PM_DOMAIN_EXISTS = 512;
const PM_DOMAIN_NOT_OWNED = 513;

/** The Postmark domain object fields we read (SPF fields are deprecated and ignored). */
interface PmDomain {
  ID: number; Name: string;
  DKIMVerified: boolean; DKIMHost: string; DKIMTextValue: string; DKIMPendingHost?: string; DKIMPendingTextValue?: string;
  ReturnPathDomain: string; ReturnPathDomainVerified: boolean; ReturnPathDomainCNAMEValue: string;
}
type Res = { status: number; body: unknown };

export const returnPathFor = (domain: string) => `pm-bounces.${domain}`;

/** Prefers the pending DKIM key (a new or rotating key is what the agency must publish). */
export function toPostmarkState(d: PmDomain): PostmarkDomainState {
  const pending = !!(d.DKIMPendingHost && d.DKIMPendingTextValue);
  return {
    id: Number(d.ID),
    dkim: { host: pending ? d.DKIMPendingHost! : d.DKIMHost, value: pending ? d.DKIMPendingTextValue! : d.DKIMTextValue, verified: d.DKIMVerified === true },
    returnPath: { host: d.ReturnPathDomain, value: d.ReturnPathDomainCNAMEValue, verified: d.ReturnPathDomainVerified === true },
  };
}

/**
 * Postmark account-API domain wrapper (13a1; header `X-Postmark-Account-Token`, `timeoutMs` 10 s). Errors are
 * `DomainVendorError`s whose text never carries the token or Postmark's free-text message.
 */
export function createPostmarkDomains(o: { token: string; fetch?: TimedFetch }): PostmarkDomains {
  const doFetch = o.fetch ?? timedFetch();

  async function call(method: string, path: string, body?: unknown): Promise<Res> {
    let res: Response;
    try {
      res = await doFetch(`${API}${path}`, {
        method,
        headers: { accept: 'application/json', 'X-Postmark-Account-Token': o.token, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        timeoutMs: DOMAIN_VENDOR_TIMEOUT_MS,
      });
    } catch {
      throw new DomainVendorError('unavailable', `Postmark ${method} ${path}: network error`);
    }
    return { status: res.status, body: await res.json().catch(() => null) };
  }

  const pmCode = (r: Res) => (r.body as { ErrorCode?: unknown } | null)?.ErrorCode;
  function fail(method: string, path: string, r: Res): never {
    const code = safeCode(pmCode(r));
    const text = `Postmark ${method} ${path}: HTTP ${r.status}${code ? ` (ErrorCode ${code})` : ''}`;
    // 422 = Postmark refused the request (invalid or unknown domain); 401/5xx/other = not usable right now.
    throw new DomainVendorError(r.status === 422 || r.status === 404 ? 'invalid' : 'unavailable', text);
  }

  async function domainCall(method: string, path: string, body?: unknown): Promise<PostmarkDomainState> {
    const r = await call(method, path, body);
    if (r.status !== 200) fail(method, path, r);
    return toPostmarkState(r.body as PmDomain);
  }

  /**
   * The domain already on our account, by exact name (case-insensitive), else null. Pages the list (500 per page, Postmark's
   * maximum) and then reads the full domain object (the list carries no DKIM/Return-Path values).
   */
  async function findByName(name: string): Promise<PostmarkDomainState | null> {
    for (let offset = 0; offset < 10_000; offset += 500) {
      const path = '/domains';
      const r = await call('GET', `${path}?count=500&offset=${offset}`);
      if (r.status !== 200) fail('GET', path, r);
      const page = (r.body as { Domains?: { ID: number; Name: string }[] } | null)?.Domains ?? [];
      const hit = page.find((x) => typeof x.Name === 'string' && x.Name.toLowerCase() === name);
      if (hit) return domainCall('GET', `/domains/${Math.trunc(Number(hit.ID))}`);
      if (page.length < 500) return null;
    }
    return null;
  }

  return {
    async create(domain) {
      const d = domain.toLowerCase();
      const r = await call('POST', '/domains', { Name: d, ReturnPathDomain: returnPathFor(d) });
      if (r.status === 200) return toPostmarkState(r.body as PmDomain);
      const code = Number(pmCode(r));
      // 512 "Domain already exists" on our account: possibly a create that crashed before the DB write, so read it back and
      // let a retry recover. Never adopt a verified domain (the platform's own sender, another agency's live domain): in use.
      if (r.status === 422 && code === PM_DOMAIN_EXISTS) {
        const found = await findByName(d);
        if (found && !found.dkim.verified && !found.returnPath.verified) return { ...found, existing: true };
        if (found) throw new DomainVendorError('in_use', `Postmark POST /domains: HTTP 422 (ErrorCode ${PM_DOMAIN_EXISTS}), already verified`);
        throw new DomainVendorError('in_use', `Postmark POST /domains: HTTP 422 (ErrorCode ${PM_DOMAIN_EXISTS}), not on this account`);
      }
      // 513 "You do not own this Domain": another Postmark account has it.
      if (r.status === 422 && code === PM_DOMAIN_NOT_OWNED) throw new DomainVendorError('in_use', `Postmark POST /domains: HTTP 422 (ErrorCode ${PM_DOMAIN_NOT_OWNED})`);
      fail('POST', '/domains', r);
    },
    verifyDkim: (id) => domainCall('PUT', `/domains/${Math.trunc(id)}/verifyDkim`),
    verifyReturnPath: (id) => domainCall('PUT', `/domains/${Math.trunc(id)}/verifyReturnPath`),
    async remove(id) {
      const path = `/domains/${Math.trunc(id)}`;
      const r = await call('DELETE', path);
      if (r.status === 200 || r.status === 404 || (r.status === 422 && Number(pmCode(r)) === PM_DOMAIN_NOT_FOUND)) return;
      fail('DELETE', path, r);
    },
  };
}
