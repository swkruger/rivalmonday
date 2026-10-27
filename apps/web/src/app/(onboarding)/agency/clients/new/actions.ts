'use server';
import { isAgencyRole } from '@cs/core';
import type { SetupLookup } from '@cs/db';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { createClientFromForm } from '@/server/new-client';
import { runTool } from '@/server/run-tool';

/** Steps 1-2 end here: creates the client (details, listing, logo) and redirects to its setup. Returns only on a refusal. */
export async function createClientAction(formData: FormData): Promise<FormResult> {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  return createClientFromForm(ctx, formData, 'active');
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
