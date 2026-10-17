import 'server-only';
import { type AccessContext } from '@cs/core';
import { setupLookupSchema } from '@cs/db';
import { redirect } from 'next/navigation';
import type { FormResult } from './forms';
import { runTool } from './run-tool';

/** Shared by the client and prospect "create from a business lookup" actions (Phase 11a Task 10). */
export async function createFromLookup(ctx: AccessContext, formData: FormData, status: 'active' | 'prospect'): Promise<FormResult> {
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get('lookup') ?? ''));
  } catch {
    return { ok: false, error: 'Choose a business from the results first.' };
  }
  const lookup = setupLookupSchema.safeParse(raw);
  if (!lookup.success) return { ok: false, error: 'Choose a business from the results first.' };
  const verticalId = String(formData.get('verticalId') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const r = await runTool<{ clientId: string }>(ctx, 'create_client', { name, verticalId, services: [], keywords: [], serviceArea: null, placeId: null, lookup: lookup.data, ...(status === 'prospect' ? { status } : {}) });
  if (!r.ok) return r;
  redirect(`/c/${r.data.clientId}/setup`);
}
