import { type AccessContext, createAccessContext, type Feature } from '@cs/core';
import { alert, changeEvent, client, clientCompetitor, competitor, competitorSuggestion, trackedPage } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnqueueJob } from '../deps';
import { createToolRegistry } from '../registry';
import { normalizeDomain } from './competitors';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const enqueue = vi.fn<EnqueueJob>(async () => {});
const reg = (webMonitoring: boolean) => createToolRegistry({ app: dbs.app, service: dbs.service, enqueue, webMonitoring }, { audit: { record: async () => {} } });
const registry = reg(false);
const ctx = (role: AccessContext['role'], scope: AccessContext['clientScope'], features: Feature[] = [], agencyId: string = IDS.agencyA) =>
  createAccessContext({ agencyId, userId: `u-${role}`, role, clientScope: scope, features });
const admin = ctx('agency_admin', 'all');
const amA1 = ctx('account_manager', [IDS.clientA1]);
const owner = ctx('client_owner', [IDS.clientA1]);

async function suggest(clientId: string, agencyId: string, name: string, placeId: string, domain: string | null = null): Promise<string> {
  const [s] = await dbs.owner.insert(competitorSuggestion).values({ agencyId, clientId, name, placeId, domain, appearances: 3, overlapScore: 0.8 }).returning();
  return s!.id;
}

beforeEach(async () => {
  enqueue.mockClear();
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('request_competitor_suggestions', () => {
  it('needs keywords and a service area, then enqueues one deduped job', async () => {
    await expect(registry.invoke(admin, 'request_competitor_suggestions', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'invalid_input' });
    await dbs.owner.update(client).set({ keywords: ['ac repair'], serviceArea: { center: { lat: 33.9, lng: -84.3 }, radiusKm: 10, zips: [] } }).where(eq(client.id, IDS.clientA1));
    await registry.invoke(admin, 'request_competitor_suggestions', { clientId: IDS.clientA1 });
    expect(enqueue).toHaveBeenCalledWith('suggest-competitors', { clientId: IDS.clientA1 }, `suggest:${IDS.clientA1}`);
  });

  it('is agency-only and scoped', async () => {
    await expect(registry.invoke(ctx('client_owner', [IDS.clientA1], ['manage_competitors']), 'request_competitor_suggestions', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(registry.invoke(amA1, 'request_competitor_suggestions', { clientId: IDS.clientA2 })).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('suggestions', () => {
  it('lists open suggestions best first, for agency roles and owners with the flag only', async () => {
    await suggest(IDS.clientA1, IDS.agencyA, 'Low', 'ChIJlowlowlow1', null);
    await dbs.owner.insert(competitorSuggestion).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, name: 'High', placeId: 'ChIJhighhigh1', appearances: 9, overlapScore: 0.95 });
    const { items } = (await registry.invoke(amA1, 'list_competitor_suggestions', { clientId: IDS.clientA1 })) as { items: { name: string }[] };
    expect(items.map((i) => i.name)).toEqual(['High', 'Low']);
    await expect(registry.invoke(owner, 'list_competitor_suggestions', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(registry.invoke(ctx('client_owner', [IDS.clientA1], ['manage_competitors']), 'list_competitor_suggestions', { clientId: IDS.clientA1 })).resolves.toBeTruthy();
  });

  it('accepts: links the competitor, starts vendor sources, and enqueues discovery only when monitoring is on', async () => {
    const off = await suggest(IDS.clientA1, IDS.agencyA, 'Peachtree Air', 'ChIJpeachtree1', 'peachtreeair.com');
    const r1 = (await registry.invoke(amA1, 'accept_competitor_suggestion', { suggestionId: off })) as { competitorId: string; discovery: string };
    expect(r1.discovery).toBe('disabled');
    expect(enqueue).not.toHaveBeenCalled();
    const links = await dbs.owner.select().from(clientCompetitor).where(and(eq(clientCompetitor.clientId, IDS.clientA1), eq(clientCompetitor.competitorId, r1.competitorId)));
    expect(links).toHaveLength(1);

    const on = await suggest(IDS.clientA1, IDS.agencyA, 'Metro Comfort', 'ChIJmetrocomf1', 'metrocomfort.com');
    const r2 = (await reg(true).invoke(amA1, 'accept_competitor_suggestion', { suggestionId: on })) as { competitorId: string; discovery: string };
    expect(r2.discovery).toBe('queued');
    expect(enqueue).toHaveBeenCalledWith('discover-pages', { competitorId: r2.competitorId }, `discover:${r2.competitorId}`);

    // A competitor that already has tracked pages is not re-discovered.
    await dbs.owner.insert(trackedPage).values({ competitorId: r2.competitorId, url: 'https://metrocomfort.com/', pageType: 'home', source: 'nav', cadence: 'daily' });
    const again = await suggest(IDS.clientA2, IDS.agencyA, 'Metro Comfort', 'ChIJmetrocomf1', 'metrocomfort.com');
    const r3 = (await reg(true).invoke(admin, 'accept_competitor_suggestion', { suggestionId: again })) as { discovery: string };
    expect(r3.discovery).toBe('not_needed');
  });

  it('enforces the competitor limit', async () => {
    for (let i = 0; i < 4; i++) {
      const [c] = await dbs.owner.insert(competitor).values({ name: `C${i}` }).returning();
      await dbs.owner.insert(clientCompetitor).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: c!.id });
    }
    const sixth = await suggest(IDS.clientA1, IDS.agencyA, 'Sixth', 'ChIJsixthsixth');
    await expect(registry.invoke(amA1, 'accept_competitor_suggestion', { suggestionId: sixth })).rejects.toMatchObject({ code: 'invalid_input', message: expect.stringContaining('5 competitors') });
  });

  it('dismisses, and refuses other scopes (Review Focus 1)', async () => {
    const id = await suggest(IDS.clientA1, IDS.agencyA, 'Nope', 'ChIJnopenopeno');
    await registry.invoke(amA1, 'dismiss_competitor_suggestion', { suggestionId: id });
    const [s] = await dbs.owner.select().from(competitorSuggestion).where(eq(competitorSuggestion.id, id));
    expect(s!.status).toBe('dismissed');
    await expect(registry.invoke(amA1, 'dismiss_competitor_suggestion', { suggestionId: id })).rejects.toMatchObject({ code: 'not_found' });
    const other = await suggest(IDS.clientA2, IDS.agencyA, 'A2 only', 'ChIJa2onlya2on');
    await expect(registry.invoke(amA1, 'accept_competitor_suggestion', { suggestionId: other })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(amA1, 'dismiss_competitor_suggestion', { suggestionId: other })).rejects.toMatchObject({ code: 'not_found' });
    const foreign = await suggest(IDS.clientB1, IDS.agencyB, 'B1 only', 'ChIJb1onlyb1on');
    await expect(registry.invoke(admin, 'accept_competitor_suggestion', { suggestionId: foreign })).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('manual competitors', () => {
  it('normalises websites to a bare host', () => {
    expect(normalizeDomain('https://www.SmithHVAC.com/about?x=1')).toBe('smithhvac.com');
    expect(normalizeDomain('smithhvac.com')).toBe('smithhvac.com');
    expect(normalizeDomain('not a domain')).toBeNull();
  });

  it('adds by website, reusing an existing global row, and lists tracked competitors', async () => {
    await dbs.owner.update(competitor).set({ domain: 'smithhvac.com' }).where(eq(competitor.id, IDS.competitorX));
    const r = (await registry.invoke(amA1, 'add_competitor', { clientId: IDS.clientA1, name: 'Ignored Name', domain: 'https://smithhvac.com' })) as { competitorId: string };
    expect(r.competitorId).toBe(IDS.competitorX);
    const n = (await registry.invoke(admin, 'add_competitor', { clientId: IDS.clientA2, name: 'Fresh Plumbing', domain: 'freshplumbing.com' })) as { competitorId: string; discovery: string };
    expect(n.discovery).toBe('disabled');
    const { items } = (await registry.invoke(admin, 'list_client_competitors', { clientId: IDS.clientA2 })) as { items: { name: string }[] };
    expect(items.map((i) => i.name).sort()).toEqual(['Bright Smiles', 'Fresh Plumbing']);
    await expect(registry.invoke(amA1, 'add_competitor', { clientId: IDS.clientA1, name: 'X' })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(registry.invoke(amA1, 'add_competitor', { clientId: IDS.clientA2, name: 'X', domain: 'x.com' })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('removes a competitor; its alerts still list with a fallback name (Review Focus 3)', async () => {
    const [e] = await dbs.owner.insert(changeEvent).values({ competitorId: IDS.competitorX, changeType: 'price_change', summary: 's', confidence: 0.9, occurredAt: new Date() }).returning();
    await dbs.owner.insert(alert).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, eventId: e!.id, score: 80, headline: 'Price cut', status: 'delivered', mode: 'direct' });
    await registry.invoke(amA1, 'remove_competitor', { clientId: IDS.clientA1, competitorId: IDS.competitorX });
    const { items } = (await registry.invoke(amA1, 'list_alerts', { clientId: IDS.clientA1 })) as { items: { competitorName: string }[] };
    expect(items).toEqual([expect.objectContaining({ competitorName: 'Competitor' })]);
    await expect(registry.invoke(amA1, 'remove_competitor', { clientId: IDS.clientA1, competitorId: IDS.competitorX })).rejects.toMatchObject({ code: 'not_found' });
    // Re-adding works.
    await registry.invoke(amA1, 'add_competitor', { clientId: IDS.clientA1, name: 'Smith HVAC', placeId: 'ChIJsmithsmith1' });
  });
});
