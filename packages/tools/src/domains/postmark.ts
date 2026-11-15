import { type TimedFetch, timedFetch } from '@cs/core/server';
import { DOMAIN_VENDOR_TIMEOUT_MS, DomainVendorError, type PostmarkDomainState, type PostmarkDomains, safeCode } from './errors';

const API = 'https://api.postmarkapp.com';
/** Postmark's "Domain not found" API error code (DELETE of an already-removed domain). */
const PM_DOMAIN_NOT_FOUND = 510;

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

  return {
    create: (domain) => {
      const d = domain.toLowerCase();
      return domainCall('POST', '/domains', { Name: d, ReturnPathDomain: returnPathFor(d) });
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
