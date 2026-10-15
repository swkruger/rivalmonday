'use server';
import { type AccessContext, isAgencyRole } from '@cs/core';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { runTool, type ToolResult } from '@/server/run-tool';
import { RUN_STATE, type SearchState } from './search-state';

/** Re-derives the viewer's context on every call (never trusts the form for identity); `clientId` is just the
 * resource being acted on and is re-checked by the tool itself (`canAccessClient`). */
async function memberCtx(): Promise<AccessContext> {
  const { ctx } = await requireContext();
  return ctx;
}

/** Paid search, page pins and manual page adds stay agency-only (5c-1 decision 15). */
async function agencyCtx(): Promise<AccessContext> {
  const ctx = await memberCtx();
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

export type { SearchState };

export type SearchStatus = { state: SearchState; stage: string; searchesDone: number; searchesTotal: number; checksTotal: number; finishedAt: string | null };

/** Polled by `SuggestionsPanel` after "Find competitors" until the background search finishes. */
export async function searchStatusAction(clientId: string): Promise<ToolResult<SearchStatus>> {
  const ctx = await agencyCtx();
  const r = await runTool<{ status: string; progress?: { searchesDone: number; searchesTotal: number; checksTotal: number }; finishedAt?: string | null }>(ctx, 'get_competitor_search_status', { clientId });
  if (!r.ok) return r;
  const p = r.data.progress;
  return { ok: true, data: { state: RUN_STATE[r.data.status] ?? 'idle', stage: r.data.status, searchesDone: p?.searchesDone ?? 0, searchesTotal: p?.searchesTotal ?? 0, checksTotal: p?.checksTotal ?? 0, finishedAt: r.data.finishedAt ?? null } };
}

/** "Track selected (n)": all or none, within the client's competitor limit (the tool enforces it). */
export async function acceptSuggestionsAction(clientId: string, ids: string[]): Promise<FormResult> {
  const ctx = await memberCtx();
  const r = await runTool<{ items: { discovery: string }[] }>(ctx, 'accept_competitor_suggestions', { clientId, ids });
  if (!r.ok) return r;
  const n = r.data.items.length;
  const note = r.data.items.some((i) => i.discovery === 'disabled') ? DISCOVERY.disabled : r.data.items.some((i) => i.discovery === 'queued') ? DISCOVERY.queued : '';
  return done(clientId, r, `${n} competitor${n === 1 ? '' : 's'} added. ${note}`.trim());
}

export async function dismissSuggestionAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await memberCtx();
  return done(s(fd, 'clientId'), await runTool(ctx, 'dismiss_competitor_suggestion', { suggestionId: s(fd, 'suggestionId') }), 'Suggestion hidden.');
}

export async function addCompetitorAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await memberCtx();
  const clientId = s(fd, 'clientId');
  const r = await runTool<{ discovery: string }>(ctx, 'add_competitor', { clientId, name: s(fd, 'name'), domain: s(fd, 'domain') || undefined, placeId: s(fd, 'placeId') || undefined });
  return done(clientId, r, `Competitor added. ${r.ok ? DISCOVERY[r.data.discovery] : ''}`.trim());
}

export async function removeCompetitorAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await memberCtx();
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
