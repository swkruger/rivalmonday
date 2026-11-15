import { type TimedFetch, timedFetch } from '@cs/core/server';
import type { DnsRecord } from '@cs/db';
import { DOMAIN_VENDOR_TIMEOUT_MS, DomainVendorError, safeCode, type VercelDomainState, type VercelDomains } from './errors';

const API = 'https://api.vercel.com';
/** Used when the config endpoint recommends no CNAME (Vercel's long-standing generic target). */
export const VERCEL_DEFAULT_CNAME = 'cname.vercel-dns.com.';

interface ProjectDomain { name: string; verified: boolean; verification?: { domain: string; type: string; value: string; reason?: string }[] }
interface DomainConfig { misconfigured: boolean; recommendedCNAME?: { rank: number; value: string }[] }
type Res = { status: number; body: unknown };

/**
 * Vercel project-domain wrapper (13a1 P13; contracts confirmed live in Task 0). Bearer token + `teamId` query on every call;
 * `timeoutMs` 10 s. Errors are `DomainVendorError`s whose text never carries the token or a query string.
 */
export function createVercelDomains(o: { token: string; projectId: string; teamId?: string; fetch?: TimedFetch }): VercelDomains {
  const doFetch = o.fetch ?? timedFetch();
  const project = encodeURIComponent(o.projectId);

  async function call(method: string, path: string, query: Record<string, string> = {}, body?: unknown): Promise<Res> {
    const params = new URLSearchParams({ ...query, ...(o.teamId ? { teamId: o.teamId } : {}) });
    const qs = params.size ? `?${params}` : '';
    let res: Response;
    try {
      res = await doFetch(`${API}${path}${qs}`, {
        method,
        headers: { authorization: `Bearer ${o.token}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        timeoutMs: DOMAIN_VENDOR_TIMEOUT_MS,
      });
    } catch {
      // The cause (a fetch/abort error) may echo the URL; it is deliberately dropped.
      throw new DomainVendorError('unavailable', `Vercel ${method} ${path}: network error`);
    }
    return { status: res.status, body: await res.json().catch(() => null) };
  }

  const errCode = (r: Res) => safeCode((r.body as { error?: { code?: unknown } } | null)?.error?.code);
  function fail(method: string, path: string, r: Res, invalidOn400 = true): never {
    const code = errCode(r);
    const text = `Vercel ${method} ${path}: HTTP ${r.status}${code ? ` (${code})` : ''}`;
    if (r.status === 409 || code === 'domain_already_in_use') throw new DomainVendorError('in_use', text);
    if (invalidOn400 && (r.status === 400 || r.status === 404)) throw new DomainVendorError('invalid', text);
    throw new DomainVendorError('unavailable', text);
  }

  const domainPath = (h: string) => `/v9/projects/${project}/domains/${encodeURIComponent(h)}`;

  async function getDomain(h: string): Promise<ProjectDomain> {
    const path = domainPath(h);
    const r = await call('GET', path);
    if (r.status !== 200) fail('GET', path, r);
    return r.body as ProjectDomain;
  }

  async function config(h: string): Promise<DomainConfig> {
    const path = `/v6/domains/${encodeURIComponent(h)}/config`;
    // projectIdOrName: correct recommendations for a domain not yet (fully) attached.
    const r = await call('GET', path, { projectIdOrName: o.projectId });
    if (r.status !== 200) fail('GET', path, r, false);
    return r.body as DomainConfig;
  }

  function toState(h: string, d: ProjectDomain, c: DomainConfig, message: string | null): VercelDomainState {
    const cname = [...(c.recommendedCNAME ?? [])].sort((a, b) => a.rank - b.rank)[0]?.value || VERCEL_DEFAULT_CNAME;
    const records: DnsRecord[] = [{ type: 'CNAME', name: h, value: cname }];
    for (const v of d.verification ?? []) records.push({ type: v.type, name: v.domain, value: v.value });
    return { verified: d.verified === true, misconfigured: c.misconfigured !== false, records, message };
  }

  return {
    async add(hostname) {
      const h = hostname.toLowerCase();
      const path = `/v10/projects/${project}/domains`;
      const r = await call('POST', path, {}, { name: h });
      let d: ProjectDomain;
      if (r.status === 200) d = r.body as ProjectDomain;
      else if (r.status === 400 && errCode(r) !== 'domain_already_in_use') {
        // 400 also means "already on this project": read it back; absent → the hostname itself was refused.
        const back = await call('GET', domainPath(h));
        if (back.status !== 200) fail('POST', path, r);
        d = back.body as ProjectDomain;
      } else fail('POST', path, r);
      return toState(h, d, await config(h), null);
    },

    async status(hostname) {
      const h = hostname.toLowerCase();
      let d = await getDomain(h);
      let message: string | null = null;
      if (!d.verified) {
        // Ask Vercel to re-check the TXT record. 400 = still missing/mismatched; keep the GET's verification records.
        const path = `${domainPath(h)}/verify`;
        const r = await call('POST', path);
        if (r.status === 200) d = { ...d, ...(r.body as ProjectDomain), verification: (r.body as ProjectDomain).verified ? undefined : d.verification };
        else if (r.status === 400) message = `Verification pending${errCode(r) ? ` (${errCode(r)})` : ''}: TXT record not found or not matching`;
        else fail('POST', path, r, false);
      }
      return toState(h, d, await config(h), message);
    },

    async remove(hostname) {
      const path = domainPath(hostname.toLowerCase());
      const r = await call('DELETE', path);
      if (r.status === 200 || r.status === 404) return;
      fail('DELETE', path, r, false);
    },
  };
}
