'use server';
import { isAgencyRole } from '@cs/core';
import { inviteMember, revokeInvitation, revokeMembership } from '@cs/tools';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { type FormResult, parseInviteForm, toFormResult } from '@/server/forms';
import { requireContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { webEnv } from '@/server/env';

export async function inviteAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const parsed = parseInviteForm(formData);
  if ('error' in parsed) return { ok: false, error: parsed.error };
  try {
    await inviteMember(dbs().service, ctx, parsed);
  } catch (e) {
    return toFormResult(e);
  }
  revalidatePath('/agency/team');
  return { ok: true, message: `Invitation created. Ask them to sign in at ${webEnv().appUrl}/sign-in with this email.` };
}

export async function revokeMembershipAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  try {
    await revokeMembership(dbs().service, ctx, String(formData.get('membershipId') ?? ''));
  } catch (e) {
    return toFormResult(e);
  }
  revalidatePath('/agency/team');
  return { ok: true };
}

export async function revokeInvitationAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  try {
    await revokeInvitation(dbs().service, ctx, String(formData.get('invitationId') ?? ''));
  } catch (e) {
    return toFormResult(e);
  }
  revalidatePath('/agency/team');
  return { ok: true };
}
