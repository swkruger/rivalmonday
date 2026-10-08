'use server';
import { isAgencyRole } from '@cs/core';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { type FormResult, parseInviteForm } from '@/server/forms';
import { requireContext } from '@/server/current-viewer';
import { runTool } from '@/server/run-tool';
import { webEnv } from '@/server/env';

export async function inviteAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const parsed = parseInviteForm(formData);
  if ('error' in parsed) return { ok: false, error: parsed.error };
  const r = await runTool(ctx, 'invite_member', parsed);
  if (!r.ok) return r;
  revalidatePath('/agency/team');
  return { ok: true, message: `Invitation created. Ask them to sign in at ${webEnv().appUrl}/sign-in with this email.` };
}

export async function revokeMembershipAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const r = await runTool(ctx, 'revoke_membership', { membershipId: String(formData.get('membershipId') ?? '') });
  if (!r.ok) return r;
  revalidatePath('/agency/team');
  return { ok: true };
}

export async function revokeInvitationAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const r = await runTool(ctx, 'revoke_invitation', { invitationId: String(formData.get('invitationId') ?? '') });
  if (!r.ok) return r;
  revalidatePath('/agency/team');
  return { ok: true };
}
