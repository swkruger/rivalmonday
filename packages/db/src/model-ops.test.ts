import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { errorText, IDS, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { createDecisionSampleSink } from './ledger';
import { changeEvent, client, decisionLabel, decisionSample, modelBatch, scoreFailure, themeProposal } from './schema';
import { withTenant } from './tenant';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

const sample = () =>
  dbs.service
    .insert(decisionSample)
    .values({ task: 'tag_decisions', reason: 'shadow', state: { after: 'AC tune-up $79' }, questions: { meaningful: { type: 'noul' } }, final: { meaningful: { value: true } } })
    .returning({ id: decisionSample.id });

describe('model-ops schema', () => {
  it('createDecisionSampleSink writes a sample and returns its id', async () => {
    const id = await createDecisionSampleSink(dbs.service).recordDecisionSample({
      agencyId: null, clientId: null, task: 'tag_decisions', reason: 'review', state: { a: 1 }, questions: { m: {} }, primary: null, fallback: null, final: {}, needsReview: ['m'],
    });
    const [row] = await dbs.owner.select().from(decisionSample).where(sql`id = ${id}`);
    expect(row).toMatchObject({ task: 'tag_decisions', reason: 'review', needsReview: ['m'] });
  });

  it('stores a sample with one label per question key', async () => {
    const [s] = await sample();
    await dbs.service.insert(decisionLabel).values({ sampleId: s!.id, questionKey: 'meaningful', value: 'true', source: 'human', labeledBy: 'owner' });
    const text = await errorText(dbs.service.insert(decisionLabel).values({ sampleId: s!.id, questionKey: 'meaningful', value: 'false', source: 'human', labeledBy: 'owner' }));
    expect(text).toMatch(/duplicate key/i);
  });

  it('keeps samples, labels, batches and score failures away from app_user', async () => {
    const [s] = await sample();
    await dbs.service.insert(modelBatch).values({ task: 'theme_discovery_batch', provider: 'anthropic', providerBatchId: 'msgbatch_1', purpose: 'theme_discovery', items: {}, requestCount: 0 });
    for (const table of [decisionSample, decisionLabel, modelBatch, scoreFailure]) {
      const rows = await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) => tx.select().from(table));
      expect(rows).toEqual([]);
    }
    expect(await errorText(withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) => tx.insert(decisionLabel).values({ sampleId: s!.id, questionKey: 'x', value: 'y', source: 'human', labeledBy: 'me' })))).toMatch(/permission denied/i);
  });

  it('theme proposals are invisible to tenant roles (platform data, approved through the service role)', async () => {
    await dbs.service.insert(themeProposal).values({ verticalId: 'hvac_plumbing', themeId: 'warranty', name: 'Warranty', description: 'd', status: 'proposed', otherCount: 20, sampleReviewIds: [] });
    const rows = await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) => tx.select().from(themeProposal));
    expect(rows).toEqual([]);
  });

  it('rejects malformed client score thresholds', async () => {
    for (const bad of [{ alert: 40, brief: 70 }, { alert: 120, brief: 40 }, { alert: '70', brief: 40 }, { alert: 70 }]) {
      const text = await errorText(dbs.owner.update(client).set({ scoreThresholds: bad as never }).where(sql`id = ${IDS.clientA1}`));
      expect(text, JSON.stringify(bad)).toMatch(/client_score_thresholds_check/);
    }
    await dbs.owner.update(client).set({ scoreThresholds: { alert: 80, brief: 50 } }).where(sql`id = ${IDS.clientA1}`);
  });

  it('app_user may update ordinary client columns but not self_competitor_id or agency_id', async () => {
    const ctx = { agencyId: IDS.agencyA, clientScope: 'all' as const };
    await withTenant(dbs.app, ctx, (tx) => tx.update(client).set({ name: 'A1 HVAC & Air' }).where(sql`id = ${IDS.clientA1}`));
    expect(await errorText(withTenant(dbs.app, ctx, (tx) => tx.update(client).set({ selfCompetitorId: IDS.competitorY }).where(sql`id = ${IDS.clientA1}`)))).toMatch(/permission denied/i);
    expect(await errorText(withTenant(dbs.app, ctx, (tx) => tx.update(client).set({ agencyId: IDS.agencyB }).where(sql`id = ${IDS.clientA1}`)))).toMatch(/permission denied/i);
  });

  it('events carry a retraction marker', async () => {
    const [ev] = await dbs.service
      .insert(changeEvent)
      .values({ competitorId: IDS.competitorX, changeType: 'promo', summary: 's', confidence: 1, occurredAt: new Date(), retractedAt: new Date(), retractionReason: 'superseded' })
      .returning({ r: changeEvent.retractionReason });
    expect(ev?.r).toBe('superseded');
  });
});
