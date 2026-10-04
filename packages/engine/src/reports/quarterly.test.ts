import { alert, brief, changeEvent, client, move, notification, recommendation, trendReport } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seedScoredEvent } from '../../test/seed';
import { addContact } from '../delivery/contacts';
import type { DeliveryConfig } from '../delivery/outbox';
import { createPackLoader } from '../tag/tag-stage';
import { computeTrendReport, previousQuarter, runQuarterlyReports } from './quarterly';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const packs = createPackLoader();
const delivery: DeliveryConfig = { appUrl: 'https://app.example', linkSecrets: ['s'.repeat(32)], fromAddress: 'b@agency.example' };
const Q3 = { start: new Date('2026-07-01T05:00:00Z'), end: new Date('2026-10-01T05:00:00Z') }; // Chicago-local quarter bounds (CDT)
const at = (iso: string) => new Date(iso);

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.update(client).set({ createdAt: at('2026-06-01T00:00:00Z') });
});

describe('previousQuarter', () => {
  it('names the calendar quarter before the local date, with exclusive end', () => {
    expect(previousQuarter('2026-10-03')).toEqual({ quarter: '2026-Q3', startDate: '2026-07-01', endDate: '2026-10-01' });
    expect(previousQuarter('2027-01-02')).toEqual({ quarter: '2026-Q4', startDate: '2026-10-01', endDate: '2027-01-01' });
    expect(previousQuarter('2026-04-07')).toEqual({ quarter: '2026-Q1', startDate: '2026-01-01', endDate: '2026-04-01' });
  });
});

describe('computeTrendReport', () => {
  it('counts only live events, moves, briefs, alerts and recommendations inside the quarter', async () => {
    const seed = (o: Partial<Parameters<typeof seedScoredEvent>[1]>) => seedScoredEvent(dbs.service, { competitorId: IDS.competitorX, clientId: IDS.clientA1, agencyId: IDS.agencyA, occurredAt: at('2026-08-01T12:00:00Z'), scoredAt: at('2026-08-01T12:00:00Z'), ...o });
    const a = await seed({});
    await seed({ changeType: 'ad_started' });
    const gone = await seed({});
    await dbs.owner.update(changeEvent).set({ retractedAt: at('2026-08-02T00:00:00Z') }).where(eq(changeEvent.id, gone.eventId));
    await seed({ scoredAt: at('2026-10-02T00:00:00Z'), occurredAt: at('2026-10-02T00:00:00Z') }); // next quarter
    await dbs.service.insert(move).values({
      agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, moveType: 'price_war', status: 'active', confidence: 0.7, summary: 's',
      ruleVersion: 2, firstDetectedAt: at('2026-08-10T00:00:00Z'), lastHeldAt: at('2026-08-12T00:00:00Z'), lastEvidenceAt: at('2026-08-12T00:00:00Z'),
    });
    await dbs.service.insert(brief).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, deliveryDate: '2026-08-10', periodStart: Q3.start, periodEnd: Q3.end, status: 'sent', sentAt: at('2026-08-10T12:00:00Z') });
    await dbs.service.insert(alert).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, eventId: a.eventId, score: 80, status: 'delivered', mode: 'direct', delivery: 'immediate', deliveredAt: at('2026-08-01T13:00:00Z') });
    const rec = { agencyId: IDS.agencyA, clientId: IDS.clientA1, title: 't', rationale: 'r', effort: 'L', impact: 'M', owner: 'client', source: 'brief', createdAt: at('2026-08-11T00:00:00Z') } as const;
    await dbs.service.insert(recommendation).values([{ ...rec, status: 'done' }, { ...rec, status: 'todo' }, { ...rec, status: 'dismissed', dismissReason: 'n/a' }]);
    const d = await computeTrendReport({ db: dbs.service, packs }, IDS.clientA1, Q3, '2026-Q3');
    expect(d).toMatchObject({
      quarter: '2026-Q3', windowDays: 90, eventsByType: { price_change: 1, ad_started: 1 }, briefsSent: 1, alertsDelivered: 1,
      moves: [{ moveType: 'price_war', competitorName: 'Smith HVAC', status: 'active', firstDetectedAt: '2026-08-10' }],
      recommendations: { created: 3, done: 1, inProgress: 0, dismissed: 1 },
    });
  });
});

describe('runQuarterlyReports', () => {
  beforeEach(async () => {
    await addContact(dbs.service, { agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'owner@a1.example' });
    await addContact(dbs.service, { agencyId: IDS.agencyA, role: 'account_manager', email: 'am@a.example' });
  });
  const run = (now: Date) => runQuarterlyReports({ db: dbs.service, packs, delivery }, now);

  it('creates last quarter\'s report from 08:00 local in the first week of the quarter, once, for client and agency', async () => {
    expect((await run(at('2026-10-05T12:30:00Z'))).created).toEqual([]); // 07:30 CDT
    const r = await run(at('2026-10-05T13:30:00Z')); // 08:30 CDT
    expect(r.created.length).toBe(3); // A1, A2 and B1 (all Chicago, all created before the quarter ended)
    const [rep] = await dbs.owner.select().from(trendReport).where(eq(trendReport.clientId, IDS.clientA1));
    expect(rep).toMatchObject({ quarter: '2026-Q3', status: 'sent' });
    expect(rep!.periodStart.toISOString()).toBe(Q3.start.toISOString());
    const rows = await dbs.owner.select().from(notification).where(eq(notification.subjectId, rep!.id));
    expect(rows.filter((x) => x.channel === 'email').map((x) => x.address).sort()).toEqual(['am@a.example', 'owner@a1.example']);
    expect((await run(at('2026-10-05T14:30:00Z'))).created).toEqual([]);
  });

  it('skips clients created after the quarter ended and days after the first week', async () => {
    await dbs.owner.update(client).set({ createdAt: at('2026-10-02T00:00:00Z') });
    expect((await run(at('2026-10-05T13:30:00Z'))).created).toEqual([]);
    await dbs.owner.update(client).set({ createdAt: at('2026-06-01T00:00:00Z') });
    expect((await run(at('2026-10-09T13:30:00Z'))).created).toEqual([]);
  });
});
