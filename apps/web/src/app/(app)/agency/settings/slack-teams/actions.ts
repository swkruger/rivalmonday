'use server';
import { READ_ONLY_SESSION_MESSAGE } from '@cs/core';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { type FormResult } from '@/server/forms';
import { runTool } from '@/server/run-tool';

function kindsFromForm(fd: FormData): string[] | null {
  const vals = fd.getAll('kinds').map(String);
  return vals.length ? vals : null;
}

/** Webhooks are agency-admin only; anyone else gets a 404. */
async function adminContext() {
  const { ctx } = await requireContext();
  if (ctx.role !== 'agency_admin') notFound();
  return ctx;
}

export async function addWebhookAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const ctx = await adminContext();
  const kind = String(formData.get('kind') ?? '');
  if (kind !== 'slack' && kind !== 'teams') return { ok: false, error: 'Choose Slack or Teams' };
  const r = await runTool(ctx, 'add_webhook', { kind, url: String(formData.get('url') ?? ''), kinds: kindsFromForm(formData) });
  if (!r.ok) return r;
  revalidatePath('/agency/settings/slack-teams');
  return { ok: true, message: 'Webhook added.' };
}

/**
 * The switch reverts and shows the refusal when the tool says no (5a T18, 5b-2). Inside a support session (8b, M3) every
 * refusal is the g10 copy, returned rather than thrown: Next redacts messages thrown from server actions in production.
 */
export async function toggleWebhookAction(input: { id: string; active: boolean }): Promise<FormResult> {
  const ctx = await adminContext();
  const r = await runTool(ctx, 'set_webhook_active', { webhookId: input.id, active: input.active });
  if (!r.ok) return { ok: false, error: ctx.support ? READ_ONLY_SESSION_MESSAGE : r.error };
  revalidatePath('/agency/settings/slack-teams');
  return { ok: true };
}

export type WebhookTestOutcome = { ok: boolean; status?: number; error?: 'timeout' | 'blocked' | 'http' | 'network' };

/** "Send test" (15c-2a T10): what the receiver answered, or the refusal (rate limit) as copy. Nothing to revalidate. */
export async function testWebhookAction(input: { id: string }): Promise<{ ok: true; result: WebhookTestOutcome } | { ok: false; error: string }> {
  const ctx = await adminContext();
  const r = await runTool<WebhookTestOutcome>(ctx, 'test_webhook', { webhookId: input.id });
  if (!r.ok) return { ok: false, error: ctx.support ? READ_ONLY_SESSION_MESSAGE : r.error };
  return { ok: true, result: r.data };
}

/** Delete behind a ConfirmDialog (15c-2a T10); the row leaves the table on revalidate. */
export async function deleteWebhookAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const ctx = await adminContext();
  const r = await runTool(ctx, 'delete_webhook', { webhookId: String(formData.get('webhookId') ?? '') });
  if (!r.ok) return { ok: false, error: ctx.support ? READ_ONLY_SESSION_MESSAGE : r.error };
  revalidatePath('/agency/settings/slack-teams');
  return { ok: true };
}
