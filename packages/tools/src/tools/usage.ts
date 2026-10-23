import { canAccessClient, spendLevel, toolkit, ToolError, usdToCredits } from '@cs/core';
import { askMessage, client, clientCompetitor, effectiveLimitUsd, readSpendGuardSettings, type SpendGuardSettings, withTenant } from '@cs/db';
import { and, asc, count, eq, gte, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { MAX_COMPETITOR_LIMIT } from '../limits';
import { agencyLevelSpend, monthStart, spendByClient } from '../usage';
import { SpendCredits, UsageRow } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();
const MAX_ASK_QUOTA = 100_000;
const round2 = (n: number) => Math.round(n * 100) / 100;
/** Until Task 5 replaces `set_client_limits` dollar input: the spec's per-client override bound (0, 10000]. */
const MAX_LIMIT_USD = 10_000;

/** What tenants see of one client's month: integer credits and a calm level (spec d1/d5). */
export function creditsView(spentUsd: number, limitUsd: number, pausedAt: Date | null, s: SpendGuardSettings): SpendCredits {
  return {
    used: usdToCredits(spentUsd, s.creditsPerUsd),
    limit: usdToCredits(limitUsd, s.creditsPerUsd),
    ratio: limitUsd > 0 ? spentUsd / limitUsd : 0,
    level: spendLevel(spentUsd, limitUsd, pausedAt),
  };
}

export const getUsage = defineTool({
  name: 'get_usage',
  access: 'read',
  description: 'This month’s credits used per client against its monthly credit limit, plus competitor limits.',
  input: z.object({}),
  output: z.object({ month: z.string(), items: z.array(UsageRow), agencyLevelCredits: z.number().int().nullable(), totalCredits: z.number().int() }),
  permission: 'agency',
  channels: ['web', 'mcp', 'ask'],
  async handler(ctx, _input, deps) {
    const now = new Date();
    const since = monthStart(now);
    const clients = await withTenant(deps.app, ctx, (tx) =>
      tx.select({ id: client.id, name: client.name, status: client.status, cap: client.spendLimitUsd, limit: client.competitorLimit, askQuota: client.askMonthlyQuota, spendPausedAt: client.spendPausedAt }).from(client).orderBy(asc(client.name)));
    const ids = clients.map((c) => c.id);
    const settings = await readSpendGuardSettings(deps.service);
    const [spend, links, asked] = await Promise.all([
      spendByClient(deps.service, ids, since),
      ids.length ? withTenant(deps.app, ctx, (tx) => tx.select({ id: clientCompetitor.clientId, n: count() }).from(clientCompetitor).where(inArray(clientCompetitor.clientId, ids)).groupBy(clientCompetitor.clientId)) : [],
      // ask_message RLS is author-only, so the per-client count (all users) is read through the service role, scoped to the ids above.
      ids.length
        ? deps.service.select({ id: askMessage.clientId, n: count() }).from(askMessage)
            .where(and(inArray(askMessage.clientId, ids), eq(askMessage.agencyId, ctx.agencyId), eq(askMessage.countsTowardQuota, true), gte(askMessage.createdAt, since)))
            .groupBy(askMessage.clientId)
        : [],
    ]);
    const questionsUsed = new Map(asked.map((l) => [l.id, l.n]));
    const competitors = new Map(links.map((l) => [l.id, l.n]));
    const items = clients.map((c) => ({
      clientId: c.id, name: c.name, status: c.status, credits: creditsView(spend.get(c.id) ?? 0, effectiveLimitUsd(c.cap, settings), c.spendPausedAt, settings),
      competitorLimit: c.limit, competitors: competitors.get(c.id) ?? 0, questions: { used: questionsUsed.get(c.id) ?? 0, quota: c.askQuota },
    }));
    const agencyLevelCredits = ctx.clientScope === 'all' ? usdToCredits(await agencyLevelSpend(deps.service, ctx.agencyId, since), settings.creditsPerUsd) : null;
    return { month: since.toISOString().slice(0, 7), items, agencyLevelCredits, totalCredits: items.reduce((n, i) => n + i.credits.used, 0) + (agencyLevelCredits ?? 0) };
  },
});

export const setClientLimits = defineTool({
  name: 'set_client_limits',
  access: 'write',
  description: 'Set a client’s monthly spend cap (USD), how many competitors it may track and its monthly Ask question quota (agency admins).',
  input: z.object({ clientId: uuid, monthlyCapUsd: z.number().optional(), competitorLimit: z.number().optional(), askMonthlyQuota: z.number().optional() }),
  output: z.object({ clientId: uuid, monthlyCapUsd: z.number(), competitorLimit: z.number().int() }),
  permission: 'agency',
  async handler(ctx, input, deps) {
    if (ctx.role !== 'agency_admin') throw new ToolError('permission_denied', 'Only agency admins change limits');
    if (!canAccessClient(ctx, input.clientId)) throw new ToolError('not_found', 'Client not found');
    const patch: { spendLimitUsd?: number; competitorLimit?: number; askMonthlyQuota?: number } = {};
    if (input.monthlyCapUsd !== undefined) {
      const cap = round2(input.monthlyCapUsd);
      if (!Number.isFinite(cap) || cap < 1 || cap > MAX_LIMIT_USD) throw new ToolError('invalid_input', `The monthly cap must be between $1 and $${MAX_LIMIT_USD}`);
      patch.spendLimitUsd = cap; // until Task 5: the monthlyCapUsd input writes the per-client override
    }
    if (input.competitorLimit !== undefined) {
      if (!Number.isInteger(input.competitorLimit) || input.competitorLimit < 1 || input.competitorLimit > MAX_COMPETITOR_LIMIT) {
        throw new ToolError('invalid_input', `The competitor limit must be a whole number from 1 to ${MAX_COMPETITOR_LIMIT}`);
      }
      patch.competitorLimit = input.competitorLimit;
    }
    if (input.askMonthlyQuota !== undefined) {
      if (!Number.isInteger(input.askMonthlyQuota) || input.askMonthlyQuota < 0 || input.askMonthlyQuota > MAX_ASK_QUOTA) {
        throw new ToolError('invalid_input', `The monthly question quota must be a whole number from 0 to ${MAX_ASK_QUOTA}`);
      }
      patch.askMonthlyQuota = input.askMonthlyQuota;
    }
    if (Object.keys(patch).length === 0) throw new ToolError('invalid_input', 'Nothing to change');
    const [row] = await deps.service
      .update(client)
      .set(patch)
      .where(and(eq(client.id, input.clientId), eq(client.agencyId, ctx.agencyId)))
      .returning({ clientId: client.id, spendLimitUsd: client.spendLimitUsd, competitorLimit: client.competitorLimit });
    if (!row) throw new ToolError('not_found', 'Client not found');
    return { clientId: row.clientId, monthlyCapUsd: effectiveLimitUsd(row.spendLimitUsd, await readSpendGuardSettings(deps.service)), competitorLimit: row.competitorLimit };
  },
});

export const usageTools = [getUsage, setClientLimits];
