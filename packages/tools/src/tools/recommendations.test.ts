import { type AccessContext, createAccessContext } from '@cs/core';
import { recommendation } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const registry = createToolRegistry({ app: dbs.app, service: dbs.service }, { audit: { record: async () => {} } });
const ctx = (role: AccessContext['role'], scope: AccessContext['clientScope']) => createAccessContext({ agencyId: IDS.agencyA, userId: `u-${role}`, role, clientScope: scope, features: [] });
const am = ctx('account_manager', [IDS.clientA1]);
const owner = ctx('client_owner', [IDS.clientA1]);
const viewer = ctx('client_viewer', [IDS.clientA1]);
const ownerA2 = ctx('client_owner', [IDS.clientA2]);
let recId = '';

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  const [r] = await dbs.owner.insert(recommendation).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, title: 'Offer a tune-up bundle', rationale: 'Smith HVAC cut its price.', effort: 'L', impact: 'H', owner: 'client', source: 'brief', upsellTag: 'ppc_audit' }).returning();
  recId = r!.id;
});

describe('recommendations (Review Focus 4)', () => {
  it('lists for agency and client roles; only agencies see the upsell tag', async () => {
    const asAm = (await registry.invoke(am, 'list_recommendations', { clientId: IDS.clientA1 })) as { items: { upsellTag: string | null }[] };
    expect(asAm.items[0]!.upsellTag).toBe('ppc_audit');
    const asViewer = (await registry.invoke(viewer, 'list_recommendations', { clientId: IDS.clientA1 })) as { items: { upsellTag: string | null }[] };
    expect(asViewer.items).toHaveLength(1);
    expect(asViewer.items[0]!.upsellTag).toBeNull();
    await expect(registry.invoke(ownerA2, 'list_recommendations', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('lets owners and agencies change status, never viewers; dismissal needs a reason', async () => {
    await registry.invoke(owner, 'update_recommendation_status', { recommendationId: recId, status: 'in_progress' });
    expect((await dbs.owner.select().from(recommendation).where(eq(recommendation.id, recId)))[0]!.status).toBe('in_progress');
    await expect(registry.invoke(viewer, 'update_recommendation_status', { recommendationId: recId, status: 'done' })).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(registry.invoke(am, 'update_recommendation_status', { recommendationId: recId, status: 'dismissed' })).rejects.toMatchObject({ code: 'invalid_input' });
    await registry.invoke(am, 'update_recommendation_status', { recommendationId: recId, status: 'dismissed', reason: 'Client already runs this offer' });
    expect((await dbs.owner.select().from(recommendation).where(eq(recommendation.id, recId)))[0]).toMatchObject({ status: 'dismissed', dismissReason: 'Client already runs this offer' });
    await expect(registry.invoke(ownerA2, 'update_recommendation_status', { recommendationId: recId, status: 'done' })).rejects.toMatchObject({ code: 'not_found' });
  });
});
