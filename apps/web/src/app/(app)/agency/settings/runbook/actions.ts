'use server';
import { isAgencyRole } from '@cs/core';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import type { RunbookActionResult, RunbookOp } from '@/components/runbook/types';
import { requireContext } from '@/server/current-viewer';
import { applyRunbookOp } from '@/server/runbook-ops';

/** Every write on the agency runbook page; the admin gate lives in the tools. */
export async function agencyRunbookAction(op: RunbookOp): Promise<RunbookActionResult> {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const r = await applyRunbookOp(ctx, { level: 'agency' }, op);
  if (r.ok) revalidatePath('/agency/settings/runbook');
  return r;
}
