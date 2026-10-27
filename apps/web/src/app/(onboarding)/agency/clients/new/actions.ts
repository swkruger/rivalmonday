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
  redirect(`/c/${r.data.clientId}/setup`); // Phase 11a: every new client goes through the wizard
}

/** A lookup match plus the listing hints that travel beside it (never part of the persisted `SetupLookup`). */
export type FoundPlace = SetupLookup & { suggestedVerticalId: string | null; isClaimed: boolean | null; possibleDuplicate: boolean };
export type FindBusinessResult =
  | { ok: true; places: FoundPlace[] }
  | { ok: false; error: string };

export async function findBusinessAction(input: { name: string; location: string }): Promise<FindBusinessResult> {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const r = await runTool<{ places: FoundPlace[] }>(ctx, 'find_business', { name: String(input.name ?? ''), location: String(input.location ?? '') });
  return r.ok ? { ok: true, places: r.data.places } : r;
}

export async function createClientFromLookupAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  return createFromLookup(ctx, formData, 'active');
}
