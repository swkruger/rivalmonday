import { generatePat } from '@cs/core/server';
import { apiToken, client, membership, oauthGrantBinding } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveBearer, tokenAccess, touchPat, type ResolvedToken } from './auth';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

async function seedUser(id: string): Promise<void> {
  await dbs.owner.execute(sql`insert into auth."user" (id, name, email, "emailVerified") values (${id}, ${id}, ${id + '@e.co'}, true)`);
}

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await dbs.owner.execute(sql`truncate auth."user", auth.verification, auth."rateLimit" cascade`);
  await seedTenancy(dbs.owner);
  await seedUser('u1');
});

async function member(values: Partial<typeof membership.$inferInsert>) {
  const [m] = await dbs.service.insert(membership).values({ userId: 'u1', agencyId: IDS.agencyA, role: 'agency_admin', createdBy: 't', ...values }).returning();
  return m!;
}

async function pat(values: Partial<typeof apiToken.$inferInsert> = {}) {
  const g = generatePat();
  const [row] = await dbs.service.insert(apiToken).values({ agencyId: IDS.agencyA, userId: 'u1', name: 't', tokenHash: g.hash, tokenPrefix: g.prefix, scope: 'read', ...values }).returning();
  return { token: g.token, row: row! };
}

async function binding(values: Partial<typeof oauthGrantBinding.$inferInsert> = {}) {
  const [row] = await dbs.service.insert(oauthGrantBinding).values({ consentId: 'consent-1', oauthClientId: 'oc', agencyId: IDS.agencyA, userId: 'u1', scope: 'read', ...values }).returning();
  return row!;
}

const bearer = (t: string) => `Bearer ${t}`;
const deps = { service: dbs.service, verifyOAuth: null };

describe('resolveBearer', () => {
  it('resolves a PAT by hash', async () => {
    const { token, row } = await pat({ scope: 'feedback' });
    expect(await resolveBearer(deps, bearer(token))).toEqual({ kind: 'pat', tokenKey: `pat:${row.id}`, tokenId: row.id, userId: 'u1', agencyId: IDS.agencyA, clientId: null, scope: 'feedback' });
  });

  it('revoked PAT -> null', async () => {
    const { token, row } = await pat();
    await dbs.service.update(apiToken).set({ revokedAt: new Date() }).where(eq(apiToken.id, row.id));
    expect(await resolveBearer(deps, bearer(token))).toBeNull();
  });

  it('malformed rm_pat_ -> null without a DB query', async () => {
    const select = vi.spyOn(dbs.service, 'select');
    expect(await resolveBearer(deps, 'Bearer rm_pat_short')).toBeNull();
    expect(select).not.toHaveBeenCalled();
    select.mockRestore();
  });

  it('missing/non-Bearer header -> null', async () => {
    const { token } = await pat();
    expect(await resolveBearer(deps, null)).toBeNull();
    expect(await resolveBearer(deps, token)).toBeNull();
    expect(await resolveBearer(deps, `Basic ${token}`)).toBeNull();
    expect(await resolveBearer(deps, 'Bearer ')).toBeNull();
  });

  it('non-PAT with no verifier -> null', async () => {
    expect(await resolveBearer(deps, 'Bearer opaque-token')).toBeNull();
  });

  it('oauth token with revoked binding -> null', async () => {
    await binding({ revokedAt: new Date() });
    const verifyOAuth = async () => ({ userId: 'u1', consentId: 'consent-1' });
    expect(await resolveBearer({ service: dbs.service, verifyOAuth }, bearer('opaque'))).toBeNull();
  });

  it('oauth token resolves binding id as tokenId', async () => {
    const b = await binding({ scope: 'manage' });
    const verifyOAuth = async () => ({ userId: 'u1', consentId: 'consent-1' });
    expect(await resolveBearer({ service: dbs.service, verifyOAuth }, bearer('opaque'))).toEqual({
      kind: 'oauth', tokenKey: 'oauth:consent-1', tokenId: b.id, userId: 'u1', agencyId: IDS.agencyA, clientId: null, scope: 'manage',
    });
  });

  it('oauth token whose verified user differs from the binding user -> null', async () => {
    await binding();
    const verifyOAuth = async () => ({ userId: 'someone-else', consentId: 'consent-1' });
    expect(await resolveBearer({ service: dbs.service, verifyOAuth }, bearer('opaque'))).toBeNull();
  });

  it('a throwing verifier -> null', async () => {
    const verifyOAuth = async () => { throw new Error('boom'); };
    expect(await resolveBearer({ service: dbs.service, verifyOAuth }, bearer('opaque'))).toBeNull();
  });
});

const tok = (o: Partial<ResolvedToken> = {}): ResolvedToken => ({ kind: 'pat', tokenKey: 'pat:x', tokenId: 'x', userId: 'u1', agencyId: IDS.agencyA, clientId: null, scope: 'manage', ...o });

describe('tokenAccess', () => {
  it('returns null after membership removal', async () => {
    const m = await member({});
    expect(await tokenAccess(dbs.service, tok())).not.toBeNull();
    await dbs.service.delete(membership).where(eq(membership.id, m.id));
    expect(await tokenAccess(dbs.service, tok())).toBeNull();
  });

  it('client-bound token of a prospect client -> null', async () => {
    await member({ role: 'client_owner', clientId: IDS.clientA1 });
    const t = tok({ clientId: IDS.clientA1, scope: 'read' });
    expect(await tokenAccess(dbs.service, t)).not.toBeNull();
    await dbs.owner.update(client).set({ status: 'prospect' }).where(eq(client.id, IDS.clientA1));
    expect(await tokenAccess(dbs.service, t)).toBeNull();
  });

  it('caps scope after role downgrade owner->viewer', async () => {
    const m = await member({ role: 'client_owner', clientId: IDS.clientA1 });
    const t = tok({ clientId: IDS.clientA1, scope: 'feedback' });
    expect((await tokenAccess(dbs.service, t))?.scope).toBe('feedback');
    await dbs.service.update(membership).set({ role: 'client_viewer' }).where(eq(membership.id, m.id));
    expect((await tokenAccess(dbs.service, t))?.scope).toBe('read');
  });

  it('narrows an account manager to the live scope', async () => {
    const m = await member({ role: 'account_manager', clientScope: [IDS.clientA1] });
    const r = await tokenAccess(dbs.service, tok());
    expect(r?.ctx.clientScope).toEqual([IDS.clientA1]);
    await dbs.service.update(membership).set({ clientScope: [IDS.clientA2] }).where(eq(membership.id, m.id));
    expect((await tokenAccess(dbs.service, tok()))?.ctx.clientScope).toEqual([IDS.clientA2]);
  });

  it('agency token ignores a client membership of the same user', async () => {
    await member({ role: 'client_owner', clientId: IDS.clientA1 });
    expect(await tokenAccess(dbs.service, tok())).toBeNull();
  });

  it('client token ignores an agency membership of the same user', async () => {
    await member({});
    expect(await tokenAccess(dbs.service, tok({ clientId: IDS.clientA1 }))).toBeNull();
  });
});

describe('touchPat', () => {
  it('writes last_used_at at most once a minute', async () => {
    const { row } = await pat();
    await touchPat(dbs.service, row.id);
    const read = async () => (await dbs.service.select({ at: apiToken.lastUsedAt }).from(apiToken).where(eq(apiToken.id, row.id)))[0]!.at;
    const first = await read();
    expect(first).not.toBeNull();
    await touchPat(dbs.service, row.id);
    expect((await read())!.getTime()).toBe(first!.getTime());
  });
});
