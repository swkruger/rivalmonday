'use server';
import { isAgencyRole } from '@cs/core';
import { notFound, redirect } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { type FormResult, parseClientProfileForm } from '@/server/forms';
import { runTool } from '@/server/run-tool';

export async function createProspectAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const parsed = parseClientProfileForm(formData);
  if ('error' in parsed) return { ok: false, error: parsed.error };
  const r = await runTool<{ clientId: string }>(ctx, 'create_client', { ...parsed, status: 'prospect' });
  if (!r.ok) return r;
  redirect(`/agency/prospects/${r.data.clientId}`);
}
