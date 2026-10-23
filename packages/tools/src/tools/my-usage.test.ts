import { type AccessContext, createAccessContext } from '@cs/core';
import { client, llmCall } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const registry = createToolRegistry({ app: dbs.app, service: dbs.service }, { audit: { record: async () => {} } });
const mk = (role: AccessContext['role'], scope: AccessContext['clientScope'], userId = `u-${role}`) => createAccessContext({ agencyId: IDS.agencyA, userId, role, clientScope: scope, features: [] });
const A1 = IDS.clientA1;
const admin = mk('agency_admin', 'all');
const am = mk('account_manager', [A1]);
const owner = mk('client_owner', [A1]);
const viewer = mk('client_viewer', [A1]);
const guest = mk('client_owner', [A1], 'contact:abc');

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

const spend = (clientId: string, costUsd: number) => ({ agencyId: IDS.agencyA, clientId, task: 't', provider: 'p', model: 'm', inputTokens: 1, outputTokens: 1, costUsd, latencyMs: 1, ok: true });
const noMoney = /usd|\$|rival monday/i;

describe('get_my_usage', () => {
  it('returns credits for agency roles (with questions) and the client owner (questions null)', async () => {
    await dbs.owner.insert(llmCall).values(spend(A1, 12));
    const a = (await registry.invoke(admin, 'get_my_usage', { clientId: A1 })) as { month: string; credits: Record<string, unknown>; questions: unknown };
    expect(a.month).toMatch(/^\d{4}-\d{2}$/);
    expect(a.credits).toMatchObject({ used: 1200, limit: 1500, level: 'near' });
    expect(a.questions).toEqual({ used: 0, quota: 100 });
    expect(await registry.invoke(am, 'get_my_usage', { clientId: A1 })).toMatchObject({ credits: { used: 1200 } });
    const o = (await registry.invoke(owner, 'get_my_usage', { clientId: A1 })) as { questions: unknown };
    expect(o.questions).toBeNull(); // client_owner gets questions null
    expect(JSON.stringify(o)).not.toMatch(noMoney);
  });

  it('refuses client_viewer and a guest (not_found), and other clients', async () => {
    await expect(registry.invoke(viewer, 'get_my_usage', { clientId: A1 })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(guest, 'get_my_usage', { clientId: A1 })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(owner, 'get_my_usage', { clientId: IDS.clientA2 })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(admin, 'get_my_usage', { clientId: IDS.clientB1 })).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('get_spend_status', () => {
  it('get_spend_status lists only visible paused clients', async () => {
    await dbs.owner.update(client).set({ spendPausedAt: new Date() }).where(eq(client.id, IDS.clientA2));
    const next = new Date();
    const until = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
    const all = (await registry.invoke(admin, 'get_spend_status', {})) as { paused: { clientId: string; name: string; until: string }[] };
    expect(all.paused.map((p) => p.clientId)).toEqual([IDS.clientA2]);
    expect(all.paused[0]!.until).toBe(until);
    expect(JSON.stringify(all)).not.toMatch(noMoney);
    expect(((await registry.invoke(am, 'get_spend_status', {})) as { paused: unknown[] }).paused).toEqual([]); // A2 out of scope
    expect(((await registry.invoke(owner, 'get_spend_status', { clientId: A1 })) as { paused: unknown[] }).paused).toEqual([]);
    await dbs.owner.update(client).set({ spendPausedAt: new Date() }).where(eq(client.id, A1));
    const o = (await registry.invoke(owner, 'get_spend_status', { clientId: A1 })) as { paused: { clientId: string }[] };
    expect(o.paused.map((p) => p.clientId)).toEqual([A1]);
    expect(((await registry.invoke(owner, 'get_spend_status', {})) as { paused: unknown[] }).paused).toEqual([]);
    expect(((await registry.invoke(owner, 'get_spend_status', { clientId: IDS.clientA2 })) as { paused: unknown[] }).paused).toEqual([]);
  });
});
