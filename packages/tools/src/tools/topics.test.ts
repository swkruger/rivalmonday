import { createAccessContext } from '@cs/core';
import { review, topicProposal } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import { createToolRegistry } from '../registry';
import { allTools } from './all';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const registry = createToolRegistry({ app: dbs.app, service: dbs.service, platformAdmins: ['op@example.com'] }, { audit: { record: async () => {} } });
const op = createAccessContext({ agencyId: IDS.agencyA, userId: 'op', role: 'agency_admin', clientScope: 'all', features: [] });
const admin = createAccessContext({ agencyId: IDS.agencyA, userId: 'admin', role: 'agency_admin', clientScope: 'all', features: [] });
const am = createAccessContext({ agencyId: IDS.agencyA, userId: 'admin', role: 'account_manager', clientScope: [IDS.clientA1], features: [] });
/** A client user whose account email is listed: the agency permission still refuses. */
const owner = createAccessContext({ agencyId: IDS.agencyA, userId: 'op', role: 'client_owner', clientScope: [IDS.clientA1], features: [] });
const guest = createAccessContext({ agencyId: IDS.agencyA, userId: 'contact:00000000-0000-4000-8000-000000000001', role: 'client_viewer', clientScope: [IDS.clientA1], features: [] });
let proposalId = '';

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedTenancy(dbs.owner);
  await seedUser(dbs.owner, 'op', 'op@example.com');
  await seedUser(dbs.owner, 'admin', 'admin@example.com');
  const [rv] = await dbs.service.insert(review).values({ competitorId: IDS.competitorX, dedupeKey: 'k1', rating: 2, text: 'They charged a trip fee nobody mentioned.' }).returning();
  const [p] = await dbs.service.insert(topicProposal).values({ verticalId: 'hvac_plumbing', topicId: 'hidden_fees', name: 'Hidden fees', description: 'Unexpected trip or diagnostic fees', otherCount: 14, sampleReviewIds: [rv!.id] }).returning();
  proposalId = p!.id;
});

describe('topic proposals (Review Focus 2)', () => {
  it('lists pending proposals with sample reviews', async () => {
    const r = (await registry.invoke(op, 'list_topic_proposals', {})) as { pending: { id: string; topicId: string; verticalName: string; samples: string[] }[]; decided: unknown[] };
    expect(r.pending).toEqual([expect.objectContaining({ id: proposalId, topicId: 'hidden_fees', verticalName: 'HVAC & Plumbing', samples: ['They charged a trip fee nobody mentioned.'] })]);
    expect(r.decided).toEqual([]);
  });

  it('has the topic tool names and none of the old theme names', () => {
    const names = allTools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['list_topic_proposals', 'decide_topic_proposal']));
    expect(names).not.toContain('list_theme_proposals');
    expect(names).not.toContain('decide_theme_proposal');
    expect(names).toContain('get_topic_benchmark');
    expect(names).not.toContain('get_theme_benchmark');
  });

  it('refuses every operator tool to non-operator admins, AMs, client users and guests; nothing changes', async () => {
    // Admins and AMs reach the handler (permission_denied); owners and guests never see the tool (not_found).
    for (const ctx of [admin, am]) {
      await expect(registry.invoke(ctx, 'list_topic_proposals', {})).rejects.toMatchObject({ code: 'permission_denied' });
      await expect(registry.invoke(ctx, 'decide_topic_proposal', { proposalId, decision: 'approved' })).rejects.toMatchObject({ code: 'permission_denied' });
    }
    for (const ctx of [owner, guest]) {
      await expect(registry.invoke(ctx, 'list_topic_proposals', {})).rejects.toMatchObject({ code: 'not_found' });
      await expect(registry.invoke(ctx, 'decide_topic_proposal', { proposalId, decision: 'approved' })).rejects.toMatchObject({ code: 'not_found' });
    }
    expect((await dbs.owner.select().from(topicProposal).where(eq(topicProposal.id, proposalId)))[0]).toMatchObject({ status: 'proposed', decidedBy: null });
  });

  it('refuses everyone when no operators are configured', async () => {
    const none = createToolRegistry({ app: dbs.app, service: dbs.service }, { audit: { record: async () => {} } });
    await expect(none.invoke(op, 'list_topic_proposals', {})).rejects.toMatchObject({ code: 'permission_denied' });
  });

  it('approves once; a second decision is invalid_input', async () => {
    await registry.invoke(op, 'decide_topic_proposal', { proposalId, decision: 'approved' });
    const [row] = await dbs.owner.select().from(topicProposal).where(eq(topicProposal.id, proposalId));
    expect(row).toMatchObject({ status: 'approved', decidedBy: 'op' });
    await expect(registry.invoke(op, 'decide_topic_proposal', { proposalId, decision: 'rejected' })).rejects.toMatchObject({ code: 'invalid_input' });
    const r = (await registry.invoke(op, 'list_topic_proposals', {})) as { pending: unknown[]; decided: { id: string; status: string }[] };
    expect(r.pending).toEqual([]);
    expect(r.decided[0]).toMatchObject({ id: proposalId, status: 'approved' });
  });
});
