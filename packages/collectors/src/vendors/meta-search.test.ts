import type { VendorCallRecord } from '@cs/core';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { META_SEARCH_COST_USD, META_SEARCH_COUNT, searchMetaPages } from './meta-search';

const fx = (n: string) => readFileSync(fileURLToPath(new URL(`../../test/fixtures/vendors/${n}`, import.meta.url)), 'utf8');
const scope = { agencyId: 'ag', clientId: 'cl' };
const q = { name: 'Granbury Dental', country: 'US' as const };

function setup(handler: (url: string) => Response) {
  const records: VendorCallRecord[] = [];
  const ledger = { recordLlmCall: async () => {}, recordVendorCall: async (r: VendorCallRecord) => { records.push(r); } };
  const fetch = vi.fn(async (u: string | URL | Request, _init?: RequestInit) => handler(String(u)));
  return { records, ledger, fetch: fetch as unknown as typeof globalThis.fetch, mock: fetch };
}

describe('searchMetaPages', () => {
  it('ScrapeCreators: groups the fixture by page id and counts active ads', async () => {
    const raw = JSON.parse(fx('scrapecreators-adlibrary-search.json')) as { searchResults: { page_id: string; is_active: boolean }[] };
    const { ledger, fetch, mock } = setup(() => new Response(fx('scrapecreators-adlibrary-search.json'), { status: 200 }));
    const r = await searchMetaPages({ apiKey: 'k', ledger, fetch }, q, scope);
    expect(r).toMatchObject({ vendor: 'scrapecreators', costUsd: META_SEARCH_COST_USD.scrapecreators });
    const out = r.pages;
    const ids = new Set(raw.searchResults.map((r) => r.page_id));
    expect(out).not.toBeNull();
    expect(out!.map((p) => p.pageId).sort()).toEqual([...ids].sort());
    const first = [...ids][0]!;
    expect(out!.find((p) => p.pageId === first)!.activeAds).toBe(raw.searchResults.filter((r) => r.page_id === first && r.is_active).length);
    expect(out!.find((p) => p.pageId === '263199177146')!.pageName).toBe('Granbury Dental Center');
    const url = String(mock.mock.calls[0]![0]);
    expect(url).toContain('/v1/facebook/adLibrary/search/ads');
    expect(url).toContain('query=Granbury+Dental');
    expect(url).toContain('status=ACTIVE');
  });

  it('falls back to Apify keyword search when ScrapeCreators errors', async () => {
    const { ledger, fetch, mock } = setup((u) => (u.includes('scrapecreators') ? new Response('{}', { status: 500 }) : new Response(fx('apify-meta-ad.json'), { status: 201 })));
    const r = await searchMetaPages({ apiKey: 'k', apifyToken: 't', ledger, fetch }, q, scope);
    expect(r.vendor).toBe('apify');
    // Both calls were made: ScrapeCreators' attempt plus Apify's count × per-ad price.
    expect(r.costUsd).toBeCloseTo(META_SEARCH_COST_USD.scrapecreators + META_SEARCH_COUNT * META_SEARCH_COST_USD.apifyPerAd, 6);
    expect(r.pages).toContainEqual({ pageId: '193259817196676', pageName: 'Main Street Plumbing', activeAds: expect.any(Number) });
    const apifyCall = mock.mock.calls.find((c) => String(c[0]).includes('apify'))!;
    const body = JSON.parse(String((apifyCall[1] as RequestInit).body)) as { count: number; limitPerSource: number; urls: { url: string }[] };
    expect(body.urls[0]!.url).toContain('search_type=keyword_unordered');
    expect(body).toMatchObject({ count: 30, limitPerSource: 30 });
  });

  it('Meta both vendors fail -> null', async () => {
    const { ledger, fetch, records } = setup(() => new Response('{}', { status: 500 }));
    expect(await searchMetaPages({ apiKey: 'k', apifyToken: 't', ledger, fetch }, q, scope)).toMatchObject({ pages: null, vendor: null });
    expect(records).toHaveLength(2);
    expect(records.every((r) => !r.ok && r.agencyId === 'ag' && r.clientId === 'cl')).toBe(true);
  });

  it('no credentials at all -> null without calling anything', async () => {
    const { ledger, fetch, mock } = setup(() => new Response('{}'));
    expect(await searchMetaPages({ ledger, fetch }, q, scope)).toEqual({ pages: null, vendor: null, costUsd: 0 });
    expect(mock).not.toHaveBeenCalled();
  });

  it('ledger receives agency and client ids', async () => {
    const { ledger, fetch, records } = setup(() => new Response(fx('scrapecreators-adlibrary-search.json'), { status: 200 }));
    await searchMetaPages({ apiKey: 'k', ledger, fetch }, q, scope);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ agencyId: 'ag', clientId: 'cl', vendor: 'scrapecreators', costUsd: META_SEARCH_COST_USD.scrapecreators });
  });

  it('ScrapeCreators rows are capped at the discovery count; the Apify ledger row carries its cost estimate', async () => {
    const many = Array.from({ length: 45 }, (_, n) => ({ page_id: `p${n}`, page_name: `Page ${n}`, is_active: true }));
    const sc = setup(() => new Response(JSON.stringify({ success: true, searchResults: many }), { status: 200 }));
    expect((await searchMetaPages({ apiKey: 'k', ledger: sc.ledger, fetch: sc.fetch }, q, scope)).pages).toHaveLength(META_SEARCH_COUNT);
    const ap = setup(() => new Response(fx('apify-meta-ad.json'), { status: 201 }));
    await searchMetaPages({ apifyToken: 't', ledger: ap.ledger, fetch: ap.fetch }, q, scope);
    expect(ap.records[0]).toMatchObject({ vendor: 'apify', costUsd: META_SEARCH_COUNT * META_SEARCH_COST_USD.apifyPerAd });
  });
});
