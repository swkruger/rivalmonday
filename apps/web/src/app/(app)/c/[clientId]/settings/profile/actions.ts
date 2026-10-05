'use server';
import { isAgencyRole } from '@cs/core';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { type FormResult, parseClientProfileForm } from '@/server/forms';
import { runTool } from '@/server/run-tool';

export async function updateProfileAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const clientId = String(formData.get('clientId') ?? '');
  const parsed = parseClientProfileForm(formData);
  if ('error' in parsed) return { ok: false, error: parsed.error };
  const { verticalId: _v, timezone: _t, ...patch } = parsed;
  const r = await runTool(ctx, 'update_client_profile', { clientId, ...patch });
  if (!r.ok) return r;
  revalidatePath(`/c/${clientId}`, 'layout');
  return { ok: true, message: 'Profile saved.' };
}
