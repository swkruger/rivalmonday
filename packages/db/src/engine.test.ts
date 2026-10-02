import { asc, cosineDistance, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { errorText, IDS, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import {
  capture, captureBlock, changeEvent, client, decisionReview, detectedChange, EMBEDDING_DIMENSIONS, eventChange, eventScore, move, moveEvent, rankScan, stageRun, trackedPage, volatileBlock,
} from './schema';
import { withTenant } from './tenant';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const PAGE_X = '00000000-0000-4000-8000-0000000000e1';
const PAGE_Y = '00000000-0000-4000-8000-0000000000e2';
const CAP_X = '00000000-0000-4000-8000-0000000000c1';
const CAP_Y = '00000000-0000-4000-8000-0000000000c2';
const CHG_X = '00000000-0000-4000-8000-0000000000b1';
const CHG_Y = '00000000-0000-4000-8000-0000000000b2';
const EVT_X = '00000000-0000-4000-8000-0000000000d1';
const EVT_Y = '00000000-0000-4000-8000-0000000000d2';
const unit = (i: number) => Array.from({ length: EMBEDDING_DIMENSIONS }, (_, k) => (k === i ? 1 : 0));
const factors = { typeWeight: 1, size: 1, serviceOverlap: 1, territoryOverlap: 1, relevance: 1, novelty: 1, maxSimilarity: null, needsReviewCap: false, thresholds: { alert: 70, brief: 40 }, scoringVersion: 1 };

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.service.insert(trackedPage).values([
    { id: PAGE_X, competitorId: IDS.competitorX, url: 'https://smithhvac.example/pricing', pageType: 'pricing', source: 'sitemap', cadence: 'daily' },
    { id: PAGE_Y, competitorId: IDS.competitorY, url: 'https://brightsmiles.example/', pageType: 'home', source: 'nav', cadence: 'daily' },
  ]);
  await dbs.service.insert(capture).values([
    { id: CAP_X, competitorId: IDS.competitorX, trackedPageId: PAGE_X, source: 'web', status: 'ok', collectorVersion: 'web/1' },
    { id: CAP_Y, competitorId: IDS.competitorY, trackedPageId: PAGE_Y, source: 'web', status: 'ok', collectorVersion: 'web/1' },
  ]);
  await dbs.service.insert(captureBlock).values([
    { captureId: CAP_X, competitorId: IDS.competitorX, trackedPageId: PAGE_X, ord: 0, blockKey: 'p#0', path: 'p', text: 'AC tune-up $69', textSha: 'x', embedding: unit(0) },
    { captureId: CAP_Y, competitorId: IDS.competitorY, trackedPageId: PAGE_Y, ord: 0, blockKey: 'p#0', path: 'p', text: 'Whitening $199', textSha: 'y', embedding: unit(1) },
  ]);
  await dbs.service.insert(detectedChange).values([
    { id: CHG_X, competitorId: IDS.competitorX, trackedPageId: PAGE_X, source: 'web', kind: 'modified', afterCaptureId: CAP_X, blockKey: 'p#0', stageVersion: 1 },
    { id: CHG_Y, competitorId: IDS.competitorY, trackedPageId: PAGE_Y, source: 'web', kind: 'added', afterCaptureId: CAP_Y, blockKey: 'p#0', stageVersion: 1 },
  ]);
  await dbs.service.insert(changeEvent).values([
    { id: EVT_X, competitorId: IDS.competitorX, changeType: 'price_change', summary: 'x', confidence: 0.9, occurredAt: new Date(), embedding: unit(0) },
    { id: EVT_Y, competitorId: IDS.competitorY, changeType: 'new_service', summary: 'y', confidence: 0.9, occurredAt: new Date(), embedding: unit(1) },
  ]);
  await dbs.service.insert(eventChange).values([{ eventId: EVT_X, changeId: CHG_X }, { eventId: EVT_Y, changeId: CHG_Y }]);
  await dbs.service.insert(eventScore).values([
    { agencyId: IDS.agencyA, clientId: IDS.clientA1, eventId: EVT_X, score: 80, route: 'alert', factors, packVersion: 1 },
    { agencyId: IDS.agencyB, clientId: IDS.clientB1, eventId: EVT_X, score: 30, route: 'archive', factors, packVersion: 1 },
    { agencyId: IDS.agencyA, clientId: IDS.clientA2, eventId: EVT_Y, score: 50, route: 'brief', factors, packVersion: 1 },
  ]);
  await dbs.service.insert(stageRun).values({ stage: 'web_diff', stageVersion: 1, subjectId: CAP_X, status: 'done' });
  await dbs.service.insert(volatileBlock).values({ trackedPageId: PAGE_X, blockKey: 'p#9' });
  await dbs.service.insert(decisionReview).values({ subjectType: 'detected_change', subjectId: CHG_X, keys: ['change_type'], answers: {} });
});

describe('engine tables', () => {
  it('global engine rows follow the client-competitor link; system tables stay invisible', async () => {
    await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: [IDS.clientA1] }, async (tx) => {
      expect((await tx.select().from(changeEvent)).map((e) => e.id)).toEqual([EVT_X]);
      expect((await tx.select().from(detectedChange)).map((c) => c.id)).toEqual([CHG_X]);
      expect((await tx.select().from(captureBlock)).map((b) => b.captureId)).toEqual([CAP_X]);
      expect((await tx.select().from(eventChange)).map((l) => l.eventId)).toEqual([EVT_X]);
      expect(await tx.select().from(stageRun)).toEqual([]);
      expect(await tx.select().from(volatileBlock)).toEqual([]);
      expect(await tx.select().from(decisionReview)).toEqual([]);
    });
  });

  it('event scores are private to the agency and client scope', async () => {
    const scores = async (agencyId: string, clientScope: 'all' | string[]) =>
      withTenant(dbs.app, { agencyId, clientScope }, async (tx) => (await tx.select().from(eventScore).orderBy(asc(eventScore.score))).map((s) => [s.clientId, s.score]));
    expect(await scores(IDS.agencyA, [IDS.clientA1])).toEqual([[IDS.clientA1, 80]]);
    expect(await scores(IDS.agencyB, 'all')).toEqual([[IDS.clientB1, 30]]);
    expect(await scores(IDS.agencyA, 'all')).toEqual([[IDS.clientA2, 50], [IDS.clientA1, 80]]);
    expect(await dbs.app.select().from(eventScore)).toEqual([]);
  });

  it('never lets app_user write engine tables', async () => {
    const scopeA = { agencyId: IDS.agencyA, clientScope: 'all' as const };
    expect(await errorText(withTenant(dbs.app, scopeA, (tx) => tx.insert(changeEvent).values({ competitorId: IDS.competitorX, changeType: 'promo', summary: 's', confidence: 1, occurredAt: new Date() })))).toMatch(/permission denied/i);
    expect(await errorText(withTenant(dbs.app, scopeA, (tx) => tx.insert(eventScore).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, eventId: EVT_Y, score: 1, route: 'archive', factors, packVersion: 1 })))).toMatch(/permission denied/i);
    expect(await errorText(withTenant(dbs.app, scopeA, (tx) => tx.update(eventScore).set({ score: 99 }).where(eq(eventScore.eventId, EVT_X))))).toMatch(/permission denied/i);
  });

  it('stores 512-d embeddings, orders by cosine distance, and rejects other widths', async () => {
    const rows = await dbs.owner
      .select({ id: changeEvent.id, d: cosineDistance(changeEvent.embedding, unit(1)) })
      .from(changeEvent)
      .orderBy(cosineDistance(changeEvent.embedding, unit(1)));
    expect(rows.map((r) => r.id)).toEqual([EVT_Y, EVT_X]);
    expect(await errorText(dbs.service.insert(changeEvent).values({ competitorId: IDS.competitorX, changeType: 'promo', summary: 's', confidence: 1, occurredAt: new Date(), embedding: [1, 0, 0] }))).toMatch(/dimensions/i);
  });

  it('client score thresholds default to null (vertical pack defaults apply)', async () => {
    expect((await dbs.owner.select().from(client).where(eq(client.id, IDS.clientA1)))[0]?.scoreThresholds).toBeNull();
  });
});

describe('engine tables (Phase 3b)', () => {
  it('tenant-private rank changes and events are visible to their own client only', async () => {
    const [scan] = await dbs.service.insert(rankScan).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, status: 'done' }).returning({ id: rankScan.id });
    const [chg] = await dbs.service
      .insert(detectedChange)
      .values({
        competitorId: IDS.competitorX, source: 'rank', kind: 'modified', rankScanId: scan!.id, agencyId: IDS.agencyA, clientId: IDS.clientA1,
        blockKey: 'rank:ac repair', details: { changeType: 'rank_change', keyword: 'ac repair', avgRankBefore: 9, avgRankAfter: 3 }, stageVersion: 1,
      })
      .returning({ id: detectedChange.id });
    const [ev] = await dbs.service
      .insert(changeEvent)
      .values({ competitorId: IDS.competitorX, agencyId: IDS.agencyA, clientId: IDS.clientA1, changeType: 'rank_change', channels: ['rank'], summary: 'r', confidence: 1, occurredAt: new Date(), details: { keyword: 'ac repair' } })
      .returning({ id: changeEvent.id });
    await dbs.service.insert(eventChange).values({ eventId: ev!.id, changeId: chg!.id });

    const view = (agencyId: string, clientScope: 'all' | string[]) =>
      withTenant(dbs.app, { agencyId, clientScope }, async (tx) => ({
        events: (await tx.select().from(changeEvent)).map((e) => e.id).sort(),
        changes: (await tx.select().from(detectedChange)).map((c) => c.id).sort(),
        links: (await tx.select().from(eventChange)).length,
      }));
    expect(await view(IDS.agencyA, [IDS.clientA1])).toEqual({ events: [EVT_X, ev!.id].sort(), changes: [CHG_X, chg!.id].sort(), links: 2 });
    // B1 tracks competitor X too, but never sees A1's rank change or event.
    expect(await view(IDS.agencyB, 'all')).toEqual({ events: [EVT_X], changes: [CHG_X], links: 1 });
  });

  it('a change needs exactly one subject; tenant columns come in pairs that match a real client', async () => {
    expect(await errorText(dbs.service.insert(detectedChange).values({ competitorId: IDS.competitorX, source: 'rank', kind: 'modified', blockKey: 'k', stageVersion: 1 }))).toMatch(/detected_change_subject_check/);
    expect(
      await errorText(dbs.service.insert(changeEvent).values({ competitorId: IDS.competitorX, clientId: IDS.clientA1, changeType: 'rank_change', summary: 's', confidence: 1, occurredAt: new Date() })),
    ).toMatch(/event_tenant_check/);
    expect(
      await errorText(dbs.service.insert(changeEvent).values({ competitorId: IDS.competitorX, agencyId: IDS.agencyB, clientId: IDS.clientA1, changeType: 'rank_change', summary: 's', confidence: 1, occurredAt: new Date() })),
    ).toMatch(/foreign key/i);
  });

  it('moves are private to the client tenant, with one open move per client, competitor and type', async () => {
    const values = {
      agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, moveType: 'price_war', status: 'emerging', confidence: 0.4, summary: 'm',
      ruleVersion: 1, lastHeldAt: new Date(), lastEvidenceAt: new Date(),
    };
    const [m] = await dbs.service.insert(move).values(values).returning({ id: move.id });
    await dbs.service.insert(moveEvent).values({ moveId: m!.id, eventId: EVT_X });
    expect(await errorText(dbs.service.insert(move).values(values))).toMatch(/move_open_unique/);
    await dbs.service.update(move).set({ closedAt: new Date() }).where(eq(move.id, m!.id));
    await dbs.service.insert(move).values(values); // a closed move frees the slot

    expect(await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: [IDS.clientA1] }, (tx) => tx.select().from(moveEvent))).toHaveLength(1);
    expect(await withTenant(dbs.app, { agencyId: IDS.agencyB, clientScope: 'all' }, (tx) => tx.select().from(move))).toEqual([]);
    expect(await withTenant(dbs.app, { agencyId: IDS.agencyB, clientScope: 'all' }, (tx) => tx.select().from(moveEvent))).toEqual([]);
    expect(await errorText(withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) => tx.insert(move).values(values)))).toMatch(/permission denied/i);
  });
});
