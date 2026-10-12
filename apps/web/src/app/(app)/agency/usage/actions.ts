'use server';
import { isAgencyRole } from '@cs/core';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { runTool } from '@/server/run-tool';

const num = (fd: FormData, k: string) => {
  const raw = String(fd.get(k) ?? '').trim();
  return raw === '' ? undefined : Number(raw);
};

export async function saveLimitsAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const monthlyCapUsd = num(fd, 'monthlyCapUsd');
  const competitorLimit = num(fd, 'competitorLimit');
  const askMonthlyQuota = num(fd, 'askMonthlyQuota');
  if ([monthlyCapUsd, competitorLimit, askMonthlyQuota].some((n) => n !== undefined && Number.isNaN(n))) {
    return { ok: false, error: 'Enter a number' };
  }
  const r = await runTool(ctx, 'set_client_limits', { clientId: String(fd.get('clientId') ?? ''), monthlyCapUsd, competitorLimit, ...(askMonthlyQuota !== undefined ? { askMonthlyQuota } : {}) });
  if (!r.ok) return r;
  revalidatePath('/agency/usage');
  return { ok: true, message: 'Limits saved.' };
}
