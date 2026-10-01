import type { VendorCallRecord } from '@cs/core';
import { describe, expect, it, vi } from 'vitest';
import { VendorError } from './errors';
import { fetchMetaAdsScrapeCreators } from './scrapecreators';

function setup(responses: Response[]) {
  const records: VendorCallRecord[] = [];
  const fetch = vi.fn(async () => responses.shift() ?? new Response('{}', { status: 500 }));
  const ledger = {
    recordLlmCall: async () => {},
    recordVendorCall: async (r: VendorCallRecord) => {
      records.push(r);
    },
  };
  return { fetch, records, ledger };
}

const page = (results: unknown[], cursor: string | null) => new Response(JSON.stringify({ success: true, results, cursor }), { status: 200 });

describe('fetchMetaAdsScrapeCreators', () => {
  it('follows the cursor across pages, concatenating results with one ledger row per page', async () => {
    const { fetch, records, ledger } = setup([page([{ id: 'a' }], 'next-cursor'), page([{ id: 'b' }], null)]);
    const items = await fetchMetaAdsScrapeCreators({ apiKey: 'super-secret-key', ledger, fetch: fetch as unknown as typeof globalThis.fetch }, '99');
    expect(items).toEqual({ items: [{ id: 'a' }, { id: 'b' }], truncated: false });
    expect(records).toHaveLength(2);
    expect(records.every((r) => r.ok)).toBe(true);
    const [secondUrl] = fetch.mock.calls[1] as unknown as [string];
    expect(secondUrl).toContain('cursor=next-cursor');
  });

  it('rejects with VendorError and returns no partial results when a later page fails', async () => {
    const { fetch, records, ledger } = setup([page([{ id: 'a' }], 'next-cursor'), new Response('boom', { status: 500 })]);
    await expect(
      fetchMetaAdsScrapeCreators({ apiKey: 'k', ledger, fetch: fetch as unknown as typeof globalThis.fetch }, '99'),
    ).rejects.toBeInstanceOf(VendorError);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ ok: true });
    expect(records[1]).toMatchObject({ ok: false });
  });

  it('throws a non-retryable VendorError when the vendor reports success: false', async () => {
    const { fetch, records, ledger } = setup([new Response(JSON.stringify({ success: false, results: [], cursor: null }), { status: 200 })]);
    const err = await fetchMetaAdsScrapeCreators({ apiKey: 'k', ledger, fetch: fetch as unknown as typeof globalThis.fetch }, '99').catch((e) => e);
    expect(err).toBeInstanceOf(VendorError);
    expect(err).toMatchObject({ vendor: 'scrapecreators', retryable: false });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ ok: false });
  });

  it('never leaks the api key into error messages or ledger records', async () => {
    const { fetch, records, ledger } = setup([new Response('server error', { status: 500 })]);
    const err = await fetchMetaAdsScrapeCreators({ apiKey: 'super-secret-key', ledger, fetch: fetch as unknown as typeof globalThis.fetch }, '99').catch((e) => e);
    expect(err).toBeInstanceOf(VendorError);
    expect(JSON.stringify({ message: err.message, vendor: err.vendor, code: err.code, retryable: err.retryable })).not.toContain('super-secret-key');
    expect(JSON.stringify(records)).not.toContain('super-secret-key');
  });

  it('reports truncated when the page limit stops the loop with a cursor still left', async () => {
    const { fetch, ledger } = setup([page([{ id: 'a' }], 'c1'), page([{ id: 'b' }], 'c2')]);
    const r = await fetchMetaAdsScrapeCreators({ apiKey: 'k', ledger, fetch: fetch as unknown as typeof globalThis.fetch, maxPages: 2 }, '99');
    expect(r).toEqual({ items: [{ id: 'a' }, { id: 'b' }], truncated: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('treats an empty-string cursor (the live terminal-page value) as no cursor, not truncated', async () => {
    // Live-verified 2026-10-01: the real API sends `"cursor": ""` on the last page, not null/absent.
    const { fetch, ledger } = setup([page([{ id: 'a' }], '')]);
    const r = await fetchMetaAdsScrapeCreators({ apiKey: 'k', ledger, fetch: fetch as unknown as typeof globalThis.fetch }, '99');
    expect(r).toEqual({ items: [{ id: 'a' }], truncated: false });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
