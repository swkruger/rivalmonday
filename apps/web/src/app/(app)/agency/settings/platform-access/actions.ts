'use server';
import { revalidatePath } from 'next/cache';
import { requireContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { runTool } from '@/server/run-tool';

/** "Email me when Rival Monday support opens a session" (agency admins; the tool refuses everyone else). */
export async function setSupportNotifyAction(enabled: boolean): Promise<FormResult> {
  const { ctx } = await requireContext();
  const r = await runTool<{ enabled: boolean }>(ctx, 'set_support_access_notify', { enabled: enabled === true });
  if (!r.ok) return r;
  revalidatePath('/agency/settings/platform-access');
  return { ok: true };
}
