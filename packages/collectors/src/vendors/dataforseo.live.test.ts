import { describe, expect, it } from 'vitest';
import { createDataForSeo, DFS_SANDBOX_URL } from './dataforseo';
import { VendorError } from './errors';

const { DATAFORSEO_LOGIN: login, DATAFORSEO_PASSWORD: password } = process.env;

// Account-level blocks (not response-shape problems): 40104 account not yet verified, 40201
// account temporarily paused by DataForSEO. Seen live on 2026-10-01 — the test skips loudly instead
// of failing the suite, since only the account owner can resolve them in the DataForSEO panel.
const ACCOUNT_BLOCKED = /: (40104|40201) /;

// Free sandbox (mock data, real response shapes). Runs only when credentials are present.
describe.skipIf(!login || !password)('DataForSEO sandbox contract', () => {
  it('returns a maps SERP task with items', async (ctx) => {
    const dfs = createDataForSeo({ login: login as string, password: password as string, baseUrl: DFS_SANDBOX_URL, ledger: { recordLlmCall: async () => {}, recordVendorCall: async () => {} } });
    let t;
    try {
      [t] = await dfs.post('/serp/google/maps/live/advanced', [{ keyword: 'hvac repair', location_code: 2840, language_code: 'en', depth: 10 }], { agencyId: null, clientId: null });
    } catch (err) {
      if (err instanceof VendorError && ACCOUNT_BLOCKED.test(err.message)) {
        console.warn(`[dataforseo.live] SKIPPED — DataForSEO account blocked: ${err.message}`);
        ctx.skip();
      }
      throw err;
    }
    expect(t?.statusCode).toBe(20000);
    expect(Array.isArray((t?.result[0] as { items?: unknown[] })?.items)).toBe(true);
  }, 60_000);
});
