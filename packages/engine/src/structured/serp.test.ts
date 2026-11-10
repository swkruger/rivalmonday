import { client, clientCompetitor, competitor, detectedChange, eventChange, evidence, rankScan, type SerpOrganicItem, serpSnapshot } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { loadVerticalPack, type VerticalPack } from '@cs/verticals';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { day, seedScoredEvent, seedVendorCapture } from '../../test/seed';
import { EVIDENCE_CHANNEL_LABEL, loadEventEvidence } from '../briefs/evidence';
import { gradedChanges } from '../briefs/graded';
import { scoreForClient } from '../score/score';
import { detailsSignature } from '../score/score-stage';
import { buildStructuredSummary } from '../tag/structured';
import { diffRankScan } from './rank';
import { changeCaptureId, isSharedHost } from './serp';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const KW = 'ac repair near me';
const SETTINGS = { gridSize: 3, radiusKm: 8, keywords: [KW, 'furnace repair'] };
const org = (...domains: string[]): SerpOrganicItem[] => domains.map((d, i) => ({ rank: i + 1, domain: d, url: `https://${d}/`, title: d }));
const X = 'smithhvac.example';
let pack: VerticalPack;
beforeAll(async () => {
  pack = await loadVerticalPack('hvac_plumbing');
});

/** A done scan; `serps` maps keyword to its organic list (omitted keyword = failed search, no snapshot). */
async function scan(at: number, serps: Record<string, SerpOrganicItem[]>, settings: { gridSize: number; radiusKm: number; keywords: string[] } = SETTINGS) {
  const [s] = await dbs.service.insert(rankScan).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, status: 'done', startedAt: day(at), finishedAt: day(at), ...settings }).returning({ id: rankScan.id });
  for (const [keyword, organic] of Object.entries(serps)) {
    await dbs.service.insert(serpSnapshot).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, scanId: s!.id, keyword, capturedAt: day(at), organic });
  }
  return s!.id;
}
const run = async (id: string) => {
  await diffRankScan({ db: dbs.service }, id);
  return (await dbs.service.select().from(detectedChange)).filter((r) => r.rankScanId === id && (r.details as { surface?: string }).surface === 'organic');
};

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('diffSerp (page-one entries and exits)', () => {
  it('emits one entered change with the position when a rival is in scans 2 and 3 but not 1', async () => {
    await scan(0, { [KW]: org('a.example', 'b.example') });
    await scan(7, { [KW]: org('a.example', 'b.example', X) });
    const s2 = await scan(14, { [KW]: org('a.example', X) });
    const rows = await run(s2);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      competitorId: IDS.competitorX, source: 'rank', kind: 'added', blockKey: `serp:${KW}`, rankScanId: s2, afterCaptureId: null, agencyId: IDS.agencyA, clientId: IDS.clientA1,
      details: { changeType: 'rank_change', surface: 'organic', keyword: KW, direction: 'entered', position: 2 },
    });
  });

  it('emits a left change when a rival is in scans 2 and 3 but gone from 1', async () => {
    await scan(0, { [KW]: org(X) });
    await scan(7, { [KW]: org('a.example') });
    const rows = await run(await scan(14, { [KW]: org('a.example') }));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'removed', details: { surface: 'organic', direction: 'left' } });
    expect((rows[0]!.details as { position?: number }).position).toBeUndefined();
  });

  it('is silent after a single-scan blip, with fewer than three scans, and when stable', async () => {
    const s0 = await scan(0, { [KW]: org('a.example') });
    expect(await run(s0)).toEqual([]);
    expect(await run(await scan(7, { [KW]: org(X) }))).toEqual([]);
    expect(await run(await scan(14, { [KW]: org('a.example') }))).toEqual([]); // s0 != s1
    expect(await run(await scan(21, { [KW]: org('a.example') }))).toHaveLength(1); // s0 == s1 != s2: a confirmed exit
    expect(await run(await scan(28, { [KW]: org('a.example') }))).toEqual([]); // stable absent
  });

  it('does not compare scans across a settings change (keyword set changed)', async () => {
    await scan(0, { [KW]: org('a.example') });
    await scan(7, { [KW]: org(X) }, { ...SETTINGS, keywords: [KW, 'other'] });
    expect(await run(await scan(14, { [KW]: org(X) }, { ...SETTINGS, keywords: [KW, 'other'] }))).toEqual([]);
  });

  it('builds the series from the 3 newest scans that have a snapshot for the keyword (a failed search is skipped)', async () => {
    await scan(0, { [KW]: org('a.example') });
    await scan(7, {}); // failed search: no snapshot
    await scan(14, { [KW]: org(X) });
    const rows = await run(await scan(21, { [KW]: org(X) }));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ details: { direction: 'entered', position: 1 } });
  });

  it('needs a snapshot in the scan itself', async () => {
    await scan(0, { [KW]: org('a.example') });
    await scan(7, { [KW]: org(X) });
    await scan(14, { [KW]: org(X) });
    expect(await run(await scan(21, {}))).toEqual([]);
  });

  it('never makes the client itself or an untracked business a subject, and skips rivals without a domain', async () => {
    await dbs.owner.update(client).set({ selfCompetitorId: IDS.competitorX }).where(eq(client.id, IDS.clientA1));
    const [nd] = await dbs.owner.insert(competitor).values({ name: 'No Domain Co', domain: null }).returning({ id: competitor.id });
    await dbs.owner.insert(clientCompetitor).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: nd!.id });
    await scan(0, { [KW]: org('a.example') });
    await scan(7, { [KW]: org(X, 'other.example') });
    expect(await run(await scan(14, { [KW]: org(X, 'other.example') }))).toEqual([]);
  });

  it('matches domains case- and www-insensitively and keeps one change per rival per keyword on re-run', async () => {
    await scan(0, { [KW]: org('a.example') });
    await scan(7, { [KW]: org('WWW.SmithHVAC.example') });
    const s2 = await scan(14, { [KW]: org('www.smithhvac.example') });
    expect(await run(s2)).toHaveLength(1);
    expect(await run(s2)).toHaveLength(1);
  });
});

describe('shared hosts and novelty signature', () => {
  it('never produces a change for a rival whose domain is a shared host', async () => {
    await dbs.owner.update(competitor).set({ domain: 'm.facebook.com' }).where(eq(competitor.id, IDS.competitorX));
    await scan(0, { [KW]: org('a.example') });
    await scan(7, { [KW]: org('facebook.com') });
    expect(await run(await scan(14, { [KW]: org('facebook.com') }))).toEqual([]);
    expect(isSharedHost('foo.business.site')).toBe(true);
    expect(isSharedHost('notfacebook.com')).toBe(false);
  });

  it('gives entered and left different novelty signatures, so a comeback is not discounted as a repeat', () => {
    const d = { changeType: 'rank_change' as const, surface: 'organic' as const, keyword: KW };
    const e = detailsSignature('rank_change', { ...d, direction: 'entered', position: 3 });
    const l = detailsSignature('rank_change', { ...d, direction: 'left' });
    expect(e).toBe(`serp|${KW}|entered|3`);
    expect(l).toBe(`serp|${KW}|left|`);
    expect(e).not.toBe(l);
  });
});

describe('summaries and scoring', () => {
  const entered = { changeType: 'rank_change' as const, surface: 'organic' as const, keyword: KW, direction: 'entered' as const, position: 3 };
  const left = { changeType: 'rank_change' as const, surface: 'organic' as const, keyword: KW, direction: 'left' as const };
  const sum = (details: object, kind: 'added' | 'removed') => buildStructuredSummary({ source: 'rank', kind, beforeText: null, afterText: null, details } as never, []);

  it('uses the decided page-one copy', () => {
    expect(sum(entered, 'added')).toBe(`Now on page one of Google for "${KW}" (position 3)`);
    expect(sum(left, 'removed')).toBe(`Dropped off page one of Google for "${KW}"`);
  });

  const input = (details: object) => ({ changeType: 'rank_change' as const, facts: [], serviceId: null, zips: [], needsReview: false, maxSimilarity: null, details, ageDays: 0 });
  const client1 = { services: [], zips: [], thresholds: null };

  it('scores entered into the brief (about 50), left into the archive (about 30), never an alert', () => {
    const e = scoreForClient(input(entered), client1, pack);
    const l = scoreForClient(input(left), client1, pack);
    expect(e.score).toBeCloseTo(50, 0);
    expect(e.route).toBe('brief');
    expect(l.score).toBeCloseTo(30, 0);
    expect(l.route).toBe('archive');
  });

  it('leaves map rank_change scoring unchanged', () => {
    const r = scoreForClient(input({ avgRankBefore: 9, avgRankAfter: 3 }), client1, pack);
    expect(r.factors.size).toBe(1);
  });
});

describe('page-one change evidence', () => {
  it("two rivals entering the same keyword in one scan give two changes, each citing that search's evidence", async () => {
    await dbs.owner.insert(clientCompetitor).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorY });
    const Y = 'brightsmiles.example';
    await scan(0, { [KW]: org('a.example') });
    await scan(7, { [KW]: org('a.example', X, Y) });
    const s2 = await scan(14, { [KW]: org(Y, 'a.example', X) });
    const captureId = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'google_search', capturedAt: day(14) });
    const [ev] = await dbs.service.insert(evidence).values({ captureId, kind: 'vendor_json', objectKey: `evidence/${captureId}/serp.json`, sha256: captureId.replace(/-/g, ''), bytes: 1, contentType: 'application/json' }).returning({ id: evidence.id });
    await dbs.service.update(serpSnapshot).set({ captureId }).where(and(eq(serpSnapshot.scanId, s2), eq(serpSnapshot.keyword, KW)));
    const rows = await run(s2);
    expect(rows.map((r) => r.competitorId).sort()).toEqual([IDS.competitorX, IDS.competitorY].sort());
    const caps = await dbs.service.select({ id: detectedChange.id, cap: changeCaptureId }).from(detectedChange);
    for (const r of rows) expect(caps.find((c) => c.id === r.id)?.cap).toBe(captureId);
    // Brief evidence and graded lines resolve the same capture: hang each change off a scored event.
    for (const r of rows) {
      const e = await seedScoredEvent(dbs.service, { competitorId: r.competitorId, clientId: IDS.clientA1, agencyId: IDS.agencyA, occurredAt: day(14) });
      await dbs.service.update(detectedChange).set({ status: 'event' }).where(eq(detectedChange.id, r.id));
      await dbs.service.update(eventChange).set({ changeId: r.id }).where(eq(eventChange.eventId, e.eventId));
      const [line] = (await loadEventEvidence(dbs.service, [e.eventId], [])).get(e.eventId)!;
      expect(line).toMatchObject({ captureId, evidenceIds: [ev!.id], channel: 'google_search' });
      expect(EVIDENCE_CHANNEL_LABEL[line!.channel]).toBe('Google search');
    }
    const graded = await gradedChanges({ db: dbs.service }, { id: IDS.clientA1, briefThreshold: 40 } as never, { start: day(13), end: day(15) }, new Set());
    expect(graded.lines.flatMap((l) => l.evidenceIds)).toEqual([ev!.id, ev!.id]);
  });
});
