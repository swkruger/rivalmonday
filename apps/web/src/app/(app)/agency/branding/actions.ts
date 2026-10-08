'use server';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { runTool } from '@/server/run-tool';
import { type FormResult, parseBrandingForm } from '@/server/forms';

export async function saveBrandingAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const { ctx } = await requireContext();
  if (ctx.role !== 'agency_admin') notFound();
  const branding = parseBrandingForm(formData);
  const r = await runTool(ctx, 'update_agency_branding', branding);
  if (!r.ok) return r;
  revalidatePath('/agency/branding');
  return { ok: true, message: 'Branding saved.' };
}
