import { type AccessContext, AiPausedError, type AiGuard, canAccessClient, hasChannel, isClientRole, SYSTEM_BUSY_COPY, ToolError } from '@cs/core';
import { askMessage, askThread, client, type Db, type Tx, withTenant } from '@cs/db';
import { monthStart } from '@cs/tools';
import { and, eq, sql } from 'drizzle-orm';

export const ASK_COPY = {
  quota: "You have reached this month's quota.",
  noEvidence: "I don't have evidence for that in the monitored data.",
  refused: 'I can only help with your competitors and market.',
  /** C4 (owner sign-off): a client spend pause. */
  paused: 'Ask is paused for the rest of this month. Your past answers are still here.',
  /** C5: a platform-wide pause. */
  busy: SYSTEM_BUSY_COPY,
  cancelled: 'Cancelled.',
  error: (name: string) => `${name} couldn't answer just now — please try again.`,
} as const;

/** 7b1: the guard's verdict for a turn's scope, as `beginTurn`'s `pause`: the pause reason, or null when allowed. Other errors propagate. */
export async function aiPauseOf(guard: AiGuard | undefined, scope: { agencyId: string; clientId: string }): Promise<'platform' | 'client' | null> {
  if (!guard) return null;
  try {
    await guard.assertAllowed(scope);
    return null;
  } catch (e) {
    if (e instanceof AiPausedError) return e.reason;
    throw e;
  }
}

export type BeginTurnInput = { clientId: string; threadId?: string; question: string; seedEvidenceId?: string };
export type BeginTurnResult =
  | { kind: 'ok'; threadId: string; userMessageId: string }
  | { kind: 'quota' | 'paused' | 'busy'; threadId: string; messageId: string };

type ThreadRow = { id: string; agencyId: string; clientId: string; userId: string };

const MAX_QUESTION = 2000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function findOwnThread(tx: Tx, ctx: AccessContext, threadId: string, clientId: string): Promise<ThreadRow | undefined> {
  if (!UUID.test(threadId)) return undefined;
  const [row] = await tx
    .select({ id: askThread.id, agencyId: askThread.agencyId, clientId: askThread.clientId, userId: askThread.userId })
    .from(askThread)
    .where(and(eq(askThread.id, threadId), eq(askThread.clientId, clientId), eq(askThread.userId, ctx.userId)));
  return row;
}

async function createThread(tx: Tx, ctx: AccessContext, clientId: string, question: string): Promise<ThreadRow> {
  const [row] = await tx
    .insert(askThread)
    .values({ agencyId: ctx.agencyId, clientId, userId: ctx.userId, title: question.slice(0, 80) })
    .returning({ id: askThread.id, agencyId: askThread.agencyId, clientId: askThread.clientId, userId: askThread.userId });
  return row!;
}

/** agency_id / client_id / user_id are always copied from the thread row, so a message can never diverge from its thread. */
async function insertMessage(
  tx: Tx,
  m: { thread: ThreadRow; role: 'user' | 'assistant'; content: string; status?: 'ok' | 'quota' | 'refused'; countsTowardQuota?: boolean },
): Promise<{ id: string }> {
  const [row] = await tx
    .insert(askMessage)
    .values({
      threadId: m.thread.id, agencyId: m.thread.agencyId, clientId: m.thread.clientId, userId: m.thread.userId,
      role: m.role, content: m.content, status: m.status ?? 'ok', countsTowardQuota: m.countsTowardQuota ?? false,
    })
    .returning({ id: askMessage.id });
  return row!;
}

/**
 * Starts an Ask turn: serialises per client with an advisory lock, enforces the client's monthly quota (client roles
 * only; agency users are never counted nor stopped) and stores the user's question. Returns no counts or limits.
 * 7b1: `opts.pause` (the spend guard's verdict, any role) stores the question uncounted plus a `refused` answer with C4
 * (`client`) or C5 (`platform`) before the quota check, so no model call follows.
 */
export async function beginTurn(
  app: Db, ctx: AccessContext, input: BeginTurnInput, now: Date = new Date(), opts: { pause?: 'platform' | 'client' | null } = {},
): Promise<BeginTurnResult> {
  // Guests (contacts) have no Ask (Q2); a client role needs the `ask` feature and the plan must include Ask (7a2).
  // All look like a missing page.
  if (ctx.userId.startsWith('contact:') || !hasChannel(ctx, 'ask')) throw new ToolError('not_found', 'Not found');
  if (!canAccessClient(ctx, input.clientId)) throw new ToolError('not_found', 'Client not found');
  const question = input.question.trim();
  if (question.length < 1 || question.length > MAX_QUESTION) throw new ToolError('invalid_input', `The question must be 1–${MAX_QUESTION} characters`);

  return withTenant(app, ctx, async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'ask-quota:' + input.clientId}))`);
    const counts = isClientRole(ctx.role);
    const thread = input.threadId ? await findOwnThread(tx, ctx, input.threadId, input.clientId) : await createThread(tx, ctx, input.clientId, question);
    if (!thread) throw new ToolError('not_found', 'Thread not found');
    if (opts.pause) {
      await insertMessage(tx, { thread, role: 'user', content: question, countsTowardQuota: false });
      const m = await insertMessage(tx, { thread, role: 'assistant', content: opts.pause === 'platform' ? ASK_COPY.busy : ASK_COPY.paused, status: 'refused' });
      return { kind: opts.pause === 'platform' ? ('busy' as const) : ('paused' as const), threadId: thread.id, messageId: m.id };
    }
    if (counts) {
      const [c] = await tx.select({ quota: client.askMonthlyQuota }).from(client).where(eq(client.id, input.clientId));
      if (!c) throw new ToolError('not_found', 'Client not found');
      // ask_message RLS is author-only; the per-client count comes from a count-only SECURITY DEFINER function (0044).
      const res = await tx.execute<{ used: number }>(sql`SELECT ask_quota_used(${input.clientId}::uuid, ${monthStart(now).toISOString()}::timestamptz) AS used`);
      const used = Number(res[0]?.used ?? 0);
      if (used >= c.quota) {
        await insertMessage(tx, { thread, role: 'user', content: question, countsTowardQuota: false });
        const m = await insertMessage(tx, { thread, role: 'assistant', content: ASK_COPY.quota, status: 'quota' });
        return { kind: 'quota' as const, threadId: thread.id, messageId: m.id };
      }
    }
    const u = await insertMessage(tx, { thread, role: 'user', content: question, countsTowardQuota: counts });
    await tx.update(askThread).set({ updatedAt: new Date() }).where(eq(askThread.id, thread.id));
    return { kind: 'ok' as const, threadId: thread.id, userMessageId: u.id };
  });
}
