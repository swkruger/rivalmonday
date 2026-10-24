'use server';
import { revalidatePath } from 'next/cache';
import { requireOperatorContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { runTool } from '@/server/run-tool';

/** Staff+ (the tool enforces it): clears the platform AI warn/pause. The note is required (1-200) and lands in the guard's event log. */
export async function resetAiPauseAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx } = await requireOperatorContext();
  const note = String(fd.get('note') ?? '').trim();
  if (!note) return { ok: false, error: 'Add a short note about why you are resetting.' };
  if (note.length > 200) return { ok: false, error: 'Keep the note to 200 characters or fewer.' };
  const r = await runTool(ctx, 'reset_ai_pause', { note });
  if (!r.ok) return r;
  revalidatePath('/platform', 'layout');
  return { ok: true, message: 'Guard reset. Queued AI work resumes.' };
}
