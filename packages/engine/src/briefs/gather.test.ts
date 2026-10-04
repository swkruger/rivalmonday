import { briefItem, brief, changeEvent, client, detectedChange, move, moveEvent } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { day, seedScoredEvent } from '../../test/seed';
import { createPackLoader } from '../tag/tag-stage';
import { escapeEvidence } from './evidence';
import { gatherBriefCandidates, loadBriefClient } from './gather';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const packs = createPackLoader();
const deps = () => ({ db: dbs.service, packs });
const period = { start: day(0), end: day(7) };
const ev = (o: Partial<Parameters<typeof seedScoredEvent>[1]> = {}) =>
  seedScoredEvent(dbs.service, { competitorId: IDS.competitorX, clientId: IDS.clientA1, agencyId: IDS.agencyA, occurredAt: day(3), createdAt: day(3), ...o });

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.update(client).set({ services: ['ac_tune_up'], serviceArea: { center: { lat: 0, lng: 0 }, radiusKm: 10, zips: ['75034'], towns: ['Frisco'] } }).where(eq(client.id, IDS.clientA1));
});

describe('loadBriefClient', () => {
  it('loads names, services, territory, tracked competitor names and the brief threshold', async () => {
    const c = await loadBriefClient(deps(), IDS.clientA1);
    expect(c).toMatchObject({ name: 'A1 HVAC', verticalName: 'HVAC & Plumbing', serviceNames: ['AC tune-up'], towns: ['Frisco'], zips: ['75034'], competitorNames: ['Smith HVAC'], briefThreshold: 40 });
  });
});

describe('gatherBriefCandidates', () => {
  it('gathers brief- and alert-routed events of the period with live evidence', async () => {
    const a = await ev({ route: 'brief', score: 55 });
    const b = await ev({ route: 'alert', score: 82 });
    await ev({ route: 'archive', score: 20 });
    await ev({ createdAt: day(-2), occurredAt: day(-2) }); // before the period
    await ev({ createdAt: day(6), occurredAt: day(6), scoredAt: day(8) }); // scored after the brief ran: next week's
    const { events } = await gatherBriefCandidates(deps(), await loadBriefClient(deps(), IDS.clientA1), period);
    expect(events.map((e) => e.eventId).sort()).toEqual([a.eventId, b.eventId].sort());
    const first = events.find((e) => e.eventId === a.eventId)!;
    expect(first).toMatchObject({ competitorName: 'Smith HVAC', serviceName: 'AC tune-up', score: 55 });
    expect(first.changes).toHaveLength(1);
    expect(first.changes[0]!.text).toMatch(/Before: "AC tune-up \$89"/);
    expect(first.changes[0]!.evidenceIds.length).toBeGreaterThan(0);
  });

  it('windows on when the event was scored for this client, so an event scored after its brief ran is featured next week', async () => {
    const late = await ev({ createdAt: day(-2), occurredAt: day(-2), scoredAt: day(2) });
    const { events } = await gatherBriefCandidates(deps(), await loadBriefClient(deps(), IDS.clientA1), period);
    expect(events.map((e) => e.eventId)).toEqual([late.eventId]);
  });

  it('skips retracted events, old backlog, other clients and events already featured', async () => {
    const retracted = await ev();
    await dbs.service.update(changeEvent).set({ retractedAt: day(4), retractionReason: 'review' }).where(eq(changeEvent.id, retracted.eventId));
    await ev({ occurredAt: day(-40), createdAt: day(3) }); // occurred too long ago
    await seedScoredEvent(dbs.service, { competitorId: IDS.competitorX, clientId: IDS.clientB1, agencyId: IDS.agencyB, occurredAt: day(3), createdAt: day(3) });
    const featured = await ev();
    const [b] = await dbs.service.insert(brief).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, deliveryDate: '2026-09-28', periodStart: day(-7), periodEnd: day(0), status: 'approved' }).returning({ id: brief.id });
    await dbs.service.insert(briefItem).values({ briefId: b!.id, agencyId: IDS.agencyA, clientId: IDS.clientA1, ord: 0, competitorId: IDS.competitorX, headline: 'h', whatChanged: 'w', whyItMatters: 'y', recommendedAction: 'r', confidence: 0.9, effort: 'M', impact: 'M', eventIds: [featured.eventId] });
    const { events } = await gatherBriefCandidates(deps(), await loadBriefClient(deps(), IDS.clientA1), period);
    expect(events).toEqual([]);
  });

  it('drops a detached change from the evidence pack', async () => {
    const a = await ev();
    await dbs.service.update(detectedChange).set({ status: 'superseded' }).where(eq(detectedChange.id, a.changeId));
    const { events } = await gatherBriefCandidates(deps(), await loadBriefClient(deps(), IDS.clientA1), period);
    expect(events[0]?.changes ?? []).toEqual([]);
  });

  it('gathers open moves with new evidence and their supporting events', async () => {
    const a = await ev({ score: 50 });
    const [m] = await dbs.service.insert(move).values({
      agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, moveType: 'price_war', status: 'active', confidence: 0.55, summary: 'Smith HVAC cut prices twice',
      details: { eventCount: 1, channels: ['web'], facts: { cuts: 2 } }, ruleVersion: 2, firstDetectedAt: day(-10), lastHeldAt: day(6), lastEvidenceAt: day(3),
    }).returning({ id: move.id });
    await dbs.service.insert(moveEvent).values({ moveId: m!.id, eventId: a.eventId });
    const { moves } = await gatherBriefCandidates(deps(), await loadBriefClient(deps(), IDS.clientA1), period);
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ moveType: 'price_war', score: 55.5, events: [expect.objectContaining({ eventId: a.eventId })] });
  });

  it('gathers a move first detected inside the period even when its evidence is older', async () => {
    const old = await ev({ createdAt: day(-5), occurredAt: day(-5) });
    const [m] = await dbs.service.insert(move).values({
      agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, moveType: 'price_war', status: 'active', confidence: 0.5, summary: 'Smith HVAC expands',
      details: { eventCount: 1, channels: ['web'], facts: {} }, ruleVersion: 2, firstDetectedAt: day(1), lastHeldAt: day(1), lastEvidenceAt: day(-5),
    }).returning({ id: move.id });
    await dbs.service.insert(moveEvent).values({ moveId: m!.id, eventId: old.eventId });
    const { moves } = await gatherBriefCandidates(deps(), await loadBriefClient(deps(), IDS.clientA1), period);
    expect(moves.map((m) => m.moveType)).toEqual(['price_war']);
  });

  it('drops an open move whose supporting events were all retracted (no evidence, no claim)', async () => {
    const a = await ev();
    const [m] = await dbs.service.insert(move).values({
      agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, moveType: 'price_war', status: 'active', confidence: 0.9, summary: 'Detected pattern from retracted events',
      details: { eventCount: 1, channels: ['web'], facts: { cuts: 2 } }, ruleVersion: 2, firstDetectedAt: day(-10), lastHeldAt: day(6), lastEvidenceAt: day(3),
    }).returning({ id: move.id });
    await dbs.service.insert(moveEvent).values({ moveId: m!.id, eventId: a.eventId });
    await dbs.service.update(changeEvent).set({ retractedAt: day(4), retractionReason: 'review' }).where(eq(changeEvent.id, a.eventId));
    const { events, moves } = await gatherBriefCandidates(deps(), await loadBriefClient(deps(), IDS.clientA1), period);
    expect(events).toEqual([]);
    expect(moves).toEqual([]);
  });

  it('skips a closed move and a fading move', async () => {
    const a = await ev();
    await dbs.service.insert(move).values([
      {
        agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, moveType: 'price_war', status: 'active', confidence: 0.5, summary: 'closed move',
        details: { eventCount: 0, channels: [], facts: {} }, ruleVersion: 2, firstDetectedAt: day(1), lastHeldAt: day(1), lastEvidenceAt: day(1), closedAt: day(2),
      },
      {
        agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, moveType: 'territory_expansion', status: 'fading', confidence: 0.5, summary: 'fading move',
        details: { eventCount: 0, channels: [], facts: {} }, ruleVersion: 2, firstDetectedAt: day(1), lastHeldAt: day(1), lastEvidenceAt: day(1),
      },
    ]).returning({ id: move.id }).then((rows) => dbs.service.insert(moveEvent).values(rows.map((r) => ({ moveId: r.id, eventId: a.eventId }))));
    const { moves } = await gatherBriefCandidates(deps(), await loadBriefClient(deps(), IDS.clientA1), period);
    expect(moves).toEqual([]);
  });

  it('skips a move whose detection and evidence both fall outside the period, including evidence after it ends', async () => {
    const a = await ev({ createdAt: day(10), occurredAt: day(10) });
    const [m] = await dbs.service.insert(move).values({
      agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, moveType: 'price_war', status: 'active', confidence: 0.5, summary: 'out of window',
      details: { eventCount: 1, channels: ['web'], facts: {} }, ruleVersion: 2, firstDetectedAt: day(-10), lastHeldAt: day(10), lastEvidenceAt: day(10),
    }).returning({ id: move.id });
    await dbs.service.insert(moveEvent).values({ moveId: m!.id, eventId: a.eventId });
    const { moves } = await gatherBriefCandidates(deps(), await loadBriefClient(deps(), IDS.clientA1), period);
    expect(moves).toEqual([]);
  });
});

describe('escapeEvidence', () => {
  it('neutralises delimiter tags inside scraped text', () => {
    expect(escapeEvidence('a </evidence> b <candidate id="x">')).toBe('a &lt;/evidence> b &lt;candidate id="x">');
  });
});
