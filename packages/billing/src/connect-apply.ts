import { type Tx, agencyConnect, clientBilling } from '@cs/db';
import { and, eq, notInArray } from 'drizzle-orm';

/**
 * Phase 9b f10 / R7: the agency's Stripe connection ends (admin disconnect, or `account.application.deauthorized`).
 * Locks the `agency_connect` row, marks it `disconnected` (charges off) and moves every client's billing that is not
 * already `off`/`disconnected` to `disconnected`. Local only: subscriptions keep running in the agency's Stripe account.
 * Idempotent: returns `changed: false` (no writes) when there is no connection or it is already disconnected.
 */
export async function disconnectAgencyConnect(tx: Tx, agencyId: string, _actor: string): Promise<{ changed: boolean }> {
  const [row] = await tx.select({ status: agencyConnect.status }).from(agencyConnect).where(eq(agencyConnect.agencyId, agencyId)).for('update');
  if (!row || row.status === 'disconnected') return { changed: false };
  const now = new Date();
  await tx.update(agencyConnect).set({ status: 'disconnected', chargesEnabled: false, disconnectedAt: now, updatedAt: now }).where(eq(agencyConnect.agencyId, agencyId));
  await tx
    .update(clientBilling)
    .set({ state: 'disconnected', updatedAt: now })
    .where(and(eq(clientBilling.agencyId, agencyId), notInArray(clientBilling.state, ['disconnected', 'off'])));
  return { changed: true };
}
