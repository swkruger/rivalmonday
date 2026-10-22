import { agency, agencyOnboarding, type Db, membership } from '@cs/db';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { openPendingSignup } from './pending-signup';

/**
 * Phase 10 (ruling R4): where `/onboarding/start` sends a user who just verified their email. Identity routing on the
 * service connection (like the auth hooks): the NEWEST admin membership whose wizard is still open wins, so a second
 * agency opens its own wizard rather than the oldest membership's.
 */
export async function onboardingStartTarget(
  service: Db, user: { id: string; email: string }, now: Date,
): Promise<{ path: '/onboarding'; membershipId: string } | { path: '/sign-up/problem' | '/agency' }> {
  const [open] = await service.select({ id: membership.id }).from(membership)
    .innerJoin(agencyOnboarding, eq(agencyOnboarding.agencyId, membership.agencyId))
    .innerJoin(agency, and(eq(agency.id, membership.agencyId), isNull(agency.archivedAt))) // 7a2 D16
    .where(and(eq(membership.userId, user.id), eq(membership.role, 'agency_admin'), isNull(agencyOnboarding.completedAt), isNull(agencyOnboarding.dismissedAt)))
    .orderBy(desc(membership.createdAt)).limit(1);
  if (open) return { path: '/onboarding', membershipId: open.id };
  const [any] = await service.select({ id: membership.id }).from(membership).where(eq(membership.userId, user.id)).limit(1);
  if (any) return { path: '/agency' };
  return (await openPendingSignup(service, user.email, now)) ? { path: '/sign-up/problem' } : { path: '/agency' };
}
