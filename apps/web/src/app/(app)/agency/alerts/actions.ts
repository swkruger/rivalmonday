'use server';
import { type AccessContext, isAgencyRole } from '@cs/core';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { runTool } from '@/server/run-tool';

async function agencyCtx(): Promise<AccessContext> {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  return ctx;
}
const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
function refresh() {
  revalidatePath('/agency/alerts');
  revalidatePath('/agency');
}

const OUTCOME_MESSAGE: Record<'immediate' | 'digest' | 'withdrawn', string> = {
  immediate: 'Sent to the client.',
  digest: 'Today’s limit of 3 alerts is reached — it goes out in the 17:00 digest.',
  withdrawn: 'Withdrawn — its evidence was retracted, so nothing was sent.',
};

export async function approveAlertAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await agencyCtx();
  const r = await runTool<{ outcome: 'immediate' | 'digest' | 'withdrawn' }>(ctx, 'approve_alert', { alertId: s(fd, 'alertId') });
  if (!r.ok) return r;
  refresh();
  return { ok: true, message: OUTCOME_MESSAGE[r.data.outcome] };
}

export async function dismissAlertAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await agencyCtx();
  const r = await runTool(ctx, 'dismiss_alert', { alertId: s(fd, 'alertId'), reason: s(fd, 'reason') });
  if (!r.ok) return r;
  refresh();
  return { ok: true, message: 'Dismissed.' };
}
