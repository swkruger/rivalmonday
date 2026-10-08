'use server';
import { isAgencyRole } from '@cs/core';
import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { runTool } from '@/server/run-tool';

async function agencyCtx() {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  return ctx;
}

export async function runSnapshotAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await agencyCtx();
  const clientId = String(fd.get('clientId') ?? '');
  const r = await runTool(ctx, 'run_prospect_snapshot', { clientId });
  if (!r.ok) return r;
  revalidatePath(`/agency/prospects/${clientId}`);
  return { ok: true, message: 'Snapshot started.' };
}

export async function convertAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await agencyCtx();
  const clientId = String(fd.get('clientId') ?? '');
  const r = await runTool(ctx, 'convert_prospect', { clientId });
  if (!r.ok) return r;
  redirect(`/c/${clientId}`);
}
