'use server';
import { isAgencyRole } from '@cs/core';
import type { SetupLookup } from '@cs/db';
import { notFound, redirect } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { type FormResult, parseClientProfileForm } from '@/server/forms';
import { createFromLookup } from '@/server/lookup-create';
import { runTool } from '@/server/run-tool';

export async function createClientAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const parsed = parseClientProfileForm(formData);
  if ('error' in parsed) return { ok: false, error: parsed.error };
  const r = await runTool<{ clientId: string }>(ctx, 'create_client', parsed);
  if (!r.ok) return r;
  redirect(`/c/${r.data.clientId}/competitors`);
}

export type FindBusinessResult =
  | { ok: true; places: (SetupLookup & { suggestedVerticalId: string | null })[] }
  | { ok: false; error: string };

export async function findBusinessAction(input: { name: string; location: string }): Promise<FindBusinessResult> {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const r = await runTool<{ places: (SetupLookup & { suggestedVerticalId: string | null })[] }>(ctx, 'find_business', { name: String(input.name ?? ''), location: String(input.location ?? '') });
  return r.ok ? { ok: true, places: r.data.places } : r;
}

export async function createClientFromLookupAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  return createFromLookup(ctx, formData, 'active');
}
