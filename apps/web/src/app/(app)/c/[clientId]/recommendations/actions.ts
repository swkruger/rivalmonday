'use server';
import { revalidatePath } from 'next/cache';
import { requireContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { runTool } from '@/server/run-tool';

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

export async function setStatusAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx } = await requireContext();
  const status = s(fd, 'status');
  if (status === 'dismissed' && !s(fd, 'reason')) return { ok: false, error: 'Tell us why you’re dismissing it.' };
  const r = await runTool(ctx, 'update_recommendation_status', { recommendationId: s(fd, 'recommendationId'), status, reason: s(fd, 'reason') || undefined });
  if (r.ok) revalidatePath(`/c/${s(fd, 'clientId')}/recommendations`);
  return r.ok ? { ok: true } : r;
}
