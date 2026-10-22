import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { agencyServiceable, clientServiceable, evidenceReferenced } from './filters';
import { agency, alert, brief, briefItem, changeEvent, client, recommendation } from './schema';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('archival filters (7a2 D16)', () => {
  it('clientServiceable excludes an archived client', async () => {
    await dbs.service.update(client).set({ archivedAt: new Date() }).where(eq(client.id, IDS.clientA2));
    const drizzle = (await dbs.service.select({ id: client.id }).from(client).where(clientServiceable(client))).map((r) => r.id);
    const aliased = ((await dbs.service.execute(sql`SELECT cl.id FROM client cl WHERE ${clientServiceable('cl')}`)) as unknown as { id: string }[]).map((r) => r.id);
    for (const got of [drizzle, aliased]) {
      expect(got).not.toContain(IDS.clientA2);
      expect(got).toContain(IDS.clientA1);
      expect(got).toContain(IDS.clientB1);
    }
  });

  it('agencyServiceable excludes an archived agency', async () => {
    await dbs.service.update(agency).set({ archivedAt: new Date() }).where(eq(agency.id, IDS.agencyB));
    const ids = (await dbs.service.select({ id: agency.id }).from(agency).where(agencyServiceable(agency.id))).map((r) => r.id);
    expect(ids).toEqual([IDS.agencyA]);
    const viaClient = ((await dbs.service.execute(sql`SELECT cl.id FROM client cl WHERE ${agencyServiceable(sql.raw('cl.agency_id'))}`)) as unknown as { id: string }[]).map((r) => r.id);
    expect(viaClient).not.toContain(IDS.clientB1);
    expect(viaClient).toContain(IDS.clientA1);
  });
});

describe('evidenceReferenced', () => {
  const referenced = async (ids: string[]) =>
    ((await dbs.service.execute(sql`
      SELECT v.id FROM (VALUES ${sql.join(ids.map((id) => sql`(${id}::uuid)`), sql`, `)}) AS v(id)
      WHERE ${evidenceReferenced(sql.raw('v.id'))}`)) as unknown as { id: string }[]).map((r) => r.id).sort();

  it('is true via brief_item, recommendation and alert, false otherwise', async () => {
    const [viaItem, viaRec, viaAlert, unused] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    expect(await referenced([viaItem!, viaRec!, viaAlert!, unused!])).toEqual([]);

    const [b] = await dbs.service
      .insert(brief)
      .values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, deliveryDate: '2026-10-05', periodStart: new Date(), periodEnd: new Date(), status: 'ready' })
      .returning({ id: brief.id });
    await dbs.service.insert(briefItem).values({
      briefId: b!.id, agencyId: IDS.agencyA, clientId: IDS.clientA1, ord: 0, competitorId: IDS.competitorX, headline: 'h',
      whatChanged: 'x', whyItMatters: 'y', recommendedAction: 'z', confidence: 0.9, effort: 'M', impact: 'H', evidenceIds: [randomUUID(), viaItem!],
    });
    await dbs.service.insert(recommendation).values({
      agencyId: IDS.agencyA, clientId: IDS.clientA1, title: 't', rationale: 'r', effort: 'M', impact: 'M', owner: 'client', source: 'brief', evidenceIds: [viaRec!],
    });
    const [e] = await dbs.service
      .insert(changeEvent)
      .values({ competitorId: IDS.competitorX, changeType: 'price_change', summary: 's', confidence: 0.9, occurredAt: new Date() })
      .returning({ id: changeEvent.id });
    await dbs.service.insert(alert).values({
      agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, eventId: e!.id, score: 80, status: 'drafting', mode: 'direct', evidenceIds: [viaAlert!],
    });

    expect(await referenced([viaItem!, viaRec!, viaAlert!, unused!])).toEqual([viaItem!, viaRec!, viaAlert!].sort());
  });
});
