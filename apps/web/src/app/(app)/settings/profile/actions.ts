'use server';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { runTool } from '@/server/run-tool';

/** `notFound()` runs before any tool call (Next throws a control-flow error a catch would swallow). */
async function userCtx() {
  const { viewer, ctx } = await requireContext();
  if (viewer.kind !== 'user') notFound();
  return ctx;
}

export async function updateNameAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const ctx = await userCtx();
  const r = await runTool(ctx, 'update_my_profile', { name: String(formData.get('name') ?? '') });
  if (!r.ok) return r;
  revalidatePath('/settings/profile');
  return { ok: true, message: 'Saved.' };
}

export async function removeAvatarAction(): Promise<FormResult> {
  const ctx = await userCtx();
  const r = await runTool(ctx, 'remove_my_avatar', {});
  if (!r.ok) return r;
  revalidatePath('/settings/profile');
  return { ok: true, message: 'Saved.' };
}
