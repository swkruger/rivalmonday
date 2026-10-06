import { type AccessContext, createAccessContext } from '@cs/core';
import { alert, brief, changeEvent, eventScore, move, recommendation } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const registry = createToolRegistry({ app: dbs.app, service: dbs.service }, { audit: { record: async () => {} } });
const ctx = (role: AccessContext['role'], scope: AccessContext['clientScope'], agencyId: string = IDS.agencyA) => createAccessContext({ agencyId, userId: `u-${role}`, role, clientScope: scope, features: [] });
const day = 86_400_000;

async function scored(score: number, route: string, ageDays: number, retracted = false): Promise<string> {
  const at = new Date(Date.now() - ageDays * day);
  const [e] = await dbs.owner.insert(changeEvent).values({ competitorId: IDS.competitorX, changeType: 'price_change', summary: 's', confidence: 0.9, occurredAt: at, retractedAt: retracted ? at : null }).returning();
  await dbs.owner.insert(eventScore).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, eventId: e!.id, score, route, factors: {} as never, packVersion: 1, scoredAt: at });
  return e!.id;
}

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('get_portfolio', () => {
  it('summarises each visible client', async () => {
    const eventId = await scored(86, 'alert', 2);
    await scored(90, 'archive', 1); // archive never counts
    await scored(95, 'alert', 3, true); // retracted never counts
    await scored(99, 'alert', 40); // older than 30 days
    await dbs.owner.insert(move).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, moveType: 'ad_surge', status: 'active', confidence: 0.5, summary: 'm', ruleVersion: 2, lastHeldAt: new Date(), lastEvidenceAt: new Date() });
    await dbs.owner.insert(alert).values([
      { agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, eventId, score: 86, status: 'pending_review', mode: 'after_am_check' },
    ]);
    const [b] = await dbs.owner.insert(brief).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, deliveryDate: '2026-10-12', periodStart: new Date(), periodEnd: new Date(), status: 'ready' }).returning();
    await dbs.owner.insert(recommendation).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, title: 't', rationale: 'r', effort: 'L', impact: 'H', owner: 'client', source: 'brief' });

    const { items } = (await registry.invoke(ctx('agency_admin', 'all'), 'get_portfolio', {})) as { items: Record<string, unknown>[] };
    const a1 = items.find((i) => i.clientId === IDS.clientA1)!;
    // 1 − (1 − 0.86)(1 − 0.5 × 0.8) = 0.916
    expect(a1).toMatchObject({
      name: 'A1 HVAC', alertsPending: 1, alertsDelivered7d: 0, briefToApprove: { id: b!.id, deliveryDate: '2026-10-12' }, openRecommendations: 1, topCompetitor: 'Smith HVAC',
      pressure: { score: 92, level: 'high', reasons: ['Price change', 'Ad surge'] },
    });
    expect(a1.lastActivityAt).toEqual(expect.any(String));
    const a2 = items.find((i) => i.clientId === IDS.clientA2)!;
    expect(a2).toMatchObject({ pressure: { score: 0, level: 'low', reasons: ['Quiet'] }, briefToApprove: null, lastActivityAt: null });
  });

  it('respects scope and is agency-only', async () => {
    const { items } = (await registry.invoke(ctx('account_manager', [IDS.clientA1]), 'get_portfolio', {})) as { items: { clientId: string }[] };
    expect(items.map((i) => i.clientId)).toEqual([IDS.clientA1]);
    await expect(registry.invoke(ctx('client_owner', [IDS.clientA1]), 'get_portfolio', {})).rejects.toMatchObject({ code: 'permission_denied' });
  });
});
