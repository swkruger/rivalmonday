import type { AccessContext } from '@cs/core';
import { clientCompetitor, detectedChange, move, moveEvent } from '@cs/db';
import { IDS } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { EventDetail, EventRow } from './schemas';
import { ctx, dbs, registry, resetWorkspace, seedEvent } from './workspace-fixtures';

const am = ctx('account_manager', 'all');
const owner = ctx('client_owner', [IDS.clientA1], ['dashboard']);
const ownerNoDash = ctx('client_owner', [IDS.clientA1]);
const otherAgency = ctx('agency_admin', 'all', [], IDS.agencyB);

beforeEach(resetWorkspace);

const search = (c: AccessContext, input: Record<string, unknown> = {}) =>
  registry.invoke(c, 'search_events', { clientId: IDS.clientA1, ...input }) as Promise<{ items: EventRow[]; hasMore: boolean }>;

describe('search_events', () => {
  it('lists flagged events by default, newest first, with labels and evidence counts', async () => {
    await seedEvent({ score: 86, route: 'alert', ageDays: 1 });
    await seedEvent({ score: 50, route: 'brief', ageDays: 2, type: 'promo', summary: 'Fall special' });
    await seedEvent({ score: 12, route: 'archive', ageDays: 3, summary: 'Footer tweak' });
    const r = await search(am);
    expect(r.items.map((i) => i.route)).toEqual(['alert', 'brief']);
    expect(r.items[0]).toMatchObject({ competitorName: 'Smith HVAC', typeLabel: 'Price change', score: 86, evidenceCount: 1, serviceId: 'ac_tune_up' });
    expect((await search(am, { route: 'archive' })).items.map((i) => i.summary)).toEqual(['Footer tweak']);
    expect((await search(am, { route: 'all' })).items).toHaveLength(3);
  });

  it('never shows retracted events or competitors the client no longer tracks (decision 3)', async () => {
    await seedEvent({ score: 86, route: 'alert', ageDays: 1, retracted: true });
    const live = await seedEvent({ score: 60, route: 'brief', ageDays: 1 });
    expect((await search(am)).items.map((i) => i.eventId)).toEqual([live.eventId]);
    await dbs.owner.delete(clientCompetitor).where(eq(clientCompetitor.competitorId, IDS.competitorX));
    expect((await search(am)).items).toEqual([]);
  });

  it('filters by type, service, period, score and text (with LIKE wildcards escaped)', async () => {
    await seedEvent({ score: 86, route: 'alert', ageDays: 1, summary: '100% off first visit' });
    await seedEvent({ score: 45, route: 'brief', ageDays: 40, type: 'promo', services: { hvac_plumbing: null } });
    expect((await search(am, { changeType: 'promo', days: 90 })).items).toHaveLength(1);
    expect((await search(am, { serviceId: 'ac_tune_up' })).items).toHaveLength(1);
    expect((await search(am, { days: 7 })).items).toHaveLength(1);
    expect((await search(am, { minScore: 80, days: 90 })).items).toHaveLength(1);
    expect((await search(am, { query: '100%' })).items).toHaveLength(1);
    expect((await search(am, { query: '_%' })).items).toHaveLength(0);
  });

  it('pages with hasMore', async () => {
    for (let i = 0; i < 3; i++) await seedEvent({ score: 60, route: 'brief', ageDays: i + 1 });
    const first = await search(am, { limit: 2 });
    expect([first.items.length, first.hasMore]).toEqual([2, true]);
    const second = await search(am, { limit: 2, offset: 2 });
    expect([second.items.length, second.hasMore]).toEqual([1, false]);
  });

  it('needs the dashboard flag for client users and hides other tenants (Review Focus 1, 2)', async () => {
    await seedEvent({ score: 86, route: 'alert', ageDays: 1 });
    expect((await search(owner)).items).toHaveLength(1);
    await expect(search(ownerNoDash)).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(search(otherAgency)).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(owner, 'search_events', { clientId: IDS.clientA2 })).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('get_event', () => {
  it('returns the score breakdown, live changes and moves', async () => {
    const e = await seedEvent({ score: 86, route: 'alert', ageDays: 1 });
    const [m] = await dbs.owner.insert(move).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, moveType: 'price_war', status: 'active', confidence: 0.7, summary: 'Price war', details: { eventCount: 1, channels: ['web'], facts: {} }, ruleVersion: 2, firstDetectedAt: new Date(), lastHeldAt: new Date(), lastEvidenceAt: new Date() }).returning();
    await dbs.owner.insert(moveEvent).values({ moveId: m!.id, eventId: e.eventId });
    const d = (await registry.invoke(am, 'get_event', { clientId: IDS.clientA1, eventId: e.eventId })) as EventDetail;
    expect(d.factors).toMatchObject({ typeWeight: 1, size: 0.95, relevance: 1, novelty: 0.9, thresholds: { alert: 70, brief: 40 } });
    expect(d.changes).toEqual([expect.objectContaining({ changeId: e.changeId, channel: 'web', channelLabel: 'Website', pageUrl: 'https://smithhvac.example/pricing', hasTextDiff: true })]);
    expect(d.moves).toEqual([{ id: m!.id, label: 'Price war', status: 'active' }]);
  });

  it('hides superseded changes, and a retracted or foreign event is not found (Review Focus 3)', async () => {
    const e = await seedEvent({ score: 86, route: 'alert', ageDays: 1 });
    await dbs.owner.update(detectedChange).set({ status: 'superseded' }).where(eq(detectedChange.id, e.changeId));
    expect(((await registry.invoke(am, 'get_event', { clientId: IDS.clientA1, eventId: e.eventId })) as EventDetail).changes).toEqual([]);
    expect((await search(am)).items).toEqual([expect.objectContaining({ eventId: e.eventId, evidenceCount: 0 })]);
    const r = await seedEvent({ score: 86, route: 'alert', ageDays: 1, retracted: true });
    await expect(registry.invoke(am, 'get_event', { clientId: IDS.clientA1, eventId: r.eventId })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(otherAgency, 'get_event', { clientId: IDS.clientA1, eventId: e.eventId })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('is not found for a competitor the client no longer tracks, or an event scored only for another client (Review Focus 1)', async () => {
    // A1 still tracks X here, so only the missing A1 score hides the A2-only event.
    const a2Only = await seedEvent({ score: 86, route: 'alert', ageDays: 1, clientId: IDS.clientA2 });
    await expect(registry.invoke(am, 'get_event', { clientId: IDS.clientA1, eventId: a2Only.eventId })).rejects.toMatchObject({ code: 'not_found' });
    const dropped = await seedEvent({ score: 86, route: 'alert', ageDays: 1 });
    expect((await registry.invoke(am, 'get_event', { clientId: IDS.clientA1, eventId: dropped.eventId })) as EventDetail).toMatchObject({ eventId: dropped.eventId });
    await dbs.owner.delete(clientCompetitor).where(eq(clientCompetitor.clientId, IDS.clientA1));
    await expect(registry.invoke(am, 'get_event', { clientId: IDS.clientA1, eventId: dropped.eventId })).rejects.toMatchObject({ code: 'not_found' });
  });
});
