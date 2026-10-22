import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { IDS, errorText, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const BLOCKS = readFileSync(join(__dirname, '../migrations/0084_topic_rename.sql'), 'utf8').split('--> statement-breakpoint');
const BACKFILL = BLOCKS.slice(BLOCKS.findIndex((b) => b.includes('-- backfill:start')));

const j = (v: unknown) => sql`${JSON.stringify(v)}::jsonb`;
async function backfill() {
  for (const s of BACKFILL) await dbs.owner.execute(sql.raw(s));
}
/** Seeds legacy-shaped rows with FK triggers off (the rows reference ids that are not worth building). */
async function seedLegacy(fn: (tx: Parameters<Parameters<typeof dbs.owner.transaction>[0]>[0]) => Promise<void>) {
  await dbs.owner.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL session_replication_role = replica`);
    await fn(tx);
  });
}
const one = async <T>(q: ReturnType<typeof sql>): Promise<T> => ((await dbs.owner.execute(q)) as unknown as T[])[0]!;
const rid = (n: number) => `00000000-0000-4000-8000-00000000e0${String(n).padStart(2, '0')}`;

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.execute(sql`DROP FUNCTION IF EXISTS topic_rename_ids(text)`);
});

describe('migration 0084 topic rename', () => {
  it('renames theme_proposal objects', async () => {
    const rel = (await dbs.owner.execute(
      sql`SELECT relname, relrowsecurity AS rls, relforcerowsecurity AS force FROM pg_class WHERE relname LIKE 'topic_proposal%' OR relname LIKE 'theme_proposal%'`,
    )) as unknown as { relname: string; rls: boolean; force: boolean }[];
    expect(rel.map((r) => r.relname).sort()).toEqual([
      'topic_proposal',
      'topic_proposal_live_unique',
      'topic_proposal_pending_unique',
      'topic_proposal_pkey',
      'topic_proposal_vertical_idx',
    ]);
    const t = rel.find((r) => r.relname === 'topic_proposal')!;
    expect([t.rls, t.force]).toEqual([true, true]);
    const cols = (await dbs.owner.execute(
      sql`SELECT table_name, column_name FROM information_schema.columns WHERE (table_name = 'topic_proposal' AND column_name IN ('topic_id','theme_id')) OR (table_name = 'review_analysis' AND column_name IN ('topics','themes'))`,
    )) as unknown as { table_name: string; column_name: string }[];
    expect(cols.map((c) => `${c.table_name}.${c.column_name}`).sort()).toEqual(['review_analysis.topics', 'topic_proposal.topic_id']);
    const con = (await dbs.owner.execute(sql`SELECT conname FROM pg_constraint WHERE conrelid = 'topic_proposal'::regclass AND contype = 'p'`)) as unknown as { conname: string }[];
    expect(con.map((c) => c.conname)).toEqual(['topic_proposal_pkey']);
  });

  it('backfills vertical config, draft and draft_evidence', async () => {
    const pack = {
      themes: [{ id: 'wait_time', description: 'themes customers mention' }],
      self_rules: [{ id: 'theme_weakness', playbook: 'fix_theme' }],
      playbooks: [{ id: 'fix_theme', trigger: 'theme_weakness', template: 'fix {{theme}} now' }],
      description: 'themes customers mention',
    };
    await dbs.owner.execute(sql`INSERT INTO vertical (id, name, status, config, draft_evidence) VALUES ('tv_one', 'Topic One', 'reviewed', ${j(pack)}, ${j(pack)})`);
    await dbs.owner.execute(sql`INSERT INTO vertical_draft (place_id, agency_id, draft) VALUES ('p1', ${IDS.agencyA}, ${j(pack)})`);
    await backfill();
    const expected = {
      topics: [{ id: 'wait_time', description: 'themes customers mention' }],
      self_rules: [{ id: 'topic_weakness', playbook: 'fix_topic' }],
      playbooks: [{ id: 'fix_topic', trigger: 'topic_weakness', template: 'fix {{topic}} now' }],
      description: 'themes customers mention',
    };
    const v = await one<{ config: unknown; draft_evidence: unknown }>(sql`SELECT config, draft_evidence FROM vertical WHERE id = 'tv_one'`);
    const d = await one<{ draft: unknown }>(sql`SELECT draft FROM vertical_draft WHERE place_id = 'p1'`);
    expect(v.config).toEqual(expected);
    expect(v.draft_evidence).toEqual(expected);
    expect(d.draft).toEqual(expected);
    expect(v.config).not.toHaveProperty('themes');
  });

  it('backfills runbook items and their snapshots', async () => {
    await dbs.owner.execute(sql`INSERT INTO runbook (id, level) VALUES (${rid(1)}, 'platform')`);
    await dbs.owner.execute(sql`INSERT INTO runbook (id, level, agency_id) VALUES (${rid(2)}, 'agency', ${IDS.agencyA})`);
    const snap = { id: 'fix_theme', template: 'fix {{theme}}', trigger: 'theme_weakness' };
    await dbs.owner.execute(sql`INSERT INTO runbook_item (runbook_id, item_key, kind, content, updated_by) VALUES
      (${rid(1)}, 'self_rule:theme_weakness', 'self_rule', ${j({ id: 'theme_weakness', playbook: 'fix_theme' })}, 't'),
      (${rid(1)}, 'play:fix_theme', 'play', ${j(snap)}, 't'),
      (${rid(1)}, 'knob:other', 'knob', ${j({ v: 1 })}, 't')`);
    await dbs.owner.execute(sql`INSERT INTO runbook_item (runbook_id, item_key, kind, content, upstream_snapshot, updated_by) VALUES
      (${rid(2)}, 'self_rule:theme_strength', 'self_rule', ${j({ id: 'theme_strength' })}, ${j(snap)}, 't')`);
    await backfill();
    const rows = (await dbs.owner.execute(sql`SELECT item_key, content, upstream_snapshot FROM runbook_item ORDER BY item_key`)) as unknown as {
      item_key: string;
      content: unknown;
      upstream_snapshot: unknown;
    }[];
    const byKey = Object.fromEntries(rows.map((r) => [r.item_key, r]));
    expect(Object.keys(byKey).sort()).toEqual(['knob:other', 'play:fix_topic', 'self_rule:topic_strength', 'self_rule:topic_weakness']);
    expect(byKey['play:fix_topic']!.content).toEqual({ id: 'fix_topic', template: 'fix {{topic}}', trigger: 'topic_weakness' });
    expect(byKey['self_rule:topic_weakness']!.content).toEqual({ id: 'topic_weakness', playbook: 'fix_topic' });
    expect(byKey['self_rule:topic_strength']!.upstream_snapshot).toEqual({ id: 'fix_topic', template: 'fix {{topic}}', trigger: 'topic_weakness' });
    expect(byKey['knob:other']!.content).toEqual({ v: 1 });
  });

  it('backfills playbook_override, brief_item, recommendation', async () => {
    await dbs.owner.execute(sql`INSERT INTO playbook_override (agency_id, vertical_id, playbook_id, template, updated_by) VALUES
      (${IDS.agencyA}, 'hvac_plumbing', 'fix_theme', 'fix {{theme}}', 't'), (${IDS.agencyA}, 'hvac_plumbing', 'other', NULL, 't')`);
    await seedLegacy(async (tx) => {
      await tx.execute(sql`INSERT INTO brief_item (brief_id, agency_id, client_id, ord, competitor_id, headline, what_changed, why_it_matters, recommended_action, confidence, effort, impact, playbook_id)
        VALUES (${rid(5)}, ${IDS.agencyA}, ${IDS.clientA1}, 0, ${IDS.competitorX}, 'h', 'w', 'y', 'a', 0.9, 'M', 'M', 'fix_theme')`);
      await tx.execute(sql`INSERT INTO recommendation (agency_id, client_id, title, rationale, effort, impact, owner, source, playbook_id)
        VALUES (${IDS.agencyA}, ${IDS.clientA1}, 't', 'r', 'M', 'M', 'agency', 'brief', 'fix_theme')`);
    });
    await backfill();
    const po = (await dbs.owner.execute(sql`SELECT playbook_id, template FROM playbook_override ORDER BY playbook_id`)) as unknown as { playbook_id: string; template: string | null }[];
    expect(po).toEqual([
      { playbook_id: 'fix_topic', template: 'fix {{topic}}' },
      { playbook_id: 'other', template: null },
    ]);
    expect((await one<{ playbook_id: string }>(sql`SELECT playbook_id FROM brief_item`)).playbook_id).toBe('fix_topic');
    expect((await one<{ playbook_id: string }>(sql`SELECT playbook_id FROM recommendation`)).playbook_id).toBe('fix_topic');
  });

  it('backfills complaint details in detected_change and event', async () => {
    const old = { theme: 'wait_time', themeName: 'Wait time', count: 3 };
    await seedLegacy(async (tx) => {
      await tx.execute(sql`INSERT INTO detected_change (competitor_id, source, kind, after_capture_id, block_key, stage_version, details) VALUES
        (${IDS.competitorX}, 'review', 'added', ${rid(7)}, 'a', 1, ${j(old)}), (${IDS.competitorX}, 'review', 'added', ${rid(7)}, 'b', 1, ${j({ count: 1 })})`);
      await tx.execute(sql`INSERT INTO "event" (competitor_id, change_type, summary, confidence, occurred_at, details) VALUES
        (${IDS.competitorX}, 'complaint_spike', 's1', 0.9, now(), ${j(old)}), (${IDS.competitorX}, 'complaint_spike', 's2', 0.9, now(), ${j({ count: 1 })})`);
    });
    await backfill();
    const dc = (await dbs.owner.execute(sql`SELECT details FROM detected_change ORDER BY block_key`)) as unknown as { details: unknown }[];
    expect(dc.map((r) => r.details)).toEqual([{ topic: 'wait_time', topicName: 'Wait time', count: 3 }, { count: 1 }]);
    const ev = (await dbs.owner.execute(sql`SELECT details FROM "event" ORDER BY summary`)) as unknown as { details: unknown }[];
    expect(ev.map((r) => r.details)).toEqual([{ topic: 'wait_time', topicName: 'Wait time', count: 3 }, { count: 1 }]);
  });

  it('backfills move facts and model_batch contexts', async () => {
    await seedLegacy(async (tx) => {
      await tx.execute(sql`INSERT INTO move (agency_id, client_id, competitor_id, move_type, status, confidence, summary, rule_version, last_held_at, last_evidence_at, details)
        VALUES (${IDS.agencyA}, ${IDS.clientA1}, ${IDS.competitorX}, 'm', 'open', 0.9, 's', 1, now(), now(), ${j({ eventCount: 1, channels: [], facts: { theme: 'wait_time', n: 2 } })})`);
    });
    await dbs.owner.execute(sql`INSERT INTO model_batch (task, provider, provider_batch_id, purpose, items, request_count)
      VALUES ('theme_discovery', 'anthropic', 'b1', 'theme_discovery', ${j({ c1: { themeIds: ['a'], verticalId: 'v' }, c2: { other: 1 } })}, 2)`);
    await backfill();
    expect((await one<{ details: unknown }>(sql`SELECT details FROM move`)).details).toEqual({ eventCount: 1, channels: [], facts: { topic: 'wait_time', n: 2 } });
    const b = await one<{ items: unknown; purpose: string }>(sql`SELECT items, purpose FROM model_batch`);
    expect(b.items).toEqual({ c1: { topicIds: ['a'], verticalId: 'v' }, c2: { other: 1 } });
    expect(b.purpose).toBe('theme_discovery');
  });

  it('leaves C7 keys alone', async () => {
    const [s] = (await dbs.owner.execute(sql`INSERT INTO decision_sample (task, reason, state, questions, final_answers)
      VALUES ('theme_discovery', 'shadow', ${j({ s: 1 })}, ${j({ theme_dental__wait_time: 'q' })}, ${j({ theme_dental__wait_time: true })}) RETURNING id`)) as unknown as { id: string }[];
    await dbs.owner.execute(sql`INSERT INTO decision_label (sample_id, question_key, value, source, labeled_by) VALUES (${s!.id}, 'theme_dental__wait_time', 'true', 'human', 't')`);
    await backfill();
    const d = await one<{ questions: unknown; final_answers: unknown }>(sql`SELECT questions, final_answers FROM decision_sample`);
    expect(d.questions).toEqual({ theme_dental__wait_time: 'q' });
    expect(d.final_answers).toEqual({ theme_dental__wait_time: true });
    expect((await one<{ question_key: string }>(sql`SELECT question_key FROM decision_label`)).question_key).toBe('theme_dental__wait_time');
  });

  it('is idempotent', async () => {
    await dbs.owner.execute(sql`INSERT INTO vertical (id, name, status, config) VALUES ('tv_two', 'Topic Two', 'reviewed', ${j({ themes: [1], self_rules: [{ id: 'theme_weakness' }] })})`);
    await dbs.owner.execute(sql`INSERT INTO runbook (id, level) VALUES (${rid(1)}, 'platform')`);
    await dbs.owner.execute(sql`INSERT INTO runbook_item (runbook_id, item_key, kind, content, updated_by) VALUES (${rid(1)}, 'self_rule:theme_weakness', 'self_rule', ${j({ id: 'theme_weakness' })}, 't')`);
    await dbs.owner.execute(sql`INSERT INTO model_batch (task, provider, provider_batch_id, purpose, items, request_count) VALUES ('t', 'p', 'b2', 'theme_discovery', ${j({ c1: { themeIds: ['a'] } })}, 1)`);
    const snapshot = async () => ({
      v: await one(sql`SELECT config FROM vertical WHERE id = 'tv_two'`),
      r: await one(sql`SELECT item_key, content FROM runbook_item`),
      b: await one(sql`SELECT items FROM model_batch`),
    });
    await backfill();
    const first = await snapshot();
    await backfill();
    expect(await snapshot()).toEqual(first);
    expect(first.v).toEqual({ config: { topics: [1], self_rules: [{ id: 'topic_weakness' }] } });
  });

  it('refuses when old and new ids both exist', async () => {
    await dbs.owner.execute(sql`INSERT INTO runbook (id, level) VALUES (${rid(1)}, 'platform')`);
    await dbs.owner.execute(sql`INSERT INTO runbook_item (runbook_id, item_key, kind, content, updated_by) VALUES
      (${rid(1)}, 'self_rule:theme_weakness', 'self_rule', '{}'::jsonb, 't'), (${rid(1)}, 'self_rule:topic_weakness', 'self_rule', '{}'::jsonb, 't')`);
    expect(await errorText(backfill())).toMatch(/topic_rename: old and new ids both present/);
    await dbs.owner.execute(sql`DROP FUNCTION IF EXISTS topic_rename_ids(text)`);
  });
});
