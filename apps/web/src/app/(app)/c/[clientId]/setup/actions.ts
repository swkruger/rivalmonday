'use server';
import { revalidatePath } from 'next/cache';
import { requireContext } from '@/server/current-viewer';
import { parseClientProfileForm } from '@/server/forms';
import { runTool, type ToolResult } from '@/server/run-tool';
import type { ClientSetupView, SetupActionResult } from './types';

/** Re-derives the viewer on every call; the tools re-check access (agency staff or the client's owner) themselves. */
const ctxOf = async () => (await requireContext()).ctx;

function refresh(clientId: string): void {
  revalidatePath(`/c/${clientId}`, 'layout');
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
  const r = await runTool<{ searchRefusal: string | null }>(await ctxOf(), 'save_setup_profile', {
    clientId, services: parsed.services, keywords, serviceArea: parsed.serviceArea, placeId: parsed.placeId,
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

export type SetupAdvance = 'start_search' | 'confirm_competitors' | 'skip_search' | 'skip_competitors' | 'dismiss';

export async function advanceSetupAction(clientId: string, action: SetupAdvance): Promise<SetupActionResult> {
  const r = await runTool<{ searchRefusal: string | null }>(await ctxOf(), 'advance_client_setup', { clientId, action });
  if (!r.ok) return r;
  refresh(clientId);
  return { ok: true, searchRefusal: r.data.searchRefusal };
}
