import { canAccessClient, toolkit, ToolError } from '@cs/core';
import { client, clientCompetitor, withTenant } from '@cs/db';
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { MAX_COMPETITOR_LIMIT, MAX_MONTHLY_CAP_USD } from '../limits';
import { agencyLevelSpend, monthStart, spendByClient, spendLevel } from '../usage';
import { UsageRow } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();
const round2 = (n: number) => Math.round(n * 100) / 100;

export const spendView = (spent: number, cap: number) => ({ monthToDateUsd: round2(spent), capUsd: cap, ratio: cap > 0 ? spent / cap : 0, level: spendLevel(spent, cap) });

export const getUsage = defineTool({
  name: 'get_usage',
  description: 'This month’s AI and data spend per client against its monthly cap, plus competitor limits.',
  input: z.object({}),
  output: z.object({ month: z.string(), items: z.array(UsageRow), agencyLevelUsd: z.number().nullable() }),
  permission: 'agency',
  async handler(ctx, _input, deps) {
    const now = new Date();
    const since = monthStart(now);
    const clients = await withTenant(deps.app, ctx, (tx) =>
      tx.select({ id: client.id, name: client.name, status: client.status, cap: client.monthlyCapUsd, limit: client.competitorLimit }).from(client).orderBy(asc(client.name)));
    const ids = clients.map((c) => c.id);
    const [spend, links] = await Promise.all([
      spendByClient(deps.service, ids, since),
      ids.length ? withTenant(deps.app, ctx, (tx) => tx.select({ id: clientCompetitor.clientId, n: count() }).from(clientCompetitor).where(inArray(clientCompetitor.clientId, ids)).groupBy(clientCompetitor.clientId)) : [],
    ]);
    const competitors = new Map(links.map((l) => [l.id, l.n]));
    return {
      month: since.toISOString().slice(0, 7),
      items: clients.map((c) => ({
        clientId: c.id, name: c.name, status: c.status, spend: spendView(spend.get(c.id) ?? 0, c.cap), competitorLimit: c.limit, competitors: competitors.get(c.id) ?? 0,
        questions: { used: null, quota: null },
      })),
      agencyLevelUsd: ctx.clientScope === 'all' ? round2(await agencyLevelSpend(deps.service, ctx.agencyId, since)) : null,
    };
  },
});

export const setClientLimits = defineTool({
  name: 'set_client_limits',
  description: 'Set a client’s monthly spend cap (USD) and how many competitors it may track (agency admins).',
  input: z.object({ clientId: uuid, monthlyCapUsd: z.number().optional(), competitorLimit: z.number().optional() }),
  output: z.object({ clientId: uuid, monthlyCapUsd: z.number(), competitorLimit: z.number().int() }),
  permission: 'agency',
  async handler(ctx, input, deps) {
    if (ctx.role !== 'agency_admin') throw new ToolError('permission_denied', 'Only agency admins change limits');
    if (!canAccessClient(ctx, input.clientId)) throw new ToolError('not_found', 'Client not found');
    const patch: { monthlyCapUsd?: number; competitorLimit?: number } = {};
    if (input.monthlyCapUsd !== undefined) {
      const cap = round2(input.monthlyCapUsd);
      if (!Number.isFinite(cap) || cap < 1 || cap > MAX_MONTHLY_CAP_USD) throw new ToolError('invalid_input', `The monthly cap must be between $1 and $${MAX_MONTHLY_CAP_USD}`);
      patch.monthlyCapUsd = cap;
    }
    if (input.competitorLimit !== undefined) {
      if (!Number.isInteger(input.competitorLimit) || input.competitorLimit < 1 || input.competitorLimit > MAX_COMPETITOR_LIMIT) {
        throw new ToolError('invalid_input', `The competitor limit must be a whole number from 1 to ${MAX_COMPETITOR_LIMIT}`);
      }
      patch.competitorLimit = input.competitorLimit;
    }
    if (Object.keys(patch).length === 0) throw new ToolError('invalid_input', 'Nothing to change');
    const [row] = await deps.service
      .update(client)
      .set(patch)
      .where(and(eq(client.id, input.clientId), eq(client.agencyId, ctx.agencyId)))
      .returning({ clientId: client.id, monthlyCapUsd: client.monthlyCapUsd, competitorLimit: client.competitorLimit });
    if (!row) throw new ToolError('not_found', 'Client not found');
    return row;
  },
});

export const usageTools = [getUsage, setClientLimits];
