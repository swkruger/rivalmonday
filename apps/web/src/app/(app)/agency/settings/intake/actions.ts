'use server';
import { revalidatePath } from 'next/cache';
import { requireContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { runTool } from '@/server/run-tool';

/** Saves the link name (slug). Empty on first use lets the tool derive one from the agency name. Taken names come back as the tool's user-facing message. */
export async function saveIntakeSlugAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx } = await requireContext();
  const slug = String(fd.get('slug') ?? '').trim();
  const r = await runTool(ctx, 'update_intake_link', slug ? { slug } : {});
  if (!r.ok) return r;
  revalidatePath('/agency/settings/intake');
  return { ok: true, message: 'Saved.' };
}

export async function setIntakeEnabledAction(enabled: boolean): Promise<FormResult> {
  const { ctx } = await requireContext();
  const r = await runTool(ctx, 'update_intake_link', { enabled: enabled === true });
  if (!r.ok) return r;
  revalidatePath('/agency/settings/intake');
  return { ok: true };
}
