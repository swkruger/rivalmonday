import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { IDS, errorText, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { brief, briefItem, client, feedback, playbookOverride, recommendation } from './schema';
import { withTenant } from './tenant';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const agencyA = { agencyId: IDS.agencyA, clientScope: 'all' as const };
const agencyB = { agencyId: IDS.agencyB, clientScope: 'all' as const };
const onlyA2 = { agencyId: IDS.agencyA, clientScope: [IDS.clientA2] };

async function seedBrief() {
  const [b] = await dbs.service
    .insert(brief)
    .values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, deliveryDate: '2026-10-05', periodStart: new Date('2026-09-24T00:00:00Z'), periodEnd: new Date('2026-10-01T03:00:00Z'), status: 'ready' })
    .returning({ id: brief.id });
  const [item] = await dbs.service
    .insert(briefItem)
    .values({
      briefId: b!.id, agencyId: IDS.agencyA, clientId: IDS.clientA1, ord: 0, competitorId: IDS.competitorX, headline: 'Smith HVAC cut its tune-up price',
      whatChanged: 'x', whyItMatters: 'y', recommendedAction: 'z', confidence: 0.9, effort: 'M', impact: 'H', eventIds: [], evidenceIds: [], upsellTag: 'ppc',
    })
    .returning({ id: briefItem.id });
  return { briefId: b!.id, itemId: item!.id };
}

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('brief tables', () => {
  it('allows one brief per client and delivery date', async () => {
    await seedBrief();
    expect(await errorText(seedBrief())).toMatch(/brief_client_delivery_unique/);
  });

  it('allows one item per (brief, ord), checked at commit so a reorder can swap ords in one transaction', async () => {
    const { briefId } = await seedBrief();
    const item = {
      briefId, agencyId: IDS.agencyA, clientId: IDS.clientA1, ord: 0, competitorId: IDS.competitorX, headline: 'h',
      whatChanged: 'x', whyItMatters: 'y', recommendedAction: 'z', confidence: 0.9, effort: 'M', impact: 'H',
    } as const;
    expect(await errorText(dbs.service.insert(briefItem).values(item))).toMatch(/brief_item_brief_ord_unique/);
    const [second] = await dbs.service.insert(briefItem).values({ ...item, ord: 1 }).returning({ id: briefItem.id });
    await dbs.service.transaction(async (tx) => {
      await tx.update(briefItem).set({ ord: 1 }).where(sql`${briefItem.briefId} = ${briefId} AND ${briefItem.id} <> ${second!.id}`);
      await tx.update(briefItem).set({ ord: 0 }).where(sql`${briefItem.id} = ${second!.id}`);
    });
    const ords = await dbs.service.select({ id: briefItem.id, ord: briefItem.ord }).from(briefItem);
    expect(ords.find((o) => o.id === second!.id)?.ord).toBe(0);
  });

  it('rejects unknown statuses, kinds and recommendation enums', async () => {
    const base = { agencyId: IDS.agencyA, clientId: IDS.clientA1, periodStart: new Date(), periodEnd: new Date() };
    expect(await errorText(dbs.service.insert(brief).values({ ...base, deliveryDate: '2026-10-12', status: 'sending' }))).toMatch(/brief_status_check/);
    expect(await errorText(dbs.service.insert(brief).values({ ...base, deliveryDate: '2026-10-19', status: 'ready', kind: 'loud' }))).toMatch(/brief_kind_check/);
    const rec = { agencyId: IDS.agencyA, clientId: IDS.clientA1, title: 't', rationale: 'r', effort: 'M', impact: 'M', owner: 'client', source: 'brief' } as const;
    expect(await errorText(dbs.service.insert(recommendation).values({ ...rec, status: 'maybe' }))).toMatch(/recommendation_status_check/);
    expect(await errorText(dbs.service.insert(recommendation).values({ ...rec, effort: 'XL' }))).toMatch(/recommendation_effort_check/);
  });

  it('keeps one recommendation per brief item and per move', async () => {
    const { itemId } = await seedBrief();
    const rec = { agencyId: IDS.agencyA, clientId: IDS.clientA1, title: 't', rationale: 'r', effort: 'M', impact: 'M', owner: 'client', source: 'brief', briefItemId: itemId } as const;
    await dbs.service.insert(recommendation).values(rec);
    expect(await errorText(dbs.service.insert(recommendation).values(rec))).toMatch(/recommendation_brief_item_unique/);
  });

  it('rejects a brief whose agency is not the client agency', async () => {
    const bad = dbs.service.insert(brief).values({ agencyId: IDS.agencyB, clientId: IDS.clientA1, deliveryDate: '2026-10-05', periodStart: new Date(), periodEnd: new Date(), status: 'ready' });
    expect(await errorText(bad)).toMatch(/foreign key/i);
  });

  it('defaults a client time zone and rejects a malformed one', async () => {
    const [c] = await dbs.owner.select({ tz: client.timezone }).from(client).where(sql`id = ${IDS.clientA1}`);
    expect(c?.tz).toBe('America/Chicago');
    expect(await errorText(dbs.owner.update(client).set({ timezone: 'not a zone; drop' }).where(sql`id = ${IDS.clientA1}`))).toMatch(/client_timezone_check/);
  });
});

describe('brief RLS', () => {
  it('shows briefs, items, recommendations and feedback only to the owning tenant', async () => {
    const { briefId, itemId } = await seedBrief();
    await dbs.service.insert(recommendation).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, title: 't', rationale: 'r', effort: 'M', impact: 'M', owner: 'client', source: 'brief', briefItemId: itemId });
    await dbs.service.insert(feedback).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, subjectType: 'brief', subjectId: briefId, kind: 'reorder', actor: 'u1' });
    for (const [scope, n] of [[agencyA, 1], [agencyB, 0], [onlyA2, 0]] as const) {
      const counts = await withTenant(dbs.app, scope, async (tx) => [
        (await tx.select().from(brief)).length, (await tx.select().from(briefItem)).length,
        (await tx.select().from(recommendation)).length, (await tx.select().from(feedback)).length,
      ]);
      expect(counts).toEqual([n, n, n, n]);
    }
  });

  it('shows playbook overrides only to their agency, and app_user cannot write any brief table', async () => {
    await dbs.service.insert(playbookOverride).values({ agencyId: IDS.agencyA, verticalId: 'hvac_plumbing', playbookId: 'price_cut_bundle', template: 'T', updatedBy: 'u1' });
    expect(await withTenant(dbs.app, agencyA, (tx) => tx.select().from(playbookOverride))).toHaveLength(1);
    expect(await withTenant(dbs.app, agencyB, (tx) => tx.select().from(playbookOverride))).toHaveLength(0);
    const write = withTenant(dbs.app, agencyA, (tx) =>
      tx.insert(brief).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, deliveryDate: '2026-10-05', periodStart: new Date(), periodEnd: new Date(), status: 'ready' }));
    expect(await errorText(write)).toMatch(/permission denied/i);
  });
});
