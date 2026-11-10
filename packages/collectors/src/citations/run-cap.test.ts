import { citationAuditRun, citationListing, client, clientCompetitor, competitor, competitorSignal } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import type { VerticalPack } from '@cs/verticals';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { dfsTask, fakeDfs } from '../../test/fake-dfs';

// Per-run cap lowered so the second business crosses it (each business costs at most 2 x 0.004).
vi.mock('./search', async (orig) => ({ ...(await orig<typeof import('./search')>()), CITATION_RUN_CAP_USD: 0.01 }));
const { runCitationAudit } = await import('./run');

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});
const pack = { citations: { groups: ['general'], min_missing: 3, directory_groups: { general: [{ host: 'mapquest.com', label: 'm', add_listing_url: 'https://mapquest.com/add' }] } } } as unknown as VerticalPack;
const IDS3 = ['00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-0000000000f4', '00000000-0000-4000-8000-0000000000f5'];

describe('runCitationAudit per-run cap', () => {
  it('stops at the cap: run capped with calls > 0 and later businesses not searched', async () => {
    await dbs.owner.insert(competitor).values(IDS3.map((id) => ({ id, name: `Rival ${id.slice(-2)}` })));
    await dbs.owner.insert(clientCompetitor).values(IDS3.map((id) => ({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: id })));
    await dbs.owner.insert(competitorSignal).values(IDS3.map((id, i) => ({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: id, tier: 'top' as const, overlap: 0.9 - i / 10, signals: {} })));
    await dbs.owner.update(client).set({ spendLimitUsd: 100 }).where(eq(client.id, IDS.clientA1));
    const dfs = fakeDfs(() => [dfsTask([{ items: [] }])]);
    const r = await runCitationAudit({ db: dbs.service, store: createMemoryStore(), dfs, packs: async () => pack }, IDS.clientA1);
    expect(r.status).toBe('capped');
    expect(r.calls).toBeGreaterThan(0);
    expect(r.calls).toBe(2); // no phone: one name+city search each; the third would cross 0.01
    expect((await dbs.owner.select().from(citationAuditRun))[0]).toMatchObject({ status: 'capped', calls: 2 });
    const searched = new Set((await dbs.owner.select().from(citationListing)).map((l) => l.competitorId));
    expect(searched).toEqual(new Set([IDS3[0], IDS3[1]]));
  });
});
