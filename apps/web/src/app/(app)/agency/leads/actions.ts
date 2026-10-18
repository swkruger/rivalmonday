'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { runTool } from '@/server/run-tool';

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

/** Accept: on success go straight into the new prospect's setup wizard (the tool commits the client, setup row and invite). */
export async function acceptLeadAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx } = await requireContext();
  const verticalId = str(fd, 'verticalId');
  if (!verticalId) return { ok: false, error: 'Choose a service type' };
  const r = await runTool<{ clientId: string }>(ctx, 'accept_lead', { leadId: str(fd, 'leadId'), verticalId });
  if (!r.ok) return r;
  revalidatePath('/agency/leads');
  redirect(`/c/${r.data.clientId}/setup`);
}

/** Decline: `notify` is the "Let them know" checkbox (never offered for platform leads, which return to the pool). */
export async function declineLeadAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx } = await requireContext();
  const r = await runTool(ctx, 'decline_lead', { leadId: str(fd, 'leadId'), notify: fd.get('notify') === 'on' });
  if (!r.ok) return r;
  revalidatePath('/agency/leads');
  return { ok: true };
}
