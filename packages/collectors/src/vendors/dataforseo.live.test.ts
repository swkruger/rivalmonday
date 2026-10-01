import { describe, expect, it } from 'vitest';
import { createDataForSeo, DFS_SANDBOX_URL } from './dataforseo';

const { DATAFORSEO_LOGIN: login, DATAFORSEO_PASSWORD: password } = process.env;

// Free sandbox (mock data, real response shapes). Runs only when credentials are present.
describe.skipIf(!login || !password)('DataForSEO sandbox contract', () => {
  it('returns a maps SERP task with items', async () => {
    const dfs = createDataForSeo({ login: login as string, password: password as string, baseUrl: DFS_SANDBOX_URL, ledger: { recordLlmCall: async () => {}, recordVendorCall: async () => {} } });
    const [t] = await dfs.post('/serp/google/maps/live/advanced', [{ keyword: 'hvac repair', location_code: 2840, language_code: 'en', depth: 10 }], { agencyId: null, clientId: null });
    expect(t?.statusCode).toBe(20000);
    expect(Array.isArray((t?.result[0] as { items?: unknown[] })?.items)).toBe(true);
  }, 60_000);
});
