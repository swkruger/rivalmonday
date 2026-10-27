'use server';
import { revalidatePath } from 'next/cache';
import type { ClientProfile } from '@cs/tools';
import { parseDollars } from '@/app/(app)/agency/settings/billing/client-billing/money';
import { requireContext } from '@/server/current-viewer';
import { runTool, type ToolResult } from '@/server/run-tool';
import type { ClientSetupView, SetupActionResult } from './types';

/** Re-derives the viewer on every call; the tools re-check access (agency staff only: owners never enter setup, P8) themselves. */
const ctxOf = async () => (await requireContext()).ctx;

function refresh(clientId: string): void {
  revalidatePath(`/c/${clientId}`, 'layout');
}

/** Polled by the wizard while suggestions are pending or the search runs. */
export async function setupStatusAction(clientId: string): Promise<ToolResult<ClientSetupView>> {
  return runTool<ClientSetupView>(await ctxOf(), 'get_client_setup', { clientId });
}

/** What the area step (step 3) saves: the chips, the radius, the ticked services, and a typed City or ZIP when the client has no location yet. */
export interface AreaInput {
  keywords: string[];
  radiusKm: number;
  services: string[];
  /** Google services that match none of our areas, ticked in the services list (14a). */
  newAreas: string[];
  locality?: string;
}

/**
 * Step 3 "Continue": a typed City or ZIP is geocoded first (`update_client_details`); the service area then keeps its centre,
 * ZIPs and towns and takes the chosen radius. Saving starts the competitor search by itself (the first automatic run).
 */
export async function saveAreaAction(clientId: string, input: AreaInput): Promise<SetupActionResult> {
  const ctx = await ctxOf();
  if (input.locality?.trim()) {
    const placed = await runTool(ctx, 'update_client_details', { clientId, locality: input.locality.trim() });
    if (!placed.ok) return placed;
  }
  const profile = await runTool<ClientProfile>(ctx, 'get_client_profile', { clientId });
  if (!profile.ok) return profile;
  const area = profile.data.serviceArea;
  if (!area?.center) return { ok: false, error: 'Add a City or ZIP so we know where to search.' };
  const r = await runTool<{ searchRefusal: string | null }>(ctx, 'save_setup_profile', {
    clientId, services: input.services, keywords: input.keywords, newAreas: input.newAreas.map((name) => ({ name })),
    serviceArea: { center: area.center, radiusKm: input.radiusKm, zips: area.zips, ...(area.towns?.length ? { towns: area.towns } : {}) },
  });
  if (!r.ok) return r;
  refresh(clientId);
  return { ok: true, searchRefusal: r.data.searchRefusal };
}

export async function pickSetupCompetitorsAction(clientId: string, accept: string[], dismiss: string[]): Promise<SetupActionResult> {
  const r = await runTool(await ctxOf(), 'pick_setup_competitors', { clientId, accept, dismiss });
  if (!r.ok) return r;
  refresh(clientId);
  return { ok: true, searchRefusal: null };
}

export type SetupAdvance = 'start_search' | 'confirm_competitors' | 'skip_competitors' | 'skip_invite' | 'skip_billing' | 'dismiss' | 'ask_owner';

export async function advanceSetupAction(clientId: string, action: SetupAdvance): Promise<SetupActionResult> {
  const r = await runTool<{ searchRefusal: string | null }>(await ctxOf(), 'advance_client_setup', { clientId, action });
  if (!r.ok) return r;
  refresh(clientId);
  return { ok: true, searchRefusal: r.data.searchRefusal };
}

/** Invite step. Re-sending is the same call; while the owner was asked to pick, the invitation also sends their competitor review email. */
export async function inviteOwnerAction(clientId: string, name: string, email: string): Promise<SetupActionResult> {
  const r = await runTool(await ctxOf(), 'invite_client_owner', { clientId, name, email: email.trim() });
  if (!r.ok) return r;
  refresh(clientId);
  return { ok: true, searchRefusal: null };
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
