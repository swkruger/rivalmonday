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

describe('alert queue', () => {
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
