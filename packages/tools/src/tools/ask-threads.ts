import { type AccessContext, hasChannel, toolkit, ToolError } from '@cs/core';
import { askMessage, askStarter, askThread, client, withTenant } from '@cs/db';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { GENERIC_STARTERS } from '../ask-tools';
import type { ToolDeps } from '../deps';
import { workspaceClient } from '../workspace/scope';

/**
 * Phase 6b Q13: the web's reads (and the soft delete) of a user's own Ask threads and a client's starter questions.
 * Web channel only (explicit literal), feature `ask`, guests refused. RLS is author-only (migration ask_rls); every
 * query still filters by `ctx.userId`, so an agency admin never reads a client user's thread (e5).
 */
const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();
const WEB_ONLY = ['web'] as const;
const THREAD_LIMIT = 100;

/** Q2: magic-link guests have no Ask. */
function refuseGuest(ctx: AccessContext): void {
  if (ctx.userId.startsWith('contact:')) throw new ToolError('not_found', 'Not found');
}

const iso = (d: Date) => d.toISOString();

/** The confirm-card view of a stored `AskAction`; the proposed input stays server-side. */
const actionView = z
  .object({
    tool: z.string(),
    summary: z.string(),
    state: z.enum(['proposed', 'confirmed', 'cancelled', 'failed']),
    error: z.string().optional(),
  })
  .nullable();
export type AskActionView = z.infer<typeof actionView>;

function toActionView(raw: unknown): AskActionView {
  const parsed = z
    .object({ tool: z.string(), summary: z.string(), state: z.enum(['proposed', 'confirmed', 'cancelled', 'failed']), error: z.string().optional() })
    .safeParse(raw);
  if (!parsed.success) return null;
  const { tool, summary, state, error } = parsed.data;
  return error === undefined ? { tool, summary, state } : { tool, summary, state, error };
}

const threadSummary = z.object({ id: uuid, title: z.string(), updatedAt: z.string() });
export type AskThreadSummary = z.infer<typeof threadSummary>;

const messageView = z.object({
  id: uuid,
  role: z.enum(['user', 'assistant', 'action']),
  content: z.string(),
  citations: z.array(z.string()),
  status: z.enum(['ok', 'quota', 'refused', 'error', 'cancelled']),
  action: actionView,
  createdAt: z.string(),
});
export type AskMessageView = z.infer<typeof messageView>;

const threadView = z.object({ id: uuid, clientId: uuid, title: z.string(), messages: z.array(messageView) });
export type AskThreadView = z.infer<typeof threadView>;

export const listMyAskThreads = defineTool({
  name: 'list_my_ask_threads',
  access: 'read',
  supportHidden: true,
  description: "The signed-in user's own Ask threads for a client, most recently active first.",
  input: z.object({ clientId: uuid }),
  output: z.object({ items: z.array(threadSummary) }),
  permission: 'read',
  feature: 'ask',
  channels: WEB_ONLY,
  async handler(ctx, input, deps) {
    refuseGuest(ctx);
    const c = await workspaceClient(deps, ctx, input.clientId);
    const rows = await withTenant(deps.app, ctx, (tx) =>
      tx
        .select({ id: askThread.id, title: askThread.title, updatedAt: askThread.updatedAt })
        .from(askThread)
        .where(and(eq(askThread.clientId, c.id), eq(askThread.userId, ctx.userId), isNull(askThread.deletedAt)))
        .orderBy(desc(askThread.updatedAt), desc(askThread.id))
        .limit(THREAD_LIMIT),
    );
    return { items: rows.map((r) => ({ id: r.id, title: r.title, updatedAt: iso(r.updatedAt) })) };
  },
});

export const getMyAskThread = defineTool({
  name: 'get_my_ask_thread',
  access: 'read',
  supportHidden: true,
  description: "One of the signed-in user's own Ask threads with its messages (never the trace).",
  input: z.object({ threadId: uuid }),
  output: threadView,
  permission: 'read',
  feature: 'ask',
  channels: WEB_ONLY,
  async handler(ctx, input, deps) {
    refuseGuest(ctx);
    return withTenant(deps.app, ctx, async (tx) => {
      const [t] = await tx
        .select({ id: askThread.id, clientId: askThread.clientId, title: askThread.title })
        .from(askThread)
        .where(and(eq(askThread.id, input.threadId), eq(askThread.userId, ctx.userId), isNull(askThread.deletedAt)));
      if (!t) throw new ToolError('not_found', 'Thread not found');
      const rows = await tx
        .select({
          id: askMessage.id, role: askMessage.role, content: askMessage.content, citations: askMessage.citations,
          status: askMessage.status, action: askMessage.action, createdAt: askMessage.createdAt,
        })
        .from(askMessage)
        .where(and(eq(askMessage.threadId, t.id), eq(askMessage.userId, ctx.userId)))
        .orderBy(asc(askMessage.createdAt), asc(askMessage.id));
      return {
        id: t.id, clientId: t.clientId, title: t.title,
        messages: rows.map((m) => ({ ...m, action: toActionView(m.action), createdAt: iso(m.createdAt) })),
      };
    });
  },
});

export const deleteAskThread = defineTool({
  name: 'delete_ask_thread',
  access: 'write',
  supportHidden: true,
  description: "Delete one of the signed-in user's own Ask conversations from their list (kept for review; never shown to them again).",
  input: z.object({ clientId: uuid, threadId: uuid }),
  output: z.object({ deleted: z.literal(true) }),
  permission: 'read',
  feature: 'ask',
  channels: WEB_ONLY,
  async handler(ctx, input, deps) {
    refuseGuest(ctx);
    if (!hasChannel(ctx, 'ask')) throw new ToolError('not_found', 'Not found');
    const c = await workspaceClient(deps, ctx, input.clientId);
    const rows = await withTenant(deps.app, ctx, (tx) =>
      tx
        .update(askThread)
        .set({ deletedAt: new Date() })
        .where(and(eq(askThread.id, input.threadId), eq(askThread.clientId, c.id), eq(askThread.userId, ctx.userId), isNull(askThread.deletedAt)))
        .returning({ id: askThread.id }),
    );
    if (rows.length === 0) throw new ToolError('not_found', 'Thread not found');
    return { deleted: true as const };
  },
});

export const getAskStarters = defineTool({
  name: 'get_ask_starters',
  access: 'read',
  supportHidden: true,
  description: "A client's four starter questions (generic ones until the weekly set exists) and whether its conversations may be reviewed.",
  input: z.object({ clientId: uuid }),
  // e4: no usage or quota numbers here, ever.
  output: z.object({ questions: z.array(z.string()), reviewAllowed: z.boolean() }),
  permission: 'read',
  feature: 'ask',
  channels: WEB_ONLY,
  async handler(ctx, input, deps) {
    refuseGuest(ctx);
    const c = await workspaceClient(deps, ctx, input.clientId);
    return withTenant(deps.app, ctx, async (tx) => {
      const [s] = await tx.select({ questions: askStarter.questions }).from(askStarter).where(eq(askStarter.clientId, c.id));
      const [flag] = await tx.select({ reviewAllowed: client.askReviewAllowed }).from(client).where(eq(client.id, c.id));
      return { questions: s && s.questions.length > 0 ? s.questions : [...GENERIC_STARTERS], reviewAllowed: flag?.reviewAllowed ?? false };
    });
  },
});

export const askThreadTools = [listMyAskThreads, getMyAskThread, deleteAskThread, getAskStarters];
