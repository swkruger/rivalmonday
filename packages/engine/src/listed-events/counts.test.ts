import { GBP_EVENTS_URL } from '@cs/collectors';
import { capture, competitor, evidence, listedEvent, stageRun } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eventsEvidenceIds, upcomingEvents } from './counts';
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
const ev = (competitorId: string, captureId: string, o: { startDate?: string; lastSeenAt?: Date; firstSeenAt?: Date; series?: boolean } = {}) =>
  dbs.owner.insert(listedEvent).values({
    competitorId, eventKey: randomUUID(), name: 'Jazz Night', nameNorm: 'jazz night', startDate: o.startDate ?? '2026-11-20', sources: ['google_panel'], series: o.series ?? false,
    firstCaptureId: captureId, lastCaptureId: captureId, firstSeenAt: o.firstSeenAt ?? ago(2), lastSeenAt: o.lastSeenAt ?? ago(1),
  });

describe('upcomingEvents (Task 12 fix ruling 1)', () => {
  it('counts non-series events starting today..+60 d and last seen within 8 d; unmeasured is null, measured with none is 0', async () => {
    const [b] = await dbs.owner.insert(competitor).values({ name: 'Measured None' }).returning({ id: competitor.id });
    const [m] = await dbs.owner.insert(competitor).values({ name: 'Meta Only' }).returning({ id: competitor.id });
    const [u] = await dbs.owner.insert(competitor).values({ name: 'Failed Run' }).returning({ id: competitor.id });
    const x = await cap(IDS.competitorX, 'panel', ago(1), 'done');
    await ev(IDS.competitorX, x.captureId, { startDate: '2026-10-15' }); // today (Chicago)
    await ev(IDS.competitorX, x.captureId, { startDate: '2026-12-14' }); // today + 60
    await ev(IDS.competitorX, x.captureId, { firstSeenAt: ago(120), lastSeenAt: ago(8) }); // a baseline row still shown counts
    await ev(IDS.competitorX, x.captureId, { startDate: '2026-10-14' }); // yesterday
    await ev(IDS.competitorX, x.captureId, { startDate: '2026-12-15' }); // beyond 60 days
    await ev(IDS.competitorX, x.captureId, { lastSeenAt: ago(9) }); // no longer shown
    await ev(IDS.competitorX, x.captureId, { series: true });
    await cap(b!.id, 'web', ago(1), 'done');
    const meta = await cap(m!.id, 'meta', ago(1), 'done'); // Meta never measures (D11)
    await ev(m!.id, meta.captureId);
    const failed = await cap(u!.id, 'panel', ago(1), 'failed');
    await ev(u!.id, failed.captureId);
    const counts = await upcomingEvents(dbs.service, [IDS.competitorX, b!.id, m!.id, u!.id], NOW);
    expect([counts.get(IDS.competitorX), counts.get(b!.id), counts.get(m!.id), counts.get(u!.id)]).toEqual([3, 0, null, null]);
    expect((await upcomingEvents(dbs.service, [], NOW)).size).toBe(0);
  });
  it('"today" follows the given time zone', async () => {
    const x = await cap(IDS.competitorX, 'panel', ago(1), 'done');
    await ev(IDS.competitorX, x.captureId, { startDate: '2026-10-15' });
    const lateUtc = new Date('2026-10-16T02:00:00Z'); // Oct 15 in Chicago, Oct 16 in UTC
    expect((await upcomingEvents(dbs.service, [IDS.competitorX], lateUtc)).get(IDS.competitorX)).toBe(1);
    expect((await upcomingEvents(dbs.service, [IDS.competitorX], lateUtc, 'UTC')).get(IDS.competitorX)).toBe(0);
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
