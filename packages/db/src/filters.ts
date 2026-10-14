import { type AnyColumn, type SQL, sql } from 'drizzle-orm';

/**
 * Phase 9a (P2): true when the agency may be serviced by worker schedulers. An agency without an
 * `agency_billing` row is serviceable; `read_only` and `suspended` are not. Pass the agency id column (or a raw `sql` fragment such as `sql.raw('cl.agency_id')` inside hand-written aliased SQL).
 */
export function agencyServiceable(agencyIdCol: AnyColumn | SQL): SQL {
  return sql`NOT EXISTS (SELECT 1 FROM agency_billing ab WHERE ab.agency_id = ${agencyIdCol} AND ab.state IN ('read_only', 'suspended'))`;
}
