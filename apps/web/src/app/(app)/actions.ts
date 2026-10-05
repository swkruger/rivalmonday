'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { MEMBERSHIP_COOKIE } from '@/server/viewer';

export async function switchMembership(formData: FormData) {
  const { viewer } = await requireContext();
  const id = String(formData.get('membershipId') ?? '');
  if (viewer.kind !== 'user' || !viewer.memberships.some((m) => m.id === id)) redirect('/');
  (await cookies()).set(MEMBERSHIP_COOKIE, id, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 365 });
  redirect('/');
}
