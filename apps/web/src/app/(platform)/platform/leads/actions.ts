'use server';
import { revalidatePath } from 'next/cache';
import { requireOperatorContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { runTool } from '@/server/run-tool';

/** Gives a pool lead to an agency (staff and owners; the tool refuses viewers). The agency-already-has-it conflict arrives as its user-facing message. */
export async function assignLeadAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx } = await requireOperatorContext();
  const r = await runTool(ctx, 'assign_lead', { leadId: String(fd.get('leadId') ?? ''), agencyId: String(fd.get('agencyId') ?? '') });
  if (!r.ok) return r;
  revalidatePath('/platform/leads');
  return { ok: true, message: 'Assigned.' };
}
