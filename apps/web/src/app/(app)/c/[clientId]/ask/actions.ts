'use server';
import { ASK_COPY, type AskAction, actionAllowed } from '@cs/ask';
import { canAccessClient, isUuid, scopeToClient } from '@cs/core';
import { askMessage, askThread, withTenant } from '@cs/db';
import { eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import type { FormResult } from '@/server/forms';
import { type EvidenceRefs, evidenceRefsFor } from '@/server/evidence-refs';
import { runTool, type ToolResult } from '@/server/run-tool';
import { viewerTimeZone } from '@/server/viewer-tz';

const NOT_FOUND = { ok: false as const, error: 'Not found' };
const SAVED = 'Saved.';
const FAILED = 'Something went wrong. Please try again.';
const NOT_ALLOWED = 'Not allowed';

type Claimed = { action: AskAction; threadId: string; clientId: string };

/**
 * e8: Confirm or Cancel a proposed write. The state moves off `proposed` in one guarded UPDATE through RLS (author-only),
 * so a foreign message, a repeat click or a race all get 0 rows → "Not found", and the tool runs at most once.
 * On confirm the tool runs on the `ask` channel; a refusal marks the action `failed` with the error.
 * 7a2 D12: the tool runs pinned to the thread's client, and only an Ask write tool whose input names no other client
 * (and a thread client the viewer can still reach); anything else is marked `failed` ("Not allowed") without running.
 */
export async function confirmAskAction(messageId: string, decision: 'confirm' | 'cancel'): Promise<ToolResult<{ state: AskAction['state'] }>> {
  const { viewer, ctx } = await requireContext();
  if (viewer.kind !== 'user' || !isUuid(messageId) || (decision !== 'confirm' && decision !== 'cancel')) return NOT_FOUND;
  const { app } = dbs();
  const target = decision === 'confirm' ? 'confirmed' : 'cancelled';

  const claimed = await withTenant(app, ctx, async (tx): Promise<Claimed | null> => {
    const rows = await tx.execute<{ action: AskAction; thread_id: string; client_id: string }>(sql`
      UPDATE ask_message SET action = jsonb_set(action, '{state}', to_jsonb(${target}::text))
      WHERE id = ${messageId} AND action->>'state' = 'proposed'
        AND EXISTS (SELECT 1 FROM ask_thread t WHERE t.id = ask_message.thread_id AND t.deleted_at IS NULL)
      RETURNING action, thread_id, client_id`);
    const row = rows[0];
    return row ? { action: row.action, threadId: row.thread_id, clientId: row.client_id } : null;
  });
  if (!claimed) return NOT_FOUND;

  let result: ToolResult<{ state: AskAction['state'] }>;
  if (decision === 'cancel') {
    await addActionMessage(ctx, claimed.threadId, ASK_COPY.cancelled);
    result = { ok: true, data: { state: 'cancelled' } };
  } else {
    let error: string | null = null;
    if (!canAccessClient(ctx, claimed.clientId) || !actionAllowed(claimed.action, claimed.clientId)) {
      error = NOT_ALLOWED;
    } else {
      try {
        const r = await runTool(scopeToClient(ctx, claimed.clientId), claimed.action.tool, claimed.action.input, { channel: 'ask' });
        if (!r.ok) error = r.error;
      } catch (e) {
        console.error('[ask] confirmed action failed', e instanceof Error ? e.message : e);
        error = FAILED;
      }
    }
    if (error === null) {
      await addActionMessage(ctx, claimed.threadId, SAVED);
      result = { ok: true, data: { state: 'confirmed' } };
    } else {
      const failed = error;
      await withTenant(app, ctx, (tx) =>
        tx.execute(sql`
          UPDATE ask_message SET action = action || jsonb_build_object('state', 'failed', 'error', ${failed}::text)
          WHERE id = ${messageId} AND action->>'state' = 'confirmed'`),
      );
      result = { ok: false, error: failed };
    }
  }
  revalidatePath(`/c/${claimed.clientId}/ask/${claimed.threadId}`);
  if (decision === 'confirm') revalidatePath(`/c/${claimed.clientId}/recommendations`);
  return result;
}

/** The short closing `action` message; agency/client/user are copied from the thread row (RLS: the author's own thread). */
async function addActionMessage(ctx: Awaited<ReturnType<typeof requireContext>>['ctx'], threadId: string, content: string): Promise<void> {
  await withTenant(dbs().app, ctx, async (tx) => {
    const [t] = await tx
      .select({ id: askThread.id, agencyId: askThread.agencyId, clientId: askThread.clientId, userId: askThread.userId })
      .from(askThread)
      .where(eq(askThread.id, threadId));
    if (!t) return;
    await tx.insert(askMessage).values({ threadId: t.id, agencyId: t.agencyId, clientId: t.clientId, userId: t.userId, role: 'action', content });
    await tx.update(askThread).set({ updatedAt: new Date() }).where(eq(askThread.id, t.id));
  });
}

/** `add_recommendation`'s own limits, so the save dialog, this action and the tool agree. */
const SaveInput = z.object({
  clientId: z.string().uuid(),
  title: z.string().trim().min(3).max(120),
  rationale: z.string().trim().min(10).max(1000),
  effort: z.enum(['L', 'M', 'H']),
  impact: z.enum(['L', 'M', 'H']).optional(),
  evidenceIds: z.array(z.string().uuid()).min(1).max(10),
});

/** The save dialog (Ask answer / evidence viewer): `add_recommendation` on the `ask` channel (`source = 'ask'`). */
export async function saveAskRecommendation(input: {
  clientId: string;
  title: string;
  rationale: string;
  effort: 'L' | 'M' | 'H';
  impact?: 'L' | 'M' | 'H';
  evidenceIds: string[];
}): Promise<ToolResult<{ id: string }>> {
  const { viewer, ctx } = await requireContext();
  if (viewer.kind !== 'user') return NOT_FOUND;
  const parsed = SaveInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the recommendation and try again.' };
  const { impact, ...rest } = parsed.data;
  const r = await runTool<{ id: string }>(ctx, 'add_recommendation', { ...rest, impact: impact ?? 'M' }, { channel: 'ask' });
  if (!r.ok) return r;
  revalidatePath(`/c/${rest.clientId}/recommendations`);
  return { ok: true, data: { id: r.data.id } };
}

const field = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

/**
 * Thread delete for the author (spec "Web"): `delete_ask_thread` through `runTool` (author-only in the tool and RLS).
 * Deleting the open thread goes back to a new question; otherwise the list just refreshes.
 */
export async function deleteAskThreadAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const { viewer, ctx } = await requireContext();
  if (viewer.kind !== 'user') return NOT_FOUND;
  const clientId = field(fd, 'clientId');
  if (!isUuid(clientId)) return NOT_FOUND;
  const r = await runTool(ctx, 'delete_ask_thread', { clientId, threadId: field(fd, 'threadId') });
  if (!r.ok) return r;
  revalidatePath(`/c/${clientId}/ask`, 'layout');
  if (field(fd, 'active') === '1') redirect(`/c/${clientId}/ask`);
  return { ok: true };
}

const MAX_REF_IDS = 60;

/**
 * Display refs for evidence ids cited in a just-streamed answer (the Ask page resolves stored messages on the server).
 * Users only; a malformed client or id, or any failure, resolves to no refs so the chat keeps its fallback pills.
 */
export async function askEvidenceRefs(clientId: string, ids: string[]): Promise<EvidenceRefs> {
  const { viewer, ctx } = await requireContext();
  if (viewer.kind !== 'user' || !isUuid(clientId) || !Array.isArray(ids) || ids.length > MAX_REF_IDS || !ids.every((i) => typeof i === 'string' && isUuid(i))) return {};
  try {
    return await evidenceRefsFor(ctx, clientId, ids, await viewerTimeZone());
  } catch {
    return {};
  }
}
