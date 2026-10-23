import { clientCompetitor, review, reviewAnalysis } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { loadVerticalPack } from '@cs/verticals';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createFakeAi, noul, reviewResult, score } from '../../test/fake-ai';
import { findEngineWork } from '../sweep';
import { createPackLoader } from '../tag/tag-stage';
import {
  analyzeReview, buildReaskQuestions, buildReviewQuestions, otherKey, type ReaskTopics, reaskGap, resolveReviewAnalysis, reviewSubjectId, themeKey, topicsForVertical,
} from './topics';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const packs = createPackLoader();
const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

let n = 0;
async function seedReview(over: Partial<typeof review.$inferInsert> = {}) {
  const [r] = await dbs.service
    .insert(review)
    .values({ competitorId: IDS.competitorX, dedupeKey: `id:${n++}`, rating: 2, text: 'Thanks Mike! Hidden fees on the invoice and the tech was rude. Call 972-555-0100', postedAt: ago(10), ...over })
    .returning({ id: review.id });
  return r!.id;
}

describe('review questions', () => {
  it('asks a sentiment score, one Noul per topic and an "other" Noul per vertical', async () => {
    const pack = await loadVerticalPack('hvac_plumbing');
    const q = buildReviewQuestions([{ pack, topics: await topicsForVertical(dbs.service, pack) }]);
    expect(Object.keys(q)).toHaveLength(1 + pack.topics.length + 1);
    expect(q.sentiment).toMatchObject({ type: 'score', levels: ['very negative', 'negative', 'mixed or neutral', 'positive', 'very positive'] });
    expect(q[themeKey('hvac_plumbing', 'price_transparency')]?.type).toBe('noul');
    expect(q[otherKey('hvac_plumbing')]?.instructions).toContain('Price transparency');
  });

  it('drops low-confidence answers from the analysis instead of guessing', async () => {
    const pack = await loadVerticalPack('hvac_plumbing');
    const topics = await topicsForVertical(dbs.service, pack);
    const answers = Object.fromEntries(
      Object.keys(buildReviewQuestions([{ pack, topics }])).map((k) => [k, k === 'sentiment' ? score(1, 0.6) : noul(k.endsWith('__upsell_pressure'), 0.6)]),
    );
    const [row] = resolveReviewAnalysis({ answers, needsReview: ['sentiment', themeKey('hvac_plumbing', 'upsell_pressure')] }, [{ pack, topics }], {
      reviewId: 'r', competitorId: 'c', textSha: 's',
    });
    expect(row).toMatchObject({ verticalId: 'hvac_plumbing', sentiment: null, needsReview: true, topics: [] });
    expect(row!.asked).not.toContain('upsell_pressure');
    expect(row!.asked).toHaveLength(pack.topics.length - 1);
  });

  it('reviewSubjectId matches the SQL the sweep uses and changes when the text is edited', async () => {
    const id = await seedReview();
    const [r] = (await dbs.owner.execute(sql`SELECT md5(r.id::text || '|' || r.text)::uuid AS s, r.text FROM review r WHERE r.id = ${id}::uuid`)) as unknown as {
      s: string;
      text: string;
    }[];
    expect(reviewSubjectId(id, r!.text)).toBe(r!.s);
    expect(reviewSubjectId(id, `${r!.text}!`)).not.toBe(r!.s);
  });
});

describe('analyzeReview', () => {
  it('stores topics and sentiment per vertical, from redacted text, via review_decisions', async () => {
    const id = await seedReview();
    const ai = createFakeAi({ decide: reviewResult({ topics: ['price_transparency', 'technician_professionalism'], sentiment: 0 }) });
    expect(await analyzeReview({ db: dbs.service, ai, packs }, id)).toEqual({ ran: true, result: { rows: 1 } });
    const [row] = await dbs.owner.select().from(reviewAnalysis);
    expect(row).toMatchObject({
      reviewId: id, verticalId: 'hvac_plumbing', competitorId: IDS.competitorX, topics: ['price_transparency', 'technician_professionalism'], other: false, sentiment: 0, needsReview: false,
    });
    expect(row!.asked).toHaveLength(8);
    expect(ai.calls.decide[0]!.task).toBe('review_decisions');
    const state = JSON.stringify(ai.calls.decide[0]!.state);
    expect(state).not.toContain('Mike');
    expect(state).not.toContain('972-555-0100');
    expect(await analyzeReview({ db: dbs.service, ai, packs }, id)).toEqual({ ran: false });
  });

  it('re-analyses an edited review and replaces its row', async () => {
    const id = await seedReview();
    await analyzeReview({ db: dbs.service, ai: createFakeAi({ decide: reviewResult({ topics: ['price_transparency'], sentiment: 0 }) }), packs }, id);
    await dbs.service.update(review).set({ text: 'Update: they refunded the fee and apologised. Great follow-up.' }).where(eq(review.id, id));
    const r = await analyzeReview({ db: dbs.service, ai: createFakeAi({ decide: reviewResult({ topics: ['communication'], sentiment: 3 }) }), packs }, id);
    expect(r.ran).toBe(true);
    const rows = await dbs.owner.select().from(reviewAnalysis);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ topics: ['communication'], sentiment: 3 });
  });

  it("an edited review's upsert clears checked_at", async () => {
    const id = await seedReview();
    await analyzeReview({ db: dbs.service, ai: createFakeAi({ decide: reviewResult({}) }), packs }, id);
    await dbs.owner.update(reviewAnalysis).set({ checkedAt: new Date() }).where(eq(reviewAnalysis.reviewId, id));
    await dbs.service.update(review).set({ text: 'Update: they came back and fixed it for free.' }).where(eq(review.id, id));
    expect((await analyzeReview({ db: dbs.service, ai: createFakeAi({ decide: reviewResult({}) }), packs }, id)).ran).toBe(true);
    const [row] = await dbs.owner.select().from(reviewAnalysis).where(eq(reviewAnalysis.reviewId, id));
    expect(row!.checkedAt).toBeNull();
  });

  it('writes one row per vertical tracking the competitor', async () => {
    await dbs.owner.insert(clientCompetitor).values({ agencyId: IDS.agencyA, clientId: IDS.clientA2, competitorId: IDS.competitorX });
    const id = await seedReview();
    await analyzeReview({ db: dbs.service, ai: createFakeAi({ decide: reviewResult({ topics: ['upsell_pressure'] }) }), packs }, id);
    const rows = await dbs.owner.select().from(reviewAnalysis);
    expect(rows.map((r) => r.verticalId).sort()).toEqual(['dental', 'hvac_plumbing']);
    expect(rows.every((r) => r.topics.includes('upsell_pressure'))).toBe(true); // both packs have an upsell_pressure topic
  });
});

describe('sweep: reviews', () => {
  it('offers recent, textual reviews of tracked competitors until analysed', async () => {
    const fresh = await seedReview();
    await seedReview({ postedAt: ago(200) });
    await seedReview({ text: 'ok' });
    await seedReview({ competitorId: IDS.competitorY, text: 'Lovely dentist, very gentle' }); // Y is tracked by A2
    const work = await findEngineWork(dbs.service, { limit: 50 });
    expect(work.reviews).toHaveLength(2);
    expect(work.reviews).toContain(fresh);
    await analyzeReview({ db: dbs.service, ai: createFakeAi({ decide: reviewResult({}) }), packs }, fresh);
    expect((await findEngineWork(dbs.service, { limit: 50 })).reviews).not.toContain(fresh);
  });
});

describe('re-ask gap (unit)', () => {
  const T = (id: string) => ({ id, name: id.toUpperCase(), description: `about ${id}` });
  const at = (h: number) => new Date(Date.UTC(2026, 9, 20, h));
  const t: ReaskTopics = { seed: [T('a'), T('b')], seedEditedAt: at(1), approved: [{ ...T('c'), decidedAt: at(5) }, { ...T('d'), decidedAt: at(1) }] };

  it('(b) without a row: every seed and approved topic', () => {
    expect(reaskGap('v', null, t)).toEqual({ kind: 'b', verticalId: 'v', topics: [T('a'), T('b'), T('c'), T('d')] });
  });

  it('(a) approved after the marker and not asked; seed only when edited after the marker', () => {
    expect(reaskGap('v', { asked: ['a'], analyzedAt: at(3), checkedAt: null }, t)).toEqual({ kind: 'a', verticalId: 'v', topics: [T('c')] });
    expect(reaskGap('v', { asked: ['a'], analyzedAt: at(0), checkedAt: null }, t)).toEqual({ kind: 'a', verticalId: 'v', topics: [T('b'), T('c'), T('d')] });
  });

  it('none when the marker is newer than every trigger or every gap topic is asked', () => {
    expect(reaskGap('v', { asked: [], analyzedAt: at(0), checkedAt: at(6) }, t)).toBeNull();
    expect(reaskGap('v', { asked: ['a', 'b', 'c', 'd'], analyzedAt: at(0), checkedAt: null }, t)).toBeNull();
  });

  it('buildReaskQuestions asks sentiment and other only for a (b) gap', async () => {
    const hvac = await loadVerticalPack('hvac_plumbing');
    const dental = await loadVerticalPack('dental');
    const map = new Map([['hvac_plumbing', hvac], ['dental', dental]]);
    const only = buildReaskQuestions([{ kind: 'a', verticalId: 'hvac_plumbing', topics: [T('warranty_claims')] }], map);
    expect(Object.keys(only)).toEqual([themeKey('hvac_plumbing', 'warranty_claims')]);
    expect(only[themeKey('hvac_plumbing', 'warranty_claims')]).toEqual(
      buildReviewQuestions([{ pack: hvac, topics: [T('warranty_claims')] }])[themeKey('hvac_plumbing', 'warranty_claims')],
    );
    const both = buildReaskQuestions([{ kind: 'a', verticalId: 'hvac_plumbing', topics: [T('x')] }, { kind: 'b', verticalId: 'dental', topics: [T('y')] }], map);
    expect(Object.keys(both).sort()).toEqual([otherKey('dental'), 'sentiment', themeKey('dental', 'y'), themeKey('hvac_plumbing', 'x')].sort());
  });
});
