import { createHash } from 'node:crypto';
import { type AccessContext, ToolError } from '@cs/core';
import { agency, askMessage, askThread, client, createAuditSink } from '@cs/db';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { ToolDeps } from './deps';
import { MCP_MAX_LIMIT, pageResult } from './paging';

export { normalizeAdminEmails } from '@cs/core';

/** Decision 2: a signed-in user (never an email-link guest) whose account email is listed in PLATFORM_ADMIN_EMAILS. */
export async function isPlatformOperator(deps: Pick<ToolDeps, 'service' | 'platformAdmins'>, ctx: AccessContext): Promise<boolean> {
  const admins = deps.platformAdmins ?? [];
  if (admins.length === 0 || ctx.userId.startsWith('contact:')) return false;
  const rows = [...(await deps.service.execute<{ email: string }>(sql`select email from auth."user" where id = ${ctx.userId}`))];
  const email = rows[0]?.email?.toLowerCase();
  return email !== undefined && admins.includes(email);
}

/** Every platform-operator tool calls this first: anyone else gets `permission_denied` (→ 404). */
export async function requirePlatformOperator(deps: Pick<ToolDeps, 'service' | 'platformAdmins'>, ctx: AccessContext): Promise<void> {
  if (!(await isPlatformOperator(deps, ctx))) throw new ToolError('permission_denied', 'Platform operators only');
}

// ---- Ask review (6b e6): plain service-role functions (they cross agencies), operator-guarded, clients with ask_review_allowed only ----

export interface ReviewableAskThreadItem {
  id: string;
  agencyName: string;
  clientName: string;
  createdAt: Date;
  flags: { removed: number; error: boolean; refused: boolean; quota: boolean };
}

type ReviewDeps = Pick<ToolDeps, 'service' | 'platformAdmins'>;

export async function listReviewableAskThreads(
  deps: ReviewDeps,
  ctx: AccessContext,
  input: { cursor?: string; limit?: number },
): Promise<{ items: ReviewableAskThreadItem[]; nextCursor: string | null }> {
  await requirePlatformOperator(deps, ctx);
  const limit = Math.min(Math.max(input.limit ?? 25, 1), MCP_MAX_LIMIT);
  let offset = 0;
  if (input.cursor) {
    try {
      const v = JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8')) as { o?: unknown };
      if (typeof v.o !== 'number' || !Number.isInteger(v.o) || v.o < 0 || v.o > 1_000_000) throw new Error('bad');
      offset = v.o;
    } catch {
      throw new ToolError('invalid_input', 'Invalid cursor');
    }
  }
  const rows = await deps.service
    .select({
      id: askThread.id,
      agencyName: agency.name,
      clientName: client.name,
      createdAt: askThread.createdAt,
      removed: sql<number>`coalesce((select sum(coalesce((m.trace->>'removedSentences')::int, 0)) from ask_message m where m.thread_id = ${askThread.id}), 0)::int`,
      error: sql<boolean>`exists (select 1 from ask_message m where m.thread_id = ${askThread.id} and m.status = 'error')`,
      refused: sql<boolean>`exists (select 1 from ask_message m where m.thread_id = ${askThread.id} and m.status = 'refused')`,
      quota: sql<boolean>`exists (select 1 from ask_message m where m.thread_id = ${askThread.id} and m.status = 'quota')`,
    })
    .from(askThread)
    .innerJoin(client, and(eq(client.id, askThread.clientId), eq(client.agencyId, askThread.agencyId)))
    .innerJoin(agency, eq(agency.id, askThread.agencyId))
    .where(eq(client.askReviewAllowed, true))
    .orderBy(desc(askThread.createdAt), asc(askThread.id))
    .limit(limit + 1)
    .offset(offset);
  const page = pageResult(rows, limit, offset);
  return {
    items: page.rows.map((r) => ({ id: r.id, agencyName: r.agencyName, clientName: r.clientName, createdAt: r.createdAt, flags: { removed: r.removed, error: r.error, refused: r.refused, quota: r.quota } })),
    nextCursor: page.nextCursor,
  };
}

export interface ReviewableAskMessage {
  id: string;
  role: 'user' | 'assistant' | 'action';
  content: string;
  citations: string[];
  status: 'ok' | 'quota' | 'refused' | 'error' | 'cancelled';
  action: unknown;
  trace: unknown;
  createdAt: Date;
}

export interface ReviewableAskThread {
  id: string;
  title: string;
  agencyName: string;
  clientName: string;
  createdAt: Date;
  messages: ReviewableAskMessage[];
}

/** Not an allowed client's thread (or no such id) → `not_found`. Every successful view writes one `audit_log` row. */
export async function getReviewableAskThread(deps: ReviewDeps, ctx: AccessContext, threadId: string): Promise<ReviewableAskThread> {
  await requirePlatformOperator(deps, ctx);
  const valid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(threadId);
  const [t] = valid
    ? await deps.service
        .select({ id: askThread.id, title: askThread.title, createdAt: askThread.createdAt, agencyName: agency.name, clientName: client.name })
        .from(askThread)
        .innerJoin(client, and(eq(client.id, askThread.clientId), eq(client.agencyId, askThread.agencyId)))
        .innerJoin(agency, eq(agency.id, askThread.agencyId))
        .where(and(eq(askThread.id, threadId), eq(client.askReviewAllowed, true)))
    : [];
  if (!t) throw new ToolError('not_found', 'Thread not found');
  const messages = await deps.service
    .select({
      id: askMessage.id, role: askMessage.role, content: askMessage.content, citations: askMessage.citations,
      status: askMessage.status, action: askMessage.action, trace: askMessage.trace, createdAt: askMessage.createdAt,
    })
    .from(askMessage)
    .where(eq(askMessage.threadId, threadId))
    .orderBy(asc(askMessage.createdAt), asc(askMessage.id));
  await createAuditSink(deps.service).record({
    agencyId: ctx.agencyId, userId: ctx.userId, role: ctx.role, tool: 'platform_view_ask_thread',
    inputHash: createHash('sha256').update(JSON.stringify({ threadId })).digest('hex'),
    channel: 'web', tokenId: null, outcome: 'ok', rowCount: messages.length, durationMs: 0,
  });
  return { ...t, messages };
}
