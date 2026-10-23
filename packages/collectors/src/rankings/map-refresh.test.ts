import { fitStaticMap, rankGridBounds } from '@cs/core';
import { client, rankMapImage } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, spendPauseClient, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { refreshRankMap } from './map-refresh';
import { rankMapSettingsHash } from './settings';
import type { StaticMapClient } from './static-map';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const center = { lat: 33.9, lng: -84.3 };
const fakeMaps = () => ({ fetchStatic: vi.fn(async () => new Uint8Array([137, 80, 78, 71])) }) satisfies StaticMapClient;
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.service.update(client).set({ serviceArea: { center, radiusKm: 8, zips: [] }, rankGridSize: 5 }).where(eq(client.id, IDS.clientA1));
});

describe('refreshRankMap', () => {
  it('no key -> skipped, no fetch', async () => {
    expect(await refreshRankMap({ db: dbs.service, store: createMemoryStore(), maps: null }, IDS.clientA1)).toBe('skipped');
    expect(await dbs.service.select().from(rankMapImage)).toHaveLength(0);
  });

  it('no service area -> skipped', async () => {
    await dbs.service.update(client).set({ serviceArea: null }).where(eq(client.id, IDS.clientA1));
    const maps = fakeMaps();
    expect(await refreshRankMap({ db: dbs.service, store: createMemoryStore(), maps }, IDS.clientA1)).toBe('skipped');
    expect(maps.fetchStatic).not.toHaveBeenCalled();
  });

  it('rank map refresh with an existing key stores the row', async () => {
    const store = createMemoryStore();
    const hash = rankMapSettingsHash({ center, radiusKm: 8, gridSize: 5 });
    await store.put(`rank-map/${IDS.clientA1}/${hash}.png`, new Uint8Array([1]), 'image/png');
    expect(await refreshRankMap({ db: dbs.service, store, maps: fakeMaps() }, IDS.clientA1)).toBe('stored');
    expect(await dbs.service.select().from(rankMapImage)).toHaveLength(1);
  });

  it('changed settings -> fetch with the fitted frame, store, upsert; same settings -> unchanged', async () => {
    const store = createMemoryStore();
    const maps = fakeMaps();
    expect(await refreshRankMap({ db: dbs.service, store, maps }, IDS.clientA1)).toBe('stored');
    const frame = fitStaticMap(rankGridBounds(center, 8, 5));
    expect(maps.fetchStatic).toHaveBeenCalledWith({ center: frame.center, zoom: frame.zoom, width: frame.width, height: frame.height }, { agencyId: IDS.agencyA, clientId: IDS.clientA1 });
    const hash = rankMapSettingsHash({ center, radiusKm: 8, gridSize: 5 });
    const [row] = await dbs.service.select().from(rankMapImage);
    expect(row).toMatchObject({ clientId: IDS.clientA1, agencyId: IDS.agencyA, settingsHash: hash, objectKey: `rank-map/${IDS.clientA1}/${hash}.png`, width: frame.width, height: frame.height, bounds: frame.bounds });
    expect(await store.exists(row!.objectKey)).toBe(true);

    expect(await refreshRankMap({ db: dbs.service, store, maps }, IDS.clientA1)).toBe('unchanged');
    expect(maps.fetchStatic).toHaveBeenCalledTimes(1);

    await dbs.service.update(client).set({ serviceArea: { center, radiusKm: 12, zips: [] } }).where(eq(client.id, IDS.clientA1));
    expect(await refreshRankMap({ db: dbs.service, store, maps }, IDS.clientA1)).toBe('stored');
    expect(maps.fetchStatic).toHaveBeenCalledTimes(2);
    const rows = await dbs.service.select().from(rankMapImage);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.settingsHash).toBe(rankMapSettingsHash({ center, radiusKm: 12, gridSize: 5 }));
  });
});

describe('refreshRankMap and a spend-paused client (7b1)', () => {
  it('spend-paused client is not offered a map refresh: no fetch, nothing stored', async () => {
    await spendPauseClient(dbs.owner, IDS.clientA1);
    const maps = fakeMaps();
    expect(await refreshRankMap({ db: dbs.service, store: createMemoryStore(), maps }, IDS.clientA1)).toBe('skipped');
    expect(maps.fetchStatic).not.toHaveBeenCalled();
    expect(await dbs.service.select().from(rankMapImage)).toHaveLength(0);
  });
});
