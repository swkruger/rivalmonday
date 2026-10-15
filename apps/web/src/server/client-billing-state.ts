import 'server-only';
import { isClientRole, type AccessContext } from '@cs/core';
import { client, clientBilling } from '@cs/db';
import { eq } from 'drizzle-orm';
import { cache } from 'react';
import { dbs } from './db';

export interface ClientBillingNotice {
  /** `client.paused_at` is set: shown to every client role. */
  paused: boolean;
  /** Billing is on and the last payment failed: shown to the client owner only. */
  paymentNeeded: boolean;
  /** Billing is on for this client: gates the owner's Billing nav entry. */
  enabled: boolean;
}

const read = cache(async (clientId: string): Promise<ClientBillingNotice> => {
  const [row] = await dbs().service
    .select({ pausedAt: client.pausedAt, enabled: clientBilling.enabled, state: clientBilling.state })
    .from(client)
    .leftJoin(clientBilling, eq(clientBilling.clientId, client.id))
    .where(eq(client.id, clientId));
  const enabled = row?.enabled ?? false;
  return { paused: !!row?.pausedAt, paymentNeeded: enabled && row?.state === 'payment_needed', enabled };
});

/** One cheap read for the client shell (banners + nav). Client roles only, for their own single client; agency roles and support sessions get null. */
export async function clientBillingNoticeOf(ctx: AccessContext): Promise<ClientBillingNotice | null> {
  if (!isClientRole(ctx.role) || ctx.support || ctx.clientScope === 'all' || ctx.clientScope.length !== 1) return null;
  return read(ctx.clientScope[0]!);
}
