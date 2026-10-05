'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
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
 * sign-out. Called by both `SignOutButton` (alongside `authClient.signOut()`) and the guest top-bar sign-out
 * control, so no session — Better Auth or email-link guest — survives a click of "Sign out".
 */
export async function endSession(): Promise<void> {
  clearSessionCookies(await cookies());
}
