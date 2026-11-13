import { GBP_EVENTS_URL } from '@cs/collectors';
import { capture, competitor, evidence, listedEvent, stageRun } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eventCounts30d, eventsEvidenceIds } from './counts';
import { LISTED_EVENTS_STAGE, LISTED_EVENTS_VERSION } from './stage';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const NOW = new Date('2026-10-15T12:00:00Z');
const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

/** An ok capture with one evidence row; `run` = its listed_events stage run status (none when omitted). */
async function cap(competitorId: string, kind: 'panel' | 'web' | 'meta', at: Date, run?: 'done' | 'failed') {
  const source = kind === 'panel' ? 'google_business_profile' : kind === 'web' ? 'web' : 'meta_ads';
  const [c] = await dbs.owner.insert(capture).values({ competitorId, source, url: kind === 'panel' ? GBP_EVENTS_URL : null, status: 'ok', collectorVersion: 't', capturedAt: at }).returning();
  const [e] = await dbs.owner.insert(evidence).values({ captureId: c!.id, kind: 'vendor_json', objectKey: randomUUID(), sha256: 'x', bytes: 1, contentType: 'application/json' }).returning();
  if (run) await dbs.owner.insert(stageRun).values({ stage: LISTED_EVENTS_STAGE, stageVersion: LISTED_EVENTS_VERSION, subjectId: c!.id, status: run });
  return { captureId: c!.id, evidenceId: e!.id };
}
const ev = (competitorId: string, captureId: string, firstSeenAt: Date, series = false) =>
  dbs.owner.insert(listedEvent).values({
    competitorId, eventKey: randomUUID(), name: 'Jazz Night', nameNorm: 'jazz night', startDate: '2026-11-20', sources: ['google_panel'], series,
    firstCaptureId: captureId, lastCaptureId: captureId, firstSeenAt, lastSeenAt: firstSeenAt,
  });

describe('eventCounts30d (P5)', () => {
  it('counts non-series events first seen in the last 30 days; unmeasured is null, measured with none is 0', async () => {
    const [b] = await dbs.owner.insert(competitor).values({ name: 'Measured None' }).returning({ id: competitor.id });
    const [m] = await dbs.owner.insert(competitor).values({ name: 'Meta Only' }).returning({ id: competitor.id });
    const [u] = await dbs.owner.insert(competitor).values({ name: 'Failed Run' }).returning({ id: competitor.id });
    const x = await cap(IDS.competitorX, 'panel', ago(1), 'done');
    await ev(IDS.competitorX, x.captureId, ago(2));
    await ev(IDS.competitorX, x.captureId, ago(29));
    await ev(IDS.competitorX, x.captureId, ago(31)); // too old
    await ev(IDS.competitorX, x.captureId, ago(3), true); // series
    await cap(b!.id, 'web', ago(1), 'done');
    const meta = await cap(m!.id, 'meta', ago(1), 'done'); // Meta never measures (D11)
    await ev(m!.id, meta.captureId, ago(2));
    const failed = await cap(u!.id, 'panel', ago(1), 'failed');
    await ev(u!.id, failed.captureId, ago(2));
    const counts = await eventCounts30d(dbs.service, [IDS.competitorX, b!.id, m!.id, u!.id], NOW);
    expect([counts.get(IDS.competitorX), counts.get(b!.id), counts.get(m!.id), counts.get(u!.id)]).toEqual([2, 0, null, null]);
    expect((await eventCounts30d(dbs.service, [], NOW)).size).toBe(0);
  });
});

describe('eventsEvidenceIds', () => {
  it('returns the newest measured capture evidence per business', async () => {
    await cap(IDS.competitorX, 'panel', ago(8), 'done');
    const newest = await cap(IDS.competitorX, 'web', ago(1), 'done');
    const unrun = await cap(IDS.competitorX, 'panel', ago(0));
    const meta = await cap(IDS.competitorX, 'meta', ago(0), 'done');
    const ids = await eventsEvidenceIds(dbs.service, [IDS.competitorX]);
    expect(ids).toEqual([newest.evidenceId]);
    expect(ids).not.toContain(unrun.evidenceId);
    expect(ids).not.toContain(meta.evidenceId);
    expect(await eventsEvidenceIds(dbs.service, [])).toEqual([]);
  });
});
