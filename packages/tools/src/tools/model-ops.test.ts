import { createAccessContext } from '@cs/core';
import { capture, changeEvent, decisionReview, detectedChange, trackedPage } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const registry = createToolRegistry({ app: dbs.app, service: dbs.service, platformAdmins: ['op@example.com'] }, { audit: { record: async () => {} } });
const op = createAccessContext({ agencyId: IDS.agencyA, userId: 'op', role: 'agency_admin', clientScope: 'all', features: [] });
const admin = createAccessContext({ agencyId: IDS.agencyA, userId: 'admin', role: 'agency_admin', clientScope: 'all', features: [] });
const am = createAccessContext({ agencyId: IDS.agencyA, userId: 'admin', role: 'account_manager', clientScope: [IDS.clientA1], features: [] });
/** A client user whose account email is listed: the agency permission still refuses. */
const owner = createAccessContext({ agencyId: IDS.agencyA, userId: 'op', role: 'client_owner', clientScope: [IDS.clientA1], features: [] });
const guest = createAccessContext({ agencyId: IDS.agencyA, userId: 'contact:00000000-0000-4000-8000-000000000001', role: 'client_viewer', clientScope: [IDS.clientA1], features: [] });
let reviewId = '';
let changeId = '';

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedTenancy(dbs.owner);
  await seedUser(dbs.owner, 'op', 'op@example.com');
  await seedUser(dbs.owner, 'admin', 'admin@example.com');
  const [page] = await dbs.service
    .insert(trackedPage)
    .values({ competitorId: IDS.competitorX, url: 'https://smithhvac.example/services', pageType: 'service', source: 'nav', cadence: 'daily' })
    .returning();
  const [cap] = await dbs.service
    .insert(capture)
    .values({ competitorId: IDS.competitorX, trackedPageId: page!.id, source: 'web', url: page!.url, status: 'ok', collectorVersion: 'test/1' })
    .returning();
  const [ch] = await dbs.service
    .insert(detectedChange)
    .values({ competitorId: IDS.competitorX, trackedPageId: page!.id, afterCaptureId: cap!.id, source: 'web', kind: 'added', blockKey: 'p#0', afterText: 'Now offering duct cleaning', status: 'cosmetic', stageVersion: 1, numericChanges: [] })
    .returning();
  changeId = ch!.id;
  const [r] = await dbs.service
    .insert(decisionReview)
    .values({ subjectType: 'detected_change', subjectId: ch!.id, keys: ['meaningful'], answers: { meaningful: { type: 'noul', value: false, probability: 0.4, confidence: 0.2 } } })
    .returning();
  reviewId = r!.id;
});

describe('decision-review queue (Review Focus 2)', () => {
  it('lists open reviews with answerable questions for operators', async () => {
    const { items } = (await registry.invoke(op, 'list_decision_reviews', {})) as {
      items: { id: string; competitorName: string; questions: { key: string; options: { value: string }[]; modelAnswer: string | null; confidence: number | null }[] }[];
    };
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: reviewId, competitorName: 'Smith HVAC' });
    expect(items[0]!.questions[0]).toMatchObject({ key: 'meaningful', modelAnswer: 'false', confidence: 0.2 });
    expect(items[0]!.questions[0]!.options.map((o) => o.value)).toEqual(['true', 'false']);
  });

  it('refuses every operator tool to non-operator admins, AMs, client users and guests; malformed input is invalid_input', async () => {
    const resolve = { reviewId, answers: { meaningful: 'true' } };
    for (const ctx of [admin, am, owner, guest]) {
      await expect(registry.invoke(ctx, 'list_decision_reviews', {})).rejects.toMatchObject({ code: 'permission_denied' });
      await expect(registry.invoke(ctx, 'resolve_decision_review', resolve)).rejects.toMatchObject({ code: 'permission_denied' });
    }
    await expect(registry.invoke(op, 'resolve_decision_review', { reviewId: 'not-a-uuid', answers: { meaningful: 'false' } })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(registry.invoke(op, 'resolve_decision_review', { reviewId, answers: {} })).rejects.toMatchObject({ code: 'invalid_input' });
    // No refused call changed anything.
    expect((await dbs.owner.select().from(decisionReview).where(eq(decisionReview.id, reviewId)))[0]?.resolvedAt).toBeNull();
    expect((await dbs.owner.select().from(detectedChange).where(eq(detectedChange.id, changeId)))[0]?.status).toBe('cosmetic');
    expect(await dbs.owner.select().from(changeEvent)).toEqual([]);
  });

  it('refuses everyone when no operators are configured', async () => {
    const none = createToolRegistry({ app: dbs.app, service: dbs.service }, { audit: { record: async () => {} } });
    await expect(none.invoke(op, 'list_decision_reviews', {})).rejects.toMatchObject({ code: 'permission_denied' });
  });

  it('resolves once; a second attempt is invalid_input and the queue is empty', async () => {
    const r = await registry.invoke(op, 'resolve_decision_review', { reviewId, answers: { meaningful: 'false' } });
    expect(r).toMatchObject({ action: 'unchanged', eventId: null, labels: 0 });
    await expect(registry.invoke(op, 'resolve_decision_review', { reviewId, answers: { meaningful: 'false' } })).rejects.toMatchObject({ code: 'invalid_input' });
    expect(((await registry.invoke(op, 'list_decision_reviews', {})) as { items: unknown[] }).items).toEqual([]);
    expect((await dbs.owner.select().from(decisionReview).where(eq(decisionReview.id, reviewId)))[0]).toMatchObject({ resolvedBy: 'op', resolution: { meaningful: 'false' } });
  });

  it('refuses an unknown review as not_found and a bad answer as invalid_input', async () => {
    await expect(registry.invoke(op, 'resolve_decision_review', { reviewId: '00000000-0000-4000-8000-000000000999', answers: { meaningful: 'false' } })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(op, 'resolve_decision_review', { reviewId, answers: { meaningful: 'maybe' } })).rejects.toMatchObject({ code: 'invalid_input' });
  });
});
