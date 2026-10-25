import { type AnyColumn, type SQL, sql } from 'drizzle-orm';
import { client } from './schema/tenancy';

/**
 * Phase 9a (P2): true when the agency may be serviced by worker schedulers. An agency without an
 * `agency_billing` row is serviceable; `read_only` and `suspended` are not, nor is an archived (7a2 D16) or held (15c3a, `suspended_at`) agency. Pass the agency id column (or a raw `sql` fragment such as `sql.raw('cl.agency_id')` inside hand-written aliased SQL).
 */
export function agencyServiceable(agencyIdCol: AnyColumn | SQL): SQL {
  return sql`(NOT EXISTS (SELECT 1 FROM agency_billing ab WHERE ab.agency_id = ${agencyIdCol} AND ab.state IN ('read_only', 'suspended'))
    AND NOT EXISTS (SELECT 1 FROM agency ax WHERE ax.id = ${agencyIdCol} AND (ax.archived_at IS NOT NULL OR ax.suspended_at IS NOT NULL)))`;
}

/**
 * Phase 10 (f12): true when the agency is on the reduced trial allowance: billing state `trialing`, not seat-cap exempt,
 * and signed up through the open sign-up (`agency_onboarding.source = 'open'`). No billing or onboarding row = not reduced.
 * Mirrors `isReducedTrial` in `@cs/billing` (access.ts). Same argument forms as `agencyServiceable`.
 */
export function agencyReducedTrial(agencyIdCol: AnyColumn | SQL): SQL {
  return sql`EXISTS (SELECT 1 FROM agency_billing ab JOIN agency_onboarding ao ON ao.agency_id = ab.agency_id
                      WHERE ab.agency_id = ${agencyIdCol} AND ab.state = 'trialing' AND NOT ab.seat_cap_exempt AND ao.source = 'open')`;
}

/**
 * Phase 9b (Q1): true when schedulers/seat counts may service the client: `status = 'active'`, not paused and not
 * archived (7a2 D16: archived = deleted for schedulers).
 * Pass the Drizzle `client` table, or a SQL alias string (`'cl'`, `'c'`) for hand-written queries.
 */
export function clientServiceable(t: typeof client | string): SQL {
  if (typeof t === 'string') {
    if (!/^[a-z_][a-z0-9_]*$/i.test(t)) throw new Error(`clientServiceable: invalid alias ${t}`);
    return sql.raw(`(${t}.status = 'active' AND ${t}.paused_at IS NULL AND ${t}.archived_at IS NULL)`);
  }
  return sql`(${t.status} = 'active' AND ${t.pausedAt} IS NULL AND ${t.archivedAt} IS NULL)`;
}

/**
 * 7b1: `clientServiceable` plus "not auto-paused by the spend guard" (`spend_paused_at IS NULL`). Use for AI / recurring client
 * work; seats, billing and the dashboards keep `clientServiceable`. Same argument forms as `clientServiceable`.
 */
export function clientWorkAllowed(t: typeof client | string): SQL {
  if (typeof t === 'string') {
    if (!/^[a-z_][a-z0-9_]*$/i.test(t)) throw new Error(`clientWorkAllowed: invalid alias ${t}`);
    return sql.raw(`(${t}.status = 'active' AND ${t}.paused_at IS NULL AND ${t}.archived_at IS NULL AND ${t}.spend_paused_at IS NULL)`);
  }
  return sql`(${clientServiceable(t)} AND ${t.spendPausedAt} IS NULL)`;
}

/**
 * 7a2 (D17): true when any `brief_item`, `recommendation` or `alert` cites the evidence id in its `evidence_ids`.
 * Exported for future evidence pruning; nothing deletes evidence in 7a. Same argument forms as `agencyServiceable`.
 */
export function evidenceReferenced(evidenceIdCol: AnyColumn | SQL): SQL {
  const col = evidenceIdCol;
  return sql`(EXISTS (SELECT 1 FROM brief_item bi WHERE bi.evidence_ids @> jsonb_build_array((${col})::text))
  OR EXISTS (SELECT 1 FROM recommendation r WHERE r.evidence_ids @> jsonb_build_array((${col})::text))
  OR EXISTS (SELECT 1 FROM alert a WHERE a.evidence_ids @> jsonb_build_array((${col})::text)))`;
}
