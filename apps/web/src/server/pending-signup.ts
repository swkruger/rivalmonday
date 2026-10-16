import { type Db, pendingSignup } from '@cs/db';
import { and, gt, isNull, sql } from 'drizzle-orm';

/** The open (not completed, not expired) agency sign-up for an address, if any. Service connection only. */
export async function openPendingSignup(service: Db, email: string, now: Date) {
  const [row] = await service.select({ id: pendingSignup.id, agencyName: pendingSignup.agencyName, inviteLinkId: pendingSignup.inviteLinkId }).from(pendingSignup)
    .where(and(sql`lower(${pendingSignup.email}) = ${email.trim().toLowerCase()}`, isNull(pendingSignup.completedAt), gt(pendingSignup.expiresAt, now))).limit(1);
  return row ?? null;
}
