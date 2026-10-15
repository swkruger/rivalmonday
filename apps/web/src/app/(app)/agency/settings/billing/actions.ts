'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { runTool } from '@/server/run-tool';

/** Subscribe / add a payment method: Stripe Checkout. Agency admins only (the tool refuses everyone else). */
export async function checkoutAction(): Promise<FormResult> {
  const { ctx } = await requireContext();
  const r = await runTool<{ url: string }>(ctx, 'create_checkout_session', {});
  if (!r.ok) return r;
  redirect(r.data.url);
}

/** Manage billing: the Stripe customer portal. */
export async function portalAction(): Promise<FormResult> {
  const { ctx } = await requireContext();
  const r = await runTool<{ url: string }>(ctx, 'create_portal_session', {});
  if (!r.ok) return r;
  redirect(r.data.url);
}

export async function redeemCodeAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx } = await requireContext();
  const r = await runTool<{ applied: boolean; appliesAtCheckout: boolean }>(ctx, 'redeem_discount_code', { code: String(fd.get('code') ?? '').trim() });
  if (!r.ok) return r;
  revalidatePath('/agency/settings/billing');
  return { ok: true, message: r.data.applied ? 'Code applied to your subscription.' : 'Code saved. It will apply at checkout.' };
}
