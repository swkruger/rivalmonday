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
});
