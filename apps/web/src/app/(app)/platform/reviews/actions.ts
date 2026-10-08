'use server';
import { revalidatePath } from 'next/cache';
import { requireContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { runTool } from '@/server/run-tool';

const DONE: Record<string, string> = {
  created: 'Resolved — a new event was created.', updated: 'Resolved — the event was updated and re-scored.', detached: 'Resolved — the change was detached from its event.',
  retracted: 'Resolved — the event was withdrawn.', unchanged: 'Resolved.',
};

export async function resolveReviewAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx } = await requireContext();
  const answers: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (k.startsWith('q:') && String(v)) answers[k.slice(2)] = String(v);
  const r = await runTool<{ action: string }>(ctx, 'resolve_decision_review', { reviewId: String(fd.get('reviewId') ?? ''), answers });
  if (!r.ok) return r;
  revalidatePath('/platform/reviews');
  return { ok: true, message: DONE[r.data.action] ?? 'Resolved.' };
}
