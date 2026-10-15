import { type AnyColumn, type SQL, sql } from 'drizzle-orm';
import { client } from './schema/tenancy';

/**
 * Phase 9a (P2): true when the agency may be serviced by worker schedulers. An agency without an
 * `agency_billing` row is serviceable; `read_only` and `suspended` are not. Pass the agency id column (or a raw `sql` fragment such as `sql.raw('cl.agency_id')` inside hand-written aliased SQL).
 */
export function agencyServiceable(agencyIdCol: AnyColumn | SQL): SQL {
  return sql`NOT EXISTS (SELECT 1 FROM agency_billing ab WHERE ab.agency_id = ${agencyIdCol} AND ab.state IN ('read_only', 'suspended'))`;
}

/**
 * Phase 9b (Q1): true when schedulers/seat counts may service the client: `status = 'active'` and not paused.
 * Pass the Drizzle `client` table, or a SQL alias string (`'cl'`, `'c'`) for hand-written queries.
 */
export function clientServiceable(t: typeof client | string): SQL {
  if (typeof t === 'string') {
    if (!/^[a-z_][a-z0-9_]*$/i.test(t)) throw new Error(`clientServiceable: invalid alias ${t}`);
    return sql.raw(`(${t}.status = 'active' AND ${t}.paused_at IS NULL)`);
  }
  return sql`(${t.status} = 'active' AND ${t.pausedAt} IS NULL)`;
}
