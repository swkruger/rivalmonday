'use server';
import { cookies, headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOperatorContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { runTool, type ToolResult } from '@/server/run-tool';
import type { MoveResultData } from '../../billing/plan-move-parts';
import { SUPPORT_COOKIE, signSupportCookie } from '@/server/support-cookie';
import { sendSupportSessionStartedEmail } from '@/server/support-email';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const isLocalHost = (host: string) => LOCAL_HOSTS.has(host.toLowerCase().replace(/:\d+$/, ''));

/**
 * Phase 8b: "Start read-only session". Runs on the operator's own context (the tool needs platform staff+), then sets
 * `rm_support` for exactly the session's lifetime (httpOnly, sameSite=lax, path=/, no domain, Secure except on a
 * localhost host), sends the best-effort "support opened a session" email and opens the agency. Refusals come back
 * through `runTool` (→ `toFormResult`) and stay in the dialog.
 */
export async function startSupportSessionAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx } = await requireOperatorContext();
  const agencyId = String(fd.get('agencyId') ?? '').slice(0, 64);
  const reason = String(fd.get('reason') ?? '').slice(0, 1200);
  const r = await runTool<{ sessionId: string; expiresAt: string }>(ctx, 'start_support_session', { agencyId, reason });
  if (!r.ok) return r;
  const maxAge = Math.max(0, Math.floor((Date.parse(r.data.expiresAt) - Date.now()) / 1000));
  const secure = !isLocalHost((await headers()).get('host') ?? '');
  (await cookies()).set(SUPPORT_COOKIE, signSupportCookie(r.data.sessionId), { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge });
  await sendSupportSessionStartedEmail(r.data.sessionId);
  redirect('/agency');
}

/**
 * Row save on the Client limits table (platform staff+, enforced by the tool). A blank override clears it (null); the other
 * two fields are always sent. A save that raises the limit above spend lifts a spend pause.
 */
export async function setClientLimitsAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx } = await requireOperatorContext();
  const clientId = String(fd.get('clientId') ?? '').slice(0, 64);
  const raw = String(fd.get('spendLimitUsd') ?? '').trim();
  const limit = raw === '' ? null : Number(raw);
  const competitorLimit = Number(String(fd.get('competitorLimit') ?? '').trim());
  const askMonthlyQuota = Number(String(fd.get('askMonthlyQuota') ?? '').trim());
  if (limit !== null && !Number.isFinite(limit)) return { ok: false, error: 'Enter the limit in dollars, or leave it blank for the default.' };
  if (!Number.isInteger(competitorLimit) || !Number.isInteger(askMonthlyQuota)) return { ok: false, error: 'Competitor limit and Ask quota must be whole numbers.' };
  const r = await runTool<{ lifted: boolean }>(ctx, 'set_client_limits', { clientId, spendLimitUsd: limit, competitorLimit, askMonthlyQuota });
  if (!r.ok) return r;
  revalidatePath('/platform/agencies/[id]', 'page');
  return { ok: true, message: r.data.lifted ? 'Pause lifted.' : 'Saved.' };
}

// ---- Phase 15c-3a agency management (Manage menu, People, hold, archive) ----

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
type HoldBilling = { done: number; failed: unknown[] };

/** Runs one platform agency tool; on success revalidates the detail page and returns `message(data)`. Refusals pass through. */
async function manage<T>(fd: FormData, tool: string, input: Record<string, unknown>, message: (data: T) => string): Promise<FormResult> {
  const { ctx } = await requireOperatorContext();
  const agencyId = str(fd, 'agencyId').slice(0, 64);
  const r = await runTool<T>(ctx, tool, { agencyId, ...input });
  if (!r.ok) return r;
  revalidatePath(`/platform/agencies/${agencyId}`);
  return { ok: true, message: message(r.data) };
}

export async function renameAgencyAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  return manage<{ name: string }>(fd, 'platform_rename_agency', { name: str(fd, 'name').slice(0, 200) }, () => 'Agency renamed.');
}

export async function changeMemberRoleAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  return manage(fd, 'platform_change_member_role', { membershipId: str(fd, 'membershipId'), role: str(fd, 'role') }, () => 'Role changed.');
}

export async function removeMemberAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  return manage(fd, 'platform_remove_member', { membershipId: str(fd, 'membershipId') }, () => 'Removed from the agency.');
}

export async function inviteAgencyAdminAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  return manage<{ emailSent: boolean }>(fd, 'platform_invite_agency_admin', { email: str(fd, 'email').slice(0, 320) }, (d) =>
    d.emailSent ? 'Invite sent.' : "Invite created, but the email couldn't be sent. Resend it from Pending invites.");
}

export async function resendInvitationAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  return manage(fd, 'platform_resend_invitation', { invitationId: str(fd, 'invitationId') }, () => 'Invite resent.');
}

export async function revokeInvitationAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  return manage(fd, 'platform_revoke_invitation', { invitationId: str(fd, 'invitationId') }, () => 'Invite revoked.');
}

/** The tool re-checks 3..500 after trimming; checking here keeps a too-short reason from costing an audit row. */
export async function suspendAgencyAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const reason = str(fd, 'reason');
  if ([...reason].length < 3) return { ok: false, error: 'Give a reason of 3 to 500 characters.' };
  return manage<{ billing: HoldBilling; emailsSent: number }>(fd, 'platform_suspend_agency', { reason: reason.slice(0, 600) }, (d) =>
    `On hold. Billing paused for ${plural(d.billing.done, 'subscription')}; ${plural(d.emailsSent, 'admin')} emailed.`
    + (d.billing.failed.length ? ` ${d.billing.failed.length} could not be paused.` : ''));
}

export async function unsuspendAgencyAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  return manage<{ billing: HoldBilling; emailsSent: number }>(fd, 'platform_unsuspend_agency', {}, (d) =>
    `Hold lifted. Billing resumed for ${plural(d.billing.done, 'subscription')}; ${plural(d.emailsSent, 'admin')} emailed.`
    + (d.billing.failed.length ? ` ${d.billing.failed.length} could not be resumed.` : ''));
}

/** A retry that still fails comes back as an error, so the banner keeps showing what is left. */
export async function retryHoldBillingAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  let failed = 0;
  const r = await manage<HoldBilling>(fd, 'platform_retry_hold_billing', {}, (d) => {
    failed = d.failed.length;
    return `${plural(d.done, 'subscription')} updated.`;
  });
  return r.ok && failed > 0 ? { ok: false, error: `${r.message} ${failed} still failed. Try again later.` } : r;
}

export async function archiveAgencyAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  return manage(fd, 'platform_archive_agency', {}, () => 'Agency archived.');
}

export async function unarchiveAgencyAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  return manage(fd, 'platform_unarchive_agency', {}, () => 'Agency unarchived.');
}

/** Owner only (the tool enforces it): the agency page's "Move to current plan", same tool as the billing list. */
export async function moveAgencyToCurrentPlanAction(agencyId: string): Promise<ToolResult<MoveResultData>> {
  const { ctx } = await requireOperatorContext();
  const id = agencyId.slice(0, 64);
  const r = await runTool<MoveResultData>(ctx, 'move_agencies_to_current_plan', { agencyIds: [id] });
  if (r.ok) revalidatePath(`/platform/agencies/${id}`);
  return r;
}
