import 'server-only';
import { createDataForSeo, DFS_BASE_URL, type MapsPlace, mapsSearchByText } from '@cs/collectors';
import { createLedgerSink, type Db, type EnvName } from '@cs/db';
import type { ToolDeps } from '@cs/tools';
import fixture from '../../e2e/fixtures/setup-lookup.json';

type SetupLookup = NonNullable<ToolDeps['setupLookup']>;

/** The fixed places E2E and DEMO answer with: three Granbury dentists, never a paid call. */
export const fixtureSetupLookup: SetupLookup = async () => fixture as MapsPlace[];

/**
 * Phase 11a Task 10: `find_business`'s search. Fixture under `SETUP_FAKE_LOOKUP` and in the DEMO/TEST environments
 * (R5: demo never spends); otherwise DataForSEO on the service connection with the cost-ledger sink. No credentials
 * means absent, and the tool then refuses with "Business search is not configured". The client is built lazily.
 */
export function setupLookupFor(name: EnvName, service: Db, env: { fake: boolean; processEnv: NodeJS.ProcessEnv }): SetupLookup | undefined {
  if (env.fake || name === 'demo' || name === 'test') return fixtureSetupLookup;
  const { DATAFORSEO_LOGIN: login, DATAFORSEO_PASSWORD: password, DATAFORSEO_BASE_URL: baseUrl } = env.processEnv;
  if (!login || !password) return undefined;
  let dfs: ReturnType<typeof createDataForSeo> | undefined;
  return async (q, scope) => {
    dfs ??= createDataForSeo({ login, password, baseUrl: baseUrl || DFS_BASE_URL, ledger: createLedgerSink(service) });
    return (await mapsSearchByText(dfs, q, scope)).places;
  };
}
