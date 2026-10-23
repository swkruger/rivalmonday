import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { findTopicLeftovers } from './topic-leftovers';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('findTopicLeftovers', () => {
  it('returns [] on a freshly migrated, seeded database', async () => {
    expect(await findTopicLeftovers(dbs.owner)).toEqual([]);
  });

  it('reports a detected_change that still has details.theme', async () => {
    await dbs.owner.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL session_replication_role = replica`);
      await tx.execute(sql`INSERT INTO detected_change (competitor_id, source, kind, after_capture_id, block_key, stage_version, details)
        VALUES (${IDS.competitorX}, 'review', 'added', '00000000-0000-4000-8000-00000000e001', 'a', 1, ${JSON.stringify({ theme: 'scheduling' })}::jsonb)`);
    });
    expect(await findTopicLeftovers(dbs.owner)).toEqual([{ table: 'detected_change', column: 'details', rows: 1 }]);
  });

  it('reports a model_batch whose context still has themeIds', async () => {
    await dbs.owner.execute(sql`INSERT INTO model_batch (task, provider, provider_batch_id, purpose, items, request_count)
      VALUES ('theme_discovery_batch', 'anthropic', 'b1', 'theme_discovery', ${JSON.stringify({ hvac_plumbing: { themeIds: ['a'] } })}::jsonb, 1)`);
    expect(await findTopicLeftovers(dbs.owner)).toEqual([{ table: 'model_batch', column: 'items', rows: 1 }]);
  });

  it('does not flag C7 keys such as theme_<vertical>__<id> or purpose theme_discovery', async () => {
    await dbs.owner.execute(sql`INSERT INTO model_batch (task, provider, provider_batch_id, purpose, items, request_count)
      VALUES ('theme_discovery_batch', 'anthropic', 'b2', 'theme_discovery', ${JSON.stringify({ hvac_plumbing: { topicIds: ['theme_hvac__x'] } })}::jsonb, 1)`);
    expect(await findTopicLeftovers(dbs.owner)).toEqual([]);
  });

  it('reports a vertical whose config still has top-level themes', async () => {
    await dbs.owner.execute(sql`INSERT INTO vertical (id, name, status, config) VALUES ('tv_old', 'Old', 'reviewed', ${JSON.stringify({ themes: [] })}::jsonb)`);
    expect(await findTopicLeftovers(dbs.owner)).toEqual([{ table: 'vertical', column: 'config', rows: 1 }]);
  });

  it('reports a playbook_override that still uses fix_theme', async () => {
    await dbs.owner.execute(sql`INSERT INTO playbook_override (agency_id, vertical_id, playbook_id, updated_by) VALUES (${IDS.agencyA}, 'hvac_plumbing', 'fix_theme', 't')`);
    expect(await findTopicLeftovers(dbs.owner)).toEqual([{ table: 'playbook_override', column: 'playbook_id', rows: 1 }]);
  });

  it('reports a vertical whose draft_evidence still has themes', async () => {
    await dbs.owner.execute(sql`INSERT INTO vertical (id, name, status, draft_evidence) VALUES ('tv_ev', 'Ev', 'reviewed', ${JSON.stringify({ themes: [] })}::jsonb)`);
    expect(await findTopicLeftovers(dbs.owner)).toEqual([{ table: 'vertical', column: 'draft_evidence', rows: 1 }]);
  });

  it('reports a vertical_draft whose draft still has themes', async () => {
    await dbs.owner.execute(sql`INSERT INTO vertical_draft (place_id, agency_id, draft) VALUES ('p1', ${IDS.agencyA}, ${JSON.stringify({ themes: [] })}::jsonb)`);
    expect(await findTopicLeftovers(dbs.owner)).toEqual([{ table: 'vertical_draft', column: 'draft', rows: 1 }]);
  });

  it('reports a move whose details.facts still has theme', async () => {
    await dbs.owner.execute(sql`INSERT INTO move (agency_id, client_id, competitor_id, move_type, status, confidence, summary, details, rule_version, last_held_at, last_evidence_at)
      VALUES (${IDS.agencyA}, ${IDS.clientA1}, ${IDS.competitorX}, 't', 'open', 0.5, 's', ${JSON.stringify({ eventCount: 0, channels: [], facts: { theme: 'x' } })}::jsonb, 1, now(), now())`);
    expect(await findTopicLeftovers(dbs.owner)).toEqual([{ table: 'move', column: 'details', rows: 1 }]);
  });

  it('does not flag hvac_plumbing rows that keep its own technician_professionalism id', async () => {
    await dbs.owner.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL session_replication_role = replica`);
      await tx.execute(sql`INSERT INTO review_analysis (review_id, vertical_id, competitor_id, text_sha, asked, topics, confidence, analysis_version)
        VALUES ('00000000-0000-4000-8000-00000000e002', 'hvac_plumbing', ${IDS.competitorX}, 's', '["technician_professionalism"]'::jsonb, '["technician_professionalism"]'::jsonb, 0.9, 1)`);
    });
    expect(await findTopicLeftovers(dbs.owner)).toEqual([]);
  });

  it('reports an inheriting vertical review_analysis row that still has technician_professionalism', async () => {
    await dbs.owner.execute(sql`INSERT INTO vertical (id, name, status, config) VALUES ('distillery', 'Distillery', 'unreviewed', '{}'::jsonb)`);
    await dbs.owner.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL session_replication_role = replica`);
      await tx.execute(sql`INSERT INTO review_analysis (review_id, vertical_id, competitor_id, text_sha, asked, topics, confidence, analysis_version)
        VALUES ('00000000-0000-4000-8000-00000000e003', 'distillery', ${IDS.competitorX}, 's', '["technician_professionalism"]'::jsonb, '[]'::jsonb, 0.9, 1)`);
    });
    expect(await findTopicLeftovers(dbs.owner)).toEqual([{ table: 'review_analysis', column: 'asked', rows: 1 }]);
  });

  it('reports a decision_label keyed theme_distillery__technician_professionalism', async () => {
    await dbs.owner.execute(sql`INSERT INTO vertical (id, name, status, config) VALUES ('distillery', 'Distillery', 'unreviewed', '{}'::jsonb)`);
    const [s] = (await dbs.owner.execute(sql`INSERT INTO decision_sample (task, reason, state, questions, final_answers)
      VALUES ('review_topics', 'shadow', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb) RETURNING id`)) as unknown as { id: string }[];
    await dbs.owner.execute(sql`INSERT INTO decision_label (sample_id, question_key, value, source, labeled_by) VALUES
      (${s!.id}, 'theme_distillery__technician_professionalism', 'true', 'human', 't'),
      (${s!.id}, 'theme_hvac_plumbing__technician_professionalism', 'true', 'human', 't')`);
    expect(await findTopicLeftovers(dbs.owner)).toEqual([{ table: 'decision_label', column: 'question_key', rows: 1 }]);
  });
});
