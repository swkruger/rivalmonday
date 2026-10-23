import { client, clientCompetitor, competitor, review, reviewAnalysis, topicProposal, vertical } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { sha256Hex } from '@cs/collectors';
import { createMemoryStore } from '@cs/storage';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createFakeAi, type DecideFn, reviewResult } from '../../test/fake-ai';
import { drainEngine } from '../drain';
import { findEngineWork } from '../sweep';
import { createPackLoader, type PackLoader } from '../tag/tag-stage';
import { analyzeReview, otherKey, reaskReview, themeKey } from './topics';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const MIN = 60_000;
const DAY = 86_400_000;
const minsAgo = (m: number) => new Date(Date.now() - m * MIN);
const base = createPackLoader();
/** `roofing` is a catalogue vertical without its own topics: it inherits generic's list. */
const packs: PackLoader = async (id) => (id === 'roofing' ? { ...(await base('generic')), id: 'roofing', name: 'Roofing' } : base(id));
const WARRANTY = themeKey('hvac_plumbing', 'warranty_claims');
const CLIENT_C3 = '00000000-0000-4000-8000-0000000000c3';

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  // The catalogue seed stamps updated_at = now(); move it well before every analysis so only explicit edits count.
  await dbs.owner.execute(sql`UPDATE vertical SET updated_at = now() - interval '1 day'`);
});

let n = 0;
async function seedReview(over: Partial<typeof review.$inferInsert> = {}) {
  const [r] = await dbs.service
    .insert(review)
    .values({ competitorId: IDS.competitorX, dedupeKey: `ra:${n++}`, rating: 2, text: 'Thanks Mike! The warranty repair was refused and the tech was rude.', postedAt: minsAgo(10 * 24 * 60), ...over })
    .returning({ id: review.id });
  return r!.id;
}

/** Runs the first analysis, then backdates it so later approvals/edits are strictly newer. */
async function analyse(id: string, input: Parameters<typeof reviewResult>[0] = {}, analysedMinsAgo = 60) {
  await analyzeReview({ db: dbs.service, ai: createFakeAi({ decide: reviewResult(input) }), packs }, id);
  await dbs.owner.execute(sql`UPDATE review_analysis SET analyzed_at = ${minsAgo(analysedMinsAgo).toISOString()}::timestamptz WHERE review_id = ${id}::uuid`);
}

async function approve(verticalId: string, topicId: string, decidedMinsAgo = 30) {
  await dbs.owner.insert(topicProposal).values({
    verticalId, topicId, name: 'Warranty claims', description: 'Whether warranty repairs are honoured', status: 'approved', otherCount: 20, decidedAt: minsAgo(decidedMinsAgo), decidedBy: 'am',
  });
}

async function editVertical(id: string, editedMinsAgo = 30) {
  await dbs.owner.execute(sql`UPDATE vertical SET updated_at = ${minsAgo(editedMinsAgo).toISOString()}::timestamptz WHERE id = ${id}`);
}

async function addCompetitor(name: string) {
  const [c] = await dbs.owner.insert(competitor).values({ name, domain: `${name.toLowerCase()}.example` }).returning({ id: competitor.id });
  return c!.id;
}

const track = (clientId: string, competitorId: string) => dbs.owner.insert(clientCompetitor).values({ agencyId: IDS.agencyA, clientId, competitorId });
const untrack = (clientId: string, competitorId: string) =>
  dbs.owner.delete(clientCompetitor).where(and(eq(clientCompetitor.clientId, clientId), eq(clientCompetitor.competitorId, competitorId)));

/** A roofing client (C3, inherits generic topics) tracking a new competitor Z. */
async function addRoofing() {
  await dbs.owner.insert(vertical).values({ id: 'roofing', name: 'Roofing', status: 'reviewed', config: {}, updatedAt: minsAgo(DAY / MIN) });
  await dbs.owner.insert(client).values({ id: CLIENT_C3, agencyId: IDS.agencyA, name: 'C3 Roofing', verticalId: 'roofing' });
  const z = await addCompetitor('Zeta');
  await track(CLIENT_C3, z);
  return z;
}

const sweep = async (opts: { reaskDailyMax?: number } = {}) => (await findEngineWork(dbs.service, { limit: 50, ...opts })).reask;
const reask = (id: string, decide: DecideFn = reviewResult({})) => {
  const ai = createFakeAi({ decide });
  return { ai, run: reaskReview({ db: dbs.service, ai, packs }, id) };
};
async function rowOf(reviewId: string, verticalId: string) {
  const [r] = await dbs.owner.select().from(reviewAnalysis).where(and(eq(reviewAnalysis.reviewId, reviewId), eq(reviewAnalysis.verticalId, verticalId)));
  return r!;
}
async function setChecked(reviewId: string, at: Date) {
  await dbs.owner.execute(sql`UPDATE review_analysis SET checked_at = ${at.toISOString()}::timestamptz WHERE review_id = ${reviewId}::uuid`);
}

describe('re-ask (15b-3b §5)', () => {
  it('approving a topic re-asks older analysed reviews once, with only that question', async () => {
    const r1 = await seedReview();
    const r2 = await seedReview();
    await analyse(r1);
    await analyse(r2);
    expect(await sweep()).toEqual([]);
    await approve('hvac_plumbing', 'warranty_claims');
    expect((await sweep()).sort()).toEqual([r1, r2].sort());
    const { ai, run } = reask(r1, reviewResult({ topics: ['warranty_claims'] }));
    expect(await run).toEqual({ ran: true, questions: 1, rows: 1 });
    expect(ai.calls.decide).toHaveLength(1);
    expect(ai.calls.decide[0]!.task).toBe('review_decisions');
    expect(Object.keys(ai.calls.decide[0]!.questions)).toEqual([WARRANTY]);
    expect(ai.calls.decide[0]!.scope).toMatchObject({ verticalId: 'hvac_plumbing' });
    const state = JSON.stringify(ai.calls.decide[0]!.state);
    expect(state).not.toContain('Mike');
    expect(state).toContain('HVAC');
    const row = await rowOf(r1, 'hvac_plumbing');
    expect(row.asked).toHaveLength(9);
    expect(row.asked.at(-1)).toBe('warranty_claims');
    expect(row.topics).toContain('warranty_claims');
    expect(row.checkedAt).not.toBeNull();
    expect(await sweep()).toEqual([r2]);
  });

  it('a second sweep selects nothing', async () => {
    const r1 = await seedReview();
    const r2 = await seedReview();
    await analyse(r1);
    await analyse(r2);
    await approve('hvac_plumbing', 'warranty_claims');
    const deps = { db: dbs.service, store: createMemoryStore(), ai: createFakeAi({ decide: reviewResult({ topics: ['warranty_claims'] }) }), packs, generic: () => base('generic') };
    expect(await drainEngine(deps)).toMatchObject({ reviews: 0, reasked: 2, errors: 0 });
    expect(await sweep()).toEqual([]);
    expect(await drainEngine(deps)).toMatchObject({ reasked: 0, errors: 0 });
    expect((deps.ai as ReturnType<typeof createFakeAi>).calls.decide).toHaveLength(2);
  });

  it('a below-τ answer is not retried', async () => {
    const r = await seedReview();
    await analyse(r);
    await approve('hvac_plumbing', 'warranty_claims');
    const { run } = reask(r, reviewResult({ topics: ['warranty_claims'], needsReview: [WARRANTY] }));
    expect(await run).toMatchObject({ ran: true, questions: 1 });
    const row = await rowOf(r, 'hvac_plumbing');
    expect(row.asked).not.toContain('warranty_claims');
    expect(row.topics).not.toContain('warranty_claims');
    expect(row.needsReview).toBe(true);
    expect(row.checkedAt).not.toBeNull();
    expect(await sweep()).toEqual([]);
  });

  it('topics left below τ earlier are not re-asked on deploy', async () => {
    await approve('hvac_plumbing', 'warranty_claims', 120);
    const r = await seedReview();
    await analyse(r, { needsReview: [WARRANTY] }); // the first analysis asked it, below τ
    const before = await rowOf(r, 'hvac_plumbing');
    expect(before.asked).not.toContain('warranty_claims');
    expect(before.checkedAt).toBeNull();
    expect(await sweep()).toEqual([]);
    const { ai, run } = reask(r);
    expect(await run).toMatchObject({ ran: true, questions: 0 });
    expect(ai.calls.decide).toHaveLength(0);
  });

  it('a vertical edit re-asks its missing seed topics once', async () => {
    const r = await seedReview();
    const missing = themeKey('hvac_plumbing', 'response_time');
    await analyse(r, { needsReview: [missing] });
    expect(await sweep()).toEqual([]);
    await editVertical('hvac_plumbing');
    expect(await sweep()).toEqual([r]);
    const { ai, run } = reask(r, reviewResult({ topics: ['response_time'] }));
    expect(await run).toMatchObject({ ran: true, questions: 1 });
    expect(Object.keys(ai.calls.decide[0]!.questions)).toEqual([missing]);
    expect((await rowOf(r, 'hvac_plumbing')).asked).toContain('response_time');
    expect(await sweep()).toEqual([]);
  });

  it('an edit with every seed topic already asked selects nothing', async () => {
    const r = await seedReview();
    await analyse(r);
    await editVertical('hvac_plumbing');
    expect(await sweep()).toEqual([]);
    const { ai, run } = reask(r);
    expect(await run).toMatchObject({ ran: true, questions: 0, rows: 1 });
    expect(ai.calls.decide).toHaveLength(0);
  });

  it('a generic edit re-asks an inheriting vertical, not hvac_plumbing', async () => {
    const z = await addRoofing();
    const rz = await seedReview({ competitorId: z });
    const rx = await seedReview();
    await analyse(rz, { needsReview: [themeKey('roofing', 'response_time')] });
    await analyse(rx, { needsReview: [themeKey('hvac_plumbing', 'response_time')] });
    expect(await sweep()).toEqual([]);
    await editVertical('generic');
    expect(await sweep()).toEqual([rz]);
    const { ai, run } = reask(rz);
    expect(await run).toMatchObject({ ran: true, questions: 1 });
    expect(Object.keys(ai.calls.decide[0]!.questions)).toEqual([themeKey('roofing', 'response_time')]);
    expect((await reask(rx).run).questions).toBe(0);
    expect(await sweep()).toEqual([]);
  });

  it('a competitor gaining a vertical gets full rows for that vertical only', async () => {
    const r = await seedReview();
    await analyse(r, { topics: ['price_transparency'], sentiment: 1 });
    const hvacBefore = await rowOf(r, 'hvac_plumbing');
    await track(IDS.clientA2, IDS.competitorX); // dental now tracks X too
    expect(await sweep()).toEqual([r]);
    const { ai, run } = reask(r, reviewResult({ topics: ['wait_time'], sentiment: 0, other: true }));
    expect(await run).toMatchObject({ ran: true, rows: 2 });
    const keys = Object.keys(ai.calls.decide[0]!.questions);
    expect(keys).toContain('sentiment');
    expect(keys).toContain(otherKey('dental'));
    expect(keys).toContain(themeKey('dental', 'wait_time'));
    expect(keys.some((k) => k.includes('hvac_plumbing'))).toBe(false);
    expect(ai.calls.decide[0]!.scope).toMatchObject({ verticalId: 'dental' });
    expect(JSON.stringify(ai.calls.decide[0]!.state)).toContain(' / '); // business_type lists both verticals
    const dental = await rowOf(r, 'dental');
    expect(dental).toMatchObject({ competitorId: IDS.competitorX, topics: ['wait_time'], other: true, sentiment: 0, needsReview: false, analysisVersion: 1 });
    expect(dental.checkedAt).not.toBeNull();
    const hvacAfter = await rowOf(r, 'hvac_plumbing');
    expect({ ...hvacAfter, checkedAt: null }).toEqual(hvacBefore);
    expect(hvacAfter.checkedAt).not.toBeNull();
    expect(await sweep()).toEqual([]);
  });

  it('a stale row of a re-tracked vertical is replaced by a full analysis of the current text', async () => {
    await track(IDS.clientA2, IDS.competitorX); // X tracked by hvac and dental
    const r = await seedReview();
    await analyse(r, { sentiment: 1, needsReview: [themeKey('dental', 'wait_time')] });
    const stale = await rowOf(r, 'dental');
    await untrack(IDS.clientA2, IDS.competitorX);
    await dbs.service.update(review).set({ text: 'Edited: the dentist called back and fixed the bill.' }).where(eq(review.id, r));
    await analyse(r, {}, 60); // only hvac is current: dental keeps the old text's row
    await track(IDS.clientA2, IDS.competitorX);
    await editVertical('dental'); // a trigger, so the sweep offers it
    expect(await sweep()).toEqual([r]);
    const { ai, run } = reask(r, reviewResult({ topics: ['wait_time'], sentiment: 4, other: true }));
    expect(await run).toMatchObject({ ran: true, rows: 2 });
    const keys = Object.keys(ai.calls.decide[0]!.questions);
    expect(keys).toContain('sentiment');
    expect(keys).toContain(otherKey('dental'));
    expect(keys.some((k) => k.includes('hvac_plumbing'))).toBe(false);
    const fresh = await rowOf(r, 'dental');
    expect(fresh.textSha).not.toBe(stale.textSha);
    expect(fresh).toMatchObject({ sentiment: 4, other: true, topics: ['wait_time'], needsReview: false });
    expect(fresh.asked).toContain('wait_time');
    expect(fresh.checkedAt).not.toBeNull();
    expect(fresh.analyzedAt.getTime()).toBeGreaterThan(stale.analyzedAt.getTime());
    expect(await sweep()).toEqual([]);
  });

  it("the sweep's SQL text hash equals sha256Hex (stale-row check)", async () => {
    const text = 'Caf\u00e9 \u201cgreat\u201d \u2014 na\u00efve \u{1F44D} service\nline two';
    const r = await seedReview({ text });
    const [row] = (await dbs.owner.execute(sql`SELECT encode(sha256(convert_to(text, 'UTF8')), 'hex') AS h FROM review WHERE id = ${r}::uuid`)) as unknown as { h: string }[];
    expect(row!.h).toBe(sha256Hex(text));
  });

  it('(a) keeps analyzed_at, sentiment, other, analysis_version', async () => {
    const r = await seedReview();
    await analyse(r, { topics: ['price_transparency'], sentiment: 1, other: false });
    const before = await rowOf(r, 'hvac_plumbing');
    await approve('hvac_plumbing', 'warranty_claims');
    await reask(r, reviewResult({ topics: ['warranty_claims'], sentiment: 4, other: true, confidence: 0.9 })).run;
    const after = await rowOf(r, 'hvac_plumbing');
    expect(after.analyzedAt).toEqual(before.analyzedAt);
    expect(after).toMatchObject({ sentiment: 1, other: false, analysisVersion: before.analysisVersion, textSha: before.textSha, confidence: 0.9, needsReview: false });
    expect(after.topics).toEqual(['price_transparency', 'warranty_claims']);
    expect(after.asked).toEqual([...before.asked, 'warranty_claims']);
  });

  it('a text edit between read and write leaves the row alone', async () => {
    const r = await seedReview();
    await analyse(r);
    const before = await rowOf(r, 'hvac_plumbing');
    await approve('hvac_plumbing', 'warranty_claims');
    const editing: DecideFn = async (state, questions) => {
      await dbs.service.update(review).set({ text: 'Edited later: they honoured the warranty in the end.' }).where(eq(review.id, r));
      return reviewResult({ topics: ['warranty_claims'] })(state, questions);
    };
    expect(await reask(r, editing).run).toEqual({ ran: true, questions: 1, rows: 0 });
    expect(await rowOf(r, 'hvac_plumbing')).toEqual(before);
  });

  it('reviews older than 180 days are skipped', async () => {
    const r = await seedReview({ postedAt: minsAgo(200 * 24 * 60) });
    await analyse(r);
    await approve('hvac_plumbing', 'warranty_claims');
    expect(await sweep()).toEqual([]);
    const { ai, run } = reask(r);
    expect(await run).toEqual({ ran: false, questions: 0, rows: 0 });
    expect(ai.calls.decide).toHaveLength(0);
  });

  it('re-ask waits while new reviews are pending', async () => {
    const old = await seedReview();
    await analyse(old);
    await approve('hvac_plumbing', 'warranty_claims');
    const fresh = await seedReview();
    const w = await findEngineWork(dbs.service, { limit: 50 });
    expect(w.reviews).toEqual([fresh]);
    expect(w.reask).toEqual([]);
    await analyzeReview({ db: dbs.service, ai: createFakeAi({ decide: reviewResult({}) }), packs }, fresh);
    expect(await sweep()).toEqual([old]); // fresh was analysed after the approval: no gap
  });

  it('the daily cap is honoured', async () => {
    const [a, b, c] = [await seedReview(), await seedReview(), await seedReview()];
    for (const id of [a, b, c]) await analyse(id);
    await approve('hvac_plumbing', 'warranty_claims');
    expect(await sweep({ reaskDailyMax: 2 })).toHaveLength(2);
    await setChecked(a, new Date());
    await setChecked(b, new Date());
    expect(await sweep({ reaskDailyMax: 2 })).toEqual([]); // two reviews checked today = cap reached
    const startOfDay = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
    await setChecked(b, new Date(startOfDay.getTime() - 60 * MIN)); // yesterday's check doesn't count
    const w = await sweep({ reaskDailyMax: 2 });
    expect(w).toHaveLength(1);
    expect([b, c]).toContain(w[0]);
    expect((await sweep()).sort()).toEqual([b, c].sort());
  });

  it('a throwing decide leaves checked_at null and the review is offered again', async () => {
    const r = await seedReview();
    await analyse(r);
    await approve('hvac_plumbing', 'warranty_claims');
    await expect(reask(r, () => { throw new Error('jev and llm down'); }).run).rejects.toThrow(/down/);
    expect((await rowOf(r, 'hvac_plumbing')).checkedAt).toBeNull();
    expect(await sweep()).toEqual([r]);
  });

  it('sweep candidates equal reviews with a non-empty JS gap', async () => {
    const z = await addRoofing();
    const w = await addCompetitor('Wren');
    await track(IDS.clientA1, w);
    const v = await addCompetitor('Vale');
    await track(IDS.clientA1, v);
    await track(IDS.clientA2, v);
    const waitTime = themeKey('dental', 'wait_time');

    const approvedAfter = await seedReview(); // analysed before the approval → (a)
    await analyse(approvedAfter, {}, 60);
    await approve('hvac_plumbing', 'warranty_claims', 30);
    const approvedBefore = await seedReview(); // analysed after the approval, left below τ → none
    await analyse(approvedBefore, { needsReview: [WARRANTY] }, 10);
    const editMissing = await seedReview({ competitorId: IDS.competitorY }); // dental edit, a seed topic missing → (a)
    await analyse(editMissing, { needsReview: [waitTime] }, 60);
    const editComplete = await seedReview({ competitorId: IDS.competitorY }); // dental edit, every seed asked → none
    await analyse(editComplete, {}, 60);
    const inheriting = await seedReview({ competitorId: z }); // generic edit reaches roofing → (a)
    await analyse(inheriting, { needsReview: [themeKey('roofing', 'response_time')] }, 60);
    const newVertical = await seedReview({ competitorId: w }); // W later gains dental → (b)
    await analyse(newVertical, {}, 10);
    const removed = await seedReview({ competitorId: v }); // dental row has a gap, but dental no longer tracks V → none
    await analyse(removed, { needsReview: [waitTime] }, 60);
    const u = await addCompetitor('Umber'); // stale row of a re-tracked vertical → asked once (R5)
    await track(IDS.clientA1, u);
    await track(IDS.clientA2, u);
    const t = await addCompetitor('Teal'); // stale row of a re-tracked vertical, no trigger at all → still asked once (R5)
    await track(IDS.clientA1, t);
    await track(IDS.clientA2, t);
    const staleQuiet = await seedReview({ competitorId: t });
    await analyse(staleQuiet, {}, 10); // every seed asked, analysed after every edit and approval
    await untrack(IDS.clientA2, t);
    await dbs.service.update(review).set({ text: 'Edited: quiet update, still a fine visit.' }).where(eq(review.id, staleQuiet));
    await analyzeReview({ db: dbs.service, ai: createFakeAi({ decide: reviewResult({}) }), packs }, staleQuiet);
    await track(IDS.clientA2, t);
    const staleRow = await seedReview({ competitorId: u });
    await analyse(staleRow, { needsReview: [waitTime] }, 60);
    await untrack(IDS.clientA2, u);
    await dbs.service.update(review).set({ text: 'Edited: they made it right in the end.' }).where(eq(review.id, staleRow));
    await analyzeReview({ db: dbs.service, ai: createFakeAi({ decide: reviewResult({}) }), packs }, staleRow); // hvac only; dental keeps its 60-min-old stale row
    await track(IDS.clientA2, u);
    await editVertical('dental', 30);
    await editVertical('generic', 30);
    await track(IDS.clientA2, w);
    await untrack(IDS.clientA2, v);

    const swept = (await sweep()).sort();
    expect(swept).toEqual([approvedAfter, editMissing, inheriting, newVertical, staleRow, staleQuiet].sort());
    const jsGap: string[] = [];
    for (const id of [approvedAfter, approvedBefore, editMissing, editComplete, inheriting, newVertical, removed, staleRow, staleQuiet]) {
      if ((await reask(id).run).questions > 0) jsGap.push(id);
    }
    expect(jsGap.sort()).toEqual(swept);
    expect(await sweep()).toEqual([]);
  });
});
