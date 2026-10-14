import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { errorText, IDS, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { competitorSignal, competitorSuggestion, discoveryRun, vendorTask } from './schema';
import { withTenant } from './tenant';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.service.insert(discoveryRun).values([
    { agencyId: IDS.agencyA, clientId: IDS.clientA1, trigger: 'auto', status: 'done' },
    { agencyId: IDS.agencyA, clientId: IDS.clientA2, trigger: 'manual', status: 'done' },
    { agencyId: IDS.agencyB, clientId: IDS.clientB1, trigger: 'auto', status: 'done' },
  ]);
  await dbs.service.insert(competitorSignal).values([
    { agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, tier: 'top', signals: {} },
    { agencyId: IDS.agencyA, clientId: IDS.clientA2, competitorId: IDS.competitorY, tier: 'minor', signals: {} },
    { agencyId: IDS.agencyB, clientId: IDS.clientB1, competitorId: IDS.competitorX, tier: 'watch', signals: {} },
  ]);
});

describe('discovery_run / competitor_signal RLS', () => {
  it('agency A sees only its own runs and signals', async () => {
    await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, async (tx) => {
      expect((await tx.select().from(discoveryRun)).map((r) => r.clientId).sort()).toEqual([IDS.clientA1, IDS.clientA2].sort());
      expect((await tx.select().from(competitorSignal)).map((r) => r.clientId).sort()).toEqual([IDS.clientA1, IDS.clientA2].sort());
    });
  });

  it('agency B cannot see agency A rows', async () => {
    await withTenant(dbs.app, { agencyId: IDS.agencyB, clientScope: 'all' }, async (tx) => {
      expect((await tx.select().from(discoveryRun)).map((r) => r.clientId)).toEqual([IDS.clientB1]);
      expect((await tx.select().from(competitorSignal)).map((r) => r.clientId)).toEqual([IDS.clientB1]);
    });
  });

  it('a client-scoped member sees only their client', async () => {
    await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: [IDS.clientA1] }, async (tx) => {
      expect((await tx.select().from(discoveryRun)).map((r) => r.clientId)).toEqual([IDS.clientA1]);
      expect((await tx.select().from(competitorSignal)).map((r) => r.clientId)).toEqual([IDS.clientA1]);
    });
  });

  it('app_user cannot write discovery_run or competitor_signal', async () => {
    const scope = { agencyId: IDS.agencyA, clientScope: 'all' as const };
    const insertRun = withTenant(dbs.app, scope, (tx) => tx.insert(discoveryRun).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, trigger: 'manual' }));
    expect(await errorText(insertRun)).toMatch(/permission denied/);
    const insertSignal = withTenant(dbs.app, scope, (tx) =>
      tx.insert(competitorSignal).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorY, tier: 'top', signals: {} }),
    );
    expect(await errorText(insertSignal)).toMatch(/permission denied/);
  });

  it('only one live run per client', async () => {
    await dbs.service.insert(discoveryRun).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, trigger: 'manual', status: 'searching' });
    expect(await errorText(dbs.service.insert(discoveryRun).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, trigger: 'auto' }))).toMatch(/discovery_run_one_live/);
  });
});

describe('vendor_task_subject_check', () => {
  it('rejects a task with both competitor and suggestion, or neither; accepts exactly one', async () => {
    const [s] = await dbs.service
      .insert(competitorSuggestion)
      .values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, name: 'Cool Air', placeId: 'p1', appearances: 1, overlapScore: 0.5 })
      .returning({ id: competitorSuggestion.id });
    const base = { vendor: 'dataforseo', kind: 'google_reviews' };
    const fail = async (v: Partial<typeof vendorTask.$inferInsert>, id: string) =>
      expect(await errorText(dbs.service.insert(vendorTask).values({ ...base, externalTaskId: id, ...v }))).toMatch(/vendor_task_subject_check/);
    await fail({ competitorId: IDS.competitorX, suggestionId: s!.id }, 'both');
    await fail({}, 'neither');
    await dbs.service.insert(vendorTask).values({ ...base, externalTaskId: 'sugg', suggestionId: s!.id });
    await dbs.service.insert(vendorTask).values({ ...base, externalTaskId: 'comp', competitorId: IDS.competitorX });
    const n = await dbs.owner.execute(sql`select count(*)::int as n from vendor_task`);
    expect((n as unknown as { n: number }[])[0]!.n).toBe(2);
  });
});
