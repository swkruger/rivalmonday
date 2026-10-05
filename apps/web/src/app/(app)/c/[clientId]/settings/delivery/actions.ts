'use server';
import { type AccessContext, isAgencyRole } from '@cs/core';
import { addClientRecipient, deactivateRecipient, updateClientDeliverySettings } from '@cs/tools';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { type FormResult, parseDeliveryForm, toFormResult } from '@/server/forms';

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
  try {
    await updateClientDeliverySettings({ service: dbs().service, app: dbs().app }, ctx, clientId, parsed);
  } catch (e) {
    return toFormResult(e);
  }
  revalidatePath(`/c/${clientId}/settings/delivery`);
  return { ok: true, message: 'Delivery settings saved.' };
}

export async function addRecipientAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const ctx = await agencyCtx();
  const clientId = String(formData.get('clientId') ?? '');
  const role = String(formData.get('role') ?? '');
  if (role !== 'client_owner' && role !== 'client_viewer') return { ok: false, error: 'Choose owner or viewer' };
  try {
    const name = String(formData.get('name') ?? '').trim();
    await addClientRecipient(dbs().service, ctx, { clientId, email: String(formData.get('email') ?? ''), name: name || null, role });
  } catch (e) {
    return toFormResult(e);
  }
  revalidatePath(`/c/${clientId}/settings/delivery`);
  return { ok: true, message: 'Recipient added.' };
}

export async function deactivateRecipientAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const ctx = await agencyCtx();
  const clientId = String(formData.get('clientId') ?? '');
  try {
    await deactivateRecipient(dbs().service, ctx, String(formData.get('contactId') ?? ''));
  } catch (e) {
    return toFormResult(e);
  }
  revalidatePath(`/c/${clientId}/settings/delivery`);
  return { ok: true };
}
