'use server';
import { redirect } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { runTool } from '@/server/run-tool';

/** "Manage payment": the client owner's payment page on the agency's own account. The tool refuses everyone else (404-style "Not found"). */
export async function managePaymentAction(clientId: string): Promise<FormResult> {
  const { ctx } = await requireContext();
  const r = await runTool<{ url: string }>(ctx, 'open_billing_portal', { clientId });
  if (!r.ok) return r;
  redirect(r.data.url);
}
