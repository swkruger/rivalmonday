import { capture, evidence } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { gunzipSync } from 'node:zlib';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { recordVendorCapture } from './vendor-capture';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('recordVendorCapture', () => {
  it('stores the raw payload as gzipped vendor_json evidence', async () => {
    const store = createMemoryStore();
    const r = await recordVendorCapture({ db: dbs.service, store }, { competitorId: IDS.competitorX, source: 'google_ads', collectorVersion: 'dfs/1', status: 'ok', payload: { items: [1, 2] } });
    expect(r.objectKey).toBe(`evidence/${IDS.competitorX}/${r.captureId}/vendor.json.gz`);
    expect(JSON.parse(gunzipSync(Buffer.from((await store.get(r.objectKey as string)) ?? [])).toString())).toEqual({ items: [1, 2] });
    const [ev] = await dbs.service.select().from(evidence).where(eq(evidence.captureId, r.captureId));
    expect(ev).toMatchObject({ kind: 'vendor_json', contentType: 'application/gzip' });
  });

  it('records vendor errors without evidence', async () => {
    const r = await recordVendorCapture({ db: dbs.service, store: createMemoryStore() }, { competitorId: IDS.competitorX, source: 'google_ads', collectorVersion: 'dfs/1', status: 'vendor_error', error: '40100 not authorized' });
    expect(r.objectKey).toBeNull();
    const [c] = await dbs.service.select().from(capture).where(eq(capture.id, r.captureId));
    expect(c).toMatchObject({ status: 'vendor_error', error: '40100 not authorized' });
  });
});
