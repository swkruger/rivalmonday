import { type AccessContext, type AuditEvent, createAccessContext } from '@cs/core';
import { alert, brief, briefItem, changeEvent, trendReport } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const audit: AuditEvent[] = [];
const registry = createToolRegistry({ app: dbs.app, service: dbs.service }, { audit: { record: async (e) => void audit.push(e) } });

const ctx = (role: AccessContext['role'], scope: AccessContext['clientScope'], agencyId: string = IDS.agencyA) =>
  createAccessContext({ agencyId, userId: `u-${role}`, role, clientScope: scope, features: [] });
const admin = ctx('agency_admin', 'all');
const owner = ctx('client_owner', [IDS.clientA1]);
const otherAgency = ctx('agency_admin', 'all', IDS.agencyB);

const ids = { readyBrief: '', sentBrief: '', pendingAlert: '', deliveredAlert: '', readyReport: '', sentReport: '' };

beforeEach(async () => {
  audit.length = 0;
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  const base = { agencyId: IDS.agencyA, clientId: IDS.clientA1 };
  const period = { periodStart: new Date('2026-09-28T00:00:00Z'), periodEnd: new Date('2026-10-04T00:00:00Z') };
  const [ready] = await dbs.owner.insert(brief).values({ ...base, ...period, deliveryDate: '2026-10-12', status: 'ready', summary: 'Draft' }).returning();
  const [sent] = await dbs.owner.insert(brief).values({ ...base, ...period, deliveryDate: '2026-10-05', status: 'sent', summary: 'Sent', sentAt: new Date('2026-10-05T12:00:00Z') }).returning();
  await dbs.owner.insert(briefItem).values({
    ...base, briefId: sent!.id, ord: 1, competitorId: IDS.competitorX, headline: 'Smith cut prices', whatChanged: 'w', whyItMatters: 'y',
    recommendedAction: 'r', confidence: 0.9, effort: 'L', impact: 'H', upsellTag: 'ppc_audit',
  });
  const [ev] = await dbs.owner.insert(changeEvent).values({ competitorId: IDS.competitorX, changeType: 'price_change', summary: 's', confidence: 0.9, occurredAt: new Date('2026-10-03T00:00:00Z') }).returning();
  const alertBase = { ...base, competitorId: IDS.competitorX, eventId: ev!.id, score: 80, headline: 'H', body: 'B', mode: 'after_am_check' };
  const [pending] = await dbs.owner.insert(alert).values({ ...alertBase, status: 'pending_review' }).returning();
  const [delivered] = await dbs.owner.insert(alert).values({ ...alertBase, status: 'delivered', deliveredAt: new Date('2026-10-04T10:00:00Z') }).returning();
  const rp = { ...base, periodStart: new Date('2026-07-01T00:00:00Z'), periodEnd: new Date('2026-09-30T00:00:00Z') };
  const [rr] = await dbs.owner.insert(trendReport).values({ ...rp, quarter: '2026-Q2', status: 'ready' }).returning();
  const [rs] = await dbs.owner.insert(trendReport).values({ ...rp, quarter: '2026-Q3', status: 'sent', sentAt: new Date('2026-10-02T08:00:00Z'), data: { quarter: '2026-Q3' } as never }).returning();
  Object.assign(ids, { readyBrief: ready!.id, sentBrief: sent!.id, pendingAlert: pending!.id, deliveredAlert: delivered!.id, readyReport: rr!.id, sentReport: rs!.id });
});

describe('clients', () => {
  it('list_clients is agency-only and tenant-scoped', async () => {
    const out = (await registry.invoke(admin, 'list_clients', {})) as { items: { name: string }[] };
    expect(out.items.map((c) => c.name).sort()).toEqual(['A1 HVAC', 'A2 Dental']);
    await expect(registry.invoke(owner, 'list_clients', {})).rejects.toMatchObject({ code: 'permission_denied' });
  });

  it('get_client_profile hides agency fields from clients and refuses other tenants', async () => {
    const asOwner = (await registry.invoke(owner, 'get_client_profile', { clientId: IDS.clientA1 })) as { alertMode: unknown };
    expect(asOwner.alertMode).toBeNull();
    const asAdmin = (await registry.invoke(admin, 'get_client_profile', { clientId: IDS.clientA1 })) as { alertMode: unknown };
    expect(asAdmin.alertMode).toBe('after_am_check');
    await expect(registry.invoke(owner, 'get_client_profile', { clientId: IDS.clientA2 })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(otherAgency, 'get_client_profile', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('briefs', () => {
  it('list_briefs shows clients only approved/sent briefs, agencies all', async () => {
    const forOwner = (await registry.invoke(owner, 'list_briefs', { clientId: IDS.clientA1 })) as { items: { id: string }[] };
    expect(forOwner.items.map((b) => b.id)).toEqual([ids.sentBrief]);
    const forAdmin = (await registry.invoke(admin, 'list_briefs', { clientId: IDS.clientA1 })) as { items: { id: string }[] };
    expect(forAdmin.items.map((b) => b.id)).toEqual([ids.readyBrief, ids.sentBrief]);
  });

  it('get_brief strips upsell_tag for clients and hides drafts', async () => {
    const forOwner = (await registry.invoke(owner, 'get_brief', { briefId: ids.sentBrief })) as { items: { upsellTag: unknown; competitorName: string }[] };
    expect(forOwner.items[0]).toMatchObject({ upsellTag: null, competitorName: 'Smith HVAC' });
    const forAdmin = (await registry.invoke(admin, 'get_brief', { briefId: ids.sentBrief })) as { items: { upsellTag: unknown }[] };
    expect(forAdmin.items[0]!.upsellTag).toBe('ppc_audit');
    await expect(registry.invoke(owner, 'get_brief', { briefId: ids.readyBrief })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(otherAgency, 'get_brief', { briefId: ids.sentBrief })).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('alerts', () => {
  it('clients see delivered alerts only', async () => {
    const forOwner = (await registry.invoke(owner, 'list_alerts', { clientId: IDS.clientA1 })) as { items: { id: string }[] };
    expect(forOwner.items.map((a) => a.id)).toEqual([ids.deliveredAlert]);
    await expect(registry.invoke(owner, 'get_alert', { alertId: ids.pendingAlert })).rejects.toMatchObject({ code: 'not_found' });
    const forAdmin = (await registry.invoke(admin, 'list_alerts', { clientId: IDS.clientA1 })) as { items: unknown[] };
    expect(forAdmin.items).toHaveLength(2);
  });
});

describe('trend reports', () => {
  it('clients see sent reports only', async () => {
    const forOwner = (await registry.invoke(owner, 'list_trend_reports', { clientId: IDS.clientA1 })) as { items: { id: string }[] };
    expect(forOwner.items.map((r) => r.id)).toEqual([ids.sentReport]);
    await expect(registry.invoke(owner, 'get_trend_report', { reportId: ids.readyReport })).rejects.toMatchObject({ code: 'not_found' });
    const detail = (await registry.invoke(admin, 'get_trend_report', { reportId: ids.sentReport })) as { quarter: string; data: unknown };
    expect(detail).toMatchObject({ quarter: '2026-Q3', data: { quarter: '2026-Q3' } });
  });
});

it('audits every call, including refusals', async () => {
  await registry.invoke(admin, 'list_clients', {});
  await registry.invoke(owner, 'list_clients', {}).catch(() => {});
  expect(audit.map((a) => [a.tool, a.outcome])).toEqual([['list_clients', 'ok'], ['list_clients', 'permission_denied']]);
});
