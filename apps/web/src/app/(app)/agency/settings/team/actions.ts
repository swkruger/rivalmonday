'use server';
import { type AccessContext, isAgencyRole, READ_ONLY_SESSION_MESSAGE, type Role } from '@cs/core';
import { clientOriginFor } from '@cs/db';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { type FormResult, parseInviteForm } from '@/server/forms';
import { requireContext } from '@/server/current-viewer';
import { runTool } from '@/server/run-tool';
import { dbs } from '@/server/db';
import { webEnv } from '@/server/env';

/** 13a1 P8: a client user signs in on the agency's client origin (service db: agency_domain), agency staff on APP_URL. */
async function signInHint(ctx: AccessContext, role?: Role): Promise<string> {
  const base = role && !isAgencyRole(role) ? await clientOriginFor(dbs().service, ctx.agencyId, webEnv().hostEnv) : webEnv().appUrl;
  return `Ask them to sign in at ${base}/sign-in with this email.`;
}

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
  return { ok: true, message: `Invitation created, but the email couldn't be sent. ${await signInHint(ctx, parsed.role)}` };
}

/** "Resend" (15c-2a T11): the line lives in `InvitationTable`, which stays mounted across the revalidate. */
export async function resendInvitationAction(input: { id: string }): Promise<FormResult> {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const r = await runTool<{ emailSent: boolean; role: Role }>(ctx, 'resend_invitation', { invitationId: input.id });
  if (!r.ok) return { ok: false, error: ctx.support ? READ_ONLY_SESSION_MESSAGE : r.error };
  revalidatePath('/agency/settings/team');
  if (r.data.emailSent) return { ok: true, message: 'Invite sent again.' };
  return { ok: true, message: `Invite renewed for 14 days, but the email couldn't be sent. ${await signInHint(ctx, r.data.role)}` };
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
