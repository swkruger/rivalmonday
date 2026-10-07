'use server';
import { isAgencyRole } from '@cs/core';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { runTool } from '@/server/run-tool';

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '');
const DONE: Record<string, string> = { save: 'Playbook saved.', disable: 'Playbook turned off.', enable: 'Playbook turned on.', reset: 'Back to the standard playbook.' };

/** intent = save | disable | enable | reset. Save sends the edited text; disable/enable keep the current text; reset clears it. */
export async function playbookAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const intent = s(fd, 'intent');
  const reset = intent === 'reset';
  const disabled = intent === 'disable' ? true : intent === 'enable' || reset ? false : fd.get('disabled') === 'true';
  const r = await runTool(ctx, 'update_playbook', {
    verticalId: s(fd, 'verticalId'), playbookId: s(fd, 'playbookId'), title: reset ? null : s(fd, 'title') || null, template: reset ? null : s(fd, 'template') || null, disabled,
  });
  if (!r.ok) return r;
  revalidatePath('/agency/playbooks');
  return { ok: true, message: DONE[intent] ?? 'Saved.' };
}
