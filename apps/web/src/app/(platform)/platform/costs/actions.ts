'use server';
import { revalidatePath } from 'next/cache';
import { requireOperatorContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { runTool } from '@/server/run-tool';

const PATH = '/platform/costs';
const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
/** An empty field clears (null) so the owner can remove a URL, threshold or rate. */
const nullable = (fd: FormData, k: string) => str(fd, k) || null;
const numOrNull = (fd: FormData, k: string): number | null | 'bad' => {
  const v = str(fd, k);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : 'bad';
};

export async function refreshCostsAction(_p: FormResult, _fd: FormData): Promise<FormResult> {
  const { ctx } = await requireOperatorContext();
  const r = await runTool<{ queued: boolean }>(ctx, 'refresh_platform_costs', {});
  if (!r.ok) return r;
  revalidatePath(PATH);
  return { ok: true, message: r.data.queued ? 'Refreshing — figures update in a minute.' : 'A refresh is already running.' };
}

export async function updateCostServiceAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx } = await requireOperatorContext();
  const low = numOrNull(fd, 'lowThresholdUsd');
  const rate = fd.has('unitRateUsd') ? numOrNull(fd, 'unitRateUsd') : undefined;
  const warn = Number(str(fd, 'warnDays'));
  if (low === 'bad' || rate === 'bad') return { ok: false, error: 'Enter numbers only' };
  if (!Number.isInteger(warn)) return { ok: false, error: 'Warn days must be a whole number' };
  const r = await runTool(ctx, 'update_platform_cost_service', {
    service: str(fd, 'service'),
    enabled: fd.get('enabled') === 'on',
    billingUrl: nullable(fd, 'billingUrl'),
    lowThresholdUsd: low,
    warnDays: warn,
    ...(rate !== undefined ? { unitRateUsd: rate } : {}),
  });
  if (!r.ok) return r;
  revalidatePath(PATH);
  return { ok: true, message: 'Saved.' };
}

export async function saveCostItemAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx } = await requireOperatorContext();
  const id = str(fd, 'id');
  const kind = str(fd, 'kind');
  const amount = Number(str(fd, 'amountUsd'));
  if (!str(fd, 'amountUsd') || !Number.isFinite(amount)) return { ok: false, error: 'Enter the amount in dollars' };
  const r = await runTool(ctx, 'save_platform_cost_item', {
    ...(id ? { id } : {}),
    name: str(fd, 'name'),
    kind,
    amountUsd: amount,
    ...(kind === 'recurring' ? { period: str(fd, 'period'), endsOn: nullable(fd, 'endsOn') } : {}),
    startsOn: str(fd, 'startsOn'),
    billingUrl: nullable(fd, 'billingUrl'),
    notes: nullable(fd, 'notes'),
  });
  if (!r.ok) return r;
  revalidatePath(PATH);
  return { ok: true, message: 'Saved.' };
}

export async function archiveCostItemAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx } = await requireOperatorContext();
  const r = await runTool(ctx, 'archive_platform_cost_item', { id: str(fd, 'id') });
  if (!r.ok) return r;
  revalidatePath(PATH);
  return { ok: true, message: 'Archived.' };
}

const GUARD_KEYS = [
  'creditsPerUsd', 'clientMonthlyLimitUsd', 'clientPausePercent', 'spikeWarnPercent', 'spikePausePercent', 'spikeFloorUsdPerDay', 'spikeFloorUsdPerClientDay', 'spikeSnoozeHours',
] as const;

/** Owner-only (the tool enforces it). The form sends just the changed fields; the tool refuses an empty patch or an invalid merge. */
export async function updateSpendGuardSettingsAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx } = await requireOperatorContext();
  const patch: Record<string, number> = {};
  for (const k of GUARD_KEYS) {
    if (!fd.has(k)) continue;
    const n = Number(str(fd, k));
    if (!str(fd, k) || !Number.isFinite(n)) return { ok: false, error: 'Enter numbers only' };
    patch[k] = n;
  }
  if (Object.keys(patch).length === 0) return { ok: false, error: 'Nothing to change' };
  const r = await runTool(ctx, 'update_spend_guard_settings', patch);
  if (!r.ok) return r;
  revalidatePath(PATH);
  return { ok: true, message: 'Saved.' };
}
