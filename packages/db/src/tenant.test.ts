import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { agency, client, clientCompetitor, competitor } from './schema';
import { withTenant } from './tenant';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

/** Drizzle 0.44 wraps driver errors (DrizzleQueryError); the Postgres message is on `cause`. */
async function errorText(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const err = e as { message?: string; cause?: { message?: string } };
    return `${err.message ?? ''} ${err.cause?.message ?? ''}`;
  }
  throw new Error('expected promise to reject');
}

describe('row-level security', () => {
  it('returns nothing without tenant context (fail closed)', async () => {
    expect(await dbs.app.select().from(client)).toEqual([]);
    expect(await dbs.app.select().from(agency)).toEqual([]);
    expect(await dbs.app.select().from(competitor)).toEqual([]);
  });

  it('agency scope all sees only its own clients', async () => {
    const rows = await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) => tx.select().from(client));
    expect(ids(rows)).toEqual([IDS.clientA1, IDS.clientA2].sort());
  });

  it('explicit client scope narrows clients, links and competitors', async () => {
    await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: [IDS.clientA1] }, async (tx) => {
      expect(ids(await tx.select().from(client))).toEqual([IDS.clientA1]);
      expect((await tx.select().from(clientCompetitor)).map((r) => r.competitorId)).toEqual([IDS.competitorX]);
      expect(ids(await tx.select().from(competitor))).toEqual([IDS.competitorX]);
    });
    await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: [IDS.clientA2] }, async (tx) => {
      expect(ids(await tx.select().from(competitor))).toEqual([IDS.competitorY]);
    });
  });

  it('shared competitor is visible to both agencies tracking it', async () => {
    const rows = await withTenant(dbs.app, { agencyId: IDS.agencyB, clientScope: 'all' }, (tx) => tx.select().from(competitor));
    expect(ids(rows)).toEqual([IDS.competitorX]);
  });

  it('cannot write rows into another agency', async () => {
    const text = await errorText(
      withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) =>
        tx.insert(client).values({ agencyId: IDS.agencyB, name: 'Sneaky', verticalId: 'dental' }),
      ),
    );
    expect(text).toMatch(/row-level security/i);
  });

  it('does not leak tenant settings to the next query on a pooled connection', async () => {
    await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) => tx.select().from(client));
    for (let i = 0; i < 10; i++) {
      expect(await dbs.app.select().from(client)).toEqual([]);
    }
    const setting = await dbs.app.execute(sql`select current_setting('app.agency_id', true) as v`);
    expect([null, '']).toContain((setting as unknown as { v: string | null }[])[0]?.v ?? null);
  });

  it('rejects malformed tenant context before touching the database', async () => {
    await expect(withTenant(dbs.app, { agencyId: 'x', clientScope: 'all' }, async () => 1)).rejects.toThrow(/agencyId/);
    await expect(
      withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: ["00000000-0000-4000-8000-0000000000a1','x"] }, async () => 1),
    ).rejects.toThrow(/clientScope/);
    await expect(withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: [] }, async () => 1)).rejects.toThrow(/clientScope/);
  });

  it('service role bypasses RLS for system jobs', async () => {
    expect(await dbs.service.select().from(client)).toHaveLength(3);
  });
});
