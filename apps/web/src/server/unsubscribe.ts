import 'server-only';
import { agency, agencyOnboarding, type Db } from '@cs/db';
import { verifyUnsubscribeToken } from '@cs/tools';
import { and, eq, isNull } from 'drizzle-orm';

/**
 * Phase 10: the agency a `/u/<token>` setup-tip unsubscribe link is for, or null (bad token, unknown agency → 404).
 * Public path, no session: identity comes from the HMAC token alone, read on the service connection. Never log the token.
 */
export async function unsubscribeTarget(service: Db, token: string, secret: string): Promise<{ agencyId: string; agencyName: string } | null> {
  const agencyId = verifyUnsubscribeToken(token, secret);
  if (!agencyId) return null;
  const [a] = await service.select({ name: agency.name }).from(agency).where(eq(agency.id, agencyId));
  return a ? { agencyId, agencyName: a.name } : null;
}

/** Stops setup tips for the agency. Idempotent: the first unsubscribe time is kept; no onboarding row = nothing to stop. */
export async function unsubscribeFromTips(service: Db, agencyId: string, now: Date): Promise<void> {
  await service.update(agencyOnboarding).set({ unsubscribedAt: now })
    .where(and(eq(agencyOnboarding.agencyId, agencyId), isNull(agencyOnboarding.unsubscribedAt)));
}
