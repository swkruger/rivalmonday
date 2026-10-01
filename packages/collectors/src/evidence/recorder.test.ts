import { capture, evidence, trackedPage } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { gunzipSync } from 'node:zlib';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RenderedPage } from '../web/renderer';
import { recordWebCapture } from './recorder';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const PAGE = '00000000-0000-4000-8000-0000000000e1';
const tp = { id: PAGE, competitorId: IDS.competitorX, url: 'https://smithhvac.example/pricing' };

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.service.insert(trackedPage).values({ ...tp, pageType: 'pricing', source: 'sitemap', cadence: 'daily' });
});

let t = Date.parse('2026-10-01T06:00:00Z');
const now = () => new Date((t += 60_000));

function page(text: string, overrides: Partial<RenderedPage> = {}): RenderedPage & { screenshot: ReturnType<typeof vi.fn> } {
  return {
    requestedUrl: tp.url, finalUrl: tp.url, httpStatus: 200, status: 'ok', title: 'Pricing',
    html: `<html><body>${text}</body></html>`, text, links: [], error: null,
    screenshot: vi.fn(async () => new Uint8Array([0x52, 0x49, 0x46, 0x46])),
    close: async () => {},
    ...overrides,
  } as RenderedPage & { screenshot: ReturnType<typeof vi.fn> };
}

describe('recordWebCapture', () => {
  it('stores html, text and screenshot for a new page', async () => {
    const store = createMemoryStore();
    const p = page('AC tune-up $99');
    const r = await recordWebCapture({ db: dbs.service, store, now }, { trackedPage: tp, page: p });
    expect(r.status).toBe('ok');
    expect(r.evidenceKeys).toEqual([
      `evidence/${IDS.competitorX}/${r.captureId}/page.html.gz`,
      `evidence/${IDS.competitorX}/${r.captureId}/text.txt`,
      `evidence/${IDS.competitorX}/${r.captureId}/screenshot.webp`,
    ]);
    const rows = await dbs.service.select().from(evidence).where(eq(evidence.captureId, r.captureId));
    expect(rows.map((e) => e.kind).sort()).toEqual(['html', 'screenshot', 'text']);
    expect(rows.every((e) => /^[0-9a-f]{64}$/.test(e.sha256))).toBe(true);
    expect(gunzipSync(Buffer.from((await store.get(r.evidenceKeys[0] as string)) ?? [])).toString()).toContain('AC tune-up $99');
    const [tpRow] = await dbs.service.select().from(trackedPage).where(eq(trackedPage.id, PAGE));
    expect(tpRow?.lastCapturedAt).not.toBeNull();
  });

  it('records unchanged (no objects, no screenshot) when visible text is the same', async () => {
    const store = createMemoryStore();
    await recordWebCapture({ db: dbs.service, store, now }, { trackedPage: tp, page: page('AC tune-up $99') });
    const put = vi.spyOn(store, 'put');
    const again = page('  AC   tune-up $99 \n');
    const r = await recordWebCapture({ db: dbs.service, store, now }, { trackedPage: tp, page: again });
    expect(r).toMatchObject({ status: 'unchanged', evidenceKeys: [] });
    expect(put).not.toHaveBeenCalled();
    expect(again.screenshot).not.toHaveBeenCalled();
  });

  it('stores a new capture when the text changes', async () => {
    const store = createMemoryStore();
    await recordWebCapture({ db: dbs.service, store, now }, { trackedPage: tp, page: page('AC tune-up $99') });
    const r = await recordWebCapture({ db: dbs.service, store, now }, { trackedPage: tp, page: page('AC tune-up $79') });
    expect(r.status).toBe('ok');
    expect(r.evidenceKeys).toHaveLength(3);
  });

  it('records blocked/timeout/robots statuses without evidence', async () => {
    const store = createMemoryStore();
    for (const status of ['blocked', 'timeout', 'robots_disallowed', 'error'] as const) {
      const r = await recordWebCapture({ db: dbs.service, store, now }, { trackedPage: tp, page: page('', { status, httpStatus: status === 'blocked' ? 403 : null, error: status === 'error' ? 'boom' : null }) });
      expect(r).toMatchObject({ status, evidenceKeys: [] });
    }
    const caps = await dbs.service.select().from(capture).where(eq(capture.trackedPageId, PAGE));
    expect(caps.map((c) => c.status).sort()).toEqual(['blocked', 'error', 'robots_disallowed', 'timeout']);
    expect(await dbs.service.select().from(evidence)).toEqual([]);
  });
});
