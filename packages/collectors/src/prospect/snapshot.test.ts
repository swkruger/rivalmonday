import { ad, capture, client, competitor, observation, prospectReport, rankScan, rankSnapshot } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { type ProspectSnapshotDeps, runProspectSnapshot } from './snapshot';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const AREA = { center: { lat: 33.95, lng: -84.33 }, radiusKm: 10, zips: [] };
let reportId = '';

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  // A2 (dental) is the prospect; it tracks Y (Bright Smiles) only.
  await dbs.owner.update(client).set({ status: 'prospect', keywords: ['dentist'], serviceArea: AREA, placeId: 'ChIJselfProspect01' }).where(eq(client.id, IDS.clientA2));
  await dbs.owner.update(competitor).set({ placeId: 'ChIJcompetitorY001' }).where(eq(competitor.id, IDS.competitorY));
  const [r] = await dbs.service.insert(prospectReport).values({ agencyId: IDS.agencyA, clientId: IDS.clientA2, status: 'running' }).returning();
  reportId = r!.id;
});

async function gbp(competitorId: string, data: Record<string, unknown>) {
  const [cap] = await dbs.service.insert(capture).values({ competitorId, source: 'google_business_profile', status: 'ok', collectorVersion: 'test' }).returning();
  await dbs.service.insert(observation).values({ competitorId, captureId: cap!.id, kind: 'gbp_profile', key: 'profile', data });
}

function fakeDeps(over: Partial<ProspectSnapshotDeps> = {}): ProspectSnapshotDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    db: dbs.service,
    calls,
    async runSource(competitorId, source) {
      calls.push(`${source}:${competitorId}`);
      if (source === 'gbp') {
        await gbp(competitorId, competitorId === IDS.competitorY ? { rating: 4.4, votes: 120, category: 'Dentist', additionalCategories: ['Cosmetic dentist'] } : { rating: 4.9, votes: 31, category: 'Dentist' });
        return { status: 'ok' };
      }
      if (source === 'ads_google') {
        await dbs.service.insert(ad).values([
          { competitorId, platform: 'google', externalId: `g1-${competitorId}`, isActive: true },
          { competitorId, platform: 'google', externalId: `g2-${competitorId}`, isActive: true },
          { competitorId, platform: 'google', externalId: `g3-${competitorId}`, isActive: false },
        ]);
        return { status: 'ok' };
      }
      return { status: 'skipped' };
    },
    async scanRankings(clientId, opts) {
      calls.push(`scan:${clientId}:${opts.gridSize}x${opts.maxKeywords}`);
      const [scan] = await dbs.service.insert(rankScan).values({ agencyId: IDS.agencyA, clientId, status: 'done', snapshots: 9 }).returning();
      for (let i = 0; i < 9; i++) {
        const results = [
          ...(i < 3 ? [{ rank: 1, placeId: 'ChIJselfProspect01', cid: null, domain: null, title: 'A2 Dental' }] : []),
          ...(i < 5 ? [{ rank: 2, placeId: 'ChIJcompetitorY001', cid: null, domain: null, title: 'Bright Smiles' }] : []),
        ];
        await dbs.service.insert(rankSnapshot).values({ agencyId: IDS.agencyA, clientId, scanId: scan!.id, keyword: 'dentist', lat: 33.9 + i / 100, lng: -84.3, results });
      }
      return { snapshots: 9, failed: 0, scanId: scan!.id };
    },
    ...over,
  };
}

const report = async () => (await dbs.owner.select().from(prospectReport).where(eq(prospectReport.id, reportId)))[0]!;

describe('runProspectSnapshot (decisions 10, 11)', () => {
  it('pulls each business once, scans 3×3 × 3 keywords, and stores a deterministic report', async () => {
    const deps = fakeDeps();
    expect(await runProspectSnapshot(deps, IDS.clientA2, reportId)).toEqual({ status: 'ready' });
    const [c] = await dbs.owner.select().from(client).where(eq(client.id, IDS.clientA2));
    expect(deps.calls).toEqual([`gbp:${c!.selfCompetitorId}`, `gbp:${IDS.competitorY}`, `ads_google:${IDS.competitorY}`, `ads_meta:${IDS.competitorY}`, `scan:${IDS.clientA2}:3x3`]);
    const r = await report();
    expect(r.status).toBe('ready');
    expect(r.data!.businesses).toEqual([
      { competitorId: c!.selfCompetitorId, name: 'A2 Dental', self: true, gbp: { rating: 4.9, reviews: 31, category: 'Dentist', extraCategories: 0 }, ads: { google: null, meta: null }, ranks: [{ keyword: 'dentist', found: 3, top3: 3, averageRank: 1 }] },
      { competitorId: IDS.competitorY, name: 'Bright Smiles', self: false, gbp: { rating: 4.4, reviews: 120, category: 'Dentist', extraCategories: 1 }, ads: { google: 2, meta: null }, ranks: [{ keyword: 'dentist', found: 5, top3: 5, averageRank: 2 }] },
    ]);
    expect(r.data).toMatchObject({ keywords: ['dentist'], points: 9, notes: [] });
  });

  it('notes a failed source and still finishes', async () => {
    const base = fakeDeps();
    const deps = fakeDeps({ runSource: async (id, s) => { if (s === 'ads_google') throw new Error('DataForSEO 500'); return base.runSource(id, s); } });
    expect(await runProspectSnapshot(deps, IDS.clientA2, reportId)).toEqual({ status: 'ready' });
    const r = await report();
    expect(r.data!.businesses[1]!.ads.google).toBeNull();
    expect(r.data!.notes).toEqual([expect.stringMatching(/Bright Smiles: Google ads .*DataForSEO 500/)]);
  });

  it('fails cleanly for a client that is no longer a prospect, and never overwrites a report that is no longer running', async () => {
    await dbs.owner.update(client).set({ status: 'active' }).where(eq(client.id, IDS.clientA2));
    expect(await runProspectSnapshot(fakeDeps(), IDS.clientA2, reportId)).toEqual({ status: 'failed' });
    expect(await report()).toMatchObject({ status: 'failed', error: expect.stringMatching(/no longer a prospect/) });
    await dbs.owner.update(client).set({ status: 'prospect' }).where(eq(client.id, IDS.clientA2));
    expect(await runProspectSnapshot(fakeDeps(), IDS.clientA2, reportId)).toEqual({ status: 'failed' });
    expect((await report()).status).toBe('failed');
  });
});
