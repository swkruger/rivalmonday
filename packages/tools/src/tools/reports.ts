import { canAccessClient, isAgencyRole, toolkit, ToolError } from '@cs/core';
import { trendReport, withTenant } from '@cs/db';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../registry';
import { ReportDetail, ReportSummary, toIso } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const summary = (r: typeof trendReport.$inferSelect): ReportSummary => ({ id: r.id, clientId: r.clientId, quarter: r.quarter, status: r.status, sentAt: toIso(r.sentAt), hasPdf: r.pdfKey !== null });

export const listTrendReports = defineTool({
  name: 'list_trend_reports',
  description: 'List quarterly trend reports for a client. Client roles see sent reports only.',
  input: z.object({ clientId: z.string().uuid() }),
  output: z.object({ items: z.array(ReportSummary) }),
  permission: 'read',
  async handler(ctx, { clientId }, deps) {
    if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
    const where = isAgencyRole(ctx.role) ? eq(trendReport.clientId, clientId) : and(eq(trendReport.clientId, clientId), eq(trendReport.status, 'sent'));
    const rows = await withTenant(deps.app, ctx, (tx) => tx.select().from(trendReport).where(where).orderBy(desc(trendReport.quarter)));
    return { items: rows.map(summary) };
  },
});

export const getTrendReport = defineTool({
  name: 'get_trend_report',
  description: 'Get one quarterly trend report (deterministic numbers, never model-written).',
  input: z.object({ reportId: z.string().uuid() }),
  output: ReportDetail,
  permission: 'read',
  async handler(ctx, { reportId }, deps) {
    const [r] = await withTenant(deps.app, ctx, (tx) => tx.select().from(trendReport).where(eq(trendReport.id, reportId)));
    if (!r || !canAccessClient(ctx, r.clientId) || (!isAgencyRole(ctx.role) && r.status !== 'sent')) throw new ToolError('not_found', 'Report not found');
    return { ...summary(r), periodStart: r.periodStart.toISOString(), periodEnd: r.periodEnd.toISOString(), data: (r.data as Record<string, unknown> | null) ?? null };
  },
});

export const reportTools = [listTrendReports, getTrendReport];
