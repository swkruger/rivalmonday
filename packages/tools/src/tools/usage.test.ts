import { type AccessContext, createAccessContext } from '@cs/core';
import { client, clientCompetitor, competitor, llmCall } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const registry = createToolRegistry({ app: dbs.app, service: dbs.service }, { audit: { record: async () => {} } });
const ctx = (role: AccessContext['role'], scope: AccessContext['clientScope']) => createAccessContext({ agencyId: IDS.agencyA, userId: `u-${role}`, role, clientScope: scope, features: [] });
const admin = ctx('agency_admin', 'all');
const am = ctx('account_manager', [IDS.clientA1]);
const owner = ctx('client_owner', [IDS.clientA1]);

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

type Usage = { month: string; items: { clientId: string; spend: { monthToDateUsd: number; capUsd: number; level: string }; competitorLimit: number; competitors: number; questions: { used: null; quota: null } }[]; agencyLevelUsd: number | null };

describe('get_usage', () => {
  it('shows spend vs cap per client in scope; agency-level spend only for scope all', async () => {
    await dbs.owner.update(client).set({ monthlyCapUsd: 10 }).where(eq(client.id, IDS.clientA1));
    await dbs.owner.insert(llmCall).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, task: 't', provider: 'p', model: 'm', inputTokens: 1, outputTokens: 1, costUsd: 8.5, latencyMs: 1, ok: true });
    const all = (await registry.invoke(admin, 'get_usage', {})) as Usage;
    const a1 = all.items.find((i) => i.clientId === IDS.clientA1)!;
    expect(a1.spend).toMatchObject({ monthToDateUsd: 8.5, capUsd: 10, level: 'warning' });
    expect(a1).toMatchObject({ competitorLimit: 5, competitors: 1, questions: { used: null, quota: null } });
    expect(all.items.map((i) => i.clientId).sort()).toEqual([IDS.clientA1, IDS.clientA2].sort());
    expect(all.agencyLevelUsd).toBe(0);
    const scoped = (await registry.invoke(am, 'get_usage', {})) as Usage;
    expect(scoped.items.map((i) => i.clientId)).toEqual([IDS.clientA1]);
    expect(scoped.agencyLevelUsd).toBeNull();
    await expect(registry.invoke(owner, 'get_usage', {})).rejects.toMatchObject({ code: 'permission_denied' });
  });
});

describe('set_client_limits (Review Focus 4)', () => {
  it('lets admins set a cap (rounded to cents) and a competitor limit', async () => {
    const r = await registry.invoke(admin, 'set_client_limits', { clientId: IDS.clientA1, monthlyCapUsd: 22.499, competitorLimit: 8 });
    expect(r).toEqual({ clientId: IDS.clientA1, monthlyCapUsd: 22.5, competitorLimit: 8 });
    const [c] = await dbs.owner.select().from(client).where(eq(client.id, IDS.clientA1));
    expect(c).toMatchObject({ monthlyCapUsd: 22.5, competitorLimit: 8 });
  });

  it('refuses bad numbers, AMs, client roles and other agencies’ clients, changing nothing', async () => {
    for (const bad of [{ monthlyCapUsd: 0 }, { monthlyCapUsd: -5 }, { monthlyCapUsd: 1e9 }, { monthlyCapUsd: Number.NaN }, { competitorLimit: 0 }, { competitorLimit: 11 }, { competitorLimit: 2.5 }, {}]) {
      await expect(registry.invoke(admin, 'set_client_limits', { clientId: IDS.clientA1, ...bad })).rejects.toMatchObject({ code: 'invalid_input' });
    }
    await expect(registry.invoke(am, 'set_client_limits', { clientId: IDS.clientA1, competitorLimit: 6 })).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(registry.invoke(owner, 'set_client_limits', { clientId: IDS.clientA1, competitorLimit: 6 })).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(registry.invoke(admin, 'set_client_limits', { clientId: IDS.clientB1, competitorLimit: 6 })).rejects.toMatchObject({ code: 'not_found' });
    const [c] = await dbs.owner.select().from(client).where(eq(client.id, IDS.clientA1));
    expect(c).toMatchObject({ monthlyCapUsd: 15, competitorLimit: 5 });
  });
});

describe('configurable competitor limit (decision 6)', () => {
  it('refuses a new competitor at the client’s own limit, keeps existing ones when lowered', async () => {
    await dbs.owner.update(client).set({ competitorLimit: 1 }).where(eq(client.id, IDS.clientA1));
    await expect(registry.invoke(admin, 'add_competitor', { clientId: IDS.clientA1, name: 'Other HVAC', domain: 'otherhvac.example' })).rejects.toMatchObject({ code: 'invalid_input', message: expect.stringMatching(/at most 1 competitor/) });
    const [extra] = await dbs.owner.insert(competitor).values({ name: 'Third', domain: 'third.example' }).returning();
    await dbs.owner.insert(clientCompetitor).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: extra!.id });
    const list = (await registry.invoke(admin, 'list_client_competitors', { clientId: IDS.clientA1 })) as { items: unknown[]; limit: number };
    expect(list).toMatchObject({ limit: 1 });
    expect(list.items).toHaveLength(2);
  });
});
