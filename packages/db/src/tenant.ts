import { type AccessContext, isUuid } from '@cs/core';
import { sql } from 'drizzle-orm';
import type { Db, Tx } from './client';

export type TenantScope = Pick<AccessContext, 'agencyId' | 'clientScope'> & Partial<Pick<AccessContext, 'userId' | 'role'>>;

/**
 * Runs fn in a transaction with transaction-local tenant settings that RLS policies read.
 * Settings use set_config(..., true) so they vanish at commit/rollback and never leak across pooled connections.
 */
export async function withTenant<T>(db: Db, scope: TenantScope, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!isUuid(scope.agencyId)) throw new Error('Invalid agencyId');
  let clientScope: string;
  if (scope.clientScope === 'all') {
    clientScope = 'all';
  } else {
    if (scope.clientScope.length === 0 || !scope.clientScope.every(isUuid)) throw new Error('Invalid clientScope');
    clientScope = scope.clientScope.join(',');
  }
  return db.transaction(async (tx) => {
    // Launch-gate 6a: the settings are pipelined with fn's first query instead of costing their own round trip.
    // `.then` dispatches the statement synchronously, so it is queued on the transaction's one connection before any
    // query fn issues; postgres-js sends a connection's queries in call order and Postgres runs them in order, so every
    // query in fn still sees the settings. Fails closed: a query that somehow ran first would see no tenant (RLS: no
    // rows, writes refused), and a failed settings statement aborts the transaction, so fn's queries fail too.
    const settings = tx
      .execute(
        sql`select set_config('app.agency_id', ${scope.agencyId}, true), set_config('app.client_scope', ${clientScope}, true), set_config('app.user_id', ${scope.userId ?? ''}, true), set_config('app.role', ${scope.role ?? ''}, true)`,
      )
      .then(() => undefined);
    let result: Promise<T>;
    try {
      result = fn(tx);
    } catch (e) {
      await settings.catch(() => undefined);
      throw e;
    }
    const [, value] = await Promise.all([settings, result]);
    return value;
  });
}
