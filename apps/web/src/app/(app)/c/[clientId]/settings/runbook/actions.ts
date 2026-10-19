'use server';
import { isAgencyRole } from '@cs/core';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import type { RunbookActionResult, RunbookOp } from '@/components/runbook/types';
import { requireContext } from '@/server/current-viewer';
import { applyRunbookOp } from '@/server/runbook-ops';
import { callTool } from '@/server/tools';

/** Every write on a client's runbook page (bound to the client id by the page); the admin / account-manager scope gate lives in the tools. */
export async function clientRunbookAction(clientId: string, op: RunbookOp): Promise<RunbookActionResult> {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const r = await applyRunbookOp(ctx, { level: 'client', clientId }, op);
  if (r.ok) revalidatePath(`/c/${clientId}/settings/runbook`);
  return r;
}

/** The poll while tailoring runs: just the status string. */
export async function clientRunbookStatusAction(clientId: string): Promise<string | null> {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const r = await callTool<{ tailorStatus: string | null }>(ctx, 'get_runbook', { owner: { level: 'client', clientId } });
  return r.tailorStatus;
}
