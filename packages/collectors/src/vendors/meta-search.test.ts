import type { VendorCallRecord } from '@cs/core';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { searchMetaPages } from './meta-search';

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
    const out = await searchMetaPages({ apiKey: 'k', ledger, fetch }, q, scope);
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
    const out = await searchMetaPages({ apiKey: 'k', apifyToken: 't', ledger, fetch }, q, scope);
    expect(out).toContainEqual({ pageId: '193259817196676', pageName: 'Main Street Plumbing', activeAds: expect.any(Number) });
    const apifyCall = mock.mock.calls.find((c) => String(c[0]).includes('apify'))!;
    expect(String((apifyCall[1] as RequestInit).body)).toContain('search_type=keyword_unordered');
  });

  it('Meta both vendors fail -> null', async () => {
    const { ledger, fetch } = setup(() => new Response('{}', { status: 500 }));
    expect(await searchMetaPages({ apiKey: 'k', apifyToken: 't', ledger, fetch }, q, scope)).toBeNull();
  });

  it('no credentials at all -> null without calling anything', async () => {
    const { ledger, fetch, mock } = setup(() => new Response('{}'));
    expect(await searchMetaPages({ ledger, fetch }, q, scope)).toBeNull();
    expect(mock).not.toHaveBeenCalled();
  });

  it('ledger receives agency and client ids', async () => {
    const { ledger, fetch, records } = setup(() => new Response(fx('scrapecreators-adlibrary-search.json'), { status: 200 }));
    await searchMetaPages({ apiKey: 'k', ledger, fetch }, q, scope);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ agencyId: 'ag', clientId: 'cl', vendor: 'scrapecreators' });
  });
});
