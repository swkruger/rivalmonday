import { alert, alertEvent, changeEvent, client, eventScore } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { day, seedScoredEvent, TEST_FACTORS } from '../../test/seed';
import { sweepAlerts } from './create';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});
const NOW = day(1);
const seed = (o: Partial<Parameters<typeof seedScoredEvent>[1]> = {}) =>
  seedScoredEvent(dbs.service, { competitorId: IDS.competitorX, clientId: IDS.clientA1, agencyId: IDS.agencyA, route: 'alert', score: 82, occurredAt: day(0), scoredAt: day(0), ...o });
const alerts = () => dbs.owner.select().from(alert).orderBy(alert.createdAt);

describe('sweepAlerts', () => {
  it('creates one drafting alert per alert-routed event, snapshotting the client mode, once', async () => {
    await dbs.owner.update(client).set({ alertMode: 'direct' }).where(eq(client.id, IDS.clientA1));
    const e = await seed();
    const r = await sweepAlerts(dbs.service, NOW);
    expect(r).toMatchObject({ created: 1, merged: 0, expired: 0 });
    const [a] = await alerts();
    expect(a).toMatchObject({ clientId: IDS.clientA1, competitorId: IDS.competitorX, eventId: e.eventId, score: 82, status: 'drafting', mode: 'direct' });
    expect(r.drafting).toEqual([a!.id]);
    expect(await dbs.owner.select().from(alertEvent)).toHaveLength(1);
    expect((await sweepAlerts(dbs.service, NOW)).created).toBe(0);
  });

  it('ignores brief-routed, retracted, cosmetic and old events', async () => {
    await seed({ route: 'brief', score: 55 });
    const r = await seed();
    await dbs.owner.update(changeEvent).set({ retractedAt: day(0) }).where(eq(changeEvent.id, r.eventId));
    await seed({ changeType: 'cosmetic' });
    await seed({ scoredAt: day(-3), occurredAt: day(-3) });
    expect((await sweepAlerts(dbs.service, NOW)).created).toBe(0);
  });

  it('merges a near-duplicate (same competitor, type and service within 72 h) into the live alert', async () => {
    await seed({ score: 75 });
    await sweepAlerts(dbs.service, NOW);
    await seed({ score: 90, scoredAt: day(1), occurredAt: day(1) });
    const r = await sweepAlerts(dbs.service, day(2));
    expect(r).toMatchObject({ created: 0, merged: 1 });
    const [a] = await alerts();
    expect(a!.score).toBe(90);
    expect(await dbs.owner.select().from(alertEvent)).toHaveLength(2);
  });

  it('opens a new alert for another service, a dismissed twin, or a twin older than 72 h', async () => {
    await seed();
    await sweepAlerts(dbs.service, NOW);
    await seed({ services: { hvac_plumbing: 'furnace_repair' }, scoredAt: day(1), occurredAt: day(1) });
    expect((await sweepAlerts(dbs.service, day(1))).created).toBe(1);
    await dbs.owner.update(alert).set({ status: 'dismissed' });
    await seed({ scoredAt: day(1), occurredAt: day(1) });
    expect((await sweepAlerts(dbs.service, day(1))).created).toBe(1);
    await seed({ scoredAt: day(5), occurredAt: day(5) });
    expect((await sweepAlerts(dbs.service, day(5))).created).toBe(1);
  });

  it('alerts each client that scored the shared event separately', async () => {
    const e = await seed();
    await dbs.service.insert(eventScore).values({ agencyId: IDS.agencyB, clientId: IDS.clientB1, eventId: e.eventId, score: 77, route: 'alert', factors: TEST_FACTORS, packVersion: 1, scoredAt: day(0) });
    expect((await sweepAlerts(dbs.service, NOW)).created).toBe(2);
    expect((await alerts()).map((a) => a.clientId).sort()).toEqual([IDS.clientA1, IDS.clientB1].sort());
  });

  it('expires alerts that waited for an AM check longer than 7 days', async () => {
    await seed();
    await sweepAlerts(dbs.service, NOW);
    await dbs.owner.update(alert).set({ status: 'pending_review', createdAt: day(-8) });
    expect((await sweepAlerts(dbs.service, NOW)).expired).toBe(1);
    expect((await alerts())[0]!.status).toBe('expired');
  });
});
