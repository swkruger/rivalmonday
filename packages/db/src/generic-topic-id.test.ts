import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';

const dbs = openTestDbs();

const MIGRATIONS = join(__dirname, '../migrations');
const FILE = readdirSync(MIGRATIONS).find((f) => /^\d{4}_generic_topic_id\.sql$/.test(f));
const BLOCKS = FILE ? readFileSync(join(MIGRATIONS, FILE), 'utf8').split('--> statement-breakpoint') : [];
const BACKFILL = BLOCKS.slice(BLOCKS.findIndex((b) => b.includes('-- backfill:start')));

const OLD = 'technician_professionalism';
const NEW = 'staff_professionalism';
const key = (v: string, id: string) => `theme_${v}__${id}`;
const j = (v: unknown) => sql`${JSON.stringify(v)}::jsonb`;
const rows = async <T>(q: ReturnType<typeof sql>) => (await dbs.owner.execute(q)) as unknown as T[];
const one = async <T>(q: ReturnType<typeof sql>): Promise<T> => (await rows<T>(q))[0]!;
const rid = (n: number) => `00000000-0000-4000-8000-00000000e1${String(n).padStart(2, '0')}`;

async function backfill() {
  if (!FILE) throw new Error('migration <N>_generic_topic_id.sql not found');
  for (const s of BACKFILL) await dbs.owner.execute(sql.raw(s));
}
/** Seeds rows with FK triggers off (the rows reference ids that are not worth building). */
async function seedLegacy(fn: (tx: Parameters<Parameters<typeof dbs.owner.transaction>[0]>[0]) => Promise<void>) {
  await dbs.owner.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL session_replication_role = replica`);
    await fn(tx);
  });
}

let savedGeneric: unknown;
beforeAll(async () => {
  savedGeneric = (await one<{ config: unknown }>(sql`SELECT config FROM vertical WHERE id = 'generic'`)).config;
});
afterAll(async () => {
  await dbs.owner.execute(sql`UPDATE vertical SET config = ${j(savedGeneric)} WHERE id = 'generic'`);
  await dbs.closeAll();
});

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  for (const f of ['_gt_keys(jsonb, text[])', '_gt_obj(jsonb, text[])', '_gt_arr(jsonb, text, text)', '_gt_verticals()']) {
    await dbs.owner.execute(sql.raw(`DROP FUNCTION IF EXISTS ${f}`));
  }
  // The pre-migration state: generic still carries the old id.
  await dbs.owner.execute(sql`UPDATE vertical SET config = replace(config::text, ${`"${NEW}"`}, ${`"${OLD}"`})::jsonb WHERE id = 'generic'`);
  await dbs.owner.execute(sql`INSERT INTO vertical (id, name, status, config) VALUES
    ('distillery', 'Distillery', 'unreviewed', '{}'::jsonb),
    ('tv_own', 'Own topics', 'unreviewed', ${j({ topics: [{ id: OLD, name: 'Technician professionalism' }] })})`);
});

describe('migration generic_topic_id', () => {
  it("renames generic's topic and leaves hvac_plumbing's", async () => {
    const before = await one<{ topics: { id: string; name: string }[] }>(sql`SELECT config -> 'topics' AS topics FROM vertical WHERE id = 'generic'`);
    await backfill();
    const after = await one<{ topics: { id: string; name: string }[] }>(sql`SELECT config -> 'topics' AS topics FROM vertical WHERE id = 'generic'`);
    expect(after.topics.map((t) => t.id)).toEqual(before.topics.map((t) => (t.id === OLD ? NEW : t.id)));
    expect(after.topics.find((t) => t.id === NEW)!.name).toBe('Staff professionalism');
    expect(after.topics).toHaveLength(before.topics.length);
    const hvac = await one<{ ids: string[] }>(sql`SELECT jsonb_path_query_array(config, '$.topics[*].id') AS ids FROM vertical WHERE id = 'hvac_plumbing'`);
    expect(hvac.ids).toContain(OLD);
    expect(hvac.ids).not.toContain(NEW);
    const own = await one<{ ids: string[] }>(sql`SELECT jsonb_path_query_array(config, '$.topics[*].id') AS ids FROM vertical WHERE id = 'tv_own'`);
    expect(own.ids).toEqual([OLD]);
  });

  it('rewrites review_analysis for generic and inheriting verticals only', async () => {
    const plain = { asked: ['response_time', OLD], topics: [OLD] };
    const both = { asked: [OLD, NEW], topics: [OLD, NEW] };
    const cases: [number, string, typeof plain][] = [
      [1, 'generic', plain],
      [2, 'distillery', plain],
      [3, 'hvac_plumbing', plain],
      [4, 'tv_own', plain],
      [5, 'generic', both],
    ];
    await seedLegacy(async (tx) => {
      for (const [n, v, a] of cases) {
        await tx.execute(sql`INSERT INTO review_analysis (review_id, vertical_id, competitor_id, text_sha, asked, topics, confidence, analysis_version)
          VALUES (${rid(n)}, ${v}, ${IDS.competitorX}, 's', ${j(a.asked)}, ${j(a.topics)}, 0.9, 1)`);
      }
    });
    await backfill();
    const got = await rows<{ review_id: string; asked: string[]; topics: string[] }>(sql`SELECT review_id, asked, topics FROM review_analysis ORDER BY review_id`);
    const by = Object.fromEntries(got.map((r) => [r.review_id, { asked: r.asked, topics: r.topics }]));
    expect(by[rid(1)]).toEqual({ asked: ['response_time', NEW], topics: [NEW] });
    expect(by[rid(2)]).toEqual({ asked: ['response_time', NEW], topics: [NEW] });
    expect(by[rid(3)]).toEqual(plain);
    expect(by[rid(4)]).toEqual(plain);
    expect(by[rid(5)]).toEqual({ asked: [NEW], topics: [NEW] });
  });

  it('renames proposals; on collision keeps the existing row', async () => {
    const [kept] = await rows<{ id: string }>(sql`INSERT INTO topic_proposal (vertical_id, topic_id, name, description, status, other_count) VALUES
      ('distillery', ${NEW}, 'Existing', 'd', 'rejected', 1) RETURNING id`);
    await dbs.owner.execute(sql`INSERT INTO topic_proposal (vertical_id, topic_id, name, description, status, other_count) VALUES
      ('generic', ${OLD}, 'G', 'd', 'approved', 1),
      ('distillery', ${OLD}, 'Old', 'd', 'approved', 1),
      ('hvac_plumbing', ${OLD}, 'H', 'd', 'approved', 1)`);
    await backfill();
    const got = await rows<{ id: string; vertical_id: string; topic_id: string; name: string }>(
      sql`SELECT id, vertical_id, topic_id, name FROM topic_proposal ORDER BY vertical_id, topic_id`,
    );
    expect(got.map((r) => [r.vertical_id, r.topic_id, r.name])).toEqual([
      ['distillery', NEW, 'Existing'],
      ['generic', NEW, 'G'],
      ['hvac_plumbing', OLD, 'H'],
    ]);
    expect(got[0]!.id).toBe(kept!.id);
  });

  it('renames decision labels; on collision deletes the old label and keeps the existing one', async () => {
    const [s] = await rows<{ id: string }>(sql`INSERT INTO decision_sample (task, reason, state, questions, final_answers)
      VALUES ('review_topics', 'shadow', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb) RETURNING id`);
    const labels: [string, string][] = [
      [key('generic', OLD), 'true'],
      [key('distillery', OLD), 'false'],
      [key('distillery', NEW), 'true'],
      [key('hvac_plumbing', OLD), 'true'],
    ];
    for (const [k, v] of labels) {
      await dbs.owner.execute(sql`INSERT INTO decision_label (sample_id, question_key, value, source, labeled_by) VALUES (${s!.id}, ${k}, ${v}, 'human', 't')`);
    }
    await backfill();
    const got = await rows<{ question_key: string; value: string }>(sql`SELECT question_key, value FROM decision_label ORDER BY question_key`);
    expect(got).toEqual([
      { question_key: key('distillery', NEW), value: 'true' },
      { question_key: key('generic', NEW), value: 'true' },
      { question_key: key('hvac_plumbing', OLD), value: 'true' },
    ]);
  });

  it('renames decision_sample object keys in questions, primary/fallback answers, final answers and needs_review', async () => {
    const g = key('generic', OLD);
    const h = key('hvac_plumbing', OLD);
    const dOld = key('distillery', OLD);
    const dNew = key('distillery', NEW);
    const [full] = await rows<{ id: string }>(sql`INSERT INTO decision_sample (task, reason, state, questions, primary_answers, fallback_answers, final_answers, needs_review)
      VALUES ('review_topics', 'shadow', ${j({ note: OLD })}, ${j({ [g]: 'q', [h]: 'q2' })},
        ${j({ provider: 'jev', answers: { [g]: true, [h]: false } })}, ${j({ provider: 'llm', answers: { [dOld]: true } })},
        ${j({ [dOld]: true, [dNew]: false })}, ${j([g, h])}) RETURNING id`);
    // R2: NULL primary/fallback answers — matches via questions and must not error.
    const [nulls] = await rows<{ id: string }>(sql`INSERT INTO decision_sample (task, reason, state, questions, final_answers, needs_review)
      VALUES ('review_topics', 'review', '{}'::jsonb, ${j({ [g]: 'q' })}, ${j({ [g]: true })}, ${j([g])}) RETURNING id`);
    // R2: NULL primary/fallback answers and nothing to rename — left as is.
    const [other] = await rows<{ id: string }>(sql`INSERT INTO decision_sample (task, reason, state, questions, final_answers)
      VALUES ('review_topics', 'review', '{}'::jsonb, ${j({ [h]: 'q' })}, ${j({ [h]: true })}) RETURNING id`);
    await backfill();
    type Row = { id: string; state: unknown; questions: unknown; primary_answers: unknown; fallback_answers: unknown; final_answers: unknown; needs_review: unknown };
    const got = await rows<Row>(sql`SELECT id, state, questions, primary_answers, fallback_answers, final_answers, needs_review FROM decision_sample`);
    const by = Object.fromEntries(got.map((r) => [r.id, r]));
    const gNew = key('generic', NEW);
    expect(by[full!.id]).toMatchObject({
      state: { note: OLD },
      questions: { [gNew]: 'q', [h]: 'q2' },
      primary_answers: { provider: 'jev', answers: { [gNew]: true, [h]: false } },
      fallback_answers: { provider: 'llm', answers: { [dNew]: true } },
      final_answers: { [dNew]: false },
      needs_review: [gNew, h],
    });
    expect(by[nulls!.id]).toMatchObject({ questions: { [gNew]: 'q' }, primary_answers: null, fallback_answers: null, final_answers: { [gNew]: true }, needs_review: [gNew] });
    expect(by[other!.id]).toMatchObject({ questions: { [h]: 'q' }, primary_answers: null, fallback_answers: null, final_answers: { [h]: true }, needs_review: [] });
  });

  it('renames decision_review keys, answers and resolution', async () => {
    const g = key('generic', OLD);
    const h = key('hvac_plumbing', OLD);
    const gNew = key('generic', NEW);
    const [a] = await rows<{ id: string }>(sql`INSERT INTO decision_review (subject_type, subject_id, keys, answers, resolution)
      VALUES ('detected_change', ${rid(1)}, ${j([g, h])}, ${j({ [g]: true, [h]: false })}, ${j({ [g]: 'true' })}) RETURNING id`);
    // R2: NULL resolution.
    const [b] = await rows<{ id: string }>(sql`INSERT INTO decision_review (subject_type, subject_id, keys, answers)
      VALUES ('detected_change', ${rid(2)}, ${j([g])}, ${j({ [g]: true })}) RETURNING id`);
    const [c] = await rows<{ id: string }>(sql`INSERT INTO decision_review (subject_type, subject_id, keys, answers)
      VALUES ('detected_change', ${rid(3)}, ${j([h])}, ${j({ [h]: true })}) RETURNING id`);
    await backfill();
    const got = await rows<{ id: string; keys: unknown; answers: unknown; resolution: unknown }>(sql`SELECT id, keys, answers, resolution FROM decision_review`);
    const by = Object.fromEntries(got.map((r) => [r.id, { keys: r.keys, answers: r.answers, resolution: r.resolution }]));
    expect(by[a!.id]).toEqual({ keys: [gNew, h], answers: { [gNew]: true, [h]: false }, resolution: { [gNew]: 'true' } });
    expect(by[b!.id]).toEqual({ keys: [gNew], answers: { [gNew]: true }, resolution: null });
    expect(by[c!.id]).toEqual({ keys: [h], answers: { [h]: true }, resolution: null });
  });

  it('renames complaint spikes: detected_change block_key + details.topic, event details.topic', async () => {
    const det = (v: string) => ({ changeType: 'review_spike', topic: OLD, topicName: 'Staff professionalism', verticalId: v, count: 4 });
    await seedLegacy(async (tx) => {
      for (const v of ['distillery', 'hvac_plumbing']) {
        await tx.execute(sql`INSERT INTO detected_change (competitor_id, source, kind, after_capture_id, block_key, stage_version, details)
          VALUES (${IDS.competitorX}, 'google_reviews', 'modified', ${rid(7)}, ${`reviews:complaints:${v}:${OLD}`}, 1, ${j(det(v))})`);
        await tx.execute(sql`INSERT INTO "event" (competitor_id, change_type, summary, confidence, occurred_at, details)
          VALUES (${IDS.competitorX}, 'review_spike', ${v}, 0.9, now(), ${j(det(v))})`);
      }
    });
    await backfill();
    const dc = await rows<{ block_key: string; topic: string }>(sql`SELECT block_key, details ->> 'topic' AS topic FROM detected_change ORDER BY block_key`);
    expect(dc).toEqual([
      { block_key: `reviews:complaints:distillery:${NEW}`, topic: NEW },
      { block_key: `reviews:complaints:hvac_plumbing:${OLD}`, topic: OLD },
    ]);
    const ev = await rows<{ summary: string; topic: string; topic_name: string }>(
      sql`SELECT summary, details ->> 'topic' AS topic, details ->> 'topicName' AS topic_name FROM "event" ORDER BY summary`,
    );
    expect(ev).toEqual([
      { summary: 'distillery', topic: NEW, topic_name: 'Staff professionalism' },
      { summary: 'hvac_plumbing', topic: OLD, topic_name: 'Staff professionalism' },
    ]);
  });

  it('renames model_batch contexts of inheriting verticals only', async () => {
    const items = { generic: { topicIds: [OLD, 'x'] }, distillery: { topicIds: [OLD] }, hvac_plumbing: { topicIds: [OLD] }, tv_own: { topicIds: [OLD] } };
    await dbs.owner.execute(sql`INSERT INTO model_batch (task, provider, provider_batch_id, purpose, items, request_count)
      VALUES ('theme_discovery_batch', 'anthropic', 'b1', 'theme_discovery', ${j(items)}, 4)`);
    await backfill();
    expect((await one<{ items: unknown }>(sql`SELECT items FROM model_batch`)).items).toEqual({
      generic: { topicIds: [NEW, 'x'] },
      distillery: { topicIds: [NEW] },
      hvac_plumbing: { topicIds: [OLD] },
      tv_own: { topicIds: [OLD] },
    });
  });

  it('renames draft_evidence of inheriting verticals and vertical drafts', async () => {
    const ev = { topics: [{ id: OLD }] };
    await dbs.owner.execute(sql`UPDATE vertical SET draft_evidence = ${j(ev)} WHERE id IN ('distillery', 'tv_own')`);
    await dbs.owner.execute(sql`INSERT INTO vertical_draft (place_id, agency_id, draft) VALUES ('p1', ${IDS.agencyA}, ${j(ev)})`);
    await backfill();
    const got = await rows<{ id: string; draft_evidence: unknown }>(sql`SELECT id, draft_evidence FROM vertical WHERE id IN ('distillery', 'tv_own') ORDER BY id`);
    expect(got).toEqual([
      { id: 'distillery', draft_evidence: { topics: [{ id: NEW }] } },
      { id: 'tv_own', draft_evidence: ev },
    ]);
    expect((await one<{ draft: unknown }>(sql`SELECT draft FROM vertical_draft`)).draft).toEqual({ topics: [{ id: NEW }] });
  });

  it('is idempotent', async () => {
    await seedLegacy(async (tx) => {
      await tx.execute(sql`INSERT INTO review_analysis (review_id, vertical_id, competitor_id, text_sha, asked, topics, confidence, analysis_version)
        VALUES (${rid(1)}, 'distillery', ${IDS.competitorX}, 's', ${j([OLD, NEW])}, ${j([OLD])}, 0.9, 1)`);
    });
    await dbs.owner.execute(sql`INSERT INTO decision_sample (task, reason, state, questions, final_answers, needs_review)
      VALUES ('review_topics', 'shadow', '{}'::jsonb, ${j({ [key('generic', OLD)]: 'q' })}, ${j({ [key('generic', OLD)]: true })}, ${j([key('generic', OLD)])})`);
    await dbs.owner.execute(sql`INSERT INTO topic_proposal (vertical_id, topic_id, name, description, status, other_count) VALUES ('distillery', ${OLD}, 'O', 'd', 'approved', 1)`);
    const snapshot = async () => ({
      v: await rows(sql`SELECT id, config FROM vertical ORDER BY id`),
      ra: await rows(sql`SELECT asked, topics FROM review_analysis`),
      ds: await rows(sql`SELECT questions, final_answers, needs_review FROM decision_sample`),
      tp: await rows(sql`SELECT vertical_id, topic_id FROM topic_proposal`),
    });
    await backfill();
    const first = await snapshot();
    await backfill();
    expect(await snapshot()).toEqual(first);
    expect(first.ra).toEqual([{ asked: [NEW], topics: [NEW] }]);
    expect(first.tp).toEqual([{ vertical_id: 'distillery', topic_id: NEW }]);
  });

  it('drops its helper functions', async () => {
    await backfill();
    const fns = await rows<{ proname: string }>(sql`SELECT proname FROM pg_proc WHERE proname IN ('_gt_verticals', '_gt_arr', '_gt_obj', '_gt_keys')`);
    expect(fns).toEqual([]);
  });
});
