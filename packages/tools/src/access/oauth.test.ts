import { oauthGrantBinding } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import { consentIdFor, deletePluginConsent, dropUnboundConsents, revokePluginTokens } from './oauth';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const client = (id: string) => dbs.owner.execute(sql`insert into auth."oauthClient" (id, "clientId", "redirectUris", name) values (${id}, ${id}, '[]'::jsonb, ${id})`);
const consent = (id: string, userId: string, clientId: string, updatedAt: string) =>
  dbs.owner.execute(sql`insert into auth."oauthConsent" (id, "clientId", "userId", scopes, "createdAt", "updatedAt") values (${id}, ${clientId}, ${userId}, '["read"]'::jsonb, ${updatedAt}::timestamptz, ${updatedAt}::timestamptz)`);
const token = (table: 'oauthAccessToken' | 'oauthRefreshToken', id: string, userId: string, clientId: string) =>
  dbs.owner.execute(sql`insert into auth.${sql.identifier(table)} (id, token, "clientId", "userId", "expiresAt", "createdAt", scopes) values (${id}, ${`h-${id}`}, ${clientId}, ${userId}, now() + interval '1 hour', now(), '["read"]'::jsonb)`);
const revoked = async (table: 'oauthAccessToken' | 'oauthRefreshToken') =>
  [...(await dbs.owner.execute<{ id: string }>(sql`select id from auth.${sql.identifier(table)} where revoked is not null order by id`))].map((r) => r.id);
const consents = async () => [...(await dbs.owner.execute<{ id: string }>(sql`select id from auth."oauthConsent" order by id`))].map((r) => r.id);
const bind = (consentId: string, userId: string, oauthClientId: string, revokedAt: Date | null = null) =>
  dbs.service.insert(oauthGrantBinding).values({ consentId, oauthClientId, userId, agencyId: IDS.agencyA, clientId: null, scope: 'read', revokedAt });

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedTenancy(dbs.owner);
  await seedUser(dbs.owner, 'u1', 'u1@e.co');
  await seedUser(dbs.owner, 'u2', 'u2@e.co');
  await client('c1');
  await client('c2');
});

describe('plugin table helpers', () => {
  it('revokePluginTokens revokes only that user and OAuth client', async () => {
    for (const t of ['oauthAccessToken', 'oauthRefreshToken'] as const) {
      await token(t, `${t}-u1c1`, 'u1', 'c1');
      await token(t, `${t}-u1c2`, 'u1', 'c2');
      await token(t, `${t}-u2c1`, 'u2', 'c1');
    }
    await dbs.service.transaction((tx) => revokePluginTokens(tx, 'u1', 'c1'));
    expect(await revoked('oauthAccessToken')).toEqual(['oauthAccessToken-u1c1']);
    expect(await revoked('oauthRefreshToken')).toEqual(['oauthRefreshToken-u1c1']);
  });

  it('consentIdFor returns the newest consent for the pair, else null', async () => {
    await consent('old', 'u1', 'c1', '2026-01-01');
    await consent('new', 'u1', 'c1', '2026-02-01');
    await consent('other', 'u2', 'c1', '2026-03-01');
    expect(await consentIdFor(dbs.service, 'u1', 'c1')).toBe('new');
    expect(await consentIdFor(dbs.service, 'u1', 'c2')).toBeNull();
    await deletePluginConsent(dbs.service, 'new');
    expect(await consentIdFor(dbs.service, 'u1', 'c1')).toBe('old');
  });

  it('dropUnboundConsents keeps consents with an active binding and drops revoked or unbound ones', async () => {
    await consent('bound', 'u1', 'c1', '2026-01-01');
    await consent('revoked', 'u1', 'c2', '2026-01-01');
    await consent('unbound', 'u1', 'c2', '2026-01-02');
    await consent('foreign', 'u2', 'c2', '2026-01-01');
    await bind('bound', 'u1', 'c1');
    await bind('revoked', 'u1', 'c2', new Date());
    await dropUnboundConsents(dbs.service, 'u1', 'c1');
    expect(await consents()).toEqual(['bound', 'foreign', 'revoked', 'unbound']);
    await dropUnboundConsents(dbs.service, 'u1', 'c2');
    expect(await consents()).toEqual(['bound', 'foreign']);
  });

  it('dropUnboundConsents with no client id covers every OAuth client of the user and no other user', async () => {
    await consent('a', 'u1', 'c1', '2026-01-01');
    await consent('b', 'u1', 'c2', '2026-01-01');
    await consent('foreign', 'u2', 'c1', '2026-01-01');
    await dropUnboundConsents(dbs.service, 'u1', null);
    expect(await consents()).toEqual(['foreign']);
  });

  it('a binding for another user or OAuth client does not keep a consent alive', async () => {
    await consent('x', 'u1', 'c1', '2026-01-01');
    await bind('x', 'u2', 'c1');
    await dropUnboundConsents(dbs.service, 'u1', 'c1');
    expect(await consents()).toEqual([]);
  });
});
