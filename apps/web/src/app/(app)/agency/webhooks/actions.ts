'use server';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { type FormResult } from '@/server/forms';
import { runTool } from '@/server/run-tool';

function kindsFromForm(fd: FormData): string[] | null {
  const vals = fd.getAll('kinds').map(String);
  return vals.length ? vals : null;
}

export async function addWebhookAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const { ctx } = await requireContext();
  if (ctx.role !== 'agency_admin') notFound();
  const kind = String(formData.get('kind') ?? '');
  if (kind !== 'slack' && kind !== 'teams') return { ok: false, error: 'Choose Slack or Teams' };
  const r = await runTool(ctx, 'add_webhook', { kind, url: String(formData.get('url') ?? ''), kinds: kindsFromForm(formData) });
  if (!r.ok) return r;
  revalidatePath('/agency/webhooks');
  return { ok: true, message: 'Webhook added.' };
}

/** The toggle switch re-renders from the server value after revalidatePath; any tool error is swallowed on purpose (no error path for this control). */
export async function toggleWebhookAction(input: { id: string; active: boolean }): Promise<void> {
  const { ctx } = await requireContext();
  if (ctx.role !== 'agency_admin') notFound();
  await runTool(ctx, 'set_webhook_active', { webhookId: input.id, active: input.active });
  revalidatePath('/agency/webhooks');
}
