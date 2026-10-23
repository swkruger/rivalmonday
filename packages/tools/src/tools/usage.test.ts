import { type AccessContext, createAccessContext } from '@cs/core';
import { askMessage, askThread, client, clientCompetitor, competitor, llmCall } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq, sql } from 'drizzle-orm';
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

type Credits = { used: number; limit: number; ratio: number; level: string };
type Usage = { month: string; items: { clientId: string; credits: Credits; competitorLimit: number; competitors: number; questions: { used: number; quota: number } }[]; agencyLevelCredits: number | null; totalCredits: number };
const spendRow = (clientId: string | null, costUsd: number, provider = 'p') => ({ agencyId: IDS.agencyA, clientId, task: 't', provider, model: 'm', inputTokens: 1, outputTokens: 1, costUsd, latencyMs: 1, ok: true });

describe('get_usage', () => {
  it('get_usage returns integer credits at 100 per USD; agency-level credits only for scope all', async () => {
    await dbs.owner.update(client).set({ spendLimitUsd: 10 }).where(eq(client.id, IDS.clientA1));
    await dbs.owner.insert(llmCall).values([spendRow(IDS.clientA1, 8.5), spendRow(null, 0.4)]);
    const all = (await registry.invoke(admin, 'get_usage', {})) as Usage;
    const a1 = all.items.find((i) => i.clientId === IDS.clientA1)!;
    expect(a1.credits).toMatchObject({ used: 850, limit: 1000, level: 'near' });
    expect(a1.credits.ratio).toBeCloseTo(0.85);
    expect(a1).toMatchObject({ competitorLimit: 5, competitors: 1, questions: { used: 0, quota: 100 } });
    expect(all.items.map((i) => i.clientId).sort()).toEqual([IDS.clientA1, IDS.clientA2].sort());
    expect(all.agencyLevelCredits).toBe(40);
    expect(all.totalCredits).toBe(850 + 0 + 40);
    const scoped = (await registry.invoke(am, 'get_usage', {})) as Usage;
    expect(scoped.items.map((i) => i.clientId)).toEqual([IDS.clientA1]);
    expect(scoped.agencyLevelCredits).toBeNull();
    expect(scoped.totalCredits).toBe(850);
    await expect(registry.invoke(owner, 'get_usage', {})).rejects.toMatchObject({ code: 'not_found' });
  });

  it('level near at 80 %, reached at 100 %, paused when spend_paused_at set', async () => {
    await dbs.owner.update(client).set({ spendLimitUsd: 10, spendPausedAt: new Date() }).where(eq(client.id, IDS.clientA2));
    await dbs.owner.insert(llmCall).values([spendRow(IDS.clientA1, 7.99)]);
    const lvl = async () => {
      const r = (await registry.invoke(admin, 'get_usage', {})) as Usage;
      return [r.items.find((i) => i.clientId === IDS.clientA1)!.credits.level, r.items.find((i) => i.clientId === IDS.clientA2)!.credits.level];
    };
    await dbs.owner.update(client).set({ spendLimitUsd: 10 }).where(eq(client.id, IDS.clientA1));
    expect(await lvl()).toEqual(['ok', 'paused']);
    await dbs.owner.insert(llmCall).values([spendRow(IDS.clientA1, 0.01)]);
    expect((await lvl())[0]).toBe('near');
    await dbs.owner.insert(llmCall).values([spendRow(IDS.clientA1, 2)]);
    expect((await lvl())[0]).toBe('reached');
  });

  it('override limit used, else default', async () => {
    await dbs.owner.update(client).set({ spendLimitUsd: 20 }).where(eq(client.id, IDS.clientA1));
    const r = (await registry.invoke(admin, 'get_usage', {})) as Usage;
    expect(r.items.find((i) => i.clientId === IDS.clientA1)!.credits.limit).toBe(2000);
    expect(r.items.find((i) => i.clientId === IDS.clientA2)!.credits.limit).toBe(1500);
  });

  it('excludes Jev spend from credits', async () => {
    await dbs.owner.insert(llmCall).values([spendRow(IDS.clientA1, 5, 'jev'), spendRow(null, 5, 'jev'), spendRow(IDS.clientA1, 1)]);
    const r = (await registry.invoke(admin, 'get_usage', {})) as Usage;
    expect(r.items.find((i) => i.clientId === IDS.clientA1)!.credits.used).toBe(100);
    expect(r.agencyLevelCredits).toBe(0);
  });

  it('no usd keys or dollar text', async () => {
    await dbs.owner.insert(llmCall).values([spendRow(IDS.clientA1, 3.3)]);
    const out = JSON.stringify(await registry.invoke(admin, 'get_usage', {}));
    expect(out).not.toMatch(/usd|\$|rival monday/i);
  });
});

describe('get_usage questions', () => {
  it('get_usage.questions used/quota', async () => {
    await dbs.owner.execute(sql`insert into auth."user" (id, name, email, "emailVerified") values ('u-a', 'a', 'a@example.com', true), ('u-b', 'b', 'b@example.com', true) on conflict (id) do nothing`);
    await dbs.owner.update(client).set({ askMonthlyQuota: 7 }).where(eq(client.id, IDS.clientA1));
    const mk = async (userId: string, counts: boolean, createdAt?: Date) => {
      const [t] = await dbs.owner.insert(askThread).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, userId, title: 't' }).returning();
      await dbs.owner.insert(askMessage).values({ threadId: t!.id, agencyId: IDS.agencyA, clientId: IDS.clientA1, userId, role: 'user', content: 'q', countsTowardQuota: counts, ...(createdAt ? { createdAt } : {}) });
    };
    await mk('u-a', true);
    await mk('u-b', true);
    await mk('u-a', false); // agency-style, not counted
    await mk('u-b', true, new Date(Date.now() - 70 * 86_400_000)); // previous months
    const r = (await registry.invoke(admin, 'get_usage', {})) as Usage;
    expect(r.items.find((i) => i.clientId === IDS.clientA1)!.questions).toEqual({ used: 2, quota: 7 });
    expect(r.items.find((i) => i.clientId === IDS.clientA2)!.questions).toEqual({ used: 0, quota: 100 });
  });

  it('get_usage refuses client roles', async () => {
    const viewer = ctx('client_viewer', [IDS.clientA1]);
    await expect(registry.invoke(viewer, 'get_usage', {})).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(owner, 'get_usage', {})).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('set_client_limits askMonthlyQuota', () => {
  it('askMonthlyQuota admin-only and bounds', async () => {
    await registry.invoke(admin, 'set_client_limits', { clientId: IDS.clientA1, askMonthlyQuota: 0 });
    expect((await dbs.owner.select().from(client).where(eq(client.id, IDS.clientA1)))[0]!.askMonthlyQuota).toBe(0);
    await registry.invoke(admin, 'set_client_limits', { clientId: IDS.clientA1, askMonthlyQuota: 100000 });
    expect((await dbs.owner.select().from(client).where(eq(client.id, IDS.clientA1)))[0]!.askMonthlyQuota).toBe(100000);
    for (const bad of [-1, 100001, 2.5, Number.NaN]) {
      await expect(registry.invoke(admin, 'set_client_limits', { clientId: IDS.clientA1, askMonthlyQuota: bad })).rejects.toMatchObject({ code: 'invalid_input' });
    }
    await expect(registry.invoke(am, 'set_client_limits', { clientId: IDS.clientA1, askMonthlyQuota: 5 })).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(registry.invoke(owner, 'set_client_limits', { clientId: IDS.clientA1, askMonthlyQuota: 5 })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(admin, 'set_client_limits', { clientId: IDS.clientB1, askMonthlyQuota: 5 })).rejects.toMatchObject({ code: 'not_found' });
    expect((await dbs.owner.select().from(client).where(eq(client.id, IDS.clientA1)))[0]!.askMonthlyQuota).toBe(100000);
  });
});

describe('set_client_limits (Review Focus 4)', () => {
  it('lets admins set a cap (rounded to cents) and a competitor limit', async () => {
    const r = await registry.invoke(admin, 'set_client_limits', { clientId: IDS.clientA1, monthlyCapUsd: 22.499, competitorLimit: 8 });
    expect(r).toEqual({ clientId: IDS.clientA1, monthlyCapUsd: 22.5, competitorLimit: 8 });
    const [c] = await dbs.owner.select().from(client).where(eq(client.id, IDS.clientA1));
    expect(c).toMatchObject({ spendLimitUsd: 22.5, competitorLimit: 8 });
  });

  it('refuses bad numbers, AMs, client roles and other agencies’ clients, changing nothing', async () => {
    for (const bad of [{ monthlyCapUsd: 0 }, { monthlyCapUsd: -5 }, { monthlyCapUsd: 10_001 }, { monthlyCapUsd: Number.NaN }, { competitorLimit: 0 }, { competitorLimit: 11 }, { competitorLimit: 2.5 }, {}]) {
      await expect(registry.invoke(admin, 'set_client_limits', { clientId: IDS.clientA1, ...bad })).rejects.toMatchObject({ code: 'invalid_input' });
    }
    await expect(registry.invoke(am, 'set_client_limits', { clientId: IDS.clientA1, competitorLimit: 6 })).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(registry.invoke(owner, 'set_client_limits', { clientId: IDS.clientA1, competitorLimit: 6 })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(admin, 'set_client_limits', { clientId: IDS.clientB1, competitorLimit: 6 })).rejects.toMatchObject({ code: 'not_found' });
    const [c] = await dbs.owner.select().from(client).where(eq(client.id, IDS.clientA1));
    expect(c).toMatchObject({ spendLimitUsd: null, competitorLimit: 5 });
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
