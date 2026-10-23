import { type AccessContext, spendLevel, toolkit, ToolError, usdToCredits } from '@cs/core';
import { askMessage, client, clientCompetitor, effectiveLimitUsd, pauseThresholdUsd, readSpendGuardSettings, type SpendGuardSettings, spendGuardEvent, withTenant } from '@cs/db';
import { and, asc, count, eq, gte, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { MAX_COMPETITOR_LIMIT } from '../limits';
import { requirePlatformOperator } from '../platform';
import { withPlatformAudit } from '../platform/audit';
import { agencyLevelSpend, monthStart, spendByClient } from '../usage';
import { SpendCredits, UsageRow } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();
const MAX_ASK_QUOTA = 100_000;
const round2 = (n: number) => Math.round(n * 100) / 100;
/** The spec's per-client override bound [1, 10000]. */
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

/** Platform staff only; anything else is hidden (404), like every platform tool. */
async function requireLimitsOperator(deps: ToolDeps, ctx: AccessContext, min: 'viewer' | 'staff') {
  try {
    return await requirePlatformOperator(deps, ctx, min);
  } catch (err) {
    if (err instanceof ToolError && err.code === 'permission_denied') throw new ToolError('not_found', 'Not found');
    throw err;
  }
}

export const setClientLimits = defineTool({
  name: 'set_client_limits',
  access: 'write',
  description: 'Platform staff: set a client’s monthly spend limit override (null clears it), competitor limit and monthly Ask question quota. Raising the limit above current spend lifts a spend pause.',
  input: z.object({
    clientId: uuid,
    spendLimitUsd: z.number().min(1).max(MAX_LIMIT_USD).nullable().optional(),
    competitorLimit: z.number().int().min(1).max(MAX_COMPETITOR_LIMIT).optional(),
    askMonthlyQuota: z.number().int().min(0).max(MAX_ASK_QUOTA).optional(),
  }),
  output: z.object({ clientId: uuid, spendLimitUsd: z.number().nullable(), competitorLimit: z.number().int(), askMonthlyQuota: z.number().int(), lifted: z.boolean() }),
  permission: 'agency',
  audit: 'skip-web',
  supportHidden: true,
  async handler(ctx: AccessContext, input, deps) {
    const role = await requireLimitsOperator(deps, ctx, 'staff');
    const [target] = await deps.service.select({ agencyId: client.agencyId }).from(client).where(eq(client.id, input.clientId));
    return withPlatformAudit(deps, ctx, { tool: 'set_client_limits', input, role, agencyId: target?.agencyId }, async () => {
      if (!target) throw new ToolError('not_found', 'Client not found');
      const patch: { spendLimitUsd?: number | null; competitorLimit?: number; askMonthlyQuota?: number } = {};
      if (input.spendLimitUsd !== undefined) patch.spendLimitUsd = input.spendLimitUsd === null ? null : round2(input.spendLimitUsd);
      if (input.competitorLimit !== undefined) patch.competitorLimit = input.competitorLimit;
      if (input.askMonthlyQuota !== undefined) patch.askMonthlyQuota = input.askMonthlyQuota;
      if (Object.keys(patch).length === 0) throw new ToolError('invalid_input', 'Nothing to change');
      const settings = await readSpendGuardSettings(deps.service);
      const now = new Date();
      return deps.service.transaction(async (tx) => {
        const [row] = await tx
          .update(client)
          .set(patch)
          .where(eq(client.id, input.clientId))
          .returning({ spendLimitUsd: client.spendLimitUsd, competitorLimit: client.competitorLimit, askMonthlyQuota: client.askMonthlyQuota, spendPausedAt: client.spendPausedAt });
        if (!row) throw new ToolError('not_found', 'Client not found');
        const limit = effectiveLimitUsd(row.spendLimitUsd, settings);
        let lifted = false;
        if (row.spendPausedAt) {
          const spent = (await spendByClient(tx, [input.clientId], monthStart(now))).get(input.clientId) ?? 0;
          // Micro-dollars, like the guard's own comparison: at or above the threshold stays paused. Lowering never pauses (d18).
          if (Math.round(spent * 1e6) < Math.round(pauseThresholdUsd(limit, settings) * 1e6)) {
            await tx.update(client).set({ spendPausedAt: null }).where(eq(client.id, input.clientId));
            await tx.insert(spendGuardEvent).values({
              kind: 'client_unpaused', agencyId: target.agencyId, clientId: input.clientId, month: monthStart(now).toISOString().slice(0, 10), limitUsd: limit, actor: ctx.userId, note: 'limit raised',
            });
            lifted = true;
          }
        }
        return {
          clientId: input.clientId,
          spendLimitUsd: row.spendLimitUsd === null ? null : Number(row.spendLimitUsd),
          competitorLimit: row.competitorLimit,
          askMonthlyQuota: row.askMonthlyQuota,
          lifted,
        };
      });
    });
  },
});

export const getClientLimits = defineTool({
  name: 'get_client_limits',
  access: 'read',
  description: 'Platform operators: one agency’s clients with month-to-date spend (USD), limits and spend level.',
  input: z.object({ agencyId: uuid }),
  output: z.object({
    defaultLimitUsd: z.number(),
    pausePercent: z.number(),
    items: z.array(
      z.object({
        clientId: uuid,
        name: z.string(),
        status: z.string(),
        spendUsd: z.number(),
        effectiveLimitUsd: z.number(),
        spendLimitUsd: z.number().nullable(),
        competitorLimit: z.number().int(),
        askMonthlyQuota: z.number().int(),
        level: z.enum(['ok', 'near', 'reached', 'paused']),
        spendPausedAt: z.string().nullable(),
      }),
    ),
  }),
  permission: 'agency',
  audit: 'skip-web',
  supportHidden: true,
  async handler(ctx: AccessContext, input, deps) {
    const role = await requireLimitsOperator(deps, ctx, 'viewer');
    return withPlatformAudit(deps, ctx, { tool: 'get_client_limits', input, role, agencyId: input.agencyId }, async () => {
      const settings = await readSpendGuardSettings(deps.service);
      const rows = await deps.service
        .select({ id: client.id, name: client.name, status: client.status, limit: client.spendLimitUsd, competitorLimit: client.competitorLimit, askMonthlyQuota: client.askMonthlyQuota, pausedAt: client.spendPausedAt })
        .from(client)
        .where(and(eq(client.agencyId, input.agencyId), isNull(client.archivedAt)))
        .orderBy(asc(client.name), asc(client.id));
      const spend = await spendByClient(deps.service, rows.map((r) => r.id), monthStart(new Date()));
      return {
        defaultLimitUsd: settings.clientMonthlyLimitUsd,
        pausePercent: settings.clientPausePercent,
        items: rows.map((r) => {
          const spendUsd = spend.get(r.id) ?? 0;
          const limitUsd = effectiveLimitUsd(r.limit, settings);
          return {
            clientId: r.id,
            name: r.name,
            status: r.status,
            spendUsd,
            effectiveLimitUsd: limitUsd,
            spendLimitUsd: r.limit === null ? null : Number(r.limit),
            competitorLimit: r.competitorLimit,
            askMonthlyQuota: r.askMonthlyQuota,
            level: spendLevel(spendUsd, limitUsd, r.pausedAt),
            spendPausedAt: r.pausedAt ? r.pausedAt.toISOString() : null,
          };
        }),
      };
    });
  },
});

export const usageTools = [getUsage, setClientLimits, getClientLimits];
