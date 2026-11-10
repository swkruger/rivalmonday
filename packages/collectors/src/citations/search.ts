import type { CallScope } from '@cs/core';
import type { SerpOrganicItem } from '@cs/db';
import { type DataForSeoClient, DFS_US, isDfsOk, isNoResults, isRetryableDfsCode, VendorError } from '../vendors/dataforseo';
import { parseSerp, SERP_OPERATION } from '../rankings/serp';

/** depth 20 = 2 pages x $0.002, both stages (Task 0; a `site:` query was billed $0.01). */
export const CITATION_CALL_USD = 0.004;
/** Depth 50 answers 40101 on narrow quoted queries. */
export const CITATION_DEPTH = 20;
export const CITATION_RUN_CAP_USD = 0.2;
export const CITATIONS_SOURCE = 'directories';

/** One live Google search, no coordinates (US, English), 20 results; `raw` is the vendor result array for evidence. An empty page = nothing found, not a failure. */
export async function citationSearch(
  dfs: DataForSeoClient,
  q: { query: string; depth: 20 },
  scope: CallScope,
): Promise<{ organic: SerpOrganicItem[]; raw: unknown[] }> {
  const [task] = await dfs.post(
    SERP_OPERATION,
    [{ keyword: q.query, location_code: DFS_US.location_code, language_code: DFS_US.language_code, depth: q.depth }],
    scope,
  );
  if (!task) throw new VendorError('dataforseo', null, 'empty task', false);
  if (isNoResults(task)) return { organic: [], raw: [] };
  if (!isDfsOk(task.statusCode)) throw new VendorError('dataforseo', task.statusCode, task.statusMessage, isRetryableDfsCode(task.statusCode));
  const raw = task.result ?? [];
  return { organic: parseSerp(raw, q.depth).organic, raw };
}
