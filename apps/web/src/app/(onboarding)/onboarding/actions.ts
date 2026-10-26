'use server';
import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { type FormResult, parseBrandingForm } from '@/server/forms';
import { runTool } from '@/server/run-tool';
import { isSkippable, nextPath } from './flow';
import { parseBasicsForm } from './parse';

/** Every wizard write is admin-only; anyone else gets a 404 (no existence leak). */
async function adminCtx() {
  const { ctx } = await requireContext();
  if (ctx.role !== 'agency_admin') notFound();
  return ctx;
}

export async function saveBasicsAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const ctx = await adminCtx();
  const r = await runTool(ctx, 'save_agency_basics', parseBasicsForm(formData));
  if (!r.ok) return r;
  redirect(nextPath('profile')); // save_agency_basics marks the step done itself
}

export async function inviteTeamAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const ctx = await adminCtx();
  const emails = formData.getAll('email').map((v) => String(v).trim());
  const roles = formData.getAll('role').map(String);
  const rows = emails.map((email, i) => ({ email, role: roles[i] ?? 'account_manager' })).filter((r) => r.email);
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
  if (!isSkippable(step)) notFound();
  const r = await runTool(ctx, 'mark_onboarding_step', { step, action: 'skip' });
  if (!r.ok) notFound();
  redirect(nextPath(step));
}

/** Saves the colour, name and logo address, then marks the step done. The logo file itself is uploaded by the logo route. */
export async function saveBrandingStepAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const ctx = await adminCtx();
  const saved = await runTool(ctx, 'update_agency_branding', parseBrandingForm(formData));
  if (!saved.ok) return saved;
  const done = await runTool(ctx, 'mark_onboarding_step', { step: 'branding', action: 'done' });
  if (!done.ok) return done;
  redirect(nextPath('branding'));
}

/** The confirmation screen: `to=client` goes on to the first client, anything else to the dashboard. */
export async function finishAction(formData: FormData): Promise<void> {
  const ctx = await adminCtx();
  const r = await runTool(ctx, 'finish_onboarding', {});
  if (!r.ok) notFound();
  redirect(formData.get('to') === 'client' ? '/agency/clients/new' : '/agency');
}

/** Hides the `/agency` getting-started checklist. */
export async function dismissChecklistAction(): Promise<void> {
  const ctx = await adminCtx();
  const r = await runTool(ctx, 'dismiss_onboarding_checklist', {});
  if (!r.ok) notFound();
  revalidatePath('/agency');
}
