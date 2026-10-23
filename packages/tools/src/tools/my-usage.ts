import { type AccessContext, canAccessClient, isAgencyRole, toolkit, ToolError } from '@cs/core';
import { askMessage, client, effectiveLimitUsd, readSpendGuardSettings } from '@cs/db';
import { and, asc, count, eq, gte, inArray, isNotNull, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { monthStart, spendByClient } from '../usage';
import { SpendCredits } from './schemas';
import { creditsView } from './usage';

/** 7b1 Task 4: tenant-facing credits. Nothing here names dollars, cost or the platform: integer credits and a calm level only. */
const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();
const NOT_FOUND = 'Not found';

/** Agency roles and the signed-in client owner of that client; viewers, guest contacts and any other client get `not_found`. */
function requireCreditsViewer(ctx: AccessContext, clientId: string) {
  const ok = isAgencyRole(ctx.role) || (ctx.role === 'client_owner' && !ctx.userId.startsWith('contact:'));
  if (!ok || !canAccessClient(ctx, clientId)) throw new ToolError('not_found', NOT_FOUND);
}

export const getMyUsageTool = defineTool({
  name: 'get_my_usage',
  access: 'read',
  description: 'This month’s credits used against the client’s monthly credit limit (and, for agency roles, the Ask question count).',
  input: z.object({ clientId: uuid }),
  output: z.object({ month: z.string(), credits: SpendCredits, questions: z.object({ used: z.number().int(), quota: z.number().int() }).nullable() }),
  permission: 'read',
  async handler(ctx, { clientId }, deps) {
    requireCreditsViewer(ctx, clientId);
    const since = monthStart(new Date());
    const [c] = await deps.service
      .select({ cap: client.spendLimitUsd, spendPausedAt: client.spendPausedAt, askQuota: client.askMonthlyQuota })
      .from(client)
      .where(and(eq(client.id, clientId), eq(client.agencyId, ctx.agencyId), isNull(client.archivedAt)));
    if (!c) throw new ToolError('not_found', NOT_FOUND);
    const settings = await readSpendGuardSettings(deps.service);
    const spent = (await spendByClient(deps.service, [clientId], since)).get(clientId) ?? 0;
    let questions: { used: number; quota: number } | null = null;
    if (isAgencyRole(ctx.role)) {
      const [r] = await deps.service
        .select({ n: count() })
        .from(askMessage)
        .where(and(eq(askMessage.clientId, clientId), eq(askMessage.agencyId, ctx.agencyId), eq(askMessage.countsTowardQuota, true), gte(askMessage.createdAt, since)));
      questions = { used: r?.n ?? 0, quota: c.askQuota };
    }
    return { month: since.toISOString().slice(0, 7), credits: creditsView(spent, effectiveLimitUsd(c.cap, settings), c.spendPausedAt, settings), questions };
  },
});

export const getSpendStatusTool = defineTool({
  name: 'get_spend_status',
  access: 'read',
  description: 'Clients whose AI and monitoring work is paused until next month because their monthly credits ran out.',
  input: z.object({ clientId: uuid.optional() }),
  output: z.object({ paused: z.array(z.object({ clientId: uuid, name: z.string(), until: z.string() })) }),
  permission: 'read',
  async handler(ctx, { clientId }, deps) {
    const now = new Date();
    const until = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
    const where = [eq(client.agencyId, ctx.agencyId), isNull(client.archivedAt), isNotNull(client.spendPausedAt)];
    if (isAgencyRole(ctx.role)) {
      if (ctx.clientScope !== 'all') where.push(inArray(client.id, [...ctx.clientScope]));
      if (clientId) where.push(eq(client.id, clientId));
    } else {
      // Client roles see only the one client they asked about, and only if it is theirs.
      if (!clientId || !canAccessClient(ctx, clientId)) return { paused: [] };
      where.push(eq(client.id, clientId));
    }
    const rows = await deps.service.select({ clientId: client.id, name: client.name }).from(client).where(and(...where)).orderBy(asc(client.name));
    return { paused: rows.map((r) => ({ ...r, until })) };
  },
});

export const myUsageTools = [getMyUsageTool, getSpendStatusTool];
