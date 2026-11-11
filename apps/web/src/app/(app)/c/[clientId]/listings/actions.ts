'use server';
import { type AccessContext, isAgencyRole, SPEND_PAUSED_COPY, ToolError } from '@cs/core';
import { searchDayLabelAt } from '@cs/tools';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { runTool, type ToolResult } from '@/server/run-tool';
import { viewerTimeZone } from '@/server/viewer-tz';
import { CHECK_ALREADY_RUNNING, CHECK_DAILY_LIMIT, CHECK_NOT_QUEUED, CHECK_NOT_READY, CHECK_QUEUED, type CheckRefusal, checkNextAvailable } from './check-copy';

/** Check listings now is agency-only (spec D1); the tool refuses client roles too. */
async function agencyCtx(): Promise<AccessContext> {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  return ctx;
}

function refusalCopy(reason: CheckRefusal, nextAvailableAt: string | undefined, tz: string): string {
  switch (reason) {
    case 'weekly_limit': return `${checkNextAvailable(nextAvailableAt ? searchDayLabelAt(nextAvailableAt, tz) : 'next week')}.`;
    case 'agency_daily_limit': return CHECK_DAILY_LIMIT;
    case 'spend_paused': return SPEND_PAUSED_COPY;
    case 'running': return CHECK_ALREADY_RUNNING;
    case 'not_ready': return CHECK_NOT_READY;
  }
}

type CheckRequest = { runId: string } | { refused: CheckRefusal; nextAvailableAt?: string };

export async function requestListingsCheck(clientId: string): Promise<FormResult> {
  const ctx = await agencyCtx();
  let r: ToolResult<CheckRequest>;
  try {
    r = await runTool<CheckRequest>(ctx, 'request_citation_audit', { clientId });
  } catch (e) {
    // A failed enqueue (incl. the DEMO/TEST queue refusal) leaves no run row behind; say so instead of crashing the page.
    if (e instanceof ToolError && e.code === 'internal') {
      console.error(`[listings-check] request for client ${clientId} failed`, e);
      return { ok: false, error: CHECK_NOT_QUEUED };
    }
    throw e;
  }
  if (!r.ok) return r;
  revalidatePath(`/c/${clientId}/listings`); // queued: the button reads "Check running…"; refused: it shows the blocking state
  if ('runId' in r.data) return { ok: true, message: CHECK_QUEUED };
  return { ok: false, error: refusalCopy(r.data.refused, r.data.nextAvailableAt, await viewerTimeZone()) };
}
