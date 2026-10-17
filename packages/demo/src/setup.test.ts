import { agency, client, clientSetup, competitorSuggestion, discoveryRun, setupSuggestionsSchema } from '@cs/db';
import { openTestDbs } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSeedContext, type SeedContext } from './context';
import { seedSetup } from './setup';
import { seedTenancy } from './tenancy';
import { resetDemoTables, TEST_SALT } from './test-support';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
let ctx: SeedContext;

beforeAll(async () => {
  await resetDemoTables(dbs.owner);
  ctx = createSeedContext({ db: dbs.owner, store: createMemoryStore(), now: new Date(), salt: TEST_SALT });
  await seedTenancy(ctx);
  // A client of a second agency (as the billing seeds create): its setup row must carry its own agency.
  const [other] = await dbs.owner.insert(agency).values({ name: 'Other Agency' }).returning({ id: agency.id });
  await dbs.owner.insert(client).values({ agencyId: other!.id, name: 'Other Agency Client', verticalId: 'hvac_plumbing', status: 'active' });
  await seedSetup(ctx);
});

describe('seedSetup (Phase 11a)', () => {
  it('stamps every setup row with its client’s own agency', async () => {
    const rows = await dbs.owner.select({ setupAgency: clientSetup.agencyId, clientAgency: client.agencyId }).from(clientSetup).innerJoin(client, eq(client.id, clientSetup.clientId));
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.filter((r) => r.setupAgency !== r.clientAgency)).toEqual([]);
  });

  it('leaves one client mid-setup: open row, ready suggestions with quotes, competitors step todo', async () => {
    const id = ctx.ids.clients.setupPending;
    const [row] = await dbs.owner.select().from(clientSetup).where(eq(clientSetup.clientId, id));
    expect([row!.completedAt, row!.dismissedAt, row!.competitorsDoneAt, row!.skipped]).toEqual([null, null, null, []]);
    expect(row!.lookup?.city).toBeTruthy();
    const s = setupSuggestionsSchema.parse(row!.suggestions);
    if (s.status !== 'ready') throw new Error('suggestions not ready');
    expect([s.services.length, s.keywords.length]).toEqual([2, 3]);
    for (const x of [...s.services, ...s.keywords]) expect(x.quote.length).toBeGreaterThan(10);
    const [c] = await dbs.owner.select().from(client).where(eq(client.id, id));
    expect(c!.placeId).toBeTruthy();
    expect(c!.keywords.length).toBeGreaterThan(0);
  });

  it('gives the mid-setup client a done discovery run with 2 top, 2 watch and 2 minor suggestions', async () => {
    const id = ctx.ids.clients.setupPending;
    const [run] = await dbs.owner.select().from(discoveryRun).where(eq(discoveryRun.clientId, id));
    expect(run!.status).toBe('done');
    const rows = await dbs.owner.select().from(competitorSuggestion).where(eq(competitorSuggestion.clientId, id));
    expect(rows.every((r) => r.runId === run!.id && r.status === 'suggested')).toBe(true);
    expect(['top', 'watch', 'minor'].map((t) => rows.filter((r) => r.tier === t).length)).toEqual([2, 2, 2]);
  });

  it('marks every other demo client as set up', async () => {
    const rows = await dbs.owner.select().from(clientSetup);
    const clients = await dbs.owner.select({ id: client.id }).from(client);
    expect(rows).toHaveLength(clients.length);
    const done = rows.filter((r) => r.completedAt && r.competitorsDoneAt);
    expect(done).toHaveLength(clients.length - 1);
    expect(rows.filter((r) => !r.completedAt).map((r) => r.clientId)).toEqual([ctx.ids.clients.setupPending]);
  });
});
