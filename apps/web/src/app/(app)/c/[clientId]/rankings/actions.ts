'use server';
import { type AccessContext, isAgencyRole, ToolError } from '@cs/core';
import { RANK_MANUAL_PER_AGENCY_DAY, searchDayLabelAt } from '@cs/tools';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { runTool, type ToolResult } from '@/server/run-tool';
import { type RankScanInfo, type RankScanRefusal, type RankSettingsView, SCAN_NOT_QUEUED, scanQueuedMessage, SETTINGS_SAVED } from './scan-copy';

/** Rank settings and Scan now are agency-only (spec D5); the tools refuse client roles too. */
async function agencyCtx(): Promise<AccessContext> {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  return ctx;
}

const page = (clientId: string) => `/c/${clientId}/rankings`;

export async function saveRankSettings(clientId: string, input: { keywords: string[]; gridSize: number; radiusKm: number }): Promise<FormResult> {
  const ctx = await agencyCtx();
  const r = await runTool(ctx, 'update_client_rank_settings', { clientId, keywords: input.keywords, gridSize: input.gridSize, radiusKm: input.radiusKm });
  if (!r.ok) return r;
  revalidatePath(page(clientId));
  return { ok: true, message: SETTINGS_SAVED };
}

/**
 * The decided copy for a refused scan. `request_rank_scan` carries no cap amount and folds `running` into `not_ready`,
 * so the copy comes from a fresh `get_rank_settings` read (`scan`, null if that read failed): its label already holds
 * the client-local date and the cap amount.
 */
function refusalCopy(reason: RankScanRefusal, nextAvailableAt: string | undefined, scan: RankScanInfo | null): string {
  switch (reason) {
    case 'weekly_limit': {
      const fromLabel = scan?.state === 'weekly_limit' ? /^Next scan available (.+)$/.exec(scan.label ?? '')?.[1] : undefined;
      const at = nextAvailableAt ?? scan?.nextAvailableAt;
      const date = fromLabel ?? (at ? searchDayLabelAt(at, 'UTC') : 'next week');
      return `Next manual scan available ${date}.`;
    }
    case 'agency_daily_limit':
      return `Your agency has used today's ${RANK_MANUAL_PER_AGENCY_DAY} manual scans.`;
    case 'cap':
      return scan?.state === 'cap' && scan.label ? scan.label : "This scan would exceed this client's monthly cost cap. Raise the cap in Usage or wait until next month.";
    case 'not_ready':
      return scan?.state === 'running' ? 'A rank scan is already running for this client.' : 'Add keywords and a service area (and an active client) before scanning.';
  }
}

type ScanRequest = { queued: true; scanEtaMinutes: number } | { queued: false; reason: RankScanRefusal; nextAvailableAt?: string };

export async function requestRankScan(clientId: string): Promise<FormResult> {
  const ctx = await agencyCtx();
  let r: ToolResult<ScanRequest>;
  try {
    r = await runTool<ScanRequest>(ctx, 'request_rank_scan', { clientId });
  } catch (e) {
    // A failed enqueue (incl. the DEMO/TEST queue refusal) leaves no scan row behind; say so instead of crashing the page.
    if (e instanceof ToolError && e.code === 'internal') return { ok: false, error: SCAN_NOT_QUEUED };
    throw e;
  }
  if (!r.ok) return r;
  revalidatePath(page(clientId)); // queued → the button reads "Scan running…"; refused → it shows the blocking state
  if (r.data.queued) return { ok: true, message: scanQueuedMessage(r.data.scanEtaMinutes) };
  const s = await runTool<RankSettingsView>(ctx, 'get_rank_settings', { clientId });
  return { ok: false, error: refusalCopy(r.data.reason, r.data.nextAvailableAt, s.ok ? s.data.scan : null) };
}
