import { type AccessContext, isUuid } from '@cs/core';
import { sql } from 'drizzle-orm';
import type { Db, Tx } from './client';

export type TenantScope = Pick<AccessContext, 'agencyId' | 'clientScope'>;

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
    await tx.execute(
      sql`select set_config('app.agency_id', ${scope.agencyId}, true), set_config('app.client_scope', ${clientScope}, true)`,
    );
    return fn(tx);
  });
}
