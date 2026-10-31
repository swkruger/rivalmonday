import { type AccessContext, createAccessContext } from '@cs/core';
import { alert, brief, changeEvent, client, clientSetup, contact, eventScore, llmCall, move, moveEvent, recommendation } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const registry = createToolRegistry({ app: dbs.app, service: dbs.service }, { audit: { record: async () => {} } });
const ctx = (role: AccessContext['role'], scope: AccessContext['clientScope'], agencyId: string = IDS.agencyA) => createAccessContext({ agencyId, userId: `u-${role}`, role, clientScope: scope, features: [] });
const admin = ctx('agency_admin', 'all');
const day = 86_400_000;

async function scored(score: number, route: string, ageDays: number, retracted = false): Promise<string> {
  const at = new Date(Date.now() - ageDays * day);
  const [e] = await dbs.owner.insert(changeEvent).values({ competitorId: IDS.competitorX, changeType: 'price_change', summary: 's', confidence: 0.9, occurredAt: at, retractedAt: retracted ? at : null }).returning();
  await dbs.owner.insert(eventScore).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, eventId: e!.id, score, route, factors: {} as never, packVersion: 1, scoredAt: at });
  return e!.id;
}

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('get_portfolio', () => {
  it('hides an archived client (7a2 D16)', async () => {
    await dbs.service.update(client).set({ archivedAt: new Date() }).where(eq(client.id, IDS.clientA2));
    const { items } = (await registry.invoke(admin, 'get_portfolio', {})) as { items: { clientId: string }[] };
    expect(items.map((i) => i.clientId)).toEqual([IDS.clientA1]);
  });

  it('summarises each visible client', async () => {
    const eventId = await scored(86, 'alert', 2);
    await scored(90, 'archive', 1); // archive never counts
    await scored(95, 'alert', 3, true); // retracted never counts
    await scored(99, 'alert', 40); // older than 30 days
    // F16: a move counts toward pressure only while it keeps a live event.
    const [m] = await dbs.owner.insert(move).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, moveType: 'ad_surge', status: 'active', confidence: 0.5, summary: 'm', ruleVersion: 2, lastHeldAt: new Date(), lastEvidenceAt: new Date() }).returning();
    await dbs.owner.insert(moveEvent).values({ moveId: m!.id, eventId });
    await dbs.owner.insert(alert).values([
      { agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, eventId, score: 86, status: 'pending_review', mode: 'after_am_check' },
    ]);
    const [b] = await dbs.owner.insert(brief).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, deliveryDate: '2026-10-12', periodStart: new Date(), periodEnd: new Date(), status: 'ready' }).returning();
    await dbs.owner.insert(recommendation).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, title: 't', rationale: 'r', effort: 'L', impact: 'H', owner: 'client', source: 'brief' });

    const { items } = (await registry.invoke(ctx('agency_admin', 'all'), 'get_portfolio', {})) as { items: Record<string, unknown>[] };
    const a1 = items.find((i) => i.clientId === IDS.clientA1)!;
    // 1 − (1 − 0.86)(1 − 0.5 × 0.8) = 0.916
    expect(a1).toMatchObject({
      name: 'A1 HVAC', alertsPending: 1, alertsDelivered7d: 0, briefToApprove: { id: b!.id, deliveryDate: '2026-10-12' }, openRecommendations: 1, topCompetitor: 'Smith HVAC',
      pressure: { score: 92, level: 'high', reasons: ['Price change', 'Ad surge'] },
    });
    expect(a1.lastActivityAt).toEqual(expect.any(String));
    const a2 = items.find((i) => i.clientId === IDS.clientA2)!;
    expect(a2).toMatchObject({ pressure: { score: 0, level: 'low', reasons: ['Quiet'] }, briefToApprove: null, lastActivityAt: null });
  });

  it('reports weekly trends for the visible clients only', async () => {
    const { trends } = (await registry.invoke(ctx('account_manager', [IDS.clientA1]), 'get_portfolio', {})) as { trends: { clients: number[]; alerts: number[]; briefs: number[] } };
    expect(trends.clients.at(-1)).toBe(1);
    expect(trends.alerts).toHaveLength(8);
    expect(trends.briefs).toHaveLength(8);
  });

  it('counts only alerts raised and briefs produced, for visible clients, with a row dated after now in the latest window', async () => {
    const [e1, e2, e3, e4] = [await scored(80, 'alert', 1), await scored(80, 'alert', 1), await scored(80, 'alert', 1), await scored(80, 'alert', 1)];
    const a = { agencyId: IDS.agencyA, competitorId: IDS.competitorX, score: 80, headline: 'h', body: 'b', mode: 'direct' };
    const recent = new Date(Date.now() - day);
    await dbs.owner.insert(alert).values([
      { ...a, clientId: IDS.clientA1, eventId: e1!, status: 'delivered', createdAt: recent },
      { ...a, clientId: IDS.clientA1, eventId: e2!, status: 'withdrawn', createdAt: recent },
      { ...a, clientId: IDS.clientA1, eventId: e3!, status: 'drafting', createdAt: recent },
      { ...a, clientId: IDS.clientA1, eventId: e4!, status: 'pending_review', createdAt: new Date(Date.now() + 60_000) },
      { ...a, clientId: IDS.clientA2, eventId: e1!, status: 'delivered', createdAt: recent },
    ] as never);
    const b = { agencyId: IDS.agencyA, clientId: IDS.clientA1, periodStart: new Date(), periodEnd: new Date(), createdAt: recent };
    await dbs.owner.insert(brief).values([
      { ...b, deliveryDate: '2026-10-05', status: 'sent' },
      { ...b, deliveryDate: '2026-10-12', status: 'failed' },
      { ...b, deliveryDate: '2026-10-19', status: 'generating' },
    ]);
    const { trends } = (await registry.invoke(ctx('account_manager', [IDS.clientA1]), 'get_portfolio', {})) as { trends: { alerts: number[]; briefs: number[] } };
    expect(trends.alerts).toEqual([0, 0, 0, 0, 0, 0, 0, 2]);
    expect(trends.briefs).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
  });

  it('respects scope and is agency-only', async () => {
    const { items } = (await registry.invoke(ctx('account_manager', [IDS.clientA1]), 'get_portfolio', {})) as { items: { clientId: string }[] };
    expect(items.map((i) => i.clientId)).toEqual([IDS.clientA1]);
    await expect(registry.invoke(ctx('client_owner', [IDS.clientA1]), 'get_portfolio', {})).rejects.toMatchObject({ code: 'not_found' });
  });

  it('includes month-to-date credits against the limit, no dollars', async () => {
    await dbs.owner.insert(llmCall).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, task: 't', provider: 'p', model: 'm', inputTokens: 1, outputTokens: 1, costUsd: 16, latencyMs: 1, ok: true });
    const { items } = (await registry.invoke(admin, 'get_portfolio', {})) as { items: { clientId: string; credits: { level: string; used: number; limit: number } }[] };
    expect(items.find((i) => i.clientId === IDS.clientA1)!.credits).toMatchObject({ level: 'reached', used: 1600, limit: 1500 });
    expect(JSON.stringify(items)).not.toMatch(/usd|\$|rival monday/i);
  });

  it('leaves prospects off the portfolio (5b-2 decision 9)', async () => {
    await dbs.owner.update(client).set({ status: 'prospect' }).where(eq(client.id, IDS.clientA2));
    const { items } = (await registry.invoke(admin, 'get_portfolio', {})) as { items: { clientId: string }[] };
    expect(items.map((i) => i.clientId)).toEqual([IDS.clientA1]);
  });

  it('rows carry setup progress only for open setups', async () => {
    const base = { agencyId: IDS.agencyA };
    await dbs.owner.insert(clientSetup).values([
      { ...base, clientId: IDS.clientA1, skipped: ['search'] },
      { ...base, clientId: IDS.clientA2, completedAt: new Date() },
    ]);
    const { items } = (await registry.invoke(admin, 'get_portfolio', {})) as { items: { clientId: string; setup: { open: boolean; doneSteps: number; totalSteps: number; waitingOnOwner: unknown } | null }[] };
    // A1: details todo (no phone), lookup done, profile todo (no keywords), competitors todo, invite todo, billing skipped (no Connect).
    // "Setup n of N": N = 6 steps + the All set screen.
    const a1 = items.find((i) => i.clientId === IDS.clientA1)!.setup;
    expect(a1).toEqual({ open: true, doneSteps: 2, totalSteps: 7, waitingOnOwner: null });
    expect(items.find((i) => i.clientId === IDS.clientA2)!.setup).toBeNull(); // completed
  });

  it('a completed setup waiting on the owner pick shows the owner first name', async () => {
    await dbs.owner.update(client).set({ phone: '817-555-0100', keywords: ['ac'], serviceArea: { center: { lat: 1, lng: 2 }, radiusKm: 10, zips: [] } }).where(eq(client.id, IDS.clientA1));
    await dbs.owner.insert(contact).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'maria@x.co', name: 'Maria Lopez', active: false });
    const asked = new Date();
    await dbs.owner.insert(clientSetup).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, skipped: ['invite'], ownerPickRequestedAt: asked, completedAt: asked });
    const get = async () => ((await registry.invoke(admin, 'get_portfolio', {})) as { items: { clientId: string; setup: unknown }[] }).items.find((i) => i.clientId === IDS.clientA1)!.setup;
    // Six steps settled (competitors waiting_owner counts), setup closed: the badge says who it waits on.
    expect(await get()).toEqual({ open: false, doneSteps: 6, totalSteps: 7, waitingOnOwner: { firstName: 'Maria' } });
    await dbs.owner.update(clientSetup).set({ competitorsDoneAt: new Date() });
    expect(await get()).toBeNull(); // the owner picked
    await dbs.owner.update(clientSetup).set({ competitorsDoneAt: null, dismissedAt: new Date() });
    expect(await get()).toBeNull(); // dismissed setups never show
  });

  it('rows without a setup row have no setup', async () => {
    const { items } = (await registry.invoke(admin, 'get_portfolio', {})) as { items: { setup: unknown }[] };
    expect(items.every((i) => i.setup === null)).toBe(true);
  });
});
