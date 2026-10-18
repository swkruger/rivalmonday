'use server';
import { isAgencyRole } from '@cs/core';
import type { VerticalDraft } from '@cs/verticals';
import { notFound } from 'next/navigation';
import type { CreateVerticalInput } from '@/components/new-business-type-model';
import { requireContext } from '@/server/current-viewer';
import { runTool } from '@/server/run-tool';

export type DraftVerticalResult =
  | { ok: true; draft: VerticalDraft | null; similar: { id: string; name: string }[] }
  | { ok: false; error: string };
export type CreateVerticalResult =
  | { ok: true; verticalId: string; name: string; droppedCategories: string[] }
  | { ok: false; error: string };

/** "Draft it": the Google profile is read server-side; nothing is saved until `createVerticalAction`. */
export async function draftVerticalAction(input: { placeId: string; category: string | null }): Promise<DraftVerticalResult> {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const category = input.category?.trim();
  const r = await runTool<{ draft: VerticalDraft | null; similar: { id: string; name: string }[] }>(ctx, 'draft_vertical', {
    placeId: String(input.placeId ?? ''),
    nearbyCategories: category ? [category] : [],
  });
  return r.ok ? { ok: true, draft: r.data.draft, similar: r.data.similar } : r;
}

export async function createVerticalAction(input: CreateVerticalInput): Promise<CreateVerticalResult> {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const r = await runTool<{ verticalId: string; droppedCategories: string[] }>(ctx, 'create_vertical', input);
  return r.ok ? { ok: true, verticalId: r.data.verticalId, name: String(input.name ?? '').trim(), droppedCategories: r.data.droppedCategories } : r;
}
