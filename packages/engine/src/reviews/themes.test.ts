import { clientCompetitor, review, reviewAnalysis } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { loadVerticalPack } from '@cs/verticals';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createFakeAi, noul, reviewResult, score } from '../../test/fake-ai';
import { findEngineWork } from '../sweep';
import { createPackLoader } from '../tag/tag-stage';
import { analyzeReview, buildReviewQuestions, otherKey, resolveReviewAnalysis, reviewSubjectId, themeKey, themesForVertical } from './themes';

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
  it('asks a sentiment score, one Noul per theme and an "other" Noul per vertical', async () => {
    const pack = await loadVerticalPack('hvac_plumbing');
    const q = buildReviewQuestions([{ pack, themes: await themesForVertical(dbs.service, pack) }]);
    expect(Object.keys(q)).toHaveLength(1 + pack.themes.length + 1);
    expect(q.sentiment).toMatchObject({ type: 'score', levels: ['very negative', 'negative', 'mixed or neutral', 'positive', 'very positive'] });
    expect(q[themeKey('hvac_plumbing', 'price_transparency')]?.type).toBe('noul');
    expect(q[otherKey('hvac_plumbing')]?.instructions).toContain('Price transparency');
  });

  it('drops low-confidence answers from the analysis instead of guessing', async () => {
    const pack = await loadVerticalPack('hvac_plumbing');
    const themes = await themesForVertical(dbs.service, pack);
    const answers = Object.fromEntries(
      Object.keys(buildReviewQuestions([{ pack, themes }])).map((k) => [k, k === 'sentiment' ? score(1, 0.6) : noul(k.endsWith('__upsell_pressure'), 0.6)]),
    );
    const [row] = resolveReviewAnalysis({ answers, needsReview: ['sentiment', themeKey('hvac_plumbing', 'upsell_pressure')] }, [{ pack, themes }], {
      reviewId: 'r', competitorId: 'c', textSha: 's',
    });
    expect(row).toMatchObject({ verticalId: 'hvac_plumbing', sentiment: null, needsReview: true, themes: [] });
    expect(row!.asked).not.toContain('upsell_pressure');
    expect(row!.asked).toHaveLength(pack.themes.length - 1);
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
  it('stores themes and sentiment per vertical, from redacted text, via review_decisions', async () => {
    const id = await seedReview();
    const ai = createFakeAi({ decide: reviewResult({ themes: ['price_transparency', 'technician_professionalism'], sentiment: 0 }) });
    expect(await analyzeReview({ db: dbs.service, ai, packs }, id)).toEqual({ ran: true, result: { rows: 1 } });
    const [row] = await dbs.owner.select().from(reviewAnalysis);
    expect(row).toMatchObject({
      reviewId: id, verticalId: 'hvac_plumbing', competitorId: IDS.competitorX, themes: ['price_transparency', 'technician_professionalism'], other: false, sentiment: 0, needsReview: false,
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
    await analyzeReview({ db: dbs.service, ai: createFakeAi({ decide: reviewResult({ themes: ['price_transparency'], sentiment: 0 }) }), packs }, id);
    await dbs.service.update(review).set({ text: 'Update: they refunded the fee and apologised. Great follow-up.' }).where(eq(review.id, id));
    const r = await analyzeReview({ db: dbs.service, ai: createFakeAi({ decide: reviewResult({ themes: ['communication'], sentiment: 3 }) }), packs }, id);
    expect(r.ran).toBe(true);
    const rows = await dbs.owner.select().from(reviewAnalysis);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ themes: ['communication'], sentiment: 3 });
  });

  it('writes one row per vertical tracking the competitor', async () => {
    await dbs.owner.insert(clientCompetitor).values({ agencyId: IDS.agencyA, clientId: IDS.clientA2, competitorId: IDS.competitorX });
    const id = await seedReview();
    await analyzeReview({ db: dbs.service, ai: createFakeAi({ decide: reviewResult({ themes: ['upsell_pressure'] }) }), packs }, id);
    const rows = await dbs.owner.select().from(reviewAnalysis);
    expect(rows.map((r) => r.verticalId).sort()).toEqual(['dental', 'hvac_plumbing']);
    expect(rows.every((r) => r.themes.includes('upsell_pressure'))).toBe(true); // both packs have an upsell_pressure theme
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
