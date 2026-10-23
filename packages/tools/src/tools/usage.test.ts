import { type AccessContext, createAccessContext } from '@cs/core';
import { askMessage, askThread, auditLog, client, clientCompetitor, competitor, llmCall, platformAdmin, spendGuardEvent } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import { PAUSED_WRITE_ALLOW_LIST } from '../billing-guard';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const registry = createToolRegistry({ app: dbs.app, service: dbs.service, platformAdmins: [] }, { audit: { record: async () => {} } });
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

const stf = ctx('agency_admin', 'all');
const staff = { ...stf, userId: 'staff' } as AccessContext;
const pviewer = { ...stf, userId: 'pviewer' } as AccessContext;
type Lim = { clientId: string; spendLimitUsd: number | null; competitorLimit: number; askMonthlyQuota: number; lifted: boolean };
const setLimits = (c: AccessContext, input: Record<string, unknown>) => registry.invoke(c, 'set_client_limits', { clientId: IDS.clientA1, ...input }) as Promise<Lim>;
const a1 = async () => (await dbs.owner.select().from(client).where(eq(client.id, IDS.clientA1)))[0]!;
const events = () => dbs.owner.select().from(spendGuardEvent).where(eq(spendGuardEvent.kind, 'client_unpaused'));
const seedOperators = async () => {
  await truncateAuth(dbs.owner);
  for (const u of ['staff', 'pviewer']) await seedUser(dbs.owner, u, `${u}@example.com`);
  await dbs.owner.insert(platformAdmin).values([{ userId: 'staff', role: 'staff', createdBy: 'test' }, { userId: 'pviewer', role: 'viewer', createdBy: 'test' }]);
};

describe('set_client_limits (platform staff only)', () => {
  beforeEach(seedOperators);

  it('agency_admin calling set_client_limits gets not_found', async () => {
    for (const c of [admin, am, owner]) await expect(setLimits(c, { competitorLimit: 6 })).rejects.toMatchObject({ code: 'not_found' });
    expect((await a1()).competitorLimit).toBe(5);
  });

  it('viewer is refused', async () => {
    await expect(setLimits(pviewer, { spendLimitUsd: 20 })).rejects.toMatchObject({ code: 'not_found' });
    expect((await a1()).spendLimitUsd).toBeNull();
  });

  it('staff sets an override and clears it with null', async () => {
    expect(await setLimits(staff, { spendLimitUsd: 22.499 })).toEqual({ clientId: IDS.clientA1, spendLimitUsd: 22.5, competitorLimit: 5, askMonthlyQuota: 100, lifted: false });
    expect((await a1()).spendLimitUsd).toBe(22.5);
    expect(await setLimits(staff, { spendLimitUsd: null })).toMatchObject({ spendLimitUsd: null });
    expect((await a1()).spendLimitUsd).toBeNull();
  });

  it('staff sets competitor limit and ask quota with bounds; other agencies are reachable', async () => {
    expect(await setLimits(staff, { competitorLimit: 8, askMonthlyQuota: 0 })).toMatchObject({ competitorLimit: 8, askMonthlyQuota: 0 });
    for (const bad of [{ spendLimitUsd: 0 }, { spendLimitUsd: 10_001 }, { competitorLimit: 0 }, { competitorLimit: 11 }, { competitorLimit: 2.5 }, { askMonthlyQuota: -1 }, { askMonthlyQuota: 100_001 }, {}]) {
      await expect(setLimits(staff, bad)).rejects.toMatchObject({ code: 'invalid_input' });
    }
    expect(await registry.invoke(staff, 'set_client_limits', { clientId: IDS.clientB1, competitorLimit: 3 })).toMatchObject({ clientId: IDS.clientB1, competitorLimit: 3 });
    await expect(registry.invoke(staff, 'set_client_limits', { clientId: '00000000-0000-4000-8000-000000000009', competitorLimit: 3 })).rejects.toMatchObject({ code: 'not_found' });
  });

  describe('spend pause', () => {
    const pausedAt = new Date('2026-10-02T00:00:00Z');
    beforeEach(async () => {
      await dbs.owner.update(client).set({ spendLimitUsd: 10, spendPausedAt: pausedAt }).where(eq(client.id, IDS.clientA1));
      await dbs.owner.insert(llmCall).values(spendRow(IDS.clientA1, 14)); // over the 13 threshold
    });

    it('raise above spend lifts the pause and writes client_unpaused in the same tx', async () => {
      const r = await setLimits(staff, { spendLimitUsd: 20 }); // threshold 26 > 14
      expect(r.lifted).toBe(true);
      expect((await a1()).spendPausedAt).toBeNull();
      const ev = await events();
      expect(ev).toHaveLength(1);
      expect(ev[0]).toMatchObject({ clientId: IDS.clientA1, agencyId: IDS.agencyA, actor: 'staff', note: 'limit raised', limitUsd: 20 });
    });

    it('raise still under the threshold keeps the pause', async () => {
      const r = await setLimits(staff, { spendLimitUsd: 10.5 }); // threshold 13.65 < 14
      expect(r.lifted).toBe(false);
      expect((await a1()).spendPausedAt).toEqual(pausedAt);
      expect(await events()).toHaveLength(0);
    });

    it('a non-limit change does not lift; clearing to the default (15 -> 19.5) does', async () => {
      expect((await setLimits(staff, { competitorLimit: 6 })).lifted).toBe(false);
      expect((await a1()).spendPausedAt).toEqual(pausedAt);
      expect((await setLimits(staff, { spendLimitUsd: null })).lifted).toBe(true);
    });
  });

  it('lowering below spend does not pause', async () => {
    await dbs.owner.insert(llmCall).values(spendRow(IDS.clientA1, 14));
    const r = await setLimits(staff, { spendLimitUsd: 1 });
    expect(r.lifted).toBe(false);
    expect((await a1()).spendPausedAt).toBeNull();
    expect(await events()).toHaveLength(0);
  });

  it('paused_at and paused_by untouched', async () => {
    const at = new Date('2026-10-01T00:00:00Z');
    await dbs.owner.update(client).set({ pausedAt: at, pausedBy: 'someone', spendPausedAt: new Date() }).where(eq(client.id, IDS.clientA1));
    await setLimits(staff, { spendLimitUsd: 500 });
    const c = await a1();
    expect(c.spendPausedAt).toBeNull();
    expect(c.pausedAt).toEqual(at);
    expect(c.pausedBy).toBe('someone');
  });

  it('archived client is not_found', async () => {
    await dbs.owner.update(client).set({ archivedAt: new Date() }).where(eq(client.id, IDS.clientA1));
    await expect(setLimits(staff, { competitorLimit: 6 })).rejects.toMatchObject({ code: 'not_found' });
    expect((await a1()).competitorLimit).toBe(5);
  });

  it('is exempt from the billing write guard (platform tool)', () => {
    expect(PAUSED_WRITE_ALLOW_LIST).toEqual(expect.arrayContaining(['set_client_limits', 'get_client_limits']));
  });

  it('is audited under the client agency', async () => {
    await setLimits(staff, { spendLimitUsd: 20 });
    const rows = await dbs.owner.select().from(auditLog).where(eq(auditLog.tool, 'set_client_limits'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ agencyId: IDS.agencyA, role: 'platform_staff', outcome: 'ok' });
  });
});

describe('get_client_limits', () => {
  beforeEach(seedOperators);
  type Limits = { defaultLimitUsd: number; pausePercent: number; items: { clientId: string; spendUsd: number; effectiveLimitUsd: number; spendLimitUsd: number | null; competitorLimit: number; askMonthlyQuota: number; level: string; spendPausedAt: string | null }[] };

  it('platform viewer reads USD spend, limits and levels; archived excluded; others refused', async () => {
    await dbs.owner.update(client).set({ spendLimitUsd: 10 }).where(eq(client.id, IDS.clientA1));
    await dbs.owner.update(client).set({ archivedAt: new Date() }).where(eq(client.id, IDS.clientA2));
    await dbs.owner.insert(llmCall).values([spendRow(IDS.clientA1, 8.5), spendRow(IDS.clientA1, 3, 'jev')]);
    const r = (await registry.invoke(pviewer, 'get_client_limits', { agencyId: IDS.agencyA })) as Limits;
    expect(r).toMatchObject({ defaultLimitUsd: 15, pausePercent: 130 });
    expect(r.items.map((i) => i.clientId)).toEqual([IDS.clientA1]);
    expect(r.items[0]).toMatchObject({ spendUsd: 8.5, effectiveLimitUsd: 10, spendLimitUsd: 10, competitorLimit: 5, askMonthlyQuota: 100, level: 'near', spendPausedAt: null });
    for (const c of [admin, am, owner]) await expect(registry.invoke(c, 'get_client_limits', { agencyId: IDS.agencyA })).rejects.toMatchObject({ code: 'not_found' });
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
