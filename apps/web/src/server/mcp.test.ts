import { generatePat } from '@cs/core/server';
import { apiToken, invitation, membership } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, testUrls, truncateAll } from '@cs/db/test-helpers';
import { resolveBranding } from '@cs/email';
import { createMemoryStore } from '@cs/storage';
import { betterAuth } from 'better-auth';
import { sql } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { truncateAuth } from '../../test/auth-fixtures';
import { oauthHarness } from '../../test/oauth-fixtures';
import { buildAuthOptions } from './auth-options';
import { bindConsent } from './oauth-consent';

const dbs = openTestDbs();
const pool = new Pool({ connectionString: testUrls.service });
afterAll(async () => {
  await pool.end();
  await dbs.closeAll();
});
// The real Better Auth + OAuth provider, on the test DB, for the app at https://app.example.
const links: string[] = [];
const background: Promise<unknown>[] = [];
const flush = () => Promise.all(background.splice(0));
const testAuth = betterAuth(buildAuthOptions({
  env: { appUrl: 'https://app.example', appDatabaseUrl: testUrls.app, serviceDatabaseUrl: testUrls.service, queueDatabaseUrl: testUrls.owner, authSecret: 's'.repeat(40), linkSecrets: ['l'.repeat(40)], emailFrom: 'f@e.co', google: null, defaultAgencyId: null, webMonitoring: false, kbImport: false, platformAdmins: [], askFakeAi: false, setupFakeLookup: false, webhookFakeSend: false },
  service: dbs.service, pool, branding: async () => resolveBranding('Rival Monday', null),
  runInBackground: (task) => void background.push(task), sendEmail: async () => {}, onMagicLink: (_e, url) => void links.push(url),
}));
const holder = vi.hoisted(() => ({ auth: null as unknown }));
holder.auth = testAuth;
vi.mock('./auth', () => ({ auth: () => holder.auth }));
vi.mock('./db', () => ({ dbs: () => ({ app: dbs.app, service: dbs.service }) }));
vi.mock('./env', () => ({ webEnv: () => ({ appUrl: 'https://app.example', webMonitoring: false, kbImport: false, platformAdmins: [] }) }));
vi.mock('./queue', () => ({ enqueueFor: () => async () => {}, jobStatusFor: () => async () => null, queueStatsFor: () => async () => ({ queues: [], lastHeartbeatAt: null }) }));
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
  await truncateAuth(dbs.owner);
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

describe('/mcp with an OAuth access token (Task 11)', () => {
  async function oauthToken() {
    const h = oauthHarness(testAuth, () => links.at(-1), flush, 'https://app.example');
    await dbs.service.insert(invitation).values({ agencyId: IDS.agencyA, email: 'oa@e.co', role: 'agency_admin', invitedBy: 't', expiresAt: new Date(Date.now() + 86_400_000) });
    await h.signIn('oa@e.co');
    const clientId = await h.registerPublic();
    const { url, verifier } = h.authorizeUrl(clientId);
    const consentPage = await h.call(url, { headers: { accept: 'text/html' } });
    const accepted = await h.consent(new URL(consentPage.location!, 'https://app.example').search.slice(1), true);
    const [row] = [...(await dbs.owner.execute<{ id: string; userId: string }>(sql`select id, "userId" from auth."oauthConsent"`))];
    await bindConsent(dbs.service, { consentId: row!.id, oauthClientId: clientId, userId: row!.userId, target: { agencyId: IDS.agencyA, clientId: null, scope: 'read' } });
    const tok = await h.exchange(clientId, new URL(accepted.body.url as string).searchParams.get('code')!, verifier);
    return tok.body.access_token as string;
  }

  it('a bound OAuth token lists tools; revoking its binding gives 401', async () => {
    const token = await oauthToken();
    const { POST } = await import('@/app/mcp/route');
    const ok = await POST(post(token));
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { result: { tools: { name: string }[] } }).result.tools.map((t) => t.name)).toContain('search');
    await dbs.owner.execute(sql`update oauth_grant_binding set revoked_at = now()`);
    expect((await POST(post(token))).status).toBe(401);
  });
});

describe('mcpDeps', () => {
  it('wires appUrl and the evidence store, and no embedQuery outside a keyed dev environment', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');
    const { mcpDeps } = await import('./mcp');
    const d = mcpDeps('test');
    expect(d.appUrl).toBe('https://app.example');
    expect(d.verifyOAuth).toBeTypeOf('function');
    expect(await d.verifyOAuth!('opaque-but-unknown')).toBeNull();
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

describe('authorization-server metadata', () => {
  it('serves RFC 8414 metadata with the /api/auth issuer at both well-known paths, public PKCE clients included', async () => {
    const { GET } = await import('@/app/.well-known/oauth-authorization-server/[[...path]]/route');
    for (const path of [undefined, ['api', 'auth']]) {
      const res = await GET(new Request(`https://app.example/.well-known/oauth-authorization-server${path ? '/api/auth' : ''}`), { params: Promise.resolve({ path }) });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toMatchObject({
        issuer: 'https://app.example/api/auth',
        authorization_endpoint: 'https://app.example/api/auth/oauth2/authorize',
        token_endpoint: 'https://app.example/api/auth/oauth2/token',
        registration_endpoint: 'https://app.example/api/auth/oauth2/register',
        code_challenge_methods_supported: ['S256'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
      });
      expect(body.token_endpoint_auth_methods_supported).toContain('none');
      expect(body.scopes_supported).toEqual(expect.arrayContaining(['read', 'feedback', 'manage', 'offline_access']));
    }
    const other = await GET(new Request('https://app.example/.well-known/oauth-authorization-server/x'), { params: Promise.resolve({ path: ['x'] }) });
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
