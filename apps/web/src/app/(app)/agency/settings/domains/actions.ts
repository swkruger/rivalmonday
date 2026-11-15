'use server';
import { revalidatePath } from 'next/cache';
import { requireContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { runTool } from '@/server/run-tool';

const PATH = '/agency/settings/domains';
const str = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? '').trim().slice(0, max);

/**
 * 13a1 Domains page writes. Each is its registered tool through `runTool` (agency admin only, refused in a support session and
 * for a held agency by the registry); refusals come back as the tool's decided copy, never vendor text.
 */
async function run(tool: string, input: Record<string, unknown>): Promise<FormResult> {
  const { ctx } = await requireContext();
  const r = await runTool(ctx, tool, input);
  if (!r.ok) return r;
  revalidatePath(PATH);
  return { ok: true };
}

export async function setCustomDomainAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  return run('set_custom_domain', { hostname: str(fd, 'hostname', 253) });
}

export async function removeCustomDomainAction(_prev: FormResult, _fd: FormData): Promise<FormResult> {
  return run('remove_custom_domain', {});
}

/** An empty address name lets the tool use its default (`briefs`). */
export async function setSendingDomainAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const localPart = str(fd, 'localPart', 64);
  return run('set_sending_domain', { domain: str(fd, 'domain', 253), ...(localPart ? { localPart } : {}) });
}

export async function removeSendingDomainAction(_prev: FormResult, _fd: FormData): Promise<FormResult> {
  return run('remove_sending_domain', {});
}
