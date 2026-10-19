import { client, playbookOverride, runbook } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { loadClientRunbook } from '@cs/engine';
import { loadVerticalPack, type VerticalPack } from '@cs/verticals';
import { count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runRunbookBackfill } from './runbook-backfill-run';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const db = dbs.service;
const packs: Record<string, VerticalPack> = {};
beforeAll(async () => {
  for (const id of ['generic', 'hvac_plumbing', 'dental']) packs[id] = await loadVerticalPack(id);
});
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.delete(runbook);
});
const deps = () => ({ db, packs: async (id: string) => packs[id]!, generic: async () => packs.generic! });
const runbooks = async () => (await db.select({ n: count() }).from(runbook))[0]!.n;

describe('runbook:backfill', () => {
  it('dry run reports counts and writes nothing', async () => {
    const clients = (await db.select({ n: count() }).from(client))[0]!.n;
    const c = await runRunbookBackfill(deps(), { dryRun: true });
    expect(c.platformCreated).toBe(true);
    expect(c.clientsCreated).toBe(clients);
    expect(c.agenciesCreated).toBeGreaterThan(0);
    expect(await runbooks()).toBe(0);
  });

  it('creates platform, agency and client runbooks (tailor skipped); a second run is a no-op; overrides untouched', async () => {
    await db.insert(playbookOverride).values({ agencyId: IDS.agencyA, verticalId: 'hvac_plumbing', playbookId: packs.hvac_plumbing!.playbooks[0]!.id, title: 'T', updatedBy: 'u1' });
    const first = await runRunbookBackfill(deps());
    expect(first.clientsCreated).toBeGreaterThan(0);
    const after = await runbooks();
    expect(after).toBe(1 + first.agenciesCreated + first.clientsCreated);
    const tailor = await db.select({ s: runbook.tailorStatus }).from(runbook).where(eq(runbook.level, 'client'));
    expect(tailor.every((r) => r.s === 'skipped')).toBe(true);
    expect(await runRunbookBackfill(deps())).toEqual({ platformCreated: false, agenciesCreated: 0, clientsCreated: 0 });
    expect(await runbooks()).toBe(after);
    expect((await db.select({ n: count() }).from(playbookOverride))[0]!.n).toBe(1);
  });

  it('the backfilled client effective runbook equals its override-applied legacy view', async () => {
    await db.update(client).set({ verticalId: 'hvac_plumbing' }).where(eq(client.id, IDS.clientA1));
    await db.insert(playbookOverride).values({ agencyId: IDS.agencyA, verticalId: 'hvac_plumbing', playbookId: packs.hvac_plumbing!.playbooks[0]!.id, title: 'Custom title', updatedBy: 'u1' });
    const before = await loadClientRunbook(deps(), IDS.clientA1);
    expect(before.source).toBe('legacy');
    await runRunbookBackfill(deps());
    const after = await loadClientRunbook(deps(), IDS.clientA1);
    expect(after.source).toBe('client');
    const shape = (r: typeof after) => ({
      plays: [...r.plays].sort((a, b) => a.id.localeCompare(b.id)).map((p) => [p.id, p.title, p.template]),
      rules: [...r.selfRules].sort((a, b) => a.id.localeCompare(b.id)),
      t: r.thresholds,
    });
    expect(shape(after)).toEqual(shape(before));
  });
});
