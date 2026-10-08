import { type AccessContext, createAccessContext } from '@cs/core';
import { claimDueSources, ensureCompetitorSources } from '@cs/collectors';
import { client, clientCompetitor, prospectReport } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { EnqueueJob } from '../deps';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const queued: { job: string; data: Record<string, string>; key: string }[] = [];
const enqueue: EnqueueJob = async (job, data, key) => void queued.push({ job, data, key });
const registry = createToolRegistry({ app: dbs.app, service: dbs.service, enqueue }, { audit: { record: async () => {} } });
const ctx = (role: AccessContext['role'], scope: AccessContext['clientScope']) => createAccessContext({ agencyId: IDS.agencyA, userId: `u-${role}`, role, clientScope: scope, features: [] });
const admin = ctx('agency_admin', 'all');
const amA1 = ctx('account_manager', [IDS.clientA1]);
const owner = ctx('client_owner', [IDS.clientA2]);
const AREA = { center: { lat: 33.95, lng: -84.33 }, radiusKm: 10, zips: [] };

beforeEach(async () => {
  queued.length = 0;
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.update(client).set({ status: 'prospect', keywords: ['dentist'], serviceArea: AREA }).where(eq(client.id, IDS.clientA2));
});

describe('prospects (decisions 8–12, Review Focus 1)', () => {
  it('creates a prospect, lists it, and keeps it off the portfolio', async () => {
    const { clientId } = (await registry.invoke(admin, 'create_client', { name: 'Peach Dental', verticalId: 'dental', services: [], keywords: ['dentist'], serviceArea: AREA, placeId: null, status: 'prospect' })) as { clientId: string };
    const { items } = (await registry.invoke(admin, 'list_prospects', {})) as { items: { clientId: string; competitors: number; keywords: number; hasServiceArea: boolean; report: unknown }[] };
    expect(items.map((i) => i.clientId).sort()).toEqual([IDS.clientA2, clientId].sort());
    expect(items.find((i) => i.clientId === IDS.clientA2)).toMatchObject({ competitors: 1, keywords: 1, hasServiceArea: true, report: null });
    expect(items.find((i) => i.clientId === clientId)).toMatchObject({ competitors: 0, report: null });
    const portfolio = (await registry.invoke(admin, 'get_portfolio', {})) as { items: { clientId: string }[] };
    expect(portfolio.items.map((i) => i.clientId)).toEqual([IDS.clientA1]);
  });

  it('runs one snapshot at a time, deduped per client, and re-runs after a timeout', async () => {
    const { reportId } = (await registry.invoke(admin, 'run_prospect_snapshot', { clientId: IDS.clientA2 })) as { reportId: string };
    expect(queued).toEqual([{ job: 'prospect-snapshot', data: { clientId: IDS.clientA2, reportId }, key: `prospect:${IDS.clientA2}` }]);
    expect(await registry.invoke(admin, 'get_prospect_report', { clientId: IDS.clientA2 })).toMatchObject({ report: { id: reportId, status: 'running', finishedAt: null, error: null, data: null } });
    const listed = (await registry.invoke(admin, 'list_prospects', {})) as { items: { clientId: string; report: unknown }[] };
    expect(listed.items.find((i) => i.clientId === IDS.clientA2)?.report).toMatchObject({ id: reportId, status: 'running' });
    await expect(registry.invoke(admin, 'run_prospect_snapshot', { clientId: IDS.clientA2 })).rejects.toMatchObject({ code: 'invalid_input', message: expect.stringMatching(/already running/) });
    await dbs.owner.update(prospectReport).set({ createdAt: new Date(Date.now() - 4 * 3_600_000) }).where(eq(prospectReport.id, reportId));
    expect(await registry.invoke(admin, 'get_prospect_report', { clientId: IDS.clientA2 })).toMatchObject({ report: { status: 'failed', error: expect.stringMatching(/timed out/) } });
    await registry.invoke(admin, 'run_prospect_snapshot', { clientId: IDS.clientA2 });
    expect(queued).toHaveLength(2);
  });

  it('lets only one of two concurrent snapshot requests start (F6)', async () => {
    const results = await Promise.allSettled([
      registry.invoke(admin, 'run_prospect_snapshot', { clientId: IDS.clientA2 }),
      registry.invoke(admin, 'run_prospect_snapshot', { clientId: IDS.clientA2 }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toMatchObject({ code: 'invalid_input', message: expect.stringMatching(/already running/) });
    const rows = await dbs.owner.select().from(prospectReport).where(eq(prospectReport.clientId, IDS.clientA2));
    expect(rows.map((r) => r.status)).toEqual(['running']);
    expect(queued).toHaveLength(1);
  });

  it('refuses a snapshot without keywords, area or competitors, for active clients, out-of-scope callers and client roles', async () => {
    await dbs.owner.update(client).set({ keywords: [] }).where(eq(client.id, IDS.clientA2));
    await expect(registry.invoke(admin, 'run_prospect_snapshot', { clientId: IDS.clientA2 })).rejects.toMatchObject({ code: 'invalid_input' });
    await dbs.owner.update(client).set({ keywords: ['dentist'], serviceArea: null }).where(eq(client.id, IDS.clientA2));
    await expect(registry.invoke(admin, 'run_prospect_snapshot', { clientId: IDS.clientA2 })).rejects.toMatchObject({ code: 'invalid_input', message: expect.stringMatching(/service area/) });
    await dbs.owner.update(client).set({ serviceArea: AREA }).where(eq(client.id, IDS.clientA2));
    await dbs.owner.delete(clientCompetitor).where(eq(clientCompetitor.clientId, IDS.clientA2));
    await expect(registry.invoke(admin, 'run_prospect_snapshot', { clientId: IDS.clientA2 })).rejects.toMatchObject({ code: 'invalid_input', message: expect.stringMatching(/competitor/) });
    await expect(registry.invoke(admin, 'run_prospect_snapshot', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(registry.invoke(amA1, 'run_prospect_snapshot', { clientId: IDS.clientA2 })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(owner, 'run_prospect_snapshot', { clientId: IDS.clientA2 })).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(registry.invoke(admin, 'run_prospect_snapshot', { clientId: IDS.clientB1 })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(admin, 'get_prospect_report', { clientId: IDS.clientB1 })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(owner, 'list_prospects', {})).rejects.toMatchObject({ code: 'permission_denied' });
    expect(queued).toEqual([]);
    expect(await dbs.owner.select().from(prospectReport)).toEqual([]);
  });

  it('marks the report failed when the queue is down', async () => {
    const broken = createToolRegistry({ app: dbs.app, service: dbs.service, enqueue: async () => { throw new Error('boss down'); } }, { audit: { record: async () => {} } });
    await expect(broken.invoke(admin, 'run_prospect_snapshot', { clientId: IDS.clientA2 })).rejects.toBeTruthy();
    const [r] = await dbs.owner.select().from(prospectReport);
    expect(r).toMatchObject({ status: 'failed' });
  });

  it('converts once: status active, links bumped, collection and portfolio start on the next tick', async () => {
    await dbs.owner.update(clientCompetitor).set({ createdAt: new Date(Date.now() - 30 * 86_400_000) }).where(eq(clientCompetitor.clientId, IDS.clientA2));
    await ensureCompetitorSources(dbs.service, IDS.competitorY);
    expect((await claimDueSources(dbs.service, 100)).map((c) => c.competitorId)).not.toContain(IDS.competitorY);
    const before = new Date();
    await expect(registry.invoke(admin, 'convert_prospect', { clientId: IDS.clientA2 })).resolves.toEqual({ clientId: IDS.clientA2 });
    const [c] = await dbs.owner.select().from(client).where(eq(client.id, IDS.clientA2));
    expect(c!.status).toBe('active');
    const [link] = await dbs.owner.select().from(clientCompetitor).where(eq(clientCompetitor.clientId, IDS.clientA2));
    expect(link!.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    expect((await claimDueSources(dbs.service, 100)).map((x) => x.competitorId)).toContain(IDS.competitorY);
    const portfolio = (await registry.invoke(admin, 'get_portfolio', {})) as { items: { clientId: string }[] };
    expect(portfolio.items.map((i) => i.clientId)).toContain(IDS.clientA2);
    expect(((await registry.invoke(admin, 'list_prospects', {})) as { items: unknown[] }).items).toEqual([]);
    await expect(registry.invoke(admin, 'convert_prospect', { clientId: IDS.clientA2 })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(registry.invoke(admin, 'convert_prospect', { clientId: IDS.clientB1 })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(amA1, 'convert_prospect', { clientId: IDS.clientA2 })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('leaves other clients’ link dates alone on convert', async () => {
    const old = new Date(Date.now() - 30 * 86_400_000);
    await dbs.owner.update(clientCompetitor).set({ createdAt: old }).where(eq(clientCompetitor.clientId, IDS.clientA1));
    await registry.invoke(admin, 'convert_prospect', { clientId: IDS.clientA2 });
    const links = await dbs.owner.select().from(clientCompetitor).where(eq(clientCompetitor.clientId, IDS.clientA1));
    expect(links.length).toBeGreaterThan(0);
    for (const l of links) expect(l.createdAt.getTime()).toBe(old.getTime());
  });
});
