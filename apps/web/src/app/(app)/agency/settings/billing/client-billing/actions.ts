'use server';
import { isUuid } from '@cs/core';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { runTool } from '@/server/run-tool';
import { parseDollars } from './money';

const BILLING_PATH = '/agency/settings/billing';
const fail = (error: string): FormResult => ({ ok: false, error });

/** Connect Stripe / Finish Stripe setup: the tool returns the Stripe-hosted onboarding URL and the browser follows it. */
export async function connectAction(): Promise<FormResult> {
  const { ctx } = await requireContext();
  const r = await runTool<{ url: string }>(ctx, 'start_stripe_connect', {});
  if (!r.ok) return r;
  redirect(r.data.url);
}

/** Only the dialog's confirm button posts `confirm=yes`; without it nothing is called. */
export async function disconnectAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  if (fd.get('confirm') !== 'yes') return fail('Confirm to disconnect Stripe.');
  const { ctx } = await requireContext();
  const r = await runTool(ctx, 'disconnect_stripe', { confirm: true });
  if (!r.ok) return r;
  revalidatePath(BILLING_PATH);
  return { ok: true, message: 'Stripe disconnected.' };
}

export async function saveDefaultsAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const priceCents = parseDollars(String(fd.get('price') ?? ''));
  if (priceCents === null) return fail('Enter the monthly price in dollars, e.g. 299.');
  const feeText = String(fd.get('setupFee') ?? '').trim();
  const setupFeeCents = feeText === '' ? 0 : parseDollars(feeText);
  if (setupFeeCents === null) return fail('Enter the setup fee in dollars, or leave it blank for none.');
  const daysText = String(fd.get('autoPauseAfterDays') ?? '').trim();
  const days = daysText === '' ? null : Number(daysText);
  if (days !== null && (!Number.isInteger(days) || days < 1 || days > 90)) return fail('Auto-pause must be between 1 and 90 days, or blank to never pause.');
  const { ctx } = await requireContext();
  const r = await runTool(ctx, 'set_client_billing_defaults', { priceCents, setupFeeCents, autoPauseAfterDays: days });
  if (!r.ok) return r;
  revalidatePath(BILLING_PATH);
  return { ok: true, message: 'Defaults saved.' };
}

/**
 * Per-client billing and pause actions for the portfolio and the client settings page, dispatched on `intent`.
 * Every refusal (billing_not_eligible, no_client_owner, billing_seat_limit, ...) comes back as the tool's own copy.
 */
export async function clientBillingAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const intent = String(fd.get('intent') ?? '');
  const clientId = String(fd.get('clientId') ?? '');
  if (!isUuid(clientId)) return fail('Not found');
  const { ctx } = await requireContext();
  const done = (message: string): FormResult => {
    revalidatePath('/agency');
    revalidatePath(`/c/${clientId}/settings/profile`);
    revalidatePath(BILLING_PATH);
    return { ok: true, message };
  };
  switch (intent) {
    case 'enable': {
      const r = await runTool(ctx, 'enable_client_billing', { clientId });
      return r.ok ? done('Billing is on. The client has been sent a payment link.') : r;
    }
    case 'resend': {
      const r = await runTool(ctx, 'resend_client_payment_link', { clientId });
      return r.ok ? done('Payment link sent.') : r;
    }
    case 'disable': {
      if (fd.get('confirm') !== 'yes') return fail('Confirm to turn off billing.');
      const r = await runTool(ctx, 'disable_client_billing', { clientId, confirm: true });
      return r.ok ? done('Billing is off.') : r;
    }
    case 'set_price': {
      const priceCents = parseDollars(String(fd.get('price') ?? ''));
      if (priceCents === null) return fail('Enter the monthly price in dollars, e.g. 299.');
      const applyTo = fd.get('applyTo') === 'new_only' ? 'new_only' : 'next_bill';
      const r = await runTool<{ linkResent?: boolean }>(ctx, 'set_client_price', { clientId, priceCents, applyTo });
      if (!r.ok) return r;
      return done(r.data?.linkResent ? 'Price saved. A new payment link has been sent.' : 'Price saved.');
    }
    case 'pause': {
      const r = await runTool(ctx, 'pause_client', { clientId });
      return r.ok ? done('Client paused.') : r;
    }
    case 'resume': {
      const r = await runTool(ctx, 'resume_client', { clientId });
      return r.ok ? done('Client resumed.') : r;
    }
    default:
      return fail('Not found');
  }
}
