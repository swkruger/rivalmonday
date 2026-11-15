import type { TimedFetch } from '@cs/core/server';
import { describe, expect, it } from 'vitest';
import { DomainVendorError } from './errors';
import { createPostmarkDomains } from './postmark';

const TOKEN = 'pm_account_token_xyz789';
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const domain = (o: Record<string, unknown> = {}) => ({
  ID: 36735, Name: 'agency.com', SPFVerified: false, SPFHost: 'agency.com', SPFTextValue: 'v=spf1 a mx include:spf.mtasv.net ~all',
  DKIMVerified: false, WeakDKIM: false, DKIMHost: '', DKIMTextValue: '', DKIMPendingHost: '20261114pm._domainkey.agency.com',
  DKIMPendingTextValue: 'k=rsa;p=MIGfPENDING', DKIMRevokedHost: '', DKIMRevokedTextValue: '', SafeToRemoveRevokedKeyFromDNS: false,
  DKIMUpdateStatus: 'Pending', ReturnPathDomain: 'pm-bounces.agency.com', ReturnPathDomainVerified: false, ReturnPathDomainCNAMEValue: 'pm.mtasv.net', ...o,
});
type Call = { url: string; method: string; headers: Record<string, string>; body?: string; timeoutMs?: number };
function fakeFetch(route: (method: string, path: string) => Response): { fetch: TimedFetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: TimedFetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ url, method, headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body as string | undefined, timeoutMs: init?.timeoutMs });
    return route(method, new URL(url).pathname);
  };
  return { fetch, calls };
}

describe('createPostmarkDomains', () => {
  it('create maps pending DKIM', async () => {
    const { fetch, calls } = fakeFetch(() => json(200, domain()));
    const s = await createPostmarkDomains({ token: TOKEN, fetch }).create('agency.com');
    expect(s).toEqual({
      id: 36735,
      dkim: { host: '20261114pm._domainkey.agency.com', value: 'k=rsa;p=MIGfPENDING', verified: false },
      returnPath: { host: 'pm-bounces.agency.com', value: 'pm.mtasv.net', verified: false },
    });
    expect(calls[0]).toMatchObject({ url: 'https://api.postmarkapp.com/domains', method: 'POST', timeoutMs: 10_000 });
    expect(JSON.parse(calls[0]!.body!)).toEqual({ Name: 'agency.com', ReturnPathDomain: 'pm-bounces.agency.com' });
    expect(calls[0]!.headers['X-Postmark-Account-Token']).toBe(TOKEN);
  });

  it('uses the active DKIM key when nothing is pending', async () => {
    const { fetch } = fakeFetch(() => json(200, domain({ DKIMHost: '2025pm._domainkey.agency.com', DKIMTextValue: 'k=rsa;p=ACTIVE', DKIMPendingHost: '', DKIMPendingTextValue: '', DKIMVerified: true })));
    const s = await createPostmarkDomains({ token: TOKEN, fetch }).create('agency.com');
    expect(s.dkim).toEqual({ host: '2025pm._domainkey.agency.com', value: 'k=rsa;p=ACTIVE', verified: true });
  });

  it('create of a domain already on the account (ErrorCode 512) reads it back, so a crash-retry recovers', async () => {
    const { fetch, calls } = fakeFetch((method, path) => {
      if (method === 'POST') return json(422, { ErrorCode: 512, Message: 'Domain already exists.' });
      if (method === 'GET' && path === '/domains') return json(200, { TotalCount: 2, Domains: [{ ID: 1, Name: 'other.com' }, { ID: 36735, Name: 'Agency.com' }] });
      if (method === 'GET' && path === '/domains/36735') return json(200, domain());
      return json(404, {});
    });
    const s = await createPostmarkDomains({ token: TOKEN, fetch }).create('agency.com');
    expect(s.id).toBe(36735);
    expect(s.dkim.host).toBe('20261114pm._domainkey.agency.com');
    expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}${new URL(c.url).search}`)).toEqual(['POST /domains', 'GET /domains?count=500&offset=0', 'GET /domains/36735']);
  });

  it('512 without a match on the account, or 513 (another account owns it) → in_use', async () => {
    const dup = fakeFetch((method) => (method === 'POST' ? json(422, { ErrorCode: 512 }) : json(200, { TotalCount: 0, Domains: [] })));
    await expect(createPostmarkDomains({ token: TOKEN, fetch: dup.fetch }).create('agency.com')).rejects.toMatchObject({ code: 'in_use' });
    const other = fakeFetch(() => json(422, { ErrorCode: 513, Message: 'You do not own this Domain.' }));
    const e = (await createPostmarkDomains({ token: TOKEN, fetch: other.fetch }).create('agency.com').catch((x: unknown) => x)) as DomainVendorError;
    expect(e).toBeInstanceOf(DomainVendorError);
    expect(e).toMatchObject({ code: 'in_use' });
    expect(e.message).not.toContain('own');
  });

  it('verify flips flags', async () => {
    const { fetch, calls } = fakeFetch((_method, path) => {
      if (path === '/domains/36735/verifyDkim') return json(200, domain({ DKIMVerified: true }));
      if (path === '/domains/36735/verifyReturnPath') return json(200, domain({ DKIMVerified: true, ReturnPathDomainVerified: true }));
      return json(404, {});
    });
    const pm = createPostmarkDomains({ token: TOKEN, fetch });
    expect((await pm.verifyDkim(36735)).dkim.verified).toBe(true);
    const r = await pm.verifyReturnPath(36735);
    expect(r.returnPath.verified).toBe(true);
    expect(calls.map((c) => c.method)).toEqual(['PUT', 'PUT']);
  });

  it('remove resolves on 200 and on an already-deleted domain', async () => {
    let res = () => json(200, { ErrorCode: 0, Message: 'Domain removed.' });
    const { fetch, calls } = fakeFetch(() => res());
    const pm = createPostmarkDomains({ token: TOKEN, fetch });
    await pm.remove(36735);
    res = () => json(422, { ErrorCode: 510, Message: 'Domain not found.' });
    await pm.remove(36735);
    res = () => json(404, {});
    await pm.remove(36735);
    expect(calls.every((c) => c.method === 'DELETE' && c.url === 'https://api.postmarkapp.com/domains/36735')).toBe(true);
  });

  it('errors: 422 → invalid, 401/5xx/network → unavailable, never the token', async () => {
    const run = (fetch: TimedFetch) => createPostmarkDomains({ token: TOKEN, fetch }).create('agency.com').catch((e) => e);
    const e422 = await run(fakeFetch(() => json(422, { ErrorCode: 503, Message: 'Invalid domain' })).fetch);
    expect(e422).toBeInstanceOf(DomainVendorError);
    expect(e422.code).toBe('invalid');
    const e401 = await run(fakeFetch(() => json(401, { ErrorCode: 10, Message: `Bad token ${TOKEN}` })).fetch);
    expect(e401.code).toBe('unavailable');
    const e500 = await run(fakeFetch(() => json(500, {})).fetch);
    expect(e500.code).toBe('unavailable');
    const eNet = await run(async () => { throw new Error(`boom ${TOKEN}`); });
    expect(eNet.code).toBe('unavailable');
    for (const e of [e422, e401, e500, eNet]) expect(`${e.message} ${e.stack} ${JSON.stringify(e)} ${String(e.cause ?? '')}`).not.toContain(TOKEN);
  });
});
