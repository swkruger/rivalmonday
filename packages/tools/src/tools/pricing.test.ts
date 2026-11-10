import { metaPageUrl } from '@cs/collectors';
import { client, clientCompetitor, competitor, gbpPost, pricePoint } from '@cs/db';
import { createPackLoader, priceHistory, priceMatrix } from '@cs/engine';
import { IDS } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PriceHistoryView, PriceMatrixView } from './schemas';
import { ago, ctx, dbs, registry, resetWorkspace, seedAdImage, seedAdPrice, seedCapture, seedPrice } from './workspace-fixtures';

const am = ctx('account_manager', 'all');
const owner = ctx('client_owner', [IDS.clientA1], ['dashboard']);
const ownerNoDash = ctx('client_owner', [IDS.clientA1]);
const otherAgency = ctx('agency_admin', 'all', [], IDS.agencyB);

beforeEach(resetWorkspace);

describe('get_price_matrix', () => {
  it('lists current prices per tracked competitor with the change against 90 days ago (decision 3)', async () => {
    await dbs.owner.update(client).set({ services: ['ac_tune_up'] }).where(eq(client.id, IDS.clientA1));
    await seedPrice({ serviceId: 'ac_tune_up', amount: 99, from: ago(120), to: ago(30) });
    await seedPrice({ serviceId: 'ac_tune_up', amount: 79, from: ago(30), promo: true });
    await seedPrice({ serviceId: 'furnace_repair', amount: 129, from: ago(10) });
    await seedPrice({ serviceId: 'ac_tune_up', amount: 59, from: ago(5), competitorId: IDS.competitorY }); // A2's competitor
    const r = (await registry.invoke(owner, 'get_price_matrix', { clientId: IDS.clientA1 })) as PriceMatrixView;
    expect(r.services).toEqual([
      { id: 'ac_tune_up', name: 'AC tune-up', offered: true },
      { id: 'furnace_repair', name: 'Furnace repair', offered: false },
    ]);
    expect(r.rows.map((row) => row.name)).toEqual(['Smith HVAC']);
    expect(r.rows[0]!.cells.map((c) => [c.serviceId, c.prices.map((p) => p.amount), c.change])).toEqual([
      ['ac_tune_up', [79], { before: 99, after: 79 }],
      ['furnace_repair', [129], null],
    ]);
    expect(r.rows[0]!.cells[0]!.prices[0]).toMatchObject({ unit: 'USD', qualifier: 'exact', promo: true });
  });

  it('ad price listed with source meta_ad and Ad Library url', async () => {
    await seedPrice({ serviceId: 'ac_tune_up', amount: 89, from: ago(10) });
    await seedAdPrice({ serviceId: 'ac_tune_up', amount: 59, from: ago(3) });
    const r = (await registry.invoke(am, 'get_price_matrix', { clientId: IDS.clientA1 })) as PriceMatrixView;
    expect(r.rows[0]!.cells[0]!.prices.map((p) => [p.amount, p.source])).toEqual([[59, 'meta_ad'], [89, 'web']]);
    const m = await priceMatrix({ db: dbs.service, packs: createPackLoader() }, IDS.clientA1);
    expect(m.rows[0]!.cells.ac_tune_up!.find((p) => p.source === 'meta_ad')).toMatchObject({ amount: 59, pageUrl: metaPageUrl('4242') });
    expect(m.rows[0]!.cells.ac_tune_up!.find((p) => p.source === 'web')!.pageUrl).toMatch(/^https:\/\//);
  });

  it('ad price below the web price does not change the cell lowest or 90-day change', async () => {
    await seedPrice({ serviceId: 'ac_tune_up', amount: 99, from: ago(120), to: ago(30) });
    await seedPrice({ serviceId: 'ac_tune_up', amount: 79, from: ago(30) });
    await seedAdPrice({ serviceId: 'ac_tune_up', amount: 29, from: ago(120) });
    await seedAdPrice({ serviceId: 'furnace_repair', amount: 19, from: ago(5) });
    const r = (await registry.invoke(am, 'get_price_matrix', { clientId: IDS.clientA1 })) as PriceMatrixView;
    const cells = Object.fromEntries(r.rows[0]!.cells.map((c) => [c.serviceId, c]));
    expect(cells.ac_tune_up!.change).toEqual({ before: 99, after: 79 });
    expect(cells.ac_tune_up!.prices).toHaveLength(2);
    expect(cells.furnace_repair).toMatchObject({ change: null, prices: [expect.objectContaining({ amount: 19, source: 'meta_ad' })] });
  });

  it('shows non-USD units but never compares them', async () => {
    await seedPrice({ serviceId: 'drain_cleaning', amount: 95, unit: 'USD/hour', qualifier: 'from', from: ago(100) });
    const r = (await registry.invoke(am, 'get_price_matrix', { clientId: IDS.clientA1 })) as PriceMatrixView;
    expect(r.rows[0]!.cells).toEqual([{ serviceId: 'drain_cleaning', prices: [expect.objectContaining({ amount: 95, unit: 'USD/hour', qualifier: 'from' })], change: null }]);
  });

  it('gives a tracked competitor with no prices an empty cell list, and no services at all', async () => {
    const r = (await registry.invoke(am, 'get_price_matrix', { clientId: IDS.clientA1 })) as PriceMatrixView;
    expect(r).toEqual({ services: [], rows: [{ competitorId: IDS.competitorX, name: 'Smith HVAC', cells: [] }] });
  });

  it('filters to one tracked competitor and refuses an untracked one (Review Focus 2)', async () => {
    await seedPrice({ serviceId: 'ac_tune_up', amount: 79, from: ago(3) });
    const r = (await registry.invoke(am, 'get_price_matrix', { clientId: IDS.clientA1, competitorId: IDS.competitorX })) as PriceMatrixView;
    expect(r.rows).toHaveLength(1);
    await expect(registry.invoke(am, 'get_price_matrix', { clientId: IDS.clientA1, competitorId: IDS.competitorY })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('is not found for another agency and needs dashboard for clients (Review Focus 4)', async () => {
    await expect(registry.invoke(otherAgency, 'get_price_matrix', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(ownerNoDash, 'get_price_matrix', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('get_price_history', () => {
  it('samples the day’s lowest USD price weekly up to today, null before the first sighting (decision 4, Review Focus 3)', async () => {
    await seedPrice({ serviceId: 'ac_tune_up', amount: 99, from: ago(60), to: ago(20) });
    await seedPrice({ serviceId: 'ac_tune_up', amount: 79, from: ago(20) });
    const r = (await registry.invoke(owner, 'get_price_history', { clientId: IDS.clientA1, serviceId: 'ac_tune_up' })) as PriceHistoryView;
    expect(r.serviceName).toBe('AC tune-up');
    expect(r.labels).toHaveLength(13); // 91 days, every 7th counting back from today
    expect(r.labels.at(-1)).toBe(new Date().toISOString().slice(0, 10));
    expect(r.series).toHaveLength(1);
    const pts = r.series[0]!.points;
    expect(pts).toHaveLength(13);
    expect(pts[0]).toBeNull();
    expect(pts).toContain(99);
    expect(pts.at(-1)).toBe(79);
  });

  it('priceHistory ignores ad rows', async () => {
    await seedPrice({ serviceId: 'ac_tune_up', amount: 99, from: ago(60) });
    await seedAdPrice({ serviceId: 'ac_tune_up', amount: 29, from: ago(40) });
    const r = (await registry.invoke(owner, 'get_price_history', { clientId: IDS.clientA1, serviceId: 'ac_tune_up' })) as PriceHistoryView;
    expect(r.series[0]!.points.filter((p) => p !== null)).not.toContain(29);
    expect(r.series[0]!.points.at(-1)).toBe(99);
    const spans = await priceHistory(dbs.service, { competitorId: IDS.competitorX, verticalId: 'hvac_plumbing', serviceId: 'ac_tune_up', since: ago(90) });
    expect(spans.map((x) => x.amount)).toEqual([99]);
  });

  it('sizes the labels by period and leaves out tracked competitors without a price', async () => {
    const [z] = await dbs.owner.insert(competitor).values({ name: 'Zed Air', domain: 'zed.example' }).returning();
    await dbs.owner.insert(clientCompetitor).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: z!.id });
    await seedPrice({ serviceId: 'ac_tune_up', amount: 79, from: ago(2) });
    const r = (await registry.invoke(am, 'get_price_history', { clientId: IDS.clientA1, serviceId: 'ac_tune_up', days: 180 })) as PriceHistoryView;
    expect(r.labels).toHaveLength(26);
    expect(r.series.map((s) => s.name)).toEqual(['Smith HVAC']);
  });

  it('refuses an unknown service and an untracked competitor', async () => {
    await expect(registry.invoke(am, 'get_price_history', { clientId: IDS.clientA1, serviceId: 'nope' })).rejects.toMatchObject({ code: 'invalid_input', message: 'Unknown service' });
    await expect(registry.invoke(am, 'get_price_history', { clientId: IDS.clientA1, serviceId: 'ac_tune_up', competitorId: IDS.competitorY })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(ownerNoDash, 'get_price_history', { clientId: IDS.clientA1, serviceId: 'ac_tune_up' })).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('post prices (18b-1)', () => {
  it('post price shown with source gbp_post and postUrl, not in lowest or 90-day change, not in history', async () => {
    await seedPrice({ serviceId: 'ac_tune_up', amount: 99, from: ago(120), to: ago(30) });
    await seedPrice({ serviceId: 'ac_tune_up', amount: 79, from: ago(30) });
    const first = await seedCapture({ competitorId: IDS.competitorX, at: ago(5), kinds: [] });
    const [g] = await dbs.owner.insert(gbpPost).values({ competitorId: IDS.competitorX, externalId: 'gp1', url: 'https://posts.example/gp1', firstCaptureId: first.captureId, lastCaptureId: first.captureId, firstSeenAt: ago(5), lastSeenAt: new Date() }).returning({ id: gbpPost.id });
    await dbs.owner.insert(pricePoint).values({ competitorId: IDS.competitorX, gbpPostId: g!.id, verticalId: 'hvac_plumbing', serviceId: 'ac_tune_up', amount: 19, unit: 'USD', qualifier: 'exact', promo: true, raw: '$19', context: 'c', firstSeenAt: ago(5), lastSeenAt: new Date(), firstCaptureId: first.captureId, lastCaptureId: first.captureId });
    const r = (await registry.invoke(am, 'get_price_matrix', { clientId: IDS.clientA1 })) as PriceMatrixView;
    const cell = r.rows[0]!.cells[0]!;
    expect(cell.change).toEqual({ before: 99, after: 79 });
    expect(cell.prices.find((p) => p.source === 'gbp_post')).toMatchObject({ amount: 19, promo: true, postUrl: 'https://posts.example/gp1' });
    expect(cell.prices.find((p) => p.source === 'web')).not.toHaveProperty('postUrl');
    const h = (await registry.invoke(owner, 'get_price_history', { clientId: IDS.clientA1, serviceId: 'ac_tune_up' })) as PriceHistoryView;
    expect(h.series[0]!.points.filter((p) => p !== null)).not.toContain(19);
  });
});

describe('image prices (18a-3)', () => {
  it('image price ⇒ source ad_image, evidenceIds [id], Google library pageUrl, not in lowest or 90-day change, not in history', async () => {
    await seedPrice({ serviceId: 'ac_tune_up', amount: 99, from: ago(120), to: ago(30) });
    await seedPrice({ serviceId: 'ac_tune_up', amount: 79, from: ago(30) });
    const img = await seedAdImage({ price: { serviceId: 'ac_tune_up', amount: 29, from: ago(120) } });
    const m = await priceMatrix({ db: dbs.service, packs: createPackLoader() }, IDS.clientA1);
    expect(m.rows[0]!.cells.ac_tune_up![0]).toMatchObject({ amount: 29, source: 'ad_image', evidenceIds: [img.evidenceId], pageUrl: expect.stringMatching(/^https:\/\/adstransparency\.google\.com\/advertiser\/AR777\/creative\/gad-/) });
    const r = (await registry.invoke(am, 'get_price_matrix', { clientId: IDS.clientA1 })) as PriceMatrixView;
    const cell = r.rows[0]!.cells[0]!;
    expect(cell.change).toEqual({ before: 99, after: 79 });
    expect(cell.prices.map((p) => [p.amount, p.source])).toEqual([[29, 'ad_image'], [79, 'web']]);
    const h = (await registry.invoke(owner, 'get_price_history', { clientId: IDS.clientA1, serviceId: 'ac_tune_up' })) as PriceHistoryView;
    expect(h.series[0]!.points.filter((p) => p !== null)).not.toContain(29);
  });

  it('get_price_matrix image price row carries evidenceIds so Ask can cite it', async () => {
    const img = await seedAdImage({ price: { serviceId: 'ac_tune_up', amount: 39, from: ago(3) } });
    await seedPrice({ serviceId: 'ac_tune_up', amount: 89, from: ago(10) });
    const r = (await registry.invoke(am, 'get_price_matrix', { clientId: IDS.clientA1 }, { channel: 'ask' })) as PriceMatrixView;
    const prices = r.rows[0]!.cells[0]!.prices;
    expect(prices.find((p) => p.source === 'ad_image')!.evidenceIds).toEqual([img.evidenceId]);
    expect(prices.find((p) => p.source === 'web')!.evidenceIds).toEqual([]);
  });

  it("other client's competitor image ⇒ not_found", async () => {
    await seedAdImage({ competitorId: IDS.competitorY, price: { serviceId: 'ac_tune_up', amount: 39, from: ago(3) } });
    await expect(registry.invoke(am, 'get_price_matrix', { clientId: IDS.clientA1, competitorId: IDS.competitorY })).rejects.toMatchObject({ code: 'not_found' });
    const r = (await registry.invoke(am, 'get_price_matrix', { clientId: IDS.clientA1 })) as PriceMatrixView;
    expect(JSON.stringify(r)).not.toContain('"ad_image"');
  });
});
