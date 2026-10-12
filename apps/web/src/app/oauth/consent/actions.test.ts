import { client, membership, oauthGrantBinding } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedAuthUsers, truncateAuth } from '../../../../test/auth-fixtures';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const m = vi.hoisted(() => ({
  calls: [] as string[],
  viewer: null as unknown,
  valid: true,
  pluginOk: true,
  requests: [] as { url: string; cookie: string | null; origin: string | null; body: unknown }[],
  onAccept: async () => {},
}));
vi.mock('@better-auth/oauth-provider', async (orig) => ({ ...(await orig<object>()), verifyOAuthQueryParams: vi.fn(async () => m.valid) }));
vi.mock('next/headers', () => ({ headers: async () => new Headers({ cookie: 'better-auth.session_token=abc' }) }));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    m.calls.push(`redirect:${to}`);
    throw new Error('NEXT_REDIRECT');
  },
}));
vi.mock('@/server/current-viewer', () => ({ getViewer: async () => m.viewer }));
vi.mock('@/server/db', () => ({ dbs: () => ({ app: dbs.app, service: dbs.service }) }));
vi.mock('@/server/env', () => ({ webEnv: () => ({ appUrl: 'https://app.example', authSecret: 's'.repeat(40) }) }));
vi.mock('@/server/auth', () => ({
  auth: () => ({
    handler: async (req: Request) => {
      const body = (await req.json()) as { accept: boolean };
      m.requests.push({ url: req.url, cookie: req.headers.get('cookie'), origin: req.headers.get('origin'), body });
      m.calls.push(body.accept ? 'accept' : 'deny');
      if (!m.pluginOk) return Response.json({ error: 'invalid_request' }, { status: 400 });
      if (body.accept) await m.onAccept();
      return Response.json({ redirect: true, url: body.accept ? 'http://127.0.0.1:33418/cb?code=c0de&state=s' : 'http://127.0.0.1:33418/cb?error=access_denied&state=s' });
    },
  }),
}));
vi.mock('@/server/oauth-consent', async (orig) => {
  const real = await orig<typeof import('@/server/oauth-consent')>();
  return { ...real, bindConsent: async (...a: Parameters<typeof real.bindConsent>) => { await real.bindConsent(...a); m.calls.push('bind'); } };
});

const { decideConsent } = await import('./actions');

const QUERY = 'response_type=code&client_id=oc1&scope=read+feedback+offline_access&state=s&sig=x';
const form = (f: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ oauth_query: QUERY, ...f })) fd.set(k, v);
  return fd;
};
const run = async (f: Record<string, string>) => {
  try {
    return await decideConsent({ ok: true }, form(f));
  } catch (e) {
    if ((e as Error).message === 'NEXT_REDIRECT') return 'redirected' as const;
    throw e;
  }
};
const bindings = () => dbs.service.select().from(oauthGrantBinding);
let membershipId = '';

beforeEach(async () => {
  Object.assign(m, { calls: [], requests: [], valid: true, pluginOk: true });
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedTenancy(dbs.owner);
  await seedAuthUsers(dbs.owner, { id: 'u1', email: 'u1@e.co' }, { id: 'u2', email: 'u2@e.co' });
  await dbs.owner.execute(sql`insert into auth."oauthClient" (id, "clientId", "redirectUris", name) values ('oc1', 'oc1', '[]'::jsonb, 'Claude')`);
  [{ id: membershipId }] = await dbs.service.insert(membership).values({ userId: 'u1', agencyId: IDS.agencyA, role: 'agency_admin', createdBy: 't' }).returning();
  m.viewer = { kind: 'user', userId: 'u1' };
  // What the plugin does on accept: save (or update) its consent row for the session user.
  m.onAccept = async () => {
    await dbs.owner.execute(sql`insert into auth."oauthConsent" (id, "clientId", "userId", scopes, "createdAt", "updatedAt") values ('consent-1', 'oc1', 'u1', '["read"]'::jsonb, now(), now()) on conflict (id) do update set "updatedAt" = now()`);
  };
});

describe('decideConsent', () => {
  it('binding exists before the redirect: plugin accept → bind → redirect', async () => {
    expect(await run({ decision: 'allow', membershipId, scope: 'feedback' })).toBe('redirected');
    expect(m.calls).toEqual(['accept', 'bind', 'redirect:http://127.0.0.1:33418/cb?code=c0de&state=s']);
    expect(m.requests).toEqual([{ url: 'https://app.example/api/auth/oauth2/consent', cookie: 'better-auth.session_token=abc', origin: 'https://app.example', body: { accept: true, oauth_query: QUERY } }]);
    expect(await bindings()).toMatchObject([{ consentId: 'consent-1', oauthClientId: 'oc1', userId: 'u1', agencyId: IDS.agencyA, clientId: null, scope: 'feedback', revokedAt: null }]);
  });

  it('a membership the user does not hold is refused before the plugin is asked', async () => {
    const [other] = await dbs.service.insert(membership).values({ userId: 'u2', agencyId: IDS.agencyB, role: 'agency_admin', createdBy: 't' }).returning();
    expect(await run({ decision: 'allow', membershipId: other!.id, scope: 'read' })).toEqual({ ok: false, error: 'Choose a workspace and access level you have.' });
    expect(m.calls).toEqual([]);
    expect(await bindings()).toEqual([]);
  });

  it('a scope above what the request asked for (or the role allows) is refused', async () => {
    expect(await run({ decision: 'allow', membershipId, scope: 'manage' })).toEqual({ ok: false, error: 'Choose a workspace and access level you have.' });
    await dbs.service.update(membership).set({ role: 'client_viewer', clientId: IDS.clientA1 }).where(eq(membership.id, membershipId));
    await dbs.service.update(client).set({ features: ['mcp'] }).where(eq(client.id, IDS.clientA1));
    expect(await run({ decision: 'allow', membershipId, scope: 'feedback' })).toEqual({ ok: false, error: 'Choose a workspace and access level you have.' });
    expect(m.calls).toEqual([]);
  });

  it('an expired or tampered query is refused before the plugin is asked', async () => {
    m.valid = false;
    expect(await run({ decision: 'allow', membershipId, scope: 'read' })).toEqual({ ok: false, error: 'This request has expired. Start again from your AI app.' });
    expect(await run({ decision: 'deny' })).toEqual({ ok: false, error: 'This request has expired. Start again from your AI app.' });
    expect(m.calls).toEqual([]);
  });

  it('a plugin refusal shows the expired message and binds nothing', async () => {
    m.pluginOk = false;
    expect(await run({ decision: 'allow', membershipId, scope: 'read' })).toEqual({ ok: false, error: 'This request has expired. Start again from your AI app.' });
    expect(m.calls).toEqual(['accept']);
    expect(await bindings()).toEqual([]);
  });

  it('cancel denies through the plugin and redirects with access_denied, binding nothing (member-less users too)', async () => {
    m.viewer = { kind: 'member-less', userId: 'u2' };
    expect(await run({ decision: 'deny' })).toBe('redirected');
    expect(m.calls).toEqual(['deny', 'redirect:http://127.0.0.1:33418/cb?error=access_denied&state=s']);
    expect(await bindings()).toEqual([]);
  });

  it('refuses without a signed-in user', async () => {
    for (const viewer of [null, { kind: 'guest' }]) {
      m.viewer = viewer;
      expect(await run({ decision: 'allow', membershipId, scope: 'read' })).toEqual({ ok: false, error: 'Sign in to connect an app.' });
    }
    expect(m.calls).toEqual([]);
  });

  it('no consent row after the plugin accepted → generic error, no redirect', async () => {
    m.onAccept = async () => {};
    expect(await run({ decision: 'allow', membershipId, scope: 'read' })).toEqual({ ok: false, error: 'Something went wrong. Start again from your AI app.' });
    expect(m.calls).toEqual(['accept']);
  });
});
