import { ToolError } from '@cs/core';
import { type Tx, client, notification } from '@cs/db';
import { and, eq, isNull, lt } from 'drizzle-orm';
import { assertCanActivateClient } from './access';

export const WITHDRAWN_NOTIFICATION_ERROR = 'withdrawn: client paused';

/**
 * Pauses an `active`, unpaused client (`paused_at` set; independent of billing). `paused_by` is `'auto'` for the
 * non-payment auto-pause, else the acting user id. Returns false (no write) when the client is not active or already paused.
 */
export async function pauseClient(tx: Tx, clientId: string, actor: string, by: 'agency' | 'auto'): Promise<boolean> {
  const rows = await tx
    .update(client)
    .set({ pausedAt: new Date(), pausedBy: by === 'auto' ? 'auto' : actor })
    .where(and(eq(client.id, clientId), eq(client.status, 'active'), isNull(client.pausedAt)))
    .returning({ id: client.id });
  return rows.length > 0;
}

/**
 * Resumes a paused client. A pilot/trial agency must not exceed its seat cap by pause -> add -> resume (A3), so the
 * activation check runs first (throws `billing_seat_limit`). Notifications still `pending` from before the resume are
 * withdrawn (R5) so the backlog does not send in a burst. Returns false when the client was not paused (nothing written).
 */
export async function resumeClient(tx: Tx, clientId: string, _actor: string, opts: { role?: string; now?: Date } = {}): Promise<boolean> {
  const now = opts.now ?? new Date();
  const [c] = await tx.select({ agencyId: client.agencyId, pausedAt: client.pausedAt }).from(client).where(eq(client.id, clientId)).for('update');
  if (!c?.pausedAt) return false;
  await assertCanActivateClient(tx, c.agencyId, { role: opts.role, now });
  await tx.update(client).set({ pausedAt: null, pausedBy: null }).where(eq(client.id, clientId));
  await tx
    .update(notification)
    .set({ status: 'failed', error: WITHDRAWN_NOTIFICATION_ERROR })
    .where(and(eq(notification.clientId, clientId), eq(notification.status, 'pending'), lt(notification.createdAt, now)));
  return true;
}

/**
 * Lifts only the AUTOMATIC pause (`paused_by = 'auto'`); a manual pause stays. The resume runs in a savepoint so an
 * expected refusal (seat cap `billing_seat_limit`, operator hold `service_paused`) leaves the caller's transaction usable;
 * the client then stays paused ('refused'). Anything else rethrows.
 */
export async function liftAutoPause(tx: Tx, clientId: string, actor: string): Promise<'lifted' | 'not_paused' | 'refused'> {
  const [c] = await tx.select({ pausedAt: client.pausedAt, pausedBy: client.pausedBy }).from(client).where(eq(client.id, clientId));
  if (!c?.pausedAt || c.pausedBy !== 'auto') return 'not_paused';
  try {
    return (await tx.transaction((sp) => resumeClient(sp, clientId, actor))) ? 'lifted' : 'not_paused';
  } catch (e) {
    if (e instanceof ToolError && (e.code === 'billing_seat_limit' || e.code === 'service_paused')) return 'refused';
    throw e;
  }
}
