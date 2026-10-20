import { generatePat } from '@cs/core/server';
import { agency, apiToken, membership } from '@cs/db';
import { IDS } from '@cs/db/test-helpers';
import { createToolRegistry, type ToolDeps } from '@cs/tools';
import { dbs, resetWorkspace } from '@cs/tools/test-fixtures';
import { eq, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { handleMcpRequest, type McpHandlerDeps } from './handler';

const deps: ToolDeps = { app: dbs.app, service: dbs.service };
const d: McpHandlerDeps = { service: dbs.service, registry: createToolRegistry(deps, { audit: { record: async () => {} } }), deps, appUrl: 'https://app.example', verifyOAuth: null };
const URL_ = 'https://app.example/mcp';

beforeEach(async () => {
  await resetWorkspace();
  await dbs.owner.execute(sql`truncate auth."user", auth.verification, auth."rateLimit" cascade`);
  await dbs.owner.execute(sql`insert into auth."user" (id, name, email, "emailVerified") values ('u1', 'u1', 'u1@e.co', true)`);
  await dbs.service.insert(membership).values({ userId: 'u1', agencyId: IDS.agencyA, role: 'agency_admin', createdBy: 't' });
});

async function pat() {
  const g = generatePat();
  const [row] = await dbs.service.insert(apiToken).values({ agencyId: IDS.agencyA, userId: 'u1', name: 't', tokenHash: g.hash, tokenPrefix: g.prefix, scope: 'read' }).returning();
  return { token: g.token, id: row!.id };
}

const initialize = (token?: string) => new Request(URL_, {
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } }),
});

const expect401 = async (res: Response) => {
  expect(res.status).toBe(401);
  expect(res.headers.get('www-authenticate')).toBe('Bearer resource_metadata="https://app.example/.well-known/oauth-protected-resource"');
  expect(await res.json()).toEqual({ error: 'invalid_token', error_description: 'Sign in again or use a valid access token.' });
};

describe('handleMcpRequest', () => {
  it('GET/DELETE 405', async () => {
    const { token } = await pat();
    for (const method of ['GET', 'DELETE']) {
      const res = await handleMcpRequest(new Request(URL_, { method, headers: { authorization: `Bearer ${token}` } }), d);
      expect(res.status).toBe(405);
      expect(res.headers.get('allow')).toBe('POST');
    }
  });

  it('no token 401 + exact WWW-Authenticate', async () => {
    await expect401(await handleMcpRequest(initialize(), d));
    await expect401(await handleMcpRequest(initialize('rm_pat_garbage'), d));
  });

  it('revoked PAT 401', async () => {
    const { token, id } = await pat();
    await dbs.service.update(apiToken).set({ revokedAt: new Date() }).where(eq(apiToken.id, id));
    await expect401(await handleMcpRequest(initialize(token), d));
  });

  it('initialize returns server name', async () => {
    const { token, id } = await pat();
    const res = await handleMcpRequest(initialize(token), d);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.headers.get('mcp-session-id')).toBeNull();
    const body = (await res.json()) as { result: { serverInfo: { name: string; version: string }; capabilities: Record<string, unknown> } };
    expect(body.result.serverInfo).toEqual({ name: 'Rival Monday', version: '1.0.0' });
    expect(Object.keys(body.result.capabilities)).toEqual(expect.arrayContaining(['tools', 'resources', 'prompts']));
    const [row] = await dbs.service.select({ at: apiToken.lastUsedAt }).from(apiToken).where(eq(apiToken.id, id));
    expect(row!.at).not.toBeNull();

    // White-label: the agency's display name (trimmed).
    await dbs.owner.update(agency).set({ branding: { displayName: '  Acme Intel ' } }).where(eq(agency.id, IDS.agencyA));
    const res2 = await handleMcpRequest(initialize(token), d);
    expect(((await res2.json()) as { result: { serverInfo: { name: string } } }).result.serverInfo.name).toBe('Acme Intel');
    await dbs.owner.update(agency).set({ branding: { displayName: '   ' } }).where(eq(agency.id, IDS.agencyA));
    const res3 = await handleMcpRequest(initialize(token), d);
    expect(((await res3.json()) as { result: { serverInfo: { name: string } } }).result.serverInfo.name).toBe('Rival Monday');
  });

  it('a refused resource read carries the exact message on the wire', async () => {
    const { token } = await pat();
    const res = await handleMcpRequest(new Request(URL_, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${token}`, 'mcp-protocol-version': '2025-06-18' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'resources/read', params: { uri: 'brief://00000000-0000-4000-8000-000000000999' } }),
    }), d);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ jsonrpc: '2.0', id: 2, error: { code: -32002, message: 'Not found' } });
  });
});
