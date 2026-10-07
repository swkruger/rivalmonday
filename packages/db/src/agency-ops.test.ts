import { sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { errorText, IDS, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { client, prospectReport, withTenant } from './index';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('client operations columns (5b-2 decisions 6, 8)', () => {
  it('defaults new clients to active, a $15 cap and 5 competitors', async () => {
    const [c] = await dbs.owner.select().from(client).where(eq(client.id, IDS.clientA1));
    expect(c).toMatchObject({ status: 'active', monthlyCapUsd: 15, competitorLimit: 5 });
  });

  it('rejects unknown statuses and out-of-range caps and limits', async () => {
    const set = (v: Partial<typeof client.$inferInsert>) => errorText(dbs.owner.update(client).set(v).where(eq(client.id, IDS.clientA1)));
    expect(await set({ status: 'lost' as never })).toMatch(/client_status_check/);
    expect(await set({ monthlyCapUsd: 0 })).toMatch(/client_monthly_cap_check/);
    expect(await set({ monthlyCapUsd: 10001 })).toMatch(/client_monthly_cap_check/);
    expect(await set({ competitorLimit: 0 })).toMatch(/client_competitor_limit_check/);
    expect(await set({ competitorLimit: 11 })).toMatch(/client_competitor_limit_check/);
  });

  it('app_user cannot change status, cap or limit', async () => {
    for (const v of [{ status: 'prospect' as const }, { monthlyCapUsd: 99 }, { competitorLimit: 9 }]) {
      const err = await errorText(withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) => tx.update(client).set(v).where(eq(client.id, IDS.clientA1))));
      expect(err).toMatch(/permission denied/);
    }
  });
});

describe('prospect_report', () => {
  it('is readable through RLS by the owning agency only and writable only by the service role', async () => {
    const [r] = await dbs.service.insert(prospectReport).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, status: 'running' }).returning();
    const asA = await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) => tx.select().from(prospectReport));
    expect(asA.map((x) => x.id)).toEqual([r!.id]);
    const asB = await withTenant(dbs.app, { agencyId: IDS.agencyB, clientScope: 'all' }, (tx) => tx.select().from(prospectReport));
    expect(asB).toEqual([]);
    const err = await errorText(withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) => tx.insert(prospectReport).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, status: 'running' })));
    expect(err).toMatch(/permission denied/);
  });

  it('checks status and ties client to agency', async () => {
    expect(await errorText(dbs.service.insert(prospectReport).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, status: 'done' as never }))).toMatch(/prospect_report_status_check/);
    expect(await errorText(dbs.service.insert(prospectReport).values({ agencyId: IDS.agencyB, clientId: IDS.clientA1, status: 'running' }))).toMatch(/foreign key/);
  });

  it('has forced RLS', async () => {
    const [row] = (await dbs.owner.execute(sql`SELECT relrowsecurity AS rls, relforcerowsecurity AS force FROM pg_class WHERE relname = 'prospect_report'`)) as unknown as { rls: boolean; force: boolean }[];
    expect(row).toEqual({ rls: true, force: true });
  });
});
