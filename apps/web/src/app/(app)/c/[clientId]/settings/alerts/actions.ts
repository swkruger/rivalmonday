'use server';
import { revalidatePath } from 'next/cache';
import { requireContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { runTool } from '@/server/run-tool';

const num = (fd: FormData, k: string) => {
  const raw = String(fd.get(k) ?? '').trim();
  return raw === '' ? undefined : Number(raw);
};

export async function saveAlertRulesAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx } = await requireContext();
  const clientId = String(fd.get('clientId') ?? '');
  const reset = fd.get('intent') === 'reset';
  const r = await runTool(ctx, 'set_alert_rules', reset ? { clientId, reset: true } : { clientId, alert: num(fd, 'alert'), brief: num(fd, 'brief') });
  if (!r.ok) return r;
  revalidatePath(`/c/${clientId}/settings/alerts`);
  return { ok: true, message: reset ? 'Back to the default thresholds.' : 'Alert rules saved.' };
}
