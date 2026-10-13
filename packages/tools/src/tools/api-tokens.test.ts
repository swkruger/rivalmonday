import { createAccessContext, type AccessContext, type Feature } from '@cs/core';
import { apiToken, client as clientTable, membership, oauthGrantBinding } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const registry = createToolRegistry({ app: dbs.app, service: dbs.service }, { audit: { record: async () => {} } });

const mk = (role: AccessContext['role'], userId: string, scope: AccessContext['clientScope'] = 'all', agencyId: string = IDS.agencyA, features: Feature[] = ['mcp']) =>
  createAccessContext({ agencyId, userId, role, clientScope: scope, features });
const am = mk('account_manager', 'am1');
const am2 = mk('account_manager', 'am2');
const admin = mk('agency_admin', 'adm');
const adminB = mk('agency_admin', 'admB', 'all', IDS.agencyB);
const owner = mk('client_owner', 'own1', [IDS.clientA1]);
const viewer = mk('client_viewer', 'view1', [IDS.clientA1]);

const call = (ctx: AccessContext, name: string, input: unknown) => registry.invoke(ctx, name, input);
const create = (ctx: AccessContext, name = 'Claude Desktop', scope = 'read') => call(ctx, 'create_api_token', { name, scope }) as Promise<{ id: string; token: string; prefix: string; scope: string }>;
const fails = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { return e as { code?: string; message: string }; }
  throw new Error('expected a failure');
};

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedTenancy(dbs.owner);
  for (const [id, name] of [['am1', 'Ann AM'], ['am2', 'Bo AM'], ['adm', 'Ada Admin'], ['admB', 'Bea Admin'], ['own1', 'Olly Owner'], ['view1', 'Vic Viewer']]) {
    await dbs.owner.execute(sql`insert into auth."user" (id, name, email, "emailVerified") values (${id}, ${name}, ${`${id}@e.co`}, true)`);
  }
});
afterEach(() => vi.restoreAllMocks());

describe('create_api_token', () => {
  it('returns the token once and stores only its hash', async () => {
    const r = await create(am);
    expect(r.token.startsWith('rm_pat_')).toBe(true);
    expect(r.prefix).toBe(r.token.slice(0, 12));
    const rows = await dbs.owner.select().from(apiToken);
    expect(rows).toHaveLength(1);
    for (const v of Object.values(rows[0]!)) expect(String(v)).not.toBe(r.token);
    expect(rows[0]!.tokenHash).not.toContain(r.token);
    expect(rows[0]!.tokenPrefix).toBe(r.prefix);
  });

  it('two creates differ', async () => {
    const [a, b] = [await create(am), await create(am)];
    expect(a.token).not.toBe(b.token);
    expect(a.id).not.toBe(b.id);
  });

  it('client_viewer cannot create feedback; client_owner cannot create manage', async () => {
    expect((await fails(create(viewer, 'x', 'feedback'))).message).toBe("Your role can't create a token with that access level.");
    expect((await fails(create(owner, 'x', 'manage'))).message).toBe("Your role can't create a token with that access level.");
    await expect(create(owner, 'ok', 'feedback')).resolves.toBeTruthy();
  });

  it('agency token client_id null, client token bound', async () => {
    await create(am);
    await create(owner);
    const rows = await dbs.owner.select().from(apiToken);
    expect(rows.find((r) => r.userId === 'am1')!.clientId).toBeNull();
    expect(rows.find((r) => r.userId === 'own1')!.clientId).toBe(IDS.clientA1);
  });

  it('a client role needs an active client', async () => {
    await dbs.owner.update(clientTable).set({ status: 'prospect' }).where(eq(clientTable.id, IDS.clientA1));
    expect((await fails(create(owner))).code).toBe('invalid_input');
  });

  it('21st active token refused; revoking one frees a slot', async () => {
    const first = await create(am);
    for (let i = 1; i < 20; i++) await create(am, `t${i}`);
    const e = await fails(create(am, 'one too many'));
    expect(e.message).toBe('You already have 20 active tokens. Revoke one first.');
    await call(am, 'revoke_api_token', { tokenId: first.id });
    await expect(create(am, 'again')).resolves.toBeTruthy();
  });

  it('refuses a name that is blank after trimming', async () => {
    await expect(call(am, 'create_api_token', { name: '   ', scope: 'read' })).rejects.toBeTruthy();
  });

  it('guest refused', async () => {
    const guest = mk('client_viewer', 'contact:abc', [IDS.clientA1]);
    expect((await fails(create(guest))).code).toBe('permission_denied');
  });

  it('no token text reaches console output', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const r = await create(am);
    await call(am, 'list_api_tokens', {});
    await call(am, 'revoke_api_token', { tokenId: r.id });
    const out = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    expect(out).not.toContain(r.token);
    expect(out).not.toContain(r.token.slice(7));
  });
});

describe('list_api_tokens', () => {
  it('masks an e-mail owner name inside a support session; plain names and non-session reads stay as they are (8b)', async () => {
    await dbs.owner.execute(sql`update auth."user" set name = 'Bo <bo@agency.io>' where id = 'am2'`);
    await create(am);
    await create(am2);
    const support = createAccessContext({
      agencyId: IDS.agencyA, userId: 'op-ctx', role: 'agency_admin', clientScope: 'all', features: ['mcp'],
      support: { sessionId: '00000000-0000-4000-8000-0000000005e5', platformUserId: 'op' },
    });
    const inSession = (await call(support, 'list_api_tokens', {})) as { items: { ownerName: string | null }[] };
    expect(inSession.items.map((i) => i.ownerName).sort()).toEqual(['Ann AM', 'Bo <b•••@agency.io>']);
    const outside = (await call(admin, 'list_api_tokens', {})) as { items: { ownerName: string | null }[] };
    expect(outside.items.map((i) => i.ownerName)).toContain('Bo <bo@agency.io>');
  });

  it('never includes token or hash', async () => {
    const r = await create(am);
    const res = await call(am, 'list_api_tokens', {}) as { items: Record<string, unknown>[] };
    expect(res.items).toHaveLength(1);
    const text = JSON.stringify(res);
    expect(text).not.toContain(r.token);
    expect(text).not.toContain('tokenHash');
    expect(text).not.toContain('token_hash');
    expect(res.items[0]).toMatchObject({ id: r.id, prefix: r.prefix, ownerName: 'Ann AM', mine: true, clientId: null, clientName: null, lastUsedAt: null });
  });

  it('AM lists own, admin all, other agency none', async () => {
    await create(am, 'a');
    await create(am2, 'b');
    const names = async (c: AccessContext) => ((await call(c, 'list_api_tokens', {})) as { items: { name: string }[] }).items.map((i) => i.name).sort();
    expect(await names(am)).toEqual(['a']);
    expect(await names(admin)).toEqual(['a', 'b']);
    expect(await names(adminB)).toEqual([]);
    const adminView = (await call(admin, 'list_api_tokens', {})) as { items: { mine: boolean }[] };
    expect(adminView.items.every((i) => !i.mine)).toBe(true);
  });

  it('clientId filter narrows agency lists; client roles are forced to their client; revoked tokens are hidden', async () => {
    await create(am, 'agency-wide');
    const own = await create(owner, 'bound');
    const all = (await call(admin, 'list_api_tokens', {})) as { items: { name: string }[] };
    expect(all.items.map((i) => i.name).sort()).toEqual(['agency-wide', 'bound']);
    const f = (await call(admin, 'list_api_tokens', { clientId: IDS.clientA1 })) as { items: { name: string; clientName: string }[] };
    expect(f.items).toMatchObject([{ name: 'bound', clientName: 'A1 HVAC' }]);
    const forced = (await call(owner, 'list_api_tokens', { clientId: IDS.clientA2 })) as { items: { name: string }[] };
    expect(forced.items.map((i) => i.name)).toEqual(['bound']);
    await call(owner, 'revoke_api_token', { tokenId: own.id });
    expect(((await call(admin, 'list_api_tokens', { clientId: IDS.clientA1 })) as { items: unknown[] }).items).toHaveLength(0);
  });
});

describe('revoke_api_token', () => {
  it('revoke own → revoked_at set and gone from the list', async () => {
    const r = await create(am);
    await expect(call(am, 'revoke_api_token', { tokenId: r.id })).resolves.toEqual({ ok: true });
    const [row] = await dbs.owner.select().from(apiToken).where(eq(apiToken.id, r.id));
    expect(row!.revokedAt).not.toBeNull();
    expect(((await call(am, 'list_api_tokens', {})) as { items: unknown[] }).items).toHaveLength(0);
    expect((await fails(call(am, 'revoke_api_token', { tokenId: r.id }))).code).toBe('not_found');
  });

  it("non-admin revoking a colleague's → not_found; an admin can", async () => {
    const r = await create(am);
    expect((await fails(call(am2, 'revoke_api_token', { tokenId: r.id }))).code).toBe('not_found');
    expect((await fails(call(adminB, 'revoke_api_token', { tokenId: r.id }))).code).toBe('not_found');
    const [row] = await dbs.owner.select().from(apiToken).where(eq(apiToken.id, r.id));
    expect(row!.revokedAt).toBeNull();
    await expect(call(admin, 'revoke_api_token', { tokenId: r.id })).resolves.toEqual({ ok: true });
  });

  it('guest refused', async () => {
    const guest = mk('client_viewer', 'contact:abc', [IDS.clientA1]);
    expect((await fails(call(guest, 'revoke_api_token', { tokenId: IDS.agencyA }))).code).toBe('permission_denied');
  });
});

describe('OAuth grants', () => {
  const oauthClient = (id: string, name: string | null) =>
    dbs.owner.execute(sql`insert into auth."oauthClient" (id, "clientId", "redirectUris", name) values (${id}, ${id}, '[]'::jsonb, ${name})`);
  const consent = (id: string, userId: string, clientId: string) =>
    dbs.owner.execute(sql`insert into auth."oauthConsent" (id, "clientId", "userId", scopes, "createdAt", "updatedAt") values (${id}, ${clientId}, ${userId}, '["read"]'::jsonb, now(), now())`);
  const token = (table: 'oauthAccessToken' | 'oauthRefreshToken', id: string, userId: string, clientId: string) =>
    dbs.owner.execute(sql`insert into auth.${sql.identifier(table)} (id, token, "clientId", "userId", "expiresAt", "createdAt", scopes) values (${id}, ${`h-${id}`}, ${clientId}, ${userId}, now() + interval '1 hour', now(), '["read"]'::jsonb)`);
  const bind = async (consentId: string, userId: string, oauthClientId: string, clientId: string | null = null) => {
    await consent(consentId, userId, oauthClientId);
    await dbs.service.insert(membership).values({ userId, agencyId: IDS.agencyA, role: 'account_manager', createdBy: 't' }).onConflictDoNothing();
    const [b] = await dbs.service.insert(oauthGrantBinding).values({ consentId, oauthClientId, userId, agencyId: IDS.agencyA, clientId, scope: 'read' }).returning();
    return b!;
  };

  beforeEach(async () => {
    await oauthClient('app1', 'Claude');
    await oauthClient('app2', null);
  });

  it('list_oauth_grants shows app name, owner and mine; admin sees all, AM only own', async () => {
    await bind('c1', 'am1', 'app1');
    await bind('c2', 'am2', 'app2');
    const mine = (await call(am, 'list_oauth_grants', {})) as { items: { appName: string; ownerName: string; mine: boolean }[] };
    expect(mine.items).toMatchObject([{ appName: 'Claude', ownerName: 'Ann AM', mine: true }]);
    const all = (await call(admin, 'list_oauth_grants', {})) as { items: { appName: string; mine: boolean }[] };
    expect(all.items.map((i) => i.appName).sort()).toEqual(['AI app', 'Claude']);
    expect(all.items.every((i) => !i.mine)).toBe(true);
    expect(((await call(adminB, 'list_oauth_grants', {})) as { items: unknown[] }).items).toHaveLength(0);
  });

  it('revoke_oauth_grant deletes the plugin consent and revokes plugin tokens', async () => {
    const b = await bind('c1', 'am1', 'app1');
    await bind('c2', 'am1', 'app2');
    for (const t of ['oauthAccessToken', 'oauthRefreshToken'] as const) {
      await token(t, `${t}-1`, 'am1', 'app1');
      await token(t, `${t}-2`, 'am1', 'app2');
    }
    await expect(call(am, 'revoke_oauth_grant', { grantId: b.id })).resolves.toEqual({ ok: true });
    const [row] = await dbs.owner.select().from(oauthGrantBinding).where(eq(oauthGrantBinding.consentId, 'c1'));
    expect(row!.revokedAt).not.toBeNull();
    const consents = [...(await dbs.owner.execute<{ id: string }>(sql`select id from auth."oauthConsent"`))].map((r) => r.id);
    expect(consents).toEqual(['c2']);
    for (const t of ['oauthAccessToken', 'oauthRefreshToken'] as const) {
      const rev = [...(await dbs.owner.execute<{ id: string }>(sql`select id from auth.${sql.identifier(t)} where revoked is not null`))].map((r) => r.id);
      expect(rev).toEqual([`${t}-1`]);
    }
    expect(((await call(am, 'list_oauth_grants', {})) as { items: { appName: string }[] }).items.map((i) => i.appName)).toEqual(['AI app']);
  });

  it("an admin can revoke a colleague's grant (tokens of the owner); a colleague or other agency gets not_found", async () => {
    const b = await bind('c1', 'am1', 'app1');
    await token('oauthAccessToken', 'at', 'am1', 'app1');
    expect((await fails(call(am2, 'revoke_oauth_grant', { grantId: b.id }))).code).toBe('not_found');
    expect((await fails(call(adminB, 'revoke_oauth_grant', { grantId: b.id }))).code).toBe('not_found');
    await call(admin, 'revoke_oauth_grant', { grantId: b.id });
    const rev = [...(await dbs.owner.execute<{ id: string }>(sql`select id from auth."oauthAccessToken" where revoked is not null`))].map((r) => r.id);
    expect(rev).toEqual(['at']);
    expect((await fails(call(admin, 'revoke_oauth_grant', { grantId: b.id }))).code).toBe('not_found');
  });

  it('guest refused', async () => {
    const guest = mk('client_viewer', 'contact:abc', [IDS.clientA1]);
    expect((await fails(call(guest, 'list_oauth_grants', {}))).code).toBe('permission_denied');
  });
});
