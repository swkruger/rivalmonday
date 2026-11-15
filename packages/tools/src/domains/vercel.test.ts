import type { TimedFetch } from '@cs/core/server';
import { describe, expect, it } from 'vitest';
import { DomainVendorError } from './errors';
import { createVercelDomains } from './vercel';

const TOKEN = 'vercel_secret_token_abc123';
type Call = { url: string; method: string; headers: Record<string, string>; timeoutMs?: number };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Routes by "METHOD path" (query stripped); records every call. */
function fakeFetch(routes: Record<string, () => Response>): { fetch: TimedFetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: TimedFetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ url, method, headers: (init?.headers ?? {}) as Record<string, string>, timeoutMs: init?.timeoutMs });
    const key = `${method} ${new URL(url).pathname}`;
    const r = routes[key];
    if (!r) throw new Error(`unrouted ${key}`);
    return r();
  };
  return { fetch, calls };
}

const pending = {
  name: 'intel.agency.com', apexName: 'agency.com', projectId: 'prj_1', verified: false,
  verification: [{ domain: '_vercel.agency.com', type: 'TXT', value: 'vc-domain-verify=intel.agency.com,abc', reason: 'pending_domain_verification' }],
};
const config = (misconfigured: boolean) => ({
  misconfigured, configuredBy: misconfigured ? null : 'CNAME',
  recommendedCNAME: [{ rank: 2, value: 'old.vercel-dns.com.' }, { rank: 1, value: 'abc.vercel-dns-017.com.' }],
  recommendedIPv4: [{ rank: 1, value: ['76.76.21.21'] }],
});

describe('createVercelDomains', () => {
  it('add maps records', async () => {
    const { fetch, calls } = fakeFetch({
      'POST /v10/projects/prj_1/domains': () => json(200, pending),
      'GET /v6/domains/intel.agency.com/config': () => json(200, config(true)),
    });
    const v = createVercelDomains({ token: TOKEN, projectId: 'prj_1', teamId: 'team_9', fetch });
    const s = await v.add('intel.agency.com');
    expect(s).toEqual({
      verified: false, misconfigured: true, message: null,
      records: [
        { type: 'CNAME', name: 'intel.agency.com', value: 'abc.vercel-dns-017.com.' },
        { type: 'TXT', name: '_vercel.agency.com', value: 'vc-domain-verify=intel.agency.com,abc' },
      ],
    });
    for (const c of calls) {
      expect(new URL(c.url).searchParams.get('teamId')).toBe('team_9');
      expect(c.headers.authorization).toBe(`Bearer ${TOKEN}`);
      expect(c.timeoutMs).toBe(10_000);
    }
    expect(new URL(calls[1]!.url).searchParams.get('projectIdOrName')).toBe('prj_1');
  });

  it('409 → in_use', async () => {
    const { fetch } = fakeFetch({ 'POST /v10/projects/prj_1/domains': () => json(409, { error: { code: 'domain_already_in_use', message: 'in use by another project' } }) });
    const err = await createVercelDomains({ token: TOKEN, projectId: 'prj_1', fetch }).add('intel.agency.com').catch((e) => e);
    expect(err).toBeInstanceOf(DomainVendorError);
    expect(err.code).toBe('in_use');
  });

  it('400 domain_already_in_use → in_use; other 400 → invalid; 402/5xx → unavailable', async () => {
    const make = (status: number, code: string) => createVercelDomains({ token: TOKEN, projectId: 'prj_1', fetch: fakeFetch({
      'POST /v10/projects/prj_1/domains': () => json(status, { error: { code, message: 'x' } }),
      'GET /v9/projects/prj_1/domains/intel.agency.com': () => json(404, { error: { code: 'not_found' } }),
    }).fetch });
    expect((await make(400, 'domain_already_in_use').add('intel.agency.com').catch((e) => e)).code).toBe('in_use');
    expect((await make(400, 'invalid_domain').add('intel.agency.com').catch((e) => e)).code).toBe('invalid');
    expect((await make(402, 'payment_required').add('intel.agency.com').catch((e) => e)).code).toBe('unavailable');
    expect((await make(503, 'down').add('intel.agency.com').catch((e) => e)).code).toBe('unavailable');
  });

  it('add of a domain already on this project reads it back', async () => {
    const { fetch } = fakeFetch({
      'POST /v10/projects/prj_1/domains': () => json(400, { error: { code: 'domain_already_exists', message: 'already on project' } }),
      'GET /v9/projects/prj_1/domains/intel.agency.com': () => json(200, { ...pending, verified: true, verification: undefined }),
      'GET /v6/domains/intel.agency.com/config': () => json(200, config(false)),
    });
    const s = await createVercelDomains({ token: TOKEN, projectId: 'prj_1', fetch }).add('intel.agency.com');
    expect(s.verified).toBe(true);
    expect(s.misconfigured).toBe(false);
  });

  it('status combines verified + misconfigured', async () => {
    let verified = false;
    const { fetch, calls } = fakeFetch({
      'GET /v9/projects/prj_1/domains/intel.agency.com': () => json(200, { ...pending, verified }),
      'POST /v9/projects/prj_1/domains/intel.agency.com/verify': () => (verified
        ? json(200, { ...pending, verified: true, verification: undefined })
        : json(400, { error: { code: 'missing_txt_record', message: 'TXT not found' } })),
      'GET /v6/domains/intel.agency.com/config': () => json(200, config(!verified)),
    });
    const v = createVercelDomains({ token: TOKEN, projectId: 'prj_1', fetch });
    const a = await v.status('intel.agency.com');
    expect(a).toMatchObject({ verified: false, misconfigured: true });
    expect(a.records.map((r) => r.type)).toEqual(['CNAME', 'TXT']);
    expect(a.message).toMatch(/TXT/);
    verified = true;
    // Verified on the project but DNS still pointing elsewhere: not live yet.
    const mid = createVercelDomains({ token: TOKEN, projectId: 'prj_1', fetch: fakeFetch({
      'GET /v9/projects/prj_1/domains/intel.agency.com': () => json(200, { ...pending, verified: true, verification: undefined }),
      'GET /v6/domains/intel.agency.com/config': () => json(200, config(true)),
    }).fetch });
    expect(await mid.status('intel.agency.com')).toMatchObject({ verified: true, misconfigured: true });
    const b = await v.status('intel.agency.com');
    expect(b).toMatchObject({ verified: true, misconfigured: false, message: null });
    expect(calls.filter((c) => c.method === 'POST').length).toBe(1); // verify only while unverified
  });

  it('status of an unknown domain → invalid', async () => {
    const { fetch } = fakeFetch({ 'GET /v9/projects/prj_1/domains/intel.agency.com': () => json(404, { error: { code: 'not_found' } }) });
    const err = await createVercelDomains({ token: TOKEN, projectId: 'prj_1', fetch }).status('intel.agency.com').catch((e) => e);
    expect(err).toBeInstanceOf(DomainVendorError);
    expect(err.code).toBe('invalid');
  });

  it('remove: 200 and 404 both resolve', async () => {
    let status = 200;
    const { fetch, calls } = fakeFetch({ 'DELETE /v9/projects/prj_1/domains/intel.agency.com': () => json(status, status === 200 ? {} : { error: { code: 'not_found' } }) });
    const v = createVercelDomains({ token: TOKEN, projectId: 'prj_1', fetch });
    await v.remove('intel.agency.com');
    status = 404;
    await v.remove('intel.agency.com');
    expect(calls).toHaveLength(2);
  });

  it('error text has no token', async () => {
    const leaky = { error: { code: 'forbidden', message: `bad token ${TOKEN}` } };
    const fetches: TimedFetch[] = [
      fakeFetch({ 'POST /v10/projects/prj_1/domains': () => json(403, leaky) }).fetch,
      async () => { throw new Error(`connect ECONNREFUSED https://api.vercel.com/v10/projects/prj_1/domains?teamId=team_9 ${TOKEN}`); },
    ];
    for (const fetch of fetches) {
      const err = await createVercelDomains({ token: TOKEN, projectId: 'prj_1', teamId: 'team_9', fetch }).add('intel.agency.com').catch((e) => e);
      expect(err).toBeInstanceOf(DomainVendorError);
      expect(err.code).toBe('unavailable');
      const text = `${err.message} ${err.stack} ${JSON.stringify(err)} ${String(err.cause ?? '')}`;
      expect(text).not.toContain(TOKEN);
      expect(text).not.toContain('teamId');
      expect(err.message).not.toContain('?');
    }
  });
});
