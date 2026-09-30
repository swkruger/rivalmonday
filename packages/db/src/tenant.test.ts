import { eq, sql } from 'drizzle-orm';
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

  it('cannot link a client belonging to another agency (client_id/agency_id integrity)', async () => {
    const text = await errorText(
      withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) =>
        tx.insert(clientCompetitor).values({ agencyId: IDS.agencyA, clientId: IDS.clientB1, competitorId: IDS.competitorX }),
      ),
    );
    expect(text).toMatch(/foreign key|constraint/i);
  });

  it('cannot insert a link for a client outside the scoped clientScope', async () => {
    const text = await errorText(
      withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: [IDS.clientA1] }, (tx) =>
        tx.insert(clientCompetitor).values({ agencyId: IDS.agencyA, clientId: IDS.clientA2, competitorId: IDS.competitorY }),
      ),
    );
    expect(text).toMatch(/row-level security/i);
  });

  it('cannot move a client to another agency via UPDATE', async () => {
    const text = await errorText(
      withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) =>
        tx.update(client).set({ agencyId: IDS.agencyB }).where(eq(client.id, IDS.clientA1)),
      ),
    );
    expect(text).toMatch(/row-level security/i);
  });

  it('UPDATE/DELETE on an out-of-scope client silently affect zero rows and leave it untouched', async () => {
    await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, async (tx) => {
      const updated = (await tx.update(client).set({ name: 'x' }).where(eq(client.id, IDS.clientB1))) as unknown as {
        count: number;
      };
      expect(updated.count).toBe(0);
      const deleted = (await tx.delete(client).where(eq(client.id, IDS.clientB1))) as unknown as { count: number };
      expect(deleted.count).toBe(0);
    });
    const stillThere = await dbs.owner.select().from(client).where(eq(client.id, IDS.clientB1));
    expect(stillThere).toHaveLength(1);
    expect(stillThere[0]?.name).toBe('B1 HVAC');
  });

  it('app_user cannot write to the agency table; deleting it cannot cascade-wipe out-of-scope clients', async () => {
    const deleteText = await errorText(
      withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: [IDS.clientA1] }, (tx) => tx.delete(agency)),
    );
    expect(deleteText).toMatch(/permission denied/i);
    const a2StillThere = await dbs.owner.select().from(client).where(eq(client.id, IDS.clientA2));
    expect(a2StillThere).toHaveLength(1);

    const updateText = await errorText(
      withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) => tx.update(agency).set({ name: 'Renamed' })),
    );
    expect(updateText).toMatch(/permission denied/i);
  });

  it('app_user cannot insert new competitors', async () => {
    const text = await errorText(
      withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) =>
        tx.insert(competitor).values({ name: 'Sneaky Competitor', domain: 'sneaky.example' }),
      ),
    );
    expect(text).toMatch(/row-level security/i);
  });

  it('every table in the public schema enables and forces row-level security', async () => {
    const rows = await dbs.owner.execute(sql`
      SELECT c.relname AS name, c.relrowsecurity AS rls, c.relforcerowsecurity AS force
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
    `);
    const unprotected = (rows as unknown as { name: string; rls: boolean; force: boolean }[]).filter((r) => !r.rls || !r.force);
    expect(unprotected).toEqual([]);
  });
});
