'use server';
import { endOpenSessionFor } from '@cs/tools';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/server/auth';
import { requireContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { clearSessionCookies } from '@/server/sign-out';
import { MEMBERSHIP_COOKIE } from '@/server/viewer';

export async function switchMembership(formData: FormData) {
  const { viewer } = await requireContext();
  const id = String(formData.get('membershipId') ?? '');
  if (viewer.kind !== 'user' || !viewer.memberships.some((m) => m.id === id)) redirect('/');
  (await cookies()).set(MEMBERSHIP_COOKIE, id, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 365 });
  redirect('/');
}

/**
 * Important I1 (final review): clears the guest (`rm_guest`) and membership-pick (`rm_membership`) cookies on
 * sign-out. Called by both `SignOutButton` (before `authClient.signOut()`) and the guest top-bar sign-out
 * control, so no session — Better Auth or email-link guest — survives a click of "Sign out".
 *
 * Phase 8b M2/R12: also ends the signed-in user's own open support session (as `exit`) and clears `rm_support`. The
 * user is read from the Better Auth session directly (not `requireContext`, which would resolve the support context or
 * redirect a member-less operator), so `SignOutButton` calls this before `authClient.signOut()`.
 */
export async function endSession(): Promise<void> {
  const s = await auth().api.getSession({ headers: await headers() });
  if (s) await endOpenSessionFor(dbs().service, s.user.id);
  clearSessionCookies(await cookies());
}
