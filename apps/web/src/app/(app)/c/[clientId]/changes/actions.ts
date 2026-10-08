'use server';
/** Task 9 brief: posts `submit_feedback` and revalidates the Changes page so `myFeedback` reflects the new verdict. */
import { revalidatePath } from 'next/cache';
import { requireContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { runTool } from '@/server/run-tool';

export async function submitFeedbackAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx } = await requireContext();
  const clientId = String(fd.get('clientId') ?? '');
  const r = await runTool(ctx, 'submit_feedback', { clientId, eventId: String(fd.get('eventId') ?? ''), verdict: String(fd.get('verdict') ?? '') });
  if (!r.ok) return r;
  revalidatePath(`/c/${clientId}/changes`);
  return { ok: true, message: 'Thanks — saved.' };
}
