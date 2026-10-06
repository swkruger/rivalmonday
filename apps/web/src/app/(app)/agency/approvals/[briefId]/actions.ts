'use server';
import { type AccessContext, isAgencyRole } from '@cs/core';
import type { BriefReview } from '@cs/tools';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { moveInOrder } from '@/server/order';
import { runTool } from '@/server/run-tool';

async function agencyCtx(): Promise<AccessContext> {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  return ctx;
}
const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
function refresh(briefId: string) {
  revalidatePath(`/agency/approvals/${briefId}`);
  revalidatePath('/agency/approvals');
}

export async function editItemAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await agencyCtx();
  const r = await runTool<{ warnings: string[] }>(ctx, 'edit_brief_item', {
    itemId: s(fd, 'itemId'), headline: s(fd, 'headline'), whatChanged: s(fd, 'whatChanged'), whyItMatters: s(fd, 'whyItMatters'), recommendedAction: s(fd, 'recommendedAction'),
  });
  if (!r.ok) return r;
  refresh(s(fd, 'briefId'));
  return { ok: true, message: r.data.warnings.length ? `Saved. Please double-check: ${r.data.warnings.join(' ')}` : 'Saved.' };
}

export async function dropItemAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await agencyCtx();
  const r = await runTool(ctx, 'drop_brief_item', { itemId: s(fd, 'itemId'), reason: s(fd, 'reason') || undefined });
  if (r.ok) refresh(s(fd, 'briefId'));
  return r.ok ? { ok: true } : r;
}

export async function moveItemAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await agencyCtx();
  const briefId = s(fd, 'briefId');
  const view = await runTool<BriefReview>(ctx, 'get_brief_review', { briefId });
  if (!view.ok) return view;
  const active = view.data.items.filter((i) => i.status === 'active').sort((a, b) => a.ord - b.ord).map((i) => i.id);
  const order = moveInOrder(active, s(fd, 'itemId'), s(fd, 'dir') === 'up' ? 'up' : 'down');
  if (!order) return { ok: true };
  const r = await runTool(ctx, 'reorder_brief_items', { briefId, itemIds: order });
  if (r.ok) refresh(briefId);
  return r.ok ? { ok: true } : r;
}

export async function rateItemAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await agencyCtx();
  const r = await runTool(ctx, 'rate_brief_item', { itemId: s(fd, 'itemId'), useful: s(fd, 'useful') === 'true' });
  return r.ok ? { ok: true, message: 'Thanks — rating saved.' } : r;
}

export async function approveAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await agencyCtx();
  const r = await runTool<{ recommendations: number }>(ctx, 'approve_brief', { briefId: s(fd, 'briefId') });
  if (!r.ok) return r;
  refresh(s(fd, 'briefId'));
  return { ok: true, message: `Approved — it goes out Monday 07:00. ${r.data.recommendations} recommendation(s) created.` };
}

export async function sendNowAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await agencyCtx();
  const r = await runTool<{ notifications: number; pdf: string }>(ctx, 'send_brief_now', { briefId: s(fd, 'briefId') });
  if (!r.ok) return r;
  refresh(s(fd, 'briefId'));
  return { ok: true, message: `Sent to ${r.data.notifications} recipient(s). The PDF ${r.data.pdf === 'queued' ? 'is being prepared' : 'will be prepared shortly'}.` };
}

export async function autoSendAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await agencyCtx();
  const r = await runTool(ctx, 'set_brief_auto_send', { clientId: s(fd, 'clientId'), enabled: s(fd, 'enabled') === 'true' });
  if (r.ok) refresh(s(fd, 'briefId'));
  return r.ok ? { ok: true, message: s(fd, 'enabled') === 'true' ? 'Untouched briefs will send automatically.' : 'Auto-send is off.' } : r;
}
