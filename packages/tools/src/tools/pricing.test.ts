import { client, clientCompetitor, competitor } from '@cs/db';
import { IDS } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PriceHistoryView, PriceMatrixView } from './schemas';
import { ago, ctx, dbs, registry, resetWorkspace, seedPrice } from './workspace-fixtures';

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
    await expect(registry.invoke(ownerNoDash, 'get_price_matrix', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'permission_denied' });
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
    await expect(registry.invoke(ownerNoDash, 'get_price_history', { clientId: IDS.clientA1, serviceId: 'ac_tune_up' })).rejects.toMatchObject({ code: 'permission_denied' });
  });
});
