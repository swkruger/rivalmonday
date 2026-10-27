'use server';
import { type Feature, FEATURES, isAgencyRole } from '@cs/core';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { type FormResult, parseClientProfileForm } from '@/server/forms';
import { LOGO_ERROR_COPY, normalizeLogo } from '@/server/logo';
import { runTool } from '@/server/run-tool';

export async function updateProfileAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const clientId = String(formData.get('clientId') ?? '');
  const parsed = parseClientProfileForm(formData);
  if ('error' in parsed) return { ok: false, error: parsed.error };
  const { verticalId: _v, timezone: _t, ...patch } = parsed;
  const r = await runTool(ctx, 'update_client_profile', { clientId, ...patch });
  if (!r.ok) return r;
  revalidatePath(`/c/${clientId}`, 'layout');
  return { ok: true, message: 'Profile saved.' };
}

export async function saveFeaturesAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const clientId = String(formData.get('clientId') ?? '');
  const features = [...new Set(formData.getAll('feature').map(String))].filter((f): f is Feature => (FEATURES as readonly string[]).includes(f));
  const r = await runTool(ctx, 'update_client_profile', {
    clientId,
    features,
    // Admin-only: the checkbox is rendered for agency_admin alone, and the tool refuses everyone else.
    ...(formData.get('askReviewPresent') === '1' ? { askReviewAllowed: formData.get('askReviewAllowed') === 'on' } : {}),
  });
  if (!r.ok) return r;
  revalidatePath(`/c/${clientId}`, 'layout');
  return { ok: true, message: 'Features saved.' };
}

const PARTIAL_ADDRESS = 'Enter the street address, city, state and ZIP code, or clear the address.';

/**
 * Final fix I3: the "Business details" section (agency staff). Saves through `update_client_details`, then a new logo
 * through `upload_client_logo`; the logo is normalised first, so a bad file stops before anything is saved.
 */
export async function updateDetailsAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const t = (k: string) => String(formData.get(k) ?? '').trim();
  const clientId = t('clientId');
  const a = { line1: t('line1'), line2: t('line2'), city: t('city'), region: t('region'), postalCode: t('postalCode') };
  const anyAddress = Object.values(a).some(Boolean);
  if (anyAddress && (!a.line1 || !a.city || !a.region || !a.postalCode)) return { ok: false, error: PARTIAL_ADDRESS };
  const address = anyAddress ? { line1: a.line1, ...(a.line2 ? { line2: a.line2 } : {}), city: a.city, region: a.region, postalCode: a.postalCode, country: 'US' as const } : null;

  let logo: { png: Uint8Array; sha256: string } | null = null;
  const file = formData.get('logo');
  if (file instanceof Blob && file.size > 0) {
    const n = await normalizeLogo(new Uint8Array(await file.arrayBuffer()), file.type);
    if ('error' in n) return { ok: false, error: LOGO_ERROR_COPY[n.error] };
    logo = n;
  }
  const contactName = t('contactName');
  const contactEmail = t('contactEmail');
  const r = await runTool(ctx, 'update_client_details', {
    clientId, phone: t('phone'), address, ...(contactName ? { contactName } : {}), ...(contactEmail ? { contactEmail } : {}),
  });
  if (!r.ok) return r;
  if (logo) {
    const up = await runTool(ctx, 'upload_client_logo', { clientId, png: Buffer.from(logo.png).toString('base64'), sha256: logo.sha256 });
    if (!up.ok) return up;
  }
  revalidatePath(`/c/${clientId}`, 'layout');
  return { ok: true, message: 'Details saved.' };
}
