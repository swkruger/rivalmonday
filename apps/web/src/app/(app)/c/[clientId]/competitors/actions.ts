'use server';
import { type AccessContext, isAgencyRole } from '@cs/core';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { runTool, type ToolResult } from '@/server/run-tool';

/** Re-derives the viewer's context on every call (never trusts the form for identity); `clientId` is just the
 * resource being acted on and is re-checked by the tool itself (`canAccessClient`). */
async function agencyCtx(): Promise<AccessContext> {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  return ctx;
}

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

const DISCOVERY: Record<string, string> = {
  queued: 'Website page discovery has started.',
  disabled: 'Website monitoring is off — only ads, reviews and Google profile data are collected.',
  not_needed: '',
};

async function done(clientId: string, r: { ok: true; data?: unknown } | { ok: false; error: string }, message: string): Promise<FormResult> {
  if (!r.ok) return r;
  revalidatePath(`/c/${clientId}/competitors`);
  return { ok: true, message };
}

export async function requestSuggestionsAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await agencyCtx();
  const clientId = s(fd, 'clientId');
  return done(clientId, await runTool(ctx, 'request_competitor_suggestions', { clientId }), 'Searching Google Maps — suggestions appear here in a few minutes.');
}

export type SearchState = 'idle' | 'queued' | 'running' | 'done' | 'failed';

/** Polled by `SuggestionsPanel` after "Find competitors" until the background search finishes. */
export async function searchStatusAction(clientId: string): Promise<ToolResult<{ state: SearchState; finishedAt: string | null }>> {
  const ctx = await agencyCtx();
  return runTool(ctx, 'get_competitor_search_status', { clientId });
}

export async function acceptSuggestionAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await agencyCtx();
  const r = await runTool<{ discovery: string }>(ctx, 'accept_competitor_suggestion', { suggestionId: s(fd, 'suggestionId') });
  return done(s(fd, 'clientId'), r, `Competitor added. ${r.ok ? DISCOVERY[r.data.discovery] : ''}`.trim());
}

export async function dismissSuggestionAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await agencyCtx();
  return done(s(fd, 'clientId'), await runTool(ctx, 'dismiss_competitor_suggestion', { suggestionId: s(fd, 'suggestionId') }), 'Suggestion hidden.');
}

export async function addCompetitorAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await agencyCtx();
  const clientId = s(fd, 'clientId');
  const r = await runTool<{ discovery: string }>(ctx, 'add_competitor', { clientId, name: s(fd, 'name'), domain: s(fd, 'domain') || undefined, placeId: s(fd, 'placeId') || undefined });
  return done(clientId, r, `Competitor added. ${r.ok ? DISCOVERY[r.data.discovery] : ''}`.trim());
}

export async function removeCompetitorAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await agencyCtx();
  const clientId = s(fd, 'clientId');
  return done(clientId, await runTool(ctx, 'remove_competitor', { clientId, competitorId: s(fd, 'competitorId') }), 'Competitor removed. Its history is kept.');
}

export async function setPinAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await agencyCtx();
  const clientId = s(fd, 'clientId');
  const r = await runTool(ctx, 'set_page_pin', { clientId, pageId: s(fd, 'pageId'), pinned: s(fd, 'pinned') === 'true' });
  if (r.ok) revalidatePath(`/c/${clientId}/competitors/${s(fd, 'competitorId')}`);
  return r.ok ? { ok: true } : r;
}

export async function addPageAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await agencyCtx();
  const clientId = s(fd, 'clientId');
  const competitorId = s(fd, 'competitorId');
  const r = await runTool(ctx, 'add_tracked_page', { clientId, competitorId, url: s(fd, 'url'), pageType: s(fd, 'pageType') });
  if (r.ok) revalidatePath(`/c/${clientId}/competitors/${competitorId}`);
  return r.ok ? { ok: true, message: 'Page added — it is captured on the next daily run.' } : r;
}
