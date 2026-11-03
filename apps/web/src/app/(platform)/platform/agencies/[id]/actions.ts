'use server';
import type { AccessContext } from '@cs/core';
import { cookies, headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOperatorContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { runTool, type ToolResult } from '@/server/run-tool';
import type { MoveResultData } from '../../_components/plan-move-parts';
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

/** One changed row of the Client limits table, as the browser posts it (raw field text; `name` is only for the result line). */
export interface ClientLimitsRow { clientId: string; name: string; spendLimitUsd: string; competitorLimit: string; askMonthlyQuota: string }

/** Parses and saves one row through `set_client_limits`; refusals come back as the error text. */
async function saveLimitsRow(ctx: AccessContext, row: ClientLimitsRow): Promise<{ ok: true; lifted: boolean } | { ok: false; error: string }> {
  const clientId = String(row.clientId ?? '').slice(0, 64);
  const raw = String(row.spendLimitUsd ?? '').trim();
  const limit = raw === '' ? null : Number(raw);
  const competitorLimit = Number(String(row.competitorLimit ?? '').trim());
  const askMonthlyQuota = Number(String(row.askMonthlyQuota ?? '').trim());
  if (limit !== null && !Number.isFinite(limit)) return { ok: false, error: 'Enter the limit in dollars, or leave it blank for the default.' };
  if (!Number.isInteger(competitorLimit) || !Number.isInteger(askMonthlyQuota)) return { ok: false, error: 'Competitor limit and Ask quota must be whole numbers.' };
  const r = await runTool<{ lifted: boolean }>(ctx, 'set_client_limits', { clientId, spendLimitUsd: limit, competitorLimit, askMonthlyQuota });
  return r.ok ? { ok: true, lifted: r.data.lifted } : { ok: false, error: r.error };
}

/**
 * The Client limits table's one Save (platform staff+, enforced by the tool). `rows` is the JSON list of changed rows; each is
 * saved on its own `set_client_limits` call (a blank override clears it to null; the other two fields are always sent). Every
 * row is tried; the result is "Saved." (naming any client whose spend pause was lifted) or the first refusal with its client's
 * name. Rows that saved stay saved, so the page revalidates whenever at least one did.
 */
export async function saveClientLimitsAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx } = await requireOperatorContext();
  let rows: ClientLimitsRow[];
  try {
    const parsed: unknown = JSON.parse(String(fd.get('rows') ?? '[]'));
    if (!Array.isArray(parsed)) throw new Error('rows');
    rows = parsed.slice(0, 500) as ClientLimitsRow[];
  } catch {
    return { ok: false, error: 'Something went wrong. Reload the page and try again.' };
  }
  let firstError: string | null = null;
  let saved = 0;
  const lifted: string[] = [];
  for (const row of rows) {
    const name = String(row?.name ?? '').slice(0, 120);
    const r = await saveLimitsRow(ctx, row);
    if (!r.ok) {
      firstError ??= `${name}: ${r.error}`;
      continue;
    }
    saved++;
    if (r.lifted) lifted.push(name);
  }
  if (saved > 0) revalidatePath('/platform/agencies/[id]', 'page');
  if (firstError) return { ok: false, error: firstError };
  return { ok: true, message: lifted.length ? `Saved. Pause lifted for ${lifted.join(', ')}.` : 'Saved.' };
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
