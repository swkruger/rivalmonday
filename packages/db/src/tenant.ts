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
    // Dispatch is not synchronous: `.then` runs drizzle's async execute, and postgres-js `Query.handle()` hands the
    // statement to the connection only after its own `await 1`. The settings still enter the connection queue first
    // because they reach `Query.then` before fn runs, and every drizzle path inside fn (select/insert/update/delete,
    // `.for('update')`, `execute`, `tx.transaction` savepoints) reaches `Query.then` at the same or a greater microtask
    // depth. postgres-js sends a connection's queries in queue order and Postgres runs them in order.
    // Invariant: drizzle-only inside fn. A raw postgres-js `Query.execute()`/`.forEach()`/`.cursor()` inside fn would
    // overtake the settings; that fails closed (RLS sees no tenant: no rows, writes refused). A failed settings
    // statement aborts the transaction, so fn's queries fail too. Tests: tenant.test.ts "launch-gate 6a".
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
