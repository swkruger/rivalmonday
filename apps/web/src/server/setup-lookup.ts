import 'server-only';
import { createDataForSeo, DFS_BASE_URL, type MapsPlace, mapsSearchByText } from '@cs/collectors';
import { createLedgerSink, type Db, type EnvName } from '@cs/db';
import type { ToolDeps } from '@cs/tools';
import distilleries from '../../e2e/fixtures/setup-lookup-distillery.json';
import fixture from '../../e2e/fixtures/setup-lookup.json';

type SetupLookup = NonNullable<ToolDeps['setupLookup']>;

/** The fixed places E2E and DEMO answer with: three Granbury dentists (two distilleries when the search says "distillery"), never a paid call. */
export const fixtureSetupLookup: SetupLookup = async (q) => (/distiller/i.test(q.keyword) ? distilleries : fixture) as MapsPlace[];

/** DataForSEO credentials present (the one rule for "vendors configured": the business search and `request_citation_audit`). */
export const dataForSeoConfigured = (env: NodeJS.ProcessEnv): boolean => Boolean(env.DATAFORSEO_LOGIN && env.DATAFORSEO_PASSWORD);

/**
 * Phase 11a Task 10: `find_business`'s search. Fixture under `SETUP_FAKE_LOOKUP` and in the DEMO/TEST environments
 * (R5: demo never spends); otherwise DataForSEO on the service connection with the cost-ledger sink. No credentials
 * means absent, and the tool then refuses with `SEARCH_UNAVAILABLE` ("Business search isn't available right now. …"). The client is built lazily.
 */
export function setupLookupFor(name: EnvName, service: Db, env: { fake: boolean; processEnv: NodeJS.ProcessEnv }): SetupLookup | undefined {
  if (env.fake || name === 'demo' || name === 'test') return fixtureSetupLookup;
  const { DATAFORSEO_LOGIN: login, DATAFORSEO_PASSWORD: password, DATAFORSEO_BASE_URL: baseUrl } = env.processEnv;
  if (!login || !password) return undefined; // = !dataForSeoConfigured(env.processEnv)
  let dfs: ReturnType<typeof createDataForSeo> | undefined;
  return async (q, scope) => {
    dfs ??= createDataForSeo({ login, password, baseUrl: baseUrl || DFS_BASE_URL, ledger: createLedgerSink(service) });
    return (await mapsSearchByText(dfs, q, scope)).places;
  };
}
