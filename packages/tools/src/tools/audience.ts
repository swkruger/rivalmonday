import { toolkit } from '@cs/core';
import { observation } from '@cs/db';
import { and, asc, eq, gte } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { allInOrder, workspaceClient } from '../workspace/scope';
import { requireTracked } from './pages';
import { AudienceTrend } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();
const DAY = 86_400_000;
const WEEKS = 52;

/** Monday (UTC) of the ISO week containing `d`, as `YYYY-MM-DD`. */
export function isoWeekMonday(d: Date): string {
  const utc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  return new Date(utc - sinceMonday * DAY).toISOString().slice(0, 10);
}

export const getAudienceTrend = defineTool({
  name: 'get_audience_trend',
  access: 'read',
  description: 'A tracked competitor’s Facebook Page likes per week (newest reading each ISO week, last 52 weeks), per Page.',
  input: z.object({ clientId: uuid, competitorId: uuid }),
  output: AudienceTrend,
  permission: 'read',
  channels: ['web'],
  feature: 'dashboard',
  async handler(ctx, { clientId, competitorId }, deps) {
    const since = new Date(Date.parse(`${isoWeekMonday(new Date())}T00:00:00Z`) - (WEEKS - 1) * 7 * DAY);
    // Launch-gate: the scope checks and the global read start together (one stage); refusals keep their order and discard the rows.
    const [, , rows] = await allInOrder([
      workspaceClient(deps, ctx, clientId),
      requireTracked(deps.app, ctx, clientId, competitorId),
      deps.service.select({ key: observation.key, data: observation.data, at: observation.observedAt }).from(observation)
        .where(and(eq(observation.competitorId, competitorId), eq(observation.kind, 'meta_page'), gte(observation.observedAt, since)))
        .orderBy(asc(observation.observedAt)),
    ]);
    const pages = new Map<string, { name: string | null; weeks: Map<string, number> }>();
    for (const r of rows) {
      const d = r.data as { pageName?: unknown; likes?: unknown };
      if (typeof d.likes !== 'number' || !Number.isFinite(d.likes)) continue;
      const p = pages.get(r.key) ?? { name: null, weeks: new Map<string, number>() };
      if (typeof d.pageName === 'string' && d.pageName) p.name = d.pageName;
      p.weeks.set(isoWeekMonday(r.at), Math.round(d.likes)); // ascending: the newest reading in a week wins
      pages.set(r.key, p);
    }
    const out = [...pages].map(([pageId, p]) => ({
      pageId, pageName: p.name,
      points: [...p.weeks].sort(([a], [b]) => a.localeCompare(b)).map(([week, likes]) => ({ week, likes })),
    }));
    out.sort((a, b) => (b.points.at(-1)?.likes ?? 0) - (a.points.at(-1)?.likes ?? 0) || a.pageId.localeCompare(b.pageId));
    return { pages: out };
  },
});

export const audienceTools = [getAudienceTrend];
