import type { Db } from '@cs/db';
import { sql } from 'drizzle-orm';

/** Phase 12: a competitor-discovery run is capped at $3 (root CLAUDE.md § Decisions). */
export const SAMPLE_DISCOVERY_CAP_USD = 3;

export interface SampleCostEstimate {
  discoveryCapUsd: number;
  /** Average AI + vendor spend up to the moment each of the last 20 starting-point briefs was generated; null with no history. */
  startingPointAvgUsd: number | null;
  basedOn: number;
}

/**
 * What one sample brief is expected to cost: discovery (up to the cap) plus the starting point itself, estimated as the
 * average spend of the last 20 starting points that were approved or sent (calls made up to each brief's generation time).
 */
export async function sampleCostEstimate(service: Db): Promise<SampleCostEstimate> {
  const rows = await service.execute<{ avg: number | null; n: number }>(sql`
    SELECT avg(spend)::float8 AS avg, count(*)::int AS n FROM (
      SELECT b.client_id,
        (SELECT coalesce(sum(cost_usd), 0) FROM llm_call WHERE client_id = b.client_id AND created_at <= b.generated_at)
        + (SELECT coalesce(sum(cost_usd), 0) FROM vendor_call WHERE client_id = b.client_id AND created_at <= b.generated_at) AS spend
      FROM brief b
      WHERE b.kind = 'starting_point' AND b.status IN ('approved', 'sent') AND b.generated_at IS NOT NULL
      ORDER BY b.generated_at DESC LIMIT 20
    ) t`);
  const row = rows[0];
  const n = Number(row?.n ?? 0);
  const avg = row?.avg;
  return { discoveryCapUsd: SAMPLE_DISCOVERY_CAP_USD, startingPointAvgUsd: n === 0 || avg == null ? null : Math.round(Number(avg) * 100) / 100, basedOn: n };
}
