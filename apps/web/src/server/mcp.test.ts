import { generatePat } from '@cs/core';
import { apiToken, membership } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { sql } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
vi.mock('./db', () => ({ dbs: () => ({ app: dbs.app, service: dbs.service }) }));
vi.mock('./env', () => ({ webEnv: () => ({ appUrl: 'https://app.example', webMonitoring: false, platformAdmins: [] }) }));
vi.mock('./queue', () => ({ enqueueFor: () => async () => {}, jobStatusFor: () => async () => null }));
vi.mock('./runtime-env', () => ({ platformAdmins: () => [] }));
const store = createMemoryStore();
vi.mock('./store', () => ({ webStore: () => store }));

const URL_ = 'https://app.example/mcp';
const post = (token?: string, body: unknown = { jsonrpc: '2.0', id: 1, method: 'tools/list' }) => new Request(URL_, {
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
});

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.execute(sql`truncate auth."user", auth.verification, auth."rateLimit" cascade`);
  await dbs.owner.execute(sql`insert into auth."user" (id, name, email, "emailVerified") values ('u1', 'u1', 'u1@e.co', true)`);
  await dbs.service.insert(membership).values({ userId: 'u1', agencyId: IDS.agencyA, role: 'agency_admin', createdBy: 't' });
});

describe('/mcp route', () => {
  it('PAT round-trip through the route handler returns tools/list', async () => {
    const g = generatePat();
    await dbs.service.insert(apiToken).values({ agencyId: IDS.agencyA, userId: 'u1', name: 't', tokenHash: g.hash, tokenPrefix: g.prefix, scope: 'read' });
    const { POST } = await import('@/app/mcp/route');
    const res = await POST(post(g.token));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { result: { tools: { name: string }[] } };
    expect(json.result.tools.map((t) => t.name)).toContain('search');
  });

  it('answers 401 with a resource_metadata challenge without a token, and 405 for GET/DELETE', async () => {
    const { POST, GET, DELETE, dynamic } = await import('@/app/mcp/route');
    const res = await POST(post());
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain('https://app.example/.well-known/oauth-protected-resource');
    expect((await GET()).status).toBe(405);
    expect((await DELETE()).status).toBe(405);
    expect(dynamic).toBe('force-dynamic');
  });
});

describe('mcpDeps', () => {
  it('wires appUrl and the evidence store, and no embedQuery outside a keyed dev environment', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');
    const { mcpDeps } = await import('./mcp');
    const d = mcpDeps('test');
    expect(d.appUrl).toBe('https://app.example');
    expect(d.verifyOAuth).toBeNull();
    expect(d.deps.appUrl).toBe('https://app.example');
    expect(d.deps.embedQuery).toBeUndefined();
    await store.put('k1', new TextEncoder().encode('hi'), 'text/plain');
    expect(new TextDecoder().decode((await d.deps.evidenceStore!.get('k1'))!)).toBe('hi');
    expect(await d.deps.evidenceStore!.get('missing')).toBeNull();
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-x');
    const { toolDeps } = await import('./tools');
    expect(toolDeps('demo').embedQuery).toBeUndefined();
    expect(toolDeps('dev').embedQuery).toBeTypeOf('function');
    vi.unstubAllEnvs();
  });
});

describe('protected-resource metadata', () => {
  it('has the RFC 9728 shape pointing at the /api/auth issuer, for both well-known paths', async () => {
    const { GET } = await import('@/app/.well-known/oauth-protected-resource/[[...path]]/route');
    for (const path of ['', '/mcp']) {
      const res = await GET(new Request(`https://app.example/.well-known/oauth-protected-resource${path}`), { params: Promise.resolve({ path: path ? ['mcp'] : undefined }) });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        resource: 'https://app.example/mcp',
        authorization_servers: ['https://app.example/api/auth'],
        scopes_supported: ['read', 'feedback', 'manage'],
        bearer_methods_supported: ['header'],
        resource_name: 'Rival Monday',
      });
    }
    const other = await GET(new Request('https://app.example/.well-known/oauth-protected-resource/x'), { params: Promise.resolve({ path: ['x'] }) });
    expect(other.status).toBe(404);
  });
});

describe('proxy', () => {
  it('lets /mcp and /.well-known through without cookies, but keeps /oauth/consent protected', async () => {
    const { proxy } = await import('../proxy');
    const run = (p: string) => proxy(new NextRequest(`https://app.example${p}`));
    for (const p of ['/mcp', '/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp', '/.well-known/oauth-authorization-server/api/auth']) {
      const res = run(p);
      expect(res.status, p).toBe(200);
      expect(res.headers.get('location'), p).toBeNull();
    }
    for (const p of ['/oauth/consent', '/mcp/x', '/mcpx']) expect(run(p).headers.get('location'), p).toContain('/sign-in');
  });
});
