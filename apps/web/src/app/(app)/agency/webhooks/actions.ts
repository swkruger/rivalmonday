'use server';
import { addWebhook, setWebhookActive } from '@cs/tools';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { type FormResult, toFormResult } from '@/server/forms';

function kindsFromForm(fd: FormData): string[] | null {
  const vals = fd.getAll('kinds').map(String);
  return vals.length ? vals : null;
}

export async function addWebhookAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const { ctx } = await requireContext();
  if (ctx.role !== 'agency_admin') notFound();
  const kind = String(formData.get('kind') ?? '');
  if (kind !== 'slack' && kind !== 'teams') return { ok: false, error: 'Choose Slack or Teams' };
  try {
    await addWebhook(dbs().service, ctx, { kind, url: String(formData.get('url') ?? ''), kinds: kindsFromForm(formData) });
  } catch (e) {
    return toFormResult(e);
  }
  revalidatePath('/agency/webhooks');
  return { ok: true, message: 'Webhook added.' };
}

export async function toggleWebhookAction(input: { id: string; active: boolean }): Promise<void> {
  const { ctx } = await requireContext();
  if (ctx.role !== 'agency_admin') notFound();
  await setWebhookActive(dbs().service, ctx, input.id, input.active);
  revalidatePath('/agency/webhooks');
}
