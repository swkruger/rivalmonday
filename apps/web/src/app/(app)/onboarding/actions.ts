'use server';
import { notFound, redirect } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { type FormResult, parseBrandingForm } from '@/server/forms';
import { runTool } from '@/server/run-tool';
import { isStep, nextPath } from './flow';
import { parseProfileForm } from './parse';

/** Every wizard write is admin-only; anyone else gets a 404 (no existence leak). */
async function adminCtx() {
  const { ctx } = await requireContext();
  if (ctx.role !== 'agency_admin') notFound();
  return ctx;
}

export async function saveProfileAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const ctx = await adminCtx();
  const r = await runTool(ctx, 'update_agency_profile', parseProfileForm(formData));
  if (!r.ok) return r;
  redirect(nextPath('profile')); // update_agency_profile marks the step done itself
}

export async function inviteTeamAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const ctx = await adminCtx();
  const emails = formData.getAll('email').map((v) => String(v).trim());
  const roles = formData.getAll('role').map(String);
  const rows = emails.map((email, i) => ({ email, role: roles[i] ?? 'agency_admin' })).filter((r) => r.email);
  if (!rows.length && formData.get('confirmEmpty') !== '1') return { ok: false, error: 'Continue without inviting anyone?' };
  const invited: string[] = [];
  for (const row of rows) {
    const r = await runTool(ctx, 'invite_member', { email: row.email, role: row.role, clientId: null, clientScope: null });
    if (!r.ok) {
      const already = invited.length ? ` Already invited: ${invited.join(', ')} — remove those rows before trying again.` : '';
      return { ...r, error: `${row.email}: ${r.error}${/[.!?]$/.test(r.error) ? '' : '.'}${already}` };
    }
    invited.push(row.email);
  }
  const done = await runTool(ctx, 'mark_onboarding_step', { step: 'team', action: 'done' });
  if (!done.ok) return done;
  redirect(nextPath('team'));
}

export async function skipStepAction(formData: FormData): Promise<void> {
  const ctx = await adminCtx();
  const step = String(formData.get('step') ?? '');
  if (!isStep(step)) notFound();
  const r = await runTool(ctx, 'mark_onboarding_step', { step, action: 'skip' });
  if (!r.ok) notFound();
  redirect(nextPath(step));
}

export async function continuePlanAction(): Promise<void> {
  const ctx = await adminCtx();
  const r = await runTool(ctx, 'mark_onboarding_step', { step: 'plan', action: 'done' });
  if (!r.ok) notFound();
  redirect(nextPath('plan'));
}

/** "Add payment method": Stripe Checkout returns to `/onboarding?step=plan`; the step is marked when they continue. */
export async function startCheckoutAction(_prev: FormResult, _formData: FormData): Promise<FormResult> {
  const ctx = await adminCtx();
  const r = await runTool<{ url: string }>(ctx, 'create_checkout_session', { returnTo: 'onboarding' });
  if (!r.ok) return r;
  redirect(r.data.url);
}

export async function saveBrandingStepAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const ctx = await adminCtx();
  const saved = await runTool(ctx, 'update_agency_branding', parseBrandingForm(formData));
  if (!saved.ok) return saved;
  const done = await runTool(ctx, 'mark_onboarding_step', { step: 'branding', action: 'done' });
  if (!done.ok) return done;
  redirect(nextPath('branding'));
}
