import { citationAuditRun, citationListing, client, clientCompetitor, detectedChange } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import type { VerticalPack } from '@cs/verticals';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { day, seedVendorCapture } from '../../test/seed';
import { diffCitations } from './citations';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const pack = {
  citations: {
    groups: ['general'],
    min_missing: 3,
    directory_groups: {
      general: [
        { host: 'bbb.org', label: 'Better Business Bureau', add_listing_url: 'https://www.bbb.org/add' },
        { host: 'manta.com', label: 'Manta', add_listing_url: 'https://www.manta.com/add' },
      ],
    },
  },
} as unknown as VerticalPack;
const deps = () => ({ db: dbs.service, packs: async () => pack });
const X = IDS.competitorX;
const RUN = '00000000-0000-4000-8000-0000000000c1';
const RUN_B = '00000000-0000-4000-8000-0000000000c2';
let cap: string;

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  cap = await seedVendorCapture(dbs.service, { competitorId: X, source: 'directories', url: 'https://www.bbb.org/x', capturedAt: day(10) });
});

const run = (id: string, clientId: string, agencyId: string, startedAt = day(10), status: 'done' | 'capped' | 'running' = 'done') =>
  dbs.service.insert(citationAuditRun).values({ id, agencyId, clientId, trigger: 'monthly', status, competitorIds: [X], startedAt, finishedAt: day(10) });
const listing = (o: Partial<typeof citationListing.$inferInsert> = {}) =>
  dbs.service.insert(citationListing).values({
    competitorId: X, host: 'bbb.org', status: 'listed', listingUrl: 'https://www.bbb.org/smith', listingTitle: 'Smith HVAC | BBB',
    captureId: cap, checkedAt: day(10), newlyFoundAt: day(10), ...o,
  });
const changes = () => dbs.service.select().from(detectedChange);
const A = [IDS.clientA1, IDS.agencyA] as const;

describe('diffCitations', () => {
  it('baseline silent', async () => {
    await run(RUN, ...A);
    await listing({ newlyFoundAt: null });
    expect(await diffCitations(deps(), RUN)).toEqual({ ran: true, result: { changeIds: [] } });
    expect(await changes()).toEqual([]);
  });

  it('not_found -> listed in this run emits one global change', async () => {
    await run(RUN, ...A);
    await listing();
    expect(await diffCitations(deps(), RUN)).toMatchObject({ ran: true });
    const rows = await changes();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      competitorId: X, source: 'directories', kind: 'added', blockKey: 'citation:bbb.org', afterCaptureId: cap, beforeText: null,
      afterText: 'Smith HVAC | BBB', agencyId: null, clientId: null, stageVersion: 1,
    });
    expect(rows[0]?.details).toEqual({ changeType: 'citation_added', directory: 'bbb.org', label: 'Better Business Bureau', url: 'https://www.bbb.org/smith' });
  });

  it('not_checked -> listed is silent (no prior row, newly_found_at null)', async () => {
    await run(RUN, ...A);
    await listing({ newlyFoundAt: null, host: 'manta.com' });
    await diffCitations(deps(), RUN);
    expect(await changes()).toEqual([]);
  });

  it('a self row newly found emits nothing', async () => {
    await dbs.owner.update(client).set({ selfCompetitorId: X }).where(eq(client.id, IDS.clientA1));
    await run(RUN, ...A);
    await listing();
    await diffCitations(deps(), RUN);
    expect(await changes()).toEqual([]);
  });

  it('reused rival: no second change for another client run', async () => {
    await run(RUN, ...A);
    await listing();
    await diffCitations(deps(), RUN);
    await run(RUN_B, IDS.clientB1, IDS.agencyB, day(40));
    await diffCitations(deps(), RUN_B);
    expect(await changes()).toHaveLength(1);
  });

  it('rerun idempotent', async () => {
    await run(RUN, ...A);
    await listing();
    await diffCitations(deps(), RUN);
    expect(await diffCitations(deps(), RUN)).toEqual({ ran: false });
    expect(await changes()).toHaveLength(1);
  });

  it('a host removed from the catalogue emits nothing', async () => {
    await run(RUN, ...A);
    await listing({ host: 'angi.com' });
    await diffCitations(deps(), RUN);
    expect(await changes()).toEqual([]);
  });

  it('a rival no longer tracked emits nothing', async () => {
    await run(RUN, ...A);
    await listing();
    await dbs.owner.delete(clientCompetitor).where(eq(clientCompetitor.clientId, IDS.clientA1));
    await diffCitations(deps(), RUN);
    expect(await changes()).toEqual([]);
  });

  it('a running audit run throws', async () => {
    await run(RUN, ...A, day(10), 'running');
    await expect(diffCitations(deps(), RUN)).rejects.toThrow(/not done\|capped/);
  });
});
