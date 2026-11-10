import { citationAuditRun, citationListing, clientCompetitor, competitor } from '@cs/db';
import { IDS } from '@cs/db/test-helpers';
import { citationCatalogue } from '@cs/verticals';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { packsOf } from '../catalog/access';
import type { CitationAuditView } from './schemas';
import { ago, ctx, dbs, registry as reg, resetWorkspace, seedCapture, seedSelf } from './workspace-fixtures';

const am = ctx('account_manager', 'all');
const owner = ctx('client_owner', [IDS.clientA1], ['dashboard']);
const ownerNoDash = ctx('client_owner', [IDS.clientA1]);
const call = (c = am, meta?: Parameters<typeof reg.invoke>[3], clientId: string = IDS.clientA1) => reg.invoke(c, 'get_citation_audit', { clientId }, meta) as Promise<CitationAuditView>;

let dirs: { host: string; label: string; add_listing_url: string }[];
beforeEach(async () => {
  await resetWorkspace();
  dirs = citationCatalogue(await packsOf({ app: dbs.app, service: dbs.service })('hvac_plumbing'));
});

type Row = Partial<typeof citationListing.$inferInsert> & { competitorId: string; host: string };
const listing = (r: Row) => dbs.owner.insert(citationListing).values({ status: 'listed', checkedAt: ago(2), inCatalogue: true, ...r });
/** Inserts a run started (and finished) `startedDaysAgo` days ago; resolves to that time. */
const run = async (status: 'running' | 'done' | 'capped' | 'failed', competitorIds: string[], startedDaysAgo: number, finished = true): Promise<Date> => {
  const at = ago(startedDaysAgo);
  await dbs.owner.insert(citationAuditRun).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, trigger: 'setup', status, competitorIds, startedAt: at, finishedAt: finished ? at : null });
  return at;
};
const track = (id: string) => dbs.owner.insert(clientCompetitor).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: id }).onConflictDoNothing();

describe('get_citation_audit (18c-1)', () => {
  it('no run: status never, every catalogue cell not_checked (only the own business is shown)', async () => {
    const self = await seedSelf();
    const r = await call();
    expect(r.status).toBe('never');
    expect(r.checkedAt).toBeNull();
    expect(r.selfMissing).toBe(false);
    expect(r.directories).toEqual(dirs.map((d) => ({ host: d.host, label: d.label, addListingUrl: d.add_listing_url })));
    expect(r.alsoFoundOn).toEqual([]);
    // Without a run only the own business is audited (rivals come from the run).
    expect(r.businesses.map((b) => [b.competitorId, b.self])).toEqual([[self, true]]);
    for (const l of r.businesses[0]!.listings) expect(l).toMatchObject({ status: 'not_checked', nameMatch: null, phoneMatch: null, listingUrl: null, shownPhone: null, evidenceId: null, checkedAt: null });
    expect(r.businesses[0]!.listings.map((l) => l.host)).toEqual(dirs.map((d) => d.host));
  });

  it('a seeded run gives the exact shape: self first, then the run order, a missing row is not_checked', async () => {
    const self = await seedSelf();
    await track(IDS.competitorX);
    const cap = await seedCapture({ competitorId: self, source: 'google_search', kinds: ['text', 'vendor_json'] });
    const h0 = dirs[0]!.host;
    const h1 = dirs[1]!.host;
    await listing({ competitorId: self, host: h0, nameMatch: true, phoneMatch: false, listingUrl: `https://${h0}/self`, shownPhone: '5125550100', captureId: cap.captureId });
    await listing({ competitorId: self, host: h1, status: 'not_found' });
    await listing({ competitorId: IDS.competitorX, host: h0, nameMatch: true, phoneMatch: true, listingUrl: `https://${h0}/x` });
    const at = await run('done', [self, IDS.competitorX], 3);
    const r = await call();
    expect(r.status).toBe('done');
    expect(r.checkedAt).toBe(at.toISOString());
    expect(r.businesses.map((b) => [b.name, b.self])).toEqual([['A1 HVAC', true], ['Smith HVAC', false]]);
    const [s, x] = r.businesses;
    expect(s!.listings[0]).toEqual({
      host: h0, status: 'listed', nameMatch: true, phoneMatch: false, listingUrl: `https://${h0}/self`, shownPhone: '5125550100', evidenceId: cap.ids.text, checkedAt: expect.any(String),
    });
    expect(s!.listings[1]).toMatchObject({ host: h1, status: 'not_found', listingUrl: null });
    expect(s!.listings[2]).toMatchObject({ status: 'not_checked', checkedAt: null });
    expect(x!.listings[0]).toMatchObject({ status: 'listed', phoneMatch: true, evidenceId: null });
    expect(x!.listings[1]).toMatchObject({ status: 'not_checked' });
    expect(s!.listings).toHaveLength(dirs.length);
  });

  it('a rival no longer tracked drops out; status follows the latest run, failed maps to the previous good run', async () => {
    const self = await seedSelf();
    await track(IDS.competitorX);
    const good = await run('capped', [self, IDS.competitorX], 20);
    await run('failed', [self, IDS.competitorX], 1);
    let r = await call();
    expect([r.status, r.checkedAt, r.businesses.length]).toEqual(['capped', good.toISOString(), 2]);
    await dbs.owner.delete(clientCompetitor).where(eq(clientCompetitor.competitorId, IDS.competitorX));
    r = await call();
    expect(r.businesses.map((b) => b.self)).toEqual([true]);
    await run('running', [self], 0, false);
    expect((await call()).status).toBe('running');
    expect((await call()).checkedAt).toBe(good.toISOString());
  });

  it('failed with no earlier good run is never', async () => {
    const self = await seedSelf();
    await run('failed', [self], 1);
    expect(await call()).toMatchObject({ status: 'never', checkedAt: null });
  });

  it('no self competitor: selfMissing true, rivals still listed', async () => {
    await track(IDS.competitorX);
    await listing({ competitorId: IDS.competitorX, host: dirs[0]!.host });
    await run('done', [IDS.competitorX], 2);
    const r = await call();
    expect(r.selfMissing).toBe(true);
    expect(r.businesses.map((b) => [b.name, b.self])).toEqual([['Smith HVAC', false]]);
    expect(r.businesses[0]!.listings[0]).toMatchObject({ status: 'listed' });
  });

  it('a banned or uncatalogued host never appears in listings', async () => {
    const self = await seedSelf();
    await listing({ competitorId: self, host: 'yelp.com', inCatalogue: false });
    await listing({ competitorId: self, host: 'nowhere.example' });
    await run('done', [self], 2);
    const r = await call();
    expect(r.businesses[0]!.listings.map((l) => l.host)).toEqual(dirs.map((d) => d.host));
    expect(JSON.stringify(r.businesses)).not.toMatch(/yelp|nowhere/);
  });

  it('also-found-on: self rows outside the catalogue only (listed, with a link), never a rival and never a catalogue host', async () => {
    const self = await seedSelf();
    await track(IDS.competitorX);
    const cap = await seedCapture({ competitorId: self, source: 'google_search', kinds: ['text'] });
    await listing({ competitorId: self, host: 'chamber.example', inCatalogue: false, listingUrl: 'https://chamber.example/a1', captureId: cap.captureId });
    await listing({ competitorId: self, host: 'gone.example', inCatalogue: false, status: 'not_found' });
    await listing({ competitorId: self, host: dirs[0]!.host, inCatalogue: false, listingUrl: `https://${dirs[0]!.host}/s` });
    await listing({ competitorId: IDS.competitorX, host: 'rival-only.example', inCatalogue: false, listingUrl: 'https://rival-only.example/x' });
    await run('done', [self, IDS.competitorX], 2);
    expect((await call()).alsoFoundOn).toEqual([{ host: 'chamber.example', listingUrl: 'https://chamber.example/a1', evidenceId: cap.ids.text }]);
  });

  it('evidence ids are channel-filtered: MCP never gets vendor_json, Ask does', async () => {
    const self = await seedSelf();
    const cap = await seedCapture({ competitorId: self, source: 'google_search', kinds: ['vendor_json'] });
    await listing({ competitorId: self, host: dirs[0]!.host, listingUrl: 'https://x.example/', captureId: cap.captureId });
    await run('done', [self], 2);
    const ev = async (channel: 'web' | 'mcp' | 'ask') => (await call(am, channel === 'web' ? undefined : { channel, tokenId: 't', tokenScope: 'read' } as never)).businesses[0]!.listings[0]!.evidenceId;
    expect(await ev('mcp')).toBeNull();
    expect(await ev('ask')).toBe(cap.ids.vendor_json);
  });

  it('shownPhone: digits on web, null on mcp and ask (phoneMatch still carries the fact)', async () => {
    const self = await seedSelf();
    await listing({ competitorId: self, host: dirs[0]!.host, phoneMatch: false, shownPhone: '5125550100', listingUrl: 'https://x.example/' });
    await run('done', [self], 2);
    const cell = async (channel?: 'mcp' | 'ask') => (await call(am, channel ? ({ channel, tokenId: 't', tokenScope: 'read' } as never) : undefined)).businesses[0]!.listings[0]!;
    expect(await cell()).toMatchObject({ phoneMatch: false, shownPhone: '5125550100' });
    for (const ch of ['mcp', 'ask'] as const) expect(await cell(ch)).toMatchObject({ phoneMatch: false, shownPhone: null });
  });

  it('RF5: an out-of-scope client, or one without the dashboard feature, is not_found (never an empty answer)', async () => {
    await seedSelf();
    await expect(call(ctx('account_manager', [IDS.clientA2]))).rejects.toMatchObject({ code: 'not_found' });
    await expect(call(ownerNoDash)).rejects.toMatchObject({ code: 'not_found' });
    await expect(call(am, undefined, IDS.clientB1)).rejects.toMatchObject({ code: 'not_found' });
    expect((await call(owner)).businesses).toHaveLength(1);
  });

  it('a client of another agency cannot see this client\'s rows (listings are narrowed to the client)', async () => {
    const [rival] = await dbs.owner.insert(competitor).values({ name: 'Elsewhere Co' }).returning();
    await dbs.owner.insert(clientCompetitor).values({ agencyId: IDS.agencyA, clientId: IDS.clientA2, competitorId: rival!.id });
    await listing({ competitorId: rival!.id, host: dirs[0]!.host });
    const self = await seedSelf();
    await run('done', [self, rival!.id], 2);
    expect((await call()).businesses.map((b) => b.name)).toEqual(['A1 HVAC']);
  });

  it('no usd keys or dollar text', async () => {
    const self = await seedSelf();
    await listing({ competitorId: self, host: dirs[0]!.host, listingUrl: 'https://x.example/' });
    await dbs.owner.insert(citationAuditRun).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, trigger: 'monthly', status: 'done', competitorIds: [self], calls: 4, estUsd: '0.0123', startedAt: ago(1), finishedAt: ago(1) });
    const out = JSON.stringify(await call());
    expect(out).not.toMatch(/usd|\$|rival monday|dataforseo/i);
  });
});
