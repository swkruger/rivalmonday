'use server';
import { updateAgencyBranding } from '@cs/tools';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { type FormResult, parseBrandingForm, toFormResult } from '@/server/forms';

export async function saveBrandingAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const { ctx } = await requireContext();
  if (ctx.role !== 'agency_admin') notFound();
  const branding = parseBrandingForm(formData);
  try {
    await updateAgencyBranding(dbs().service, ctx, branding);
  } catch (e) {
    return toFormResult(e);
  }
  revalidatePath('/agency/branding');
  return { ok: true, message: 'Branding saved.' };
}
