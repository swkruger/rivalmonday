'use server';
import { revalidatePath } from 'next/cache';
import { requireOperatorContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { runTool } from '@/server/run-tool';
import { endOfDayIso, toCents } from './parse';

const PATH = '/platform/billing';
const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const int = (v: string): number | null => (/^\d+$/.test(v) ? Number(v) : null);

export async function createPlanVersionAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx } = await requireOperatorContext();
  const base = toCents(str(fd, 'basePrice'));
  const seat = toCents(str(fd, 'seatPrice'));
  const seats = int(str(fd, 'includedSeats'));
  const trial = int(str(fd, 'trialDays'));
  if (base === null || seat === null) return { ok: false, error: 'Enter prices in dollars, e.g. 299 or 49.00' };
  if (seats === null || trial === null) return { ok: false, error: 'Included seats and trial days must be whole numbers' };
  const r = await runTool<{ version: number }>(ctx, 'create_plan_version', { name: str(fd, 'name'), basePriceCents: base, includedSeats: seats, seatPriceCents: seat, trialDays: trial });
  if (!r.ok) return r;
  revalidatePath(PATH);
  return { ok: true, message: `Published version ${r.data.version}. Existing subscriptions keep their prices.` };
}

export async function createDiscountCodeAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx } = await requireOperatorContext();
  const kind = str(fd, 'kind');
  const amount = str(fd, 'amount');
  const duration = str(fd, 'duration');
  const months = str(fd, 'durationMonths');
  const max = str(fd, 'maxRedemptions');
  const expires = str(fd, 'expires');
  const agencies = str(fd, 'restrictedAgencyIds').split(/[\s,;]+/).filter(Boolean);
  let off: { percentOff: number } | { amountOffCents: number };
  if (kind === 'percent') {
    const n = Number(amount);
    if (!amount || !Number.isFinite(n)) return { ok: false, error: 'Enter the percentage off' };
    off = { percentOff: n };
  } else {
    const c = toCents(amount);
    if (c === null) return { ok: false, error: 'Enter the amount off in dollars' };
    off = { amountOffCents: c };
  }
  const exp = expires ? endOfDayIso(expires) : undefined;
  if (exp === null) return { ok: false, error: 'Enter a valid expiry date' };
  const r = await runTool(ctx, 'create_discount_code', {
    code: str(fd, 'code'), ...off, appliesTo: str(fd, 'appliesTo'), duration,
    ...(duration === 'repeating' && months ? { durationMonths: Number(months) } : {}),
    ...(agencies.length ? { restrictedAgencyIds: agencies } : {}),
    ...(exp ? { expiresAt: exp } : {}),
    ...(max ? { maxRedemptions: Number(max) } : {}),
  });
  if (!r.ok) return r;
  revalidatePath(PATH);
  return { ok: true, message: 'Code created.' };
}

export async function revokeDiscountCodeAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx } = await requireOperatorContext();
  const r = await runTool(ctx, 'revoke_discount_code', { id: str(fd, 'id') });
  if (!r.ok) return r;
  revalidatePath(PATH);
  return { ok: true, message: 'Revoked.' };
}

export type InviteLinkResult = FormResult | { ok: true; url: string };

/** The returned URL travels back to the one form that asked for it; it is not stored or revalidated into the list. */
export async function createInviteLinkAction(_p: InviteLinkResult, fd: FormData): Promise<InviteLinkResult> {
  const { ctx } = await requireOperatorContext();
  const offer = str(fd, 'offer');
  const pilotEndsAt = offer === 'pilot' ? endOfDayIso(str(fd, 'pilotEndsAt')) : undefined;
  if (offer === 'pilot' && !pilotEndsAt) return { ok: false, error: 'Choose when the pilot ends' };
  const maxUses = int(str(fd, 'maxUses') || '1');
  const days = int(str(fd, 'expiresInDays') || '14');
  if (maxUses === null || days === null) return { ok: false, error: 'Max uses and expiry days must be whole numbers' };
  const email = str(fd, 'emailLock');
  const code = str(fd, 'discountCodeId');
  const note = str(fd, 'note');
  const r = await runTool<{ url: string }>(ctx, 'create_invite_link', {
    offer, ...(pilotEndsAt ? { pilotEndsAt } : {}), ...(code ? { discountCodeId: code } : {}), ...(email ? { emailLock: email } : {}),
    maxUses, expiresInDays: days, ...(note ? { note } : {}),
  });
  if (!r.ok) return r;
  revalidatePath(PATH);
  return { ok: true, url: r.data.url };
}

export async function revokeInviteLinkAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx } = await requireOperatorContext();
  const r = await runTool(ctx, 'revoke_invite_link', { id: str(fd, 'id') });
  if (!r.ok) return r;
  revalidatePath(PATH);
  return { ok: true, message: 'Revoked.' };
}
