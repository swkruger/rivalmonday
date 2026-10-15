'use server';
import { revalidatePath } from 'next/cache';
import { requireOperatorContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { runTool } from '@/server/run-tool';
import { endOfDayIso } from '../../billing/parse';

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const done = (agencyId: string, message: string): FormResult => {
  revalidatePath(`/platform/agencies/${agencyId}`);
  return { ok: true, message };
};

export async function grantPilotAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx } = await requireOperatorContext();
  const agencyId = str(fd, 'agencyId');
  const end = str(fd, 'endsAt');
  const endsAt = end ? endOfDayIso(end) : undefined;
  if (endsAt === null) return { ok: false, error: 'Enter a valid end date' };
  const r = await runTool(ctx, 'grant_pilot', { agencyId, ...(endsAt ? { endsAt } : {}) });
  return r.ok ? done(agencyId, 'Pilot granted.') : r;
}

export async function endPilotAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx } = await requireOperatorContext();
  const agencyId = str(fd, 'agencyId');
  const r = await runTool(ctx, 'end_pilot', { agencyId });
  return r.ok ? done(agencyId, 'Pilot ended; the trial has started.') : r;
}

export async function extendTrialAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx } = await requireOperatorContext();
  const agencyId = str(fd, 'agencyId');
  const until = endOfDayIso(str(fd, 'until'));
  if (!until) return { ok: false, error: 'Choose the new trial end date' };
  const r = await runTool(ctx, 'extend_trial', { agencyId, until });
  return r.ok ? done(agencyId, 'Trial extended.') : r;
}

export async function attachDiscountAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx } = await requireOperatorContext();
  const agencyId = str(fd, 'agencyId');
  const discountCodeId = str(fd, 'discountCodeId');
  if (!discountCodeId) return { ok: false, error: 'Choose a discount code' };
  const r = await runTool<{ appliesAtCheckout: boolean }>(ctx, 'attach_agency_discount', { agencyId, discountCodeId });
  return r.ok ? done(agencyId, r.data.appliesAtCheckout ? 'Attached; it applies at checkout.' : 'Attached to the subscription.') : r;
}

export async function setSeatCapExemptAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx } = await requireOperatorContext();
  const agencyId = str(fd, 'agencyId');
  const exempt = str(fd, 'exempt') === 'true';
  const r = await runTool<{ meaningful: boolean }>(ctx, 'set_seat_cap_exempt', { agencyId, exempt });
  if (!r.ok) return r;
  if (!r.data.meaningful) return done(agencyId, 'Saved; it only has an effect while the agency is in pilot.');
  return done(agencyId, exempt ? 'Pilot client cap lifted.' : 'Pilot client cap restored.');
}
