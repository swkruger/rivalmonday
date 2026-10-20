'use server';
import { revalidatePath } from 'next/cache';
import type { RunbookActionResult, RunbookOp } from '@/components/runbook/types';
import { requireOperatorContext } from '@/server/current-viewer';
import { applyRunbookOp } from '@/server/runbook-ops';

/** Every write on the platform runbook page. The staff gate and the audit row live in the tools; a refusal reads "Not found". */
export async function platformRunbookAction(op: RunbookOp): Promise<RunbookActionResult> {
  const { ctx } = await requireOperatorContext();
  const r = await applyRunbookOp(ctx, { level: 'platform' }, op);
  if (r.ok) revalidatePath('/platform/runbook');
  return r;
}
