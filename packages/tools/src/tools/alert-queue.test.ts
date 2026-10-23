import { type AccessContext, createAccessContext } from '@cs/core';
import { alert, changeEvent, contact } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import type { DeliveryConfig } from '@cs/engine';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const delivery: DeliveryConfig = { appUrl: 'http://localhost:3000', linkSecrets: ['k'.repeat(40)], fromAddress: 'alerts@example.com' };
const registry = createToolRegistry({ app: dbs.app, service: dbs.service, delivery }, { audit: { record: async () => {} } });
const ctx = (role: AccessContext['role'], scope: AccessContext['clientScope']) => createAccessContext({ agencyId: IDS.agencyA, userId: `u-${role}`, role, clientScope: scope, features: [] });
const am = ctx('account_manager', [IDS.clientA1]);
const amA2 = ctx('account_manager', [IDS.clientA2]);
let pending = '';

async function mkAlert(status: string, delivery: string | null = null): Promise<string> {
  const [e] = await dbs.owner.insert(changeEvent).values({ competitorId: IDS.competitorX, changeType: 'price_change', summary: 'Smith HVAC cut tune-ups to $59', confidence: 0.9, occurredAt: new Date() }).returning();
  const [a] = await dbs.owner.insert(alert).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, eventId: e!.id, score: 82, headline: 'Price cut', body: 'Smith HVAC cut tune-ups to $59.', status, mode: 'after_am_check', delivery, evidenceIds: ['00000000-0000-4000-8000-0000000000e1'] }).returning();
  return a!.id;
}

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.service.insert(contact).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'owner@a1.example' });
  pending = await mkAlert('pending_review');
  await mkAlert('approved', 'digest');
  await mkAlert('delivered', 'immediate');
});

type Queue = { items: { clientId: string }[]; capped: boolean; clients: { id: string; name: string; count: number }[] };
const queue = (c: AccessContext, input: object = {}) => registry.invoke(c, 'list_alert_queue', input) as Promise<Queue>;
const admin = ctx('agency_admin', 'all');

/** Queue rows for a client in bulk, without the per-row helper's round trips. */
async function bulkAlerts(clientId: string, n: number): Promise<void> {
  const events = await dbs.owner.insert(changeEvent).values(Array.from({ length: n }, () => ({ competitorId: IDS.competitorX, changeType: 'price_change', summary: 's', confidence: 0.9, occurredAt: new Date() }))).returning();
  await dbs.owner.insert(alert).values(events.map((e, i) => ({ agencyId: IDS.agencyA, clientId, competitorId: IDS.competitorX, eventId: e.id, score: 70, headline: `h${i}`, body: 'b', status: 'pending_review', mode: 'after_am_check', evidenceIds: [] })));
}

describe('alert queue', () => {
  it('capped is true with 201 queued alerts and items has 200', async () => {
    await bulkAlerts(IDS.clientA1, 199); // + the 2 queued by beforeEach = 201
    const r = await queue(admin);
    expect(r.items).toHaveLength(200);
    expect(r.capped).toBe(true);
  });

  it('capped is false at exactly 200', async () => {
    await bulkAlerts(IDS.clientA1, 198);
    const r = await queue(admin);
    expect(r.items).toHaveLength(200);
    expect(r.capped).toBe(false);
  });

  it('clientId filters', async () => {
    await bulkAlerts(IDS.clientA2, 1);
    const r = await queue(admin, { clientId: IDS.clientA2 });
    expect(r.items).toHaveLength(1);
    expect(r.items.every((i) => i.clientId === IDS.clientA2)).toBe(true);
  });

  it('clients lists every client with queue rows even when capped', async () => {
    await bulkAlerts(IDS.clientA1, 250);
    await bulkAlerts(IDS.clientA2, 1);
    const r = await queue(admin);
    expect(r.capped).toBe(true);
    expect(r.clients.map((c) => [c.id, c.count])).toEqual(expect.arrayContaining([[IDS.clientA1, 252], [IDS.clientA2, 1]]));
    expect(r.clients).toHaveLength(2);
    const names = r.clients.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('invisible clientId returns empty', async () => {
    const r = await queue(amA2, { clientId: IDS.clientA1 });
    expect(r).toMatchObject({ items: [], capped: false, clients: [] });
  });

  it('lists alerts waiting for review and digest-held ones, scoped', async () => {
    const { items } = (await registry.invoke(am, 'list_alert_queue', {})) as { items: { status: string; heldForDigest: boolean; clientName: string; evidenceCount: number }[] };
    expect(items.map((i) => [i.status, i.heldForDigest])).toEqual([['pending_review', false], ['approved', true]]);
    expect(items[0]).toMatchObject({ clientName: 'A1 HVAC', evidenceCount: 1 });
    expect(((await registry.invoke(amA2, 'list_alert_queue', {})) as { items: unknown[] }).items).toEqual([]);
  });

  it('approves once (Review Focus 2) and refuses other scopes (Review Focus 1)', async () => {
    await expect(registry.invoke(amA2, 'approve_alert', { alertId: pending })).rejects.toMatchObject({ code: 'not_found' });
    const { outcome } = (await registry.invoke(am, 'approve_alert', { alertId: pending })) as { outcome: string };
    expect(['immediate', 'digest']).toContain(outcome);
    await expect(registry.invoke(am, 'approve_alert', { alertId: pending })).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('dismisses with a reason only, and refuses a cross-scope alert id', async () => {
    await expect(registry.invoke(amA2, 'dismiss_alert', { alertId: pending, reason: 'Not mine' })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(am, 'dismiss_alert', { alertId: pending, reason: '  ' })).rejects.toMatchObject({ code: 'invalid_input' });
    await registry.invoke(am, 'dismiss_alert', { alertId: pending, reason: 'Already discussed with the client' });
    expect((await dbs.owner.select().from(alert).where(eq(alert.id, pending)))[0]).toMatchObject({ status: 'dismissed', dismissReason: 'Already discussed with the client' });
  });

  it('explains missing delivery configuration on approve', async () => {
    const bare = createToolRegistry({ app: dbs.app, service: dbs.service }, { audit: { record: async () => {} } });
    await expect(bare.invoke(am, 'approve_alert', { alertId: pending })).rejects.toMatchObject({ code: 'invalid_input' });
  });
});
