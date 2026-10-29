import { type AccessContext, createAccessContext } from '@cs/core';
import { alert, brief, capture, changeEvent, decisionReview, detectedChange, lead, review, topicProposal, trackedPage } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const platformAdmins = ['op@example.com'];
const registry = createToolRegistry({ app: dbs.app, service: dbs.service, platformAdmins }, { audit: { record: async () => {} } });
const mk = (userId: string, role: AccessContext['role'], scope: AccessContext['clientScope'] = 'all', extra: Partial<Parameters<typeof createAccessContext>[0]> = {}) =>
  createAccessContext({ agencyId: IDS.agencyA, userId, role, clientScope: scope, features: [], ...extra });
const admin = mk('admin', 'agency_admin');
const amA1 = mk('am', 'account_manager', [IDS.clientA1]);
const ownerA1 = mk('owner', 'client_owner', [IDS.clientA1]);
const op = mk('op', 'agency_admin');
const adminB = mk('adminb', 'agency_admin', 'all', { agencyId: IDS.agencyB });
const supportA = mk('op', 'agency_admin', 'all', { support: { sessionId: '00000000-0000-4000-8000-0000000005e1', platformUserId: 'op' } });

const call = <T>(ctx: AccessContext, tool: string) => registry.invoke(ctx, tool, {}) as Promise<T>;
type AgencyCounts = { approvals: number; alerts: number; leads: number };
type PlatformCounts = { modelReviews: number; topics: number };

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

async function mkBrief(clientId: string, deliveryDate: string, status: string): Promise<void> {
  const agencyId = clientId === IDS.clientB1 ? IDS.agencyB : IDS.agencyA;
  await dbs.owner.insert(brief).values({ agencyId, clientId, deliveryDate, periodStart: new Date(), periodEnd: new Date(), status, summary: 's' });
}

async function mkAlert(clientId: string, status: string, delivery: string | null = null): Promise<void> {
  const agencyId = clientId === IDS.clientB1 ? IDS.agencyB : IDS.agencyA;
  const [e] = await dbs.owner.insert(changeEvent).values({ competitorId: IDS.competitorX, changeType: 'price_change', summary: 'Price cut', confidence: 0.9, occurredAt: new Date() }).returning();
  await dbs.owner.insert(alert).values({ agencyId, clientId, competitorId: IDS.competitorX, eventId: e!.id, score: 82, headline: 'h', body: 'b', status, mode: 'after_am_check', delivery });
}

async function mkLead(agencyId: string, status: 'unverified' | 'verified' | 'accepted' | 'declined'): Promise<void> {
  await dbs.service.insert(lead).values({
    agencyId, source: 'agency_link', status, contactName: 'Sam', email: `sam-${crypto.randomUUID()}@smith.co`, lookup: { placeId: 'p', cid: null, title: 'Smith', address: null, city: null, category: null, phone: null, domain: null, rating: null, votes: null, lat: 30.2, lng: -97.7 },
    preview: { status: 'pending' }, verifiedAt: status === 'unverified' ? null : new Date(),
  });
}

async function mkDecisionReview(changeStatus: string, resolved = false): Promise<void> {
  const [page] = await dbs.service.insert(trackedPage).values({ competitorId: IDS.competitorX, url: `https://smithhvac.example/${crypto.randomUUID()}`, pageType: 'service', source: 'nav', cadence: 'daily' }).returning();
  const [cap] = await dbs.service.insert(capture).values({ competitorId: IDS.competitorX, trackedPageId: page!.id, source: 'web', url: page!.url, status: 'ok', collectorVersion: 'test/1' }).returning();
  const [ch] = await dbs.service.insert(detectedChange).values({ competitorId: IDS.competitorX, trackedPageId: page!.id, afterCaptureId: cap!.id, source: 'web', kind: 'added', blockKey: 'p#0', afterText: 'Duct cleaning', status: changeStatus, stageVersion: 1, numericChanges: [] }).returning();
  await dbs.service.insert(decisionReview).values({
    subjectType: 'detected_change', subjectId: ch!.id, keys: ['meaningful'], answers: { meaningful: { type: 'noul', value: false, probability: 0.4, confidence: 0.2 } },
    ...(resolved ? { resolvedAt: new Date(), resolvedBy: 'op', resolution: { meaningful: false } } : {}),
  });
}

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedTenancy(dbs.owner);
  await seedUser(dbs.owner, 'op', 'op@example.com');
  await seedUser(dbs.owner, 'admin', 'admin@example.com');
});

describe('get_nav_counts', () => {
  beforeEach(async () => {
    // Briefs: A1 this week ready + an old one still ready (both waiting); A2 this week ready, an old sent one (out); B1 ready (other agency).
    await mkBrief(IDS.clientA1, day(0), 'ready');
    await mkBrief(IDS.clientA1, day(-30), 'ready');
    await mkBrief(IDS.clientA2, day(-1), 'ready');
    await mkBrief(IDS.clientA2, day(-40), 'sent');
    await mkBrief(IDS.clientA2, day(-2), 'approved');
    await mkBrief(IDS.clientB1, day(0), 'ready');
    // Alerts: A1 two waiting, one held for the digest (listed, nothing to do), one delivered (out); A2 one waiting; B1 one waiting.
    await mkAlert(IDS.clientA1, 'pending_review');
    await mkAlert(IDS.clientA1, 'pending_review');
    await mkAlert(IDS.clientA1, 'approved', 'digest');
    await mkAlert(IDS.clientA1, 'delivered', 'immediate');
    await mkAlert(IDS.clientA2, 'pending_review');
    await mkAlert(IDS.clientB1, 'pending_review');
    // Leads: A two new, one accepted (listed, not new), one unverified (never listed); B one new.
    await mkLead(IDS.agencyA, 'verified');
    await mkLead(IDS.agencyA, 'verified');
    await mkLead(IDS.agencyA, 'accepted');
    await mkLead(IDS.agencyA, 'unverified');
    await mkLead(IDS.agencyB, 'verified');
  });

  async function fromLists(ctx: AccessContext): Promise<AgencyCounts> {
    const briefs = (await call<{ items: { status: string }[] }>(ctx, 'list_brief_queue')).items;
    const alerts = (await call<{ items: { status: string }[] }>(ctx, 'list_alert_queue')).items;
    const leads = ctx.clientScope === 'all' ? (await registry.invoke(ctx, 'list_leads', { status: 'verified' }) as { leads: unknown[] }).leads.length : 0;
    return { approvals: briefs.filter((b) => b.status === 'ready').length, alerts: alerts.filter((a) => a.status === 'pending_review').length, leads };
  }

  it('counts exactly the waiting rows the queue pages list (agency admin)', async () => {
    const counts = await call<AgencyCounts>(admin, 'get_nav_counts');
    expect(counts).toEqual({ approvals: 3, alerts: 3, leads: 2 });
    expect(counts).toEqual(await fromLists(admin));
  });

  it('an account manager scoped to A1 counts only A1 and gets no leads count', async () => {
    const counts = await call<AgencyCounts>(amA1, 'get_nav_counts');
    expect(counts).toEqual({ approvals: 2, alerts: 2, leads: 0 });
    expect(counts).toEqual(await fromLists(amA1));
  });

  it('counts per agency, and for the supported agency inside a support session', async () => {
    expect(await call<AgencyCounts>(adminB, 'get_nav_counts')).toEqual({ approvals: 1, alerts: 1, leads: 1 });
    expect(await call<AgencyCounts>(supportA, 'get_nav_counts')).toEqual({ approvals: 3, alerts: 3, leads: 2 });
  });

  it('is not offered to client roles', async () => {
    await expect(call(ownerA1, 'get_nav_counts')).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('get_platform_nav_counts', () => {
  beforeEach(async () => {
    // Decision reviews: two open, one resolved (out), one whose change was superseded (out).
    await mkDecisionReview('cosmetic');
    await mkDecisionReview('cosmetic');
    await mkDecisionReview('cosmetic', true);
    await mkDecisionReview('superseded');
    // Topic proposals: two proposed, one approved recently (listed as decided, not pending).
    const [rv] = await dbs.service.insert(review).values({ competitorId: IDS.competitorX, dedupeKey: 'k1', rating: 2, text: 'Trip fee.' }).returning();
    await dbs.service.insert(topicProposal).values([
      { verticalId: 'hvac_plumbing', topicId: 'hidden_fees', name: 'Hidden fees', description: 'd', otherCount: 14, sampleReviewIds: [rv!.id] },
      { verticalId: 'dental', topicId: 'parking', name: 'Parking', description: 'd', otherCount: 9, sampleReviewIds: [] },
      { verticalId: 'hvac_plumbing', topicId: 'late', name: 'Late', description: 'd', otherCount: 3, sampleReviewIds: [], status: 'approved', decidedAt: new Date(), decidedBy: 'op' },
    ]);
  });

  it('counts exactly the open rows the platform queue pages list', async () => {
    const counts = await call<PlatformCounts>(op, 'get_platform_nav_counts');
    expect(counts).toEqual({ modelReviews: 2, topics: 2, waitlist: 0 });
    const reviews = (await call<{ items: unknown[] }>(op, 'list_decision_reviews')).items;
    const topics = (await call<{ pending: unknown[] }>(op, 'list_topic_proposals')).pending;
    expect(counts).toEqual({ modelReviews: reviews.length, topics: topics.length, waitlist: 0 });
  });

  it('looks unknown to non-operators (agency admins, client users)', async () => {
    await expect(call(admin, 'get_platform_nav_counts')).rejects.toMatchObject({ code: 'not_found' });
    await expect(call(ownerA1, 'get_platform_nav_counts')).rejects.toMatchObject({ code: 'not_found' });
  });
});
