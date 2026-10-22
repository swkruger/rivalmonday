'use server';
import { revalidatePath } from 'next/cache';
import { requireOperatorContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { runTool } from '@/server/run-tool';

export async function decideThemeAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx } = await requireOperatorContext();
  const decision = String(fd.get('decision') ?? '');
  const r = await runTool(ctx, 'decide_topic_proposal', { proposalId: String(fd.get('proposalId') ?? ''), decision });
  if (!r.ok) return r;
  revalidatePath('/platform/themes');
  const name = String(fd.get('name') ?? 'the topic');
  return { ok: true, message: decision === 'approved' ? `Approved “${name}”.` : `Rejected “${name}”.` };
}
