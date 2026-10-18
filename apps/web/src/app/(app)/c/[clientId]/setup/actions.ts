'use server';
import { isAgencyRole } from '@cs/core';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { parseDollars } from '../../../agency/settings/billing/client-billing/money';
import { requireContext } from '@/server/current-viewer';
import { parseClientProfileForm } from '@/server/forms';
import { runTool, type ToolResult } from '@/server/run-tool';
import type { ClientSetupView, SetupActionResult } from './types';

/** Re-derives the viewer on every call; the tools re-check access (agency staff or the client's owner) themselves. */
const ctxOf = async () => (await requireContext()).ctx;

function refresh(clientId: string): void {
  revalidatePath(`/c/${clientId}`, 'layout');
}

/**
 * A client owner can't open a setup that is closed for them (404 once `clientOpen` is false: their three steps are done,
 * or the setup completed/was dismissed), so the write that closes it sends them to the overview instead of refreshing
 * this page into the 404. Staff stay (the invite/billing steps or the "Setup finished" summary).
 */
async function leaveIfClosed(clientId: string, state: { clientOpen: boolean }): Promise<void> {
  if (!state.clientOpen && !isAgencyRole((await ctxOf()).role)) redirect(`/c/${clientId}`);
}

/** Polled by the wizard while suggestions are pending or the search runs. */
export async function setupStatusAction(clientId: string): Promise<ToolResult<ClientSetupView>> {
  return runTool<ClientSetupView>(await ctxOf(), 'get_client_setup', { clientId });
}

/** "Save and find competitors": ticked services, ticked + typed keywords, service area, place id. */
export async function saveSetupProfileAction(clientId: string, fd: FormData): Promise<SetupActionResult> {
  const parsed = parseClientProfileForm(fd); // only its service-area parsing is used here; name/vertical aren't part of this step
  if ('error' in parsed) return { ok: false, error: parsed.error };
  const typed = String(fd.get('extraKeywords') ?? '').split(/\r?\n/).map((k) => k.trim()).filter(Boolean);
  const keywords = [...new Set([...fd.getAll('keywords').map((k) => String(k).trim()).filter(Boolean), ...typed])];
  const r = await runTool<{ state: { open: boolean; clientOpen: boolean }; searchRefusal: string | null }>(await ctxOf(), 'save_setup_profile', {
    clientId, services: parsed.services, keywords, newAreas: fd.getAll('newAreas').map((n) => ({ name: String(n).trim() })).filter((n) => n.name), serviceArea: parsed.serviceArea, placeId: parsed.placeId,
  });
  if (!r.ok) return r;
  refresh(clientId);
  await leaveIfClosed(clientId, r.data.state);
  return { ok: true, searchRefusal: r.data.searchRefusal };
}

export async function pickSetupCompetitorsAction(clientId: string, accept: string[], dismiss: string[]): Promise<SetupActionResult> {
  const r = await runTool(await ctxOf(), 'pick_setup_competitors', { clientId, accept, dismiss });
  if (!r.ok) return r;
  refresh(clientId);
  return { ok: true, searchRefusal: null };
}

export type SetupAdvance = 'start_search' | 'confirm_competitors' | 'skip_search' | 'skip_competitors' | 'skip_invite' | 'skip_billing' | 'dismiss';

export async function advanceSetupAction(clientId: string, action: SetupAdvance): Promise<SetupActionResult> {
  const r = await runTool<{ state: { open: boolean; clientOpen: boolean }; searchRefusal: string | null }>(await ctxOf(), 'advance_client_setup', { clientId, action });
  if (!r.ok) return r;
  refresh(clientId);
  await leaveIfClosed(clientId, r.data.state);
  return { ok: true, searchRefusal: r.data.searchRefusal };
}

/** Invite step (and the side-panel form on steps 1-3). Re-sending is the same call. */
export async function inviteOwnerAction(clientId: string, name: string, email: string): Promise<SetupActionResult> {
  const r = await runTool(await ctxOf(), 'invite_client_owner', { clientId, name, email: email.trim() });
  if (!r.ok) return r;
  refresh(clientId);
  return { ok: true, searchRefusal: null };
}

/** Pick step: "Ask {ownerName} to review". `queued: false` covers every non-send reason (no invite, expired, already sent today). */
export async function sendReviewAction(clientId: string): Promise<ToolResult<{ queued: boolean }>> {
  const r = await runTool<{ queued: boolean }>(await ctxOf(), 'send_competitor_review', { clientId });
  if (r.ok) refresh(clientId);
  return r;
}

/** Billing step: dollars text -> cents; the '0 if paid before' setup-fee rule stays in `enable_client_billing`. */
export async function enableBillingAction(clientId: string, price: string, setupFee: string): Promise<SetupActionResult> {
  const priceCents = parseDollars(price);
  if (priceCents === null) return { ok: false, error: 'Enter the monthly price in dollars, e.g. 299.' };
  const setupFeeCents = parseDollars(setupFee === '' ? '0' : setupFee);
  if (setupFeeCents === null) return { ok: false, error: 'Enter the setup fee in dollars, e.g. 0 or 99.50.' };
  const r = await runTool(await ctxOf(), 'enable_client_billing', { clientId, priceCents, setupFeeCents });
  if (!r.ok) return r;
  refresh(clientId);
  return { ok: true, searchRefusal: null };
}
