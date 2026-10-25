'use server';
import { revalidatePath } from 'next/cache';
import { requireOperatorContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { runTool } from '@/server/run-tool';

/** Unarchive from the list's Archived view (owner only, enforced by the tool). The row then leaves the filtered list. */
export async function unarchiveFromListAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx } = await requireOperatorContext();
  const agencyId = String(fd.get('agencyId') ?? '').slice(0, 64);
  const r = await runTool(ctx, 'platform_unarchive_agency', { agencyId });
  if (!r.ok) return r;
  revalidatePath('/platform/agencies');
  revalidatePath(`/platform/agencies/${agencyId}`);
  return { ok: true, message: 'Agency unarchived.' };
}
