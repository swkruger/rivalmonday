'use server';
import { isAgencyRole, READ_ONLY_SESSION_MESSAGE } from '@cs/core';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { type FormResult, parseInviteForm } from '@/server/forms';
import { requireContext } from '@/server/current-viewer';
import { runTool } from '@/server/run-tool';
import { webEnv } from '@/server/env';

const signInHint = () => `Ask them to sign in at ${webEnv().appUrl}/sign-in with this email.`;

export async function inviteAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const parsed = parseInviteForm(formData);
  if ('error' in parsed) return { ok: false, error: parsed.error };
  const r = await runTool<{ emailSent: boolean }>(ctx, 'invite_member', parsed);
  if (!r.ok) return r;
  revalidatePath('/agency/settings/team');
  // 15c-2a D7: every role now gets an email (client roles `client_invite`, agency staff `team_invite`).
  if (r.data.emailSent) return { ok: true, message: `Invitation sent to ${parsed.email}.` };
  return { ok: true, message: `Invitation created, but the email couldn't be sent. ${signInHint()}` };
}

/** "Resend" (15c-2a T11): the line lives in `InvitationTable`, which stays mounted across the revalidate. */
export async function resendInvitationAction(input: { id: string }): Promise<FormResult> {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const r = await runTool<{ emailSent: boolean }>(ctx, 'resend_invitation', { invitationId: input.id });
  if (!r.ok) return { ok: false, error: ctx.support ? READ_ONLY_SESSION_MESSAGE : r.error };
  revalidatePath('/agency/settings/team');
  if (r.data.emailSent) return { ok: true, message: 'Invite sent again.' };
  return { ok: true, message: `Invite renewed for 14 days, but the email couldn't be sent. ${signInHint()}` };
}

export async function revokeMembershipAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const r = await runTool(ctx, 'revoke_membership', { membershipId: String(formData.get('membershipId') ?? '') });
  if (!r.ok) return { ok: false, error: ctx.support ? READ_ONLY_SESSION_MESSAGE : r.error };
  revalidatePath('/agency/settings/team');
  return { ok: true };
}

export async function revokeInvitationAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const r = await runTool(ctx, 'revoke_invitation', { invitationId: String(formData.get('invitationId') ?? '') });
  if (!r.ok) return { ok: false, error: ctx.support ? READ_ONLY_SESSION_MESSAGE : r.error };
  revalidatePath('/agency/settings/team');
  return { ok: true };
}
