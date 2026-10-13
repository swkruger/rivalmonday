import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { IDS, errorText, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { createAuditSink } from './audit';
import { apiToken, auditLog, brief, briefItem, mcpRateWindow, oauthGrantBinding, recommendation, review } from './schema';
import { withTenant } from './tenant';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const scopeFor = (agencyId: string, userId: string, role: 'agency_admin' | 'account_manager' | 'client_owner') => ({
  agencyId,
  clientScope: 'all' as const,
  userId,
  role,
});

async function seedUser(id: string) {
  await dbs.owner.execute(sql`insert into auth."user" (id, name, email, "emailVerified") values (${id}, ${id}, ${id + '@example.com'}, true)`);
}

let n = 0;
const token = (userId: string, agencyId: string = IDS.agencyA) => ({
  agencyId,
  userId,
  name: `t${n}`,
  tokenHash: `hash-${++n}`,
  tokenPrefix: 'rm_pat_xxxxx',
  scope: 'read' as const,
});
const grant = (userId: string, agencyId: string = IDS.agencyA) => ({
  consentId: `consent-${++n}`,
  oauthClientId: 'oc1',
  agencyId,
  userId,
  scope: 'read' as const,
});
const count = (r: unknown) => (r as { count: number }).count;

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await dbs.owner.execute(sql`truncate auth."user" cascade`);
  await seedTenancy(dbs.owner);
  for (const u of ['u1', 'u2', 'admin', 'admin-b']) await seedUser(u);
  await dbs.service.insert(apiToken).values([token('u1'), token('u2'), token('admin-b', IDS.agencyB)]);
  await dbs.service.insert(oauthGrantBinding).values([grant('u1'), grant('u2'), grant('admin-b', IDS.agencyB)]);
});

// app_user may select every api_token column except token_hash, so select explicit columns.
const tokenUsers = async (scope: ReturnType<typeof scopeFor>) =>
  (await withTenant(dbs.app, scope, (tx) => tx.select({ u: apiToken.userId }).from(apiToken))).map((r) => r.u).sort();

describe('api_token RLS', () => {
  it("user sees own tokens, not a colleague's", async () => {
    expect(await tokenUsers(scopeFor(IDS.agencyA, 'u1', 'client_owner'))).toEqual(['u1']);
  });

  it('agency_admin sees all of the agency, none of another', async () => {
    expect(await tokenUsers(scopeFor(IDS.agencyA, 'admin', 'agency_admin'))).toEqual(['u1', 'u2']);
    expect(await tokenUsers(scopeFor(IDS.agencyB, 'admin-b', 'agency_admin'))).toEqual(['admin-b']);
  });

  it('account_manager sees only own', async () => {
    expect(await tokenUsers(scopeFor(IDS.agencyA, 'u2', 'account_manager'))).toEqual(['u2']);
  });

  it('sees nothing without user settings (engine callers)', async () => {
    const rows = await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) => tx.select({ id: apiToken.id }).from(apiToken));
    expect(rows).toEqual([]);
  });

  it('app_user cannot select token_hash', async () => {
    const scope = scopeFor(IDS.agencyA, 'u1', 'client_owner');
    expect(await errorText(withTenant(dbs.app, scope, (tx) => tx.select().from(apiToken)))).toMatch(/permission denied/);
    expect(await errorText(withTenant(dbs.app, scope, (tx) => tx.execute(sql`select token_hash from api_token`)))).toMatch(/permission denied/);
  });

  it('app_user cannot insert/delete', async () => {
    const scope = scopeFor(IDS.agencyA, 'u1', 'client_owner');
    expect(await errorText(withTenant(dbs.app, scope, (tx) => tx.insert(apiToken).values(token('u1'))))).toMatch(/permission denied/);
    expect(await errorText(withTenant(dbs.app, scope, (tx) => tx.execute(sql`delete from api_token`)))).toMatch(/permission denied/);
    expect(await errorText(withTenant(dbs.app, scope, (tx) => tx.execute(sql`update api_token set name = 'x'`)))).toMatch(/permission denied/);
  });

  it("revokes own, not a colleague's (0 rows)", async () => {
    await withTenant(dbs.app, scopeFor(IDS.agencyA, 'u1', 'client_owner'), async (tx) => {
      expect(count(await tx.execute(sql`update api_token set revoked_at = now() where user_id = 'u1'`))).toBe(1);
      expect(count(await tx.execute(sql`update api_token set revoked_at = now() where user_id = 'u2'`))).toBe(0);
    });
    const revoked = await dbs.owner.select({ u: apiToken.userId }).from(apiToken).where(sql`revoked_at is not null`);
    expect(revoked).toEqual([{ u: 'u1' }]);
  });

  it("agency_admin revokes the agency's tokens but not another agency's", async () => {
    await withTenant(dbs.app, scopeFor(IDS.agencyA, 'admin', 'agency_admin'), async (tx) => {
      expect(count(await tx.execute(sql`update api_token set revoked_at = now()`))).toBe(2);
    });
  });

  it('rejects unknown scopes and bad names', async () => {
    expect(await errorText(dbs.service.insert(apiToken).values({ ...token('u1'), scope: 'root' as never }))).toMatch(/api_token_scope_check/);
    expect(await errorText(dbs.service.insert(apiToken).values({ ...token('u1'), name: '' }))).toMatch(/api_token_name_check/);
    expect(await errorText(dbs.service.insert(apiToken).values({ ...token('u1'), name: 'x'.repeat(81) }))).toMatch(/api_token_name_check/);
  });

  it('cascades when the auth user is deleted', async () => {
    await dbs.owner.execute(sql`delete from auth."user" where id = 'u1'`);
    expect(await dbs.owner.select().from(apiToken).where(sql`user_id = 'u1'`)).toEqual([]);
    expect(await dbs.owner.select().from(oauthGrantBinding).where(sql`user_id = 'u1'`)).toEqual([]);
  });
});

describe('oauth_grant_binding RLS', () => {
  const users = async (scope: ReturnType<typeof scopeFor>) =>
    (await withTenant(dbs.app, scope, (tx) => tx.select({ u: oauthGrantBinding.userId }).from(oauthGrantBinding))).map((r) => r.u).sort();

  it("user sees own, not a colleague's; admin sees agency; account_manager own", async () => {
    expect(await users(scopeFor(IDS.agencyA, 'u1', 'client_owner'))).toEqual(['u1']);
    expect(await users(scopeFor(IDS.agencyA, 'admin', 'agency_admin'))).toEqual(['u1', 'u2']);
    expect(await users(scopeFor(IDS.agencyA, 'u2', 'account_manager'))).toEqual(['u2']);
  });

  it('app_user cannot insert/delete', async () => {
    const scope = scopeFor(IDS.agencyA, 'u1', 'client_owner');
    expect(await errorText(withTenant(dbs.app, scope, (tx) => tx.insert(oauthGrantBinding).values(grant('u1'))))).toMatch(/permission denied/);
    expect(await errorText(withTenant(dbs.app, scope, (tx) => tx.execute(sql`delete from oauth_grant_binding`)))).toMatch(/permission denied/);
  });

  it("revokes own, not a colleague's (0 rows)", async () => {
    await withTenant(dbs.app, scopeFor(IDS.agencyA, 'u1', 'client_owner'), async (tx) => {
      expect(count(await tx.execute(sql`update oauth_grant_binding set revoked_at = now() where user_id = 'u1'`))).toBe(1);
      expect(count(await tx.execute(sql`update oauth_grant_binding set revoked_at = now() where user_id = 'u2'`))).toBe(0);
    });
  });

  it('cannot change anything but revoked_at', async () => {
    const err = await errorText(withTenant(dbs.app, scopeFor(IDS.agencyA, 'u1', 'client_owner'), (tx) => tx.execute(sql`update oauth_grant_binding set scope = 'manage'`)));
    expect(err).toMatch(/permission denied/);
  });
});

describe('mcp_rate_window', () => {
  it('is invisible to app_user and writable by the service role', async () => {
    await dbs.service.insert(mcpRateWindow).values({ tokenKey: 'pat:x', windowKind: 'minute', windowStart: new Date('2026-10-12T10:00:00Z'), count: 1 });
    const err = await errorText(withTenant(dbs.app, scopeFor(IDS.agencyA, 'admin', 'agency_admin'), (tx) => tx.select().from(mcpRateWindow)));
    expect(err).toMatch(/permission denied/);
    expect(await dbs.service.select().from(mcpRateWindow)).toHaveLength(1);
    expect(await errorText(dbs.service.insert(mcpRateWindow).values({ tokenKey: 'pat:x', windowKind: 'hour', windowStart: new Date() }))).toMatch(/mcp_rate_window_kind_check/);
  });
});

describe('audit_log channel', () => {
  const row = { agencyId: IDS.agencyA, userId: 'u1', role: 'agency_admin' as const, tool: 't', inputHash: 'h', outcome: 'ok' as const, durationMs: 1 };

  it('rejects unknown channel', async () => {
    expect(await errorText(dbs.service.insert(auditLog).values({ ...row, channel: 'sms' as never }))).toMatch(/audit_log_channel_check/);
  });

  it('sink writes channel and token_id (null for web)', async () => {
    const sink = createAuditSink(dbs.service);
    const base = { ...row, rowCount: 1 };
    const tokenId = '00000000-0000-4000-8000-0000000000f1';
    await sink.record({ ...base, channel: 'mcp', tokenId });
    await sink.record({ ...base, channel: 'web', tokenId: null });
    const rows = await dbs.service.select({ channel: auditLog.channel, tokenId: auditLog.tokenId }).from(auditLog).orderBy(auditLog.channel);
    expect(rows).toEqual([
      { channel: 'mcp', tokenId },
      { channel: 'web', tokenId: null },
    ]);
  });
});

describe('search_tsv', () => {
  it('is a generated tsvector column with a GIN index on the five tables', async () => {
    const cols = (await dbs.owner.execute(sql`
      SELECT table_name AS t, data_type AS d, is_generated AS g FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'search_tsv' ORDER BY table_name`)) as unknown as { t: string; d: string; g: string }[];
    expect(cols.map((c) => c.t)).toEqual(['alert', 'brief_item', 'event', 'kb_chunk', 'recommendation', 'review']);
    for (const c of cols) expect(c).toMatchObject({ d: 'tsvector', g: 'ALWAYS' });
    const idx = (await dbs.owner.execute(sql`
      SELECT tablename AS t FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE '%search_tsv_idx' AND indexdef LIKE '%USING gin%' ORDER BY tablename`)) as unknown as { t: string }[];
    expect(idx.map((r) => r.t)).toEqual(['alert', 'brief_item', 'event', 'recommendation', 'review']);
  });

  it('matches stemmed words on review, recommendation and brief_item', async () => {
    await dbs.owner.insert(review).values({ competitorId: IDS.competitorX, dedupeKey: 'k', text: 'Technicians arrived promptly' });
    await dbs.service.insert(recommendation).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, title: 'Lower tune-up prices', rationale: 'r', effort: 'L', impact: 'H', owner: 'agency', source: 'brief' });
    const [b] = await dbs.service
      .insert(brief)
      .values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, deliveryDate: '2026-10-05', periodStart: new Date('2026-09-24T00:00:00Z'), periodEnd: new Date('2026-10-01T03:00:00Z'), status: 'ready' })
      .returning({ id: brief.id });
    await dbs.service.insert(briefItem).values({ briefId: b!.id, agencyId: IDS.agencyA, clientId: IDS.clientA1, ord: 0, competitorId: IDS.competitorX, headline: 'h', whatChanged: 'Cut prices', whyItMatters: 'y', recommendedAction: 'z', confidence: 0.9, effort: 'M', impact: 'H' });
    const hit = async (table: string, q: string) =>
      ((await dbs.owner.execute(sql`select count(*)::int as c from ${sql.identifier(table)} where search_tsv @@ plainto_tsquery('english', ${q})`)) as unknown as { c: number }[])[0]!.c;
    expect(await hit('review', 'technician arrive')).toBe(1);
    expect(await hit('recommendation', 'price')).toBe(1);
    expect(await hit('brief_item', 'cutting price')).toBe(1);
    expect(await hit('review', 'plumber')).toBe(0);
  });
});

describe('recommendation.source', () => {
  const rec = { agencyId: IDS.agencyA, clientId: IDS.clientA1, title: 't', rationale: 'r', effort: 'L', impact: 'H', owner: 'agency' } as const;

  it('accepts mcp and still rejects unknown sources', async () => {
    const [r] = await dbs.service.insert(recommendation).values({ ...rec, source: 'mcp' }).returning({ s: recommendation.source });
    expect(r!.s).toBe('mcp');
    expect(await errorText(dbs.service.insert(recommendation).values({ ...rec, source: 'zzz' }))).toMatch(/recommendation_source_check/);
  });
});
