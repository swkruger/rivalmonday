'use server';
import { type AccessContext, isAgencyRole } from '@cs/core';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { type FormResult, parseDeliveryForm } from '@/server/forms';
import { runTool } from '@/server/run-tool';

/** Re-derives the viewer's context on every call (never trusts the form for identity); `clientId` is just the
 * resource being acted on and is re-checked by the `@cs/tools` functions themselves (`canAccessClient`). */
async function agencyCtx(): Promise<AccessContext> {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  return ctx;
}

export async function saveDeliveryAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const ctx = await agencyCtx();
  const clientId = String(formData.get('clientId') ?? '');
  const parsed = parseDeliveryForm(formData);
  if ('error' in parsed) return { ok: false, error: parsed.error };
  const r = await runTool(ctx, 'update_client_delivery', { clientId, ...parsed });
  if (!r.ok) return r;
  revalidatePath(`/c/${clientId}/settings/delivery`);
  return { ok: true, message: 'Delivery settings saved.' };
}

export async function addRecipientAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const ctx = await agencyCtx();
  const clientId = String(formData.get('clientId') ?? '');
  const role = String(formData.get('role') ?? '');
  if (role !== 'client_owner' && role !== 'client_viewer') return { ok: false, error: 'Choose owner or viewer' };
  const name = String(formData.get('name') ?? '').trim();
  const r = await runTool(ctx, 'add_client_recipient', { clientId, email: String(formData.get('email') ?? ''), name: name || null, role });
  if (!r.ok) return r;
  revalidatePath(`/c/${clientId}/settings/delivery`);
  return { ok: true, message: 'Recipient added.' };
}

export async function deactivateRecipientAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const ctx = await agencyCtx();
  const clientId = String(formData.get('clientId') ?? '');
  const r = await runTool(ctx, 'deactivate_recipient', { contactId: String(formData.get('contactId') ?? '') });
  if (!r.ok) return r;
  revalidatePath(`/c/${clientId}/settings/delivery`);
  return { ok: true };
}
