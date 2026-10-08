'use server';
import type { AccessContext } from '@cs/core';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { runTool } from '@/server/run-tool';

async function userCtx(): Promise<AccessContext> {
  const { viewer, ctx } = await requireContext();
  if (viewer.kind !== 'user') notFound();
  return ctx;
}

export async function setPrefAction(input: { contactId: string; kind: string; channel: 'in_app' | 'email'; enabled: boolean }) {
  const ctx = await userCtx();
  await runTool(ctx, 'set_my_notification_pref', input);
  revalidatePath('/settings/notifications');
}

/**
 * Controller ruling S8: `userCtx()` (which may call `notFound()`) runs BEFORE the tool call — Next's `notFound()` throws a
 * control-flow error that a catch here would otherwise turn into a form error string instead of the 404 page.
 */
export async function updateContactAction(_prev: { error: string | null }, formData: FormData): Promise<{ error: string | null }> {
  const ctx = await userCtx();
  const start = String(formData.get('quietStart') ?? '');
  const end = String(formData.get('quietEnd') ?? '');
  const r = await runTool(ctx, 'update_my_contact', {
    contactId: String(formData.get('contactId') ?? ''),
    timezone: String(formData.get('timezone') ?? ''),
    quietHours: start && end ? { start, end } : null,
  });
  if (!r.ok) return { error: r.error };
  revalidatePath('/settings/notifications');
  return { error: null };
}
