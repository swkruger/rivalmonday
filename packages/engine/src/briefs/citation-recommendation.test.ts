import { brief, capture, citationListing, client, competitor, evidence, feedback, playbookOverride, recommendation } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { loadVerticalPack } from '@cs/verticals';
import { asc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPackLoader } from '../tag/tag-stage';
import { CITATION_REC_CLOSED_REASON, CITATION_REC_COOLDOWN_DAYS, recommendForCitations } from './citation-recommendation';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const generic = () => loadVerticalPack('generic');
const base = createPackLoader();
/** Directory definitions live in generic.yaml (DB packs inherit them); the file loader does not, so graft them on. */
const packs = async (id: string) => { const [p, g] = await Promise.all([base(id), generic()]); return { ...p, citations: { ...p.citations, directory_groups: g.citations.directory_groups } }; };
const NOW = new Date('2026-11-10T12:00:00Z');
const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const run = () => recommendForCitations({ db: dbs.service, packs, generic, now: () => NOW }, IDS.clientA1);
const recs = () => dbs.owner.select().from(recommendation).orderBy(asc(recommendation.createdAt));
let selfId: string;
let evidenceId: string;

async function listings(missing: string[], listed: string[] = ['facebook.com']) {
  await dbs.owner.delete(citationListing);
  const [cap] = await dbs.owner.insert(capture).values({ competitorId: selfId, source: 'directories', status: 'ok', collectorVersion: 't' }).returning();
  const [ev] = await dbs.owner.insert(evidence).values({ captureId: cap!.id, kind: 'vendor_json', objectKey: randomUUID(), sha256: 'x', bytes: 1, contentType: 'application/json' }).returning();
  evidenceId = ev!.id;
  await dbs.owner.insert(citationListing).values([
    ...missing.map((host) => ({ competitorId: selfId, host, status: 'not_found' as const, checkedAt: NOW, captureId: cap!.id })),
    ...listed.map((host) => ({ competitorId: selfId, host, status: 'listed' as const, checkedAt: NOW, captureId: null })),
  ]);
}
const FOUR = ['manta.com', 'foursquare.com', 'mapquest.com', 'yellowpages.com'];
const spBrief = (status: string) => dbs.owner.insert(brief).values({
  agencyId: IDS.agencyA, clientId: IDS.clientA1, deliveryDate: '2026-11-02', periodStart: ago(10), periodEnd: ago(3), kind: 'starting_point', status,
});
const existing = (over: Partial<typeof recommendation.$inferInsert>) => dbs.owner.insert(recommendation).values({
  agencyId: IDS.agencyA, clientId: IDS.clientA1, title: 't', rationale: 'r', effort: 'M', impact: 'M', owner: 'client', source: 'brief', playbookId: 'fix_citations', ...over,
});

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  const [s] = await dbs.owner.insert(competitor).values({ name: 'A1 HVAC', placeId: 'PSELF' }).returning({ id: competitor.id });
  selfId = s!.id;
  await dbs.owner.update(client).set({ selfCompetitorId: selfId }).where(eq(client.id, IDS.clientA1));
});

describe('recommendForCitations', () => {
  it('skips until the starting point is approved or sent', async () => {
    await listings(FOUR);
    expect(await run()).toMatchObject({ outcome: 'skipped', reason: 'starting point not out yet' });
    await spBrief('ready');
    expect(await run()).toMatchObject({ outcome: 'skipped', reason: 'starting point not out yet' });
    expect(await recs()).toHaveLength(0);
  });

  it('creates one deterministic listings recommendation, then refreshes it', async () => {
    await spBrief('sent');
    await listings(FOUR);
    expect(await run()).toEqual({ outcome: 'created' });
    const [r] = await recs();
    expect(r).toMatchObject({
      source: 'listings', status: 'todo', owner: 'client', upsellTag: null, playbookId: 'fix_citations', eventIds: [], evidenceIds: [evidenceId],
      title: "Get listed on the directories you're missing",
    });
    expect(r!.rationale).toBe('Google search found no listing for you on 4 of 5 directories we check: Yellow Pages, Manta, Foursquare and MapQuest.');
    await listings([...FOUR, 'bbb.org']);
    expect(await run()).toEqual({ outcome: 'refreshed' });
    const all = await recs();
    expect(all).toHaveLength(1);
    expect(all[0]!.rationale).toContain('5 of 6 directories');
    expect(all[0]!.evidenceIds).toEqual([evidenceId]);
  });

  it('skips when a live fix_citations recommendation of another source exists, or one is in progress', async () => {
    await spBrief('approved');
    await listings(FOUR);
    await existing({ source: 'brief', status: 'todo' });
    expect(await run()).toMatchObject({ outcome: 'skipped' });
    expect(await recs()).toHaveLength(1);
    await dbs.owner.delete(recommendation);
    await existing({ source: 'listings', status: 'in_progress' });
    expect(await run()).toMatchObject({ outcome: 'skipped' });
    expect(await recs()).toHaveLength(1);
  });

  it(`a done or dismissed one blocks for ${CITATION_REC_COOLDOWN_DAYS} days only`, async () => {
    await spBrief('sent');
    await listings(FOUR);
    await existing({ source: 'listings', status: 'dismissed', dismissReason: 'no', updatedAt: ago(10) });
    expect(await run()).toMatchObject({ outcome: 'skipped' });
    await dbs.owner.update(recommendation).set({ updatedAt: ago(100) });
    expect(await run()).toEqual({ outcome: 'created' });
    expect(await recs()).toHaveLength(2);
  });

  it('closes an untouched todo when the gap is gone; in_progress and other sources stay', async () => {
    await spBrief('sent');
    await listings([], ['facebook.com', 'bbb.org']);
    await existing({ source: 'listings', status: 'todo' });
    expect(await run()).toEqual({ outcome: 'closed' });
    const [r] = await recs();
    expect(r!.status).toBe('done');
    const fb = await dbs.owner.select().from(feedback);
    expect(fb).toHaveLength(1);
    expect(fb[0]).toMatchObject({ subjectType: 'recommendation', subjectId: r!.id, kind: 'status', actor: 'system', reason: CITATION_REC_CLOSED_REASON, before: { status: 'todo' }, after: { status: 'done' } });
    await dbs.owner.delete(recommendation);
    await dbs.owner.delete(feedback);
    await existing({ source: 'listings', status: 'in_progress' });
    await existing({ source: 'brief', status: 'todo' });
    expect(await run()).toMatchObject({ outcome: 'skipped' });
    expect((await recs()).map((x) => x.status).sort()).toEqual(['in_progress', 'todo']);
    expect(await dbs.owner.select().from(feedback)).toHaveLength(0);
  });

  it('a refresh with unchanged text leaves updatedAt alone', async () => {
    await spBrief('sent');
    await listings(FOUR);
    await run();
    const [before] = await recs();
    await dbs.owner.update(recommendation).set({ updatedAt: ago(5) });
    expect(await run()).toEqual({ outcome: 'refreshed' });
    expect((await recs())[0]!.updatedAt.toISOString()).toBe(ago(5).toISOString());
    expect(before!.rationale).toBe((await recs())[0]!.rationale);
  });

  it('a system auto-close does not start the hold: the gap returning creates a new recommendation', async () => {
    await spBrief('sent');
    await listings(FOUR);
    await run();
    await listings([], ['facebook.com', 'bbb.org']);
    expect(await run()).toEqual({ outcome: 'closed' });
    await dbs.owner.update(recommendation).set({ updatedAt: ago(10) });
    await listings(FOUR);
    expect(await run()).toEqual({ outcome: 'created' });
    expect(await recs()).toHaveLength(2);
  });

  it('an owner acting after the system close starts the hold', async () => {
    await spBrief('sent');
    await listings(FOUR);
    await run();
    await listings([], ['facebook.com', 'bbb.org']);
    expect(await run()).toEqual({ outcome: 'closed' });
    const [r] = await recs();
    await dbs.owner.update(recommendation).set({ status: 'dismissed', dismissReason: 'not now', updatedAt: ago(10) });
    await dbs.owner.insert(feedback).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, subjectType: 'recommendation', subjectId: r!.id, kind: 'status', actor: 'user-1', before: { status: 'done' }, after: { status: 'dismissed' }, reason: 'not now' });
    await listings(FOUR);
    expect(await run()).toEqual({ outcome: 'skipped', reason: 'recently closed by the owner' });
    expect(await recs()).toHaveLength(1);
  });

  it('writes nothing for a gap without evidence', async () => {
    await spBrief('sent');
    await listings(FOUR);
    await dbs.owner.update(citationListing).set({ captureId: null });
    expect(await run()).toMatchObject({ outcome: 'skipped' });
    expect(await recs()).toHaveLength(0);
  });

  it('skips when the agency disabled the fix_citations play, and for a non-active client', async () => {
    await spBrief('sent');
    await listings(FOUR);
    await dbs.owner.insert(playbookOverride).values({ agencyId: IDS.agencyA, verticalId: 'hvac_plumbing', playbookId: 'fix_citations', title: null, template: null, disabledBy: 'am-1', updatedBy: 'am-1' });
    expect(await run()).toMatchObject({ outcome: 'skipped', reason: 'citation_gap or fix_citations not enabled' });
    await dbs.owner.delete(playbookOverride);
    await dbs.owner.update(client).set({ status: 'prospect' }).where(eq(client.id, IDS.clientA1));
    expect(await run()).toMatchObject({ outcome: 'skipped', reason: 'client is prospect' });
    expect(await recs()).toHaveLength(0);
  });
});
