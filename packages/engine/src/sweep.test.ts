import { capture, changeEvent, detectedChange, eventScore, stageRun, trackedPage } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { scoreEvent } from './score/score-stage';
import { MAX_STAGE_ATTEMPTS } from './stage';
import { findEngineWork } from './sweep';
import { createPackLoader } from './tag/tag-stage';

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const PAGE = '00000000-0000-4000-8000-0000000000e1';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.service.insert(trackedPage).values({ id: PAGE, competitorId: IDS.competitorX, url: 'https://smithhvac.example/', pageType: 'home', source: 'manual', cadence: 'daily' });
});

describe('findEngineWork', () => {
  it('finds undiffed ok web captures oldest first, skipping done, exhausted and non-web captures', async () => {
    await dbs.service.insert(capture).values([
      { id: id(1), competitorId: IDS.competitorX, trackedPageId: PAGE, source: 'web', status: 'ok', collectorVersion: 'web/1', capturedAt: new Date('2026-10-02') },
      { id: id(2), competitorId: IDS.competitorX, trackedPageId: PAGE, source: 'web', status: 'ok', collectorVersion: 'web/1', capturedAt: new Date('2026-10-01') },
      { id: id(3), competitorId: IDS.competitorX, trackedPageId: PAGE, source: 'web', status: 'unchanged', collectorVersion: 'web/1' },
      { id: id(4), competitorId: IDS.competitorX, source: 'google_ads', status: 'ok', collectorVersion: 'dfs/1' },
      { id: id(5), competitorId: IDS.competitorX, trackedPageId: PAGE, source: 'web', status: 'ok', collectorVersion: 'web/1' },
      { id: id(6), competitorId: IDS.competitorX, trackedPageId: PAGE, source: 'web', status: 'ok', collectorVersion: 'web/1' },
      { id: id(7), competitorId: IDS.competitorX, trackedPageId: PAGE, source: 'web', status: 'ok', collectorVersion: 'web/1', capturedAt: new Date('2026-10-03') },
    ]);
    await dbs.service.insert(stageRun).values([
      { stage: 'web_diff', stageVersion: 1, subjectId: id(5), status: 'done' },
      { stage: 'web_diff', stageVersion: 1, subjectId: id(6), status: 'failed', attempts: MAX_STAGE_ATTEMPTS },
      { stage: 'web_diff', stageVersion: 1, subjectId: id(7), status: 'failed', attempts: 1 },
    ]);
    expect((await findEngineWork(dbs.service, { limit: 10 })).diff).toEqual([id(2), id(1), id(7)]);
    expect((await findEngineWork(dbs.service, { limit: 10, competitorId: IDS.competitorY })).diff).toEqual([]);
  });

  it('backs off a failed run exponentially (30 * 2^(attempts-1) minutes) from finished_at, oldest first', async () => {
    await dbs.service.insert(capture).values([
      { id: id(1), competitorId: IDS.competitorX, trackedPageId: PAGE, source: 'web', status: 'ok', collectorVersion: 'web/1' },
      { id: id(2), competitorId: IDS.competitorX, trackedPageId: PAGE, source: 'web', status: 'ok', collectorVersion: 'web/1' },
      { id: id(3), competitorId: IDS.competitorX, trackedPageId: PAGE, source: 'web', status: 'ok', collectorVersion: 'web/1' },
    ]);
    await dbs.service.insert(stageRun).values([
      // attempts 1, finished just now: within the 30-minute backoff — not yet eligible.
      { stage: 'web_diff', stageVersion: 1, subjectId: id(1), status: 'failed', attempts: 1, finishedAt: new Date() },
      // attempts 1, finished 31 minutes ago: past the 30-minute backoff — eligible again.
      { stage: 'web_diff', stageVersion: 1, subjectId: id(2), status: 'failed', attempts: 1, finishedAt: minutesAgo(31) },
      // attempts 2, finished 31 minutes ago: backoff is 60 minutes — not yet eligible.
      { stage: 'web_diff', stageVersion: 1, subjectId: id(3), status: 'failed', attempts: 2, finishedAt: minutesAgo(31) },
    ]);
    expect((await findEngineWork(dbs.service, { limit: 10 })).diff).toEqual([id(2)]);
  });

  it('finds pending changes and events missing a client score', async () => {
    await dbs.service.insert(capture).values({ id: id(1), competitorId: IDS.competitorX, trackedPageId: PAGE, source: 'web', status: 'ok', collectorVersion: 'web/1' });
    await dbs.service.insert(detectedChange).values([
      { id: id(11), competitorId: IDS.competitorX, source: 'web', kind: 'added', afterCaptureId: id(1), blockKey: 'p#0', stageVersion: 1 },
      { id: id(12), competitorId: IDS.competitorX, source: 'web', kind: 'added', afterCaptureId: id(1), blockKey: 'p#1', stageVersion: 1, status: 'event' },
    ]);
    await dbs.service.insert(stageRun).values({ stage: 'web_diff', stageVersion: 1, subjectId: id(1), status: 'done' });
    await dbs.service.insert(changeEvent).values([
      { id: id(21), competitorId: IDS.competitorX, changeType: 'promo', summary: 's', confidence: 1, occurredAt: new Date() },
      { id: id(22), competitorId: IDS.competitorX, changeType: 'promo', summary: 's', confidence: 1, occurredAt: new Date(), createdAt: new Date('2025-01-01') },
    ]);
    const factors = { typeWeight: 1, size: 1, serviceOverlap: 1, territoryOverlap: 1, relevance: 1, novelty: 1, maxSimilarity: null, needsReviewCap: false, thresholds: { alert: 70, brief: 40 }, scoringVersion: 1 };
    await dbs.service.insert(eventScore).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, eventId: id(21), score: 1, route: 'archive', factors, packVersion: 1 });
    const w = await findEngineWork(dbs.service, { limit: 10 });
    expect(w).toEqual({ diff: [], tag: [id(11)], score: [id(21)], rankDiff: [], reviews: [] }); // B1 still lacks a score for 21; 22 is outside the window
  });

  it('offers settled vendor captures of sources that have a differ, and nothing else', async () => {
    const mk = async (source: string, minutesAgo: number) => {
      const [row] = await dbs.service
        .insert(capture)
        .values({ competitorId: IDS.competitorX, source, status: 'ok', collectorVersion: 'test/1', capturedAt: new Date(Date.now() - minutesAgo * 60_000) })
        .returning({ id: capture.id });
      return row!.id;
    };
    const settled = await mk('meta_ads', 15);
    const fresh = await mk('meta_ads', 2);
    const unknown = await mk('instagram', 15);
    const w = await findEngineWork(dbs.service, { limit: 50 });
    expect(w.diff).toContain(settled);
    expect(w.diff).not.toContain(fresh);
    expect(w.diff).not.toContain(unknown);
  });

  it('offers a tenant event for scoring only while its own client lacks a score', async () => {
    const [ev] = await dbs.service
      .insert(changeEvent)
      .values({ competitorId: IDS.competitorX, agencyId: IDS.agencyA, clientId: IDS.clientA1, changeType: 'rank_change', summary: 'r', confidence: 1, occurredAt: new Date() })
      .returning({ id: changeEvent.id });
    expect((await findEngineWork(dbs.service, { limit: 50 })).score).toContain(ev!.id);
    await scoreEvent({ db: dbs.service, packs: createPackLoader() }, ev!.id);
    expect((await findEngineWork(dbs.service, { limit: 50 })).score).not.toContain(ev!.id); // B1 tracks X but is not owed this score
  });
});
