import { agency, brief, capture, client, clientCompetitor, competitor, platformSetting } from '@cs/db';
import { openTestDbs, truncateAll } from '@cs/db/test-helpers';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { publicCount, siteStatus } from './site-status';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
});

const NOW = new Date('2026-10-28T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

async function mkAgency(): Promise<string> {
  const [a] = await dbs.owner.insert(agency).values({ name: `Agency ${randomUUID().slice(0, 6)}` }).returning({ id: agency.id });
  return a!.id;
}
type ClientOpts = Partial<{ status: 'prospect' | 'active'; pausedAt: Date; archivedAt: Date }>;
async function mkClient(agencyId: string, o: ClientOpts = {}): Promise<string> {
  const [c] = await dbs.owner.insert(client).values({ agencyId, name: 'C', verticalId: 'hvac_plumbing', ...o }).returning({ id: client.id });
  return c!.id;
}
/** n new competitors, each tracked by the client. */
async function track(agencyId: string, clientId: string, n: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const [c] = await dbs.owner.insert(competitor).values({ name: `Rival ${randomUUID()}` }).returning({ id: competitor.id });
    await dbs.owner.insert(clientCompetitor).values({ agencyId, clientId, competitorId: c!.id });
    ids.push(c!.id);
  }
  return ids;
}
async function snap(competitorId: string, n: number, o: { at?: Date; status?: string } = {}) {
  await dbs.owner.insert(capture).values(Array.from({ length: n }, () => ({
    competitorId, source: 'web', status: o.status ?? 'ok', collectorVersion: 't', capturedAt: o.at ?? daysAgo(1),
  })));
}
let day = 0;
async function mkBrief(agencyId: string, clientId: string, o: { claims: number | null; dropped?: number; at?: Date }) {
  day += 1;
  await dbs.owner.insert(brief).values({
    agencyId, clientId, deliveryDate: `2026-01-${String(day).padStart(2, '0')}`, periodStart: daysAgo(8), periodEnd: daysAgo(1), status: 'sent',
    claimsChecked: o.claims, dropped: { items: 0, sentences: o.dropped ?? 0 }, generatedAt: o.at ?? daysAgo(2),
  });
}

describe('publicCount', () => {
  it.each([[9, null], [10, 10], [87, 80], [100, 100], [1234, 1200], [98765, 98000], [NaN, null]])('%s -> %s', (n, want) => {
    expect(publicCount(n)).toBe(want);
  });
});

describe('siteStatus', () => {
  it('counts tracked rivals of active clients once each', async () => {
    const a = await mkAgency();
    const c1 = await mkClient(a);
    const c2 = await mkClient(a);
    const rivals = await track(a, c1, 10);
    await dbs.owner.insert(clientCompetitor).values(rivals.map((competitorId) => ({ agencyId: a, clientId: c2, competitorId })));
    const s = await siteStatus(dbs.service, NOW);
    expect(s.counters?.rivalSitesWatched).toBe(10);
  });

  it('excludes paused, archived and prospect clients', async () => {
    const a = await mkAgency();
    await track(a, await mkClient(a), 10);
    for (const o of <ClientOpts[]>[{ pausedAt: daysAgo(1) }, { archivedAt: daysAgo(1) }, { status: 'prospect' }]) await track(a, await mkClient(a, o), 10);
    const s = await siteStatus(dbs.service, NOW);
    expect(s.counters?.rivalSitesWatched).toBe(10);
  });

  it('excludes the sample agency', async () => {
    const a = await mkAgency();
    const sample = await mkAgency();
    const [r] = await track(a, await mkClient(a), 10);
    await track(sample, await mkClient(sample), 10);
    await snap(r!, 10);
    const sc = await mkClient(sample);
    await mkBrief(sample, sc, { claims: 50, dropped: 20 });
    await dbs.owner.insert(platformSetting).values({ key: 'sample_agency_id', value: { agencyId: sample }, updatedBy: 't' });
    const s = await siteStatus(dbs.service, NOW);
    expect(s.counters).toEqual({ rivalSitesWatched: 10, snapshotsThisWeek: 10, claimsChecked: null, claimsDropped: null });
  });

  it('snapshots count only 7 days and only tracked competitors', async () => {
    const a = await mkAgency();
    const rivals = await track(a, await mkClient(a), 10);
    await snap(rivals[0]!, 10); // counted
    await snap(rivals[1]!, 10, { at: daysAgo(8) }); // too old
    await snap(rivals[2]!, 10, { status: 'failed' }); // not ok
    const [loose] = await dbs.owner.insert(competitor).values({ name: 'Untracked' }).returning({ id: competitor.id });
    await snap(loose!.id, 10); // untracked
    const s = await siteStatus(dbs.service, NOW);
    expect(s.counters?.snapshotsThisWeek).toBe(10);
  });

  it('claims sums only briefs with claims_checked and generated in 7 days', async () => {
    const a = await mkAgency();
    const c = await mkClient(a);
    await mkBrief(a, c, { claims: 40, dropped: 22 });
    await mkBrief(a, c, { claims: 20, dropped: 3, at: daysAgo(3) });
    await mkBrief(a, c, { claims: null, dropped: 99 }); // pre-17a
    await mkBrief(a, c, { claims: 500, dropped: 500, at: daysAgo(9) }); // too old
    const s = await siteStatus(dbs.service, NOW);
    expect(s.counters?.claimsChecked).toBe(60);
    expect(s.counters?.claimsDropped).toBe(20);
  });

  it('output has no ids or names', async () => {
    const a = await mkAgency();
    await track(a, await mkClient(a), 10);
    const s = await siteStatus(dbs.service, NOW);
    expect(Object.keys(s).sort()).toEqual(['counters', 'pilotMode']);
    expect(Object.keys(s.counters!).sort()).toEqual(['claimsChecked', 'claimsDropped', 'rivalSitesWatched', 'snapshotsThisWeek']);
    expect(JSON.stringify(s)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}|Agency|Rival /);
  });

  it('pilotMode reads the switch and counters failure yields null', async () => {
    await dbs.service.insert(platformSetting).values({ key: 'pilot_mode', value: { on: true }, updatedBy: 't' });
    expect((await siteStatus(dbs.service, NOW)).pilotMode).toBe(true);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = new Proxy(dbs.service, { get: (t, p, r) => (p === 'execute' ? () => Promise.reject(new Error('boom')) : Reflect.get(t, p, r)) });
    const s = await siteStatus(broken, NOW);
    expect(s).toEqual({ pilotMode: true, counters: null });
    expect(spy).toHaveBeenCalledWith('[site-status] counters failed', 'Error');
    spy.mockRestore();
  });
});
