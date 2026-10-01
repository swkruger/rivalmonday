import type { VendorCallRecord } from '@cs/core';
import { describe, expect, it, vi } from 'vitest';
import { APIFY_META_ACTOR, fetchMetaAdsApify } from './apify';
import { VendorError } from './errors';

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

describe('fetchMetaAdsApify', () => {
  it('throws a non-retryable VendorError when the body is not an array', async () => {
    const { fetch, records, ledger } = setup([new Response(JSON.stringify({ not: 'an array' }), { status: 200 })]);
    const err = await fetchMetaAdsApify({ token: 'super-secret-token', ledger, fetch: fetch as unknown as typeof globalThis.fetch }, '99').catch((e) => e);
    expect(err).toBeInstanceOf(VendorError);
    expect(err).toMatchObject({ vendor: 'apify', retryable: false });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ vendor: 'apify', operation: APIFY_META_ACTOR, ok: false });
  });

  it('throws a retryable VendorError on HTTP 408 (Apify sync run timeout)', async () => {
    const { fetch, records, ledger } = setup([new Response('timeout', { status: 408 })]);
    const err = await fetchMetaAdsApify({ token: 'super-secret-token', ledger, fetch: fetch as unknown as typeof globalThis.fetch }, '99').catch((e) => e);
    expect(err).toBeInstanceOf(VendorError);
    expect(err).toMatchObject({ vendor: 'apify', code: 408, retryable: true });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ ok: false });
  });

  it('never leaks the token into error messages or ledger records', async () => {
    const { fetch, records, ledger } = setup([new Response('server error', { status: 500 })]);
    const err = await fetchMetaAdsApify({ token: 'super-secret-token', ledger, fetch: fetch as unknown as typeof globalThis.fetch }, '99').catch((e) => e);
    expect(err).toBeInstanceOf(VendorError);
    expect(JSON.stringify({ message: err.message, vendor: err.vendor, code: err.code, retryable: err.retryable })).not.toContain('super-secret-token');
    expect(JSON.stringify(records)).not.toContain('super-secret-token');
  });
});
