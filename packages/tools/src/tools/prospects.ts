import { type AccessContext, canAccessClient, toolkit, ToolError } from '@cs/core';
import { failProspectReport, PROSPECT_STALE_HOURS } from '@cs/collectors';
import { client, clientCompetitor, prospectReport, withTenant } from '@cs/db';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { enqueueOf, type ToolDeps } from '../deps';
import { ProspectReportView, ProspectRow } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();
const STALE_MS = PROSPECT_STALE_HOURS * 3_600_000;
type ReportRow = typeof prospectReport.$inferSelect;

/** Decision 10: a `running` row older than the stale window is reported (and treated) as failed. */
function effective(r: ReportRow, now: Date): ReportRow {
  if (r.status === 'running' && now.getTime() - r.createdAt.getTime() > STALE_MS) return { ...r, status: 'failed', error: 'The snapshot timed out — run it again' };
  return r;
}

/** The client as the caller's RLS sees it; `not_found` when out of scope or another agency's. */
async function visibleClient(deps: ToolDeps, ctx: AccessContext, clientId: string): Promise<{ id: string }> {
  if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
  const [c] = await withTenant(deps.app, ctx, (tx) => tx.select({ id: client.id }).from(client).where(eq(client.id, clientId)));
  if (!c) throw new ToolError('not_found', 'Client not found');
  return c;
}

export const listProspects = defineTool({
  name: 'list_prospects',
  description: 'Businesses this agency is pitching (prospects), with their competitors and latest snapshot.',
  input: z.object({}),
  output: z.object({ items: z.array(ProspectRow) }),
  permission: 'agency',
  async handler(ctx, _input, deps) {
    const now = new Date();
    return withTenant(deps.app, ctx, async (tx) => {
      const rows = await tx.select().from(client).where(eq(client.status, 'prospect')).orderBy(desc(client.createdAt));
      const ids = rows.map((r) => r.id);
      if (ids.length === 0) return { items: [] };
      const [links, reports] = await Promise.all([
        tx.select({ id: clientCompetitor.clientId, n: count() }).from(clientCompetitor).where(inArray(clientCompetitor.clientId, ids)).groupBy(clientCompetitor.clientId),
        tx.select().from(prospectReport).where(inArray(prospectReport.clientId, ids)).orderBy(desc(prospectReport.createdAt)),
      ]);
      return {
        items: rows.map((c) => {
          const r = reports.find((x) => x.clientId === c.id);
          const e = r ? effective(r, now) : null;
          return {
            clientId: c.id, name: c.name, verticalId: c.verticalId, createdAt: c.createdAt.toISOString(), competitors: links.find((l) => l.id === c.id)?.n ?? 0,
            keywords: c.keywords.length, hasServiceArea: c.serviceArea !== null, report: e ? { id: e.id, status: e.status, createdAt: e.createdAt.toISOString() } : null,
          };
        }),
      };
    });
  },
});

export const runProspectSnapshotTool = defineTool({
  name: 'run_prospect_snapshot',
  description: 'Pull each business’s Google profile and ads once and scan local rankings on a 3×3 grid, then build a landscape report (paid; runs in the background).',
  input: z.object({ clientId: uuid }),
  output: z.object({ reportId: uuid }),
  permission: 'agency',
  async handler(ctx, { clientId }, deps) {
    await visibleClient(deps, ctx, clientId);
    const enqueue = enqueueOf(deps);
    // Amendment F6: lock the client row so the "nothing running" check and the insert are atomic — a second
    // concurrent request waits here, then sees the first one's `running` row and is refused.
    const reportId = await deps.service.transaction(async (tx) => {
      const [c] = await tx.select().from(client).where(and(eq(client.id, clientId), eq(client.agencyId, ctx.agencyId))).for('update');
      if (!c) throw new ToolError('not_found', 'Client not found');
      if (c.status !== 'prospect') throw new ToolError('invalid_input', 'Snapshots are for prospects — this business is already a client');
      if (c.keywords.length === 0 || !c.serviceArea) throw new ToolError('invalid_input', 'Add at least one keyword and a service area to the profile first');
      const [links] = await tx.select({ n: count() }).from(clientCompetitor).where(eq(clientCompetitor.clientId, clientId));
      if ((links?.n ?? 0) === 0) throw new ToolError('invalid_input', 'Pick at least one competitor first');
      const [last] = await tx.select().from(prospectReport).where(eq(prospectReport.clientId, clientId)).orderBy(desc(prospectReport.createdAt)).limit(1);
      if (last && effective(last, new Date()).status === 'running') throw new ToolError('invalid_input', 'A snapshot is already running — it usually takes a few minutes');
      const [row] = await tx.insert(prospectReport).values({ agencyId: ctx.agencyId, clientId, status: 'running' }).returning({ id: prospectReport.id });
      return row!.id;
    });
    try {
      await enqueue('prospect-snapshot', { clientId, reportId }, `prospect:${clientId}`);
    } catch (err) {
      await failProspectReport(deps.service, reportId, 'Could not start the snapshot — try again');
      throw err;
    }
    return { reportId };
  },
});

export const getProspectReport = defineTool({
  name: 'get_prospect_report',
  description: 'The latest prospect snapshot report for a business (running, ready or failed).',
  input: z.object({ clientId: uuid }),
  output: z.object({ report: ProspectReportView.nullable() }),
  permission: 'agency',
  async handler(ctx, { clientId }, deps) {
    await visibleClient(deps, ctx, clientId);
    const [r] = await withTenant(deps.app, ctx, (tx) => tx.select().from(prospectReport).where(eq(prospectReport.clientId, clientId)).orderBy(desc(prospectReport.createdAt)).limit(1));
    if (!r) return { report: null };
    const e = effective(r, new Date());
    return { report: { id: e.id, status: e.status, createdAt: e.createdAt.toISOString(), finishedAt: e.finishedAt?.toISOString() ?? null, error: e.error, data: e.data } };
  },
});

export const convertProspect = defineTool({
  name: 'convert_prospect',
  description: 'Turn a prospect into a client: monitoring, alerts and weekly briefs start.',
  input: z.object({ clientId: uuid }),
  output: z.object({ clientId: uuid }),
  permission: 'agency',
  async handler(ctx, { clientId }, deps) {
    await visibleClient(deps, ctx, clientId);
    await deps.service.transaction(async (tx) => {
      const rows = await tx
        .update(client)
        .set({ status: 'active' })
        .where(and(eq(client.id, clientId), eq(client.agencyId, ctx.agencyId), eq(client.status, 'prospect')))
        .returning({ id: client.id });
      if (rows.length === 0) throw new ToolError('invalid_input', 'This business is already a client');
      // Decision 12: a fresh link date lets the score sweep's late-link lookback offer the last 90 days of events.
      await tx.update(clientCompetitor).set({ createdAt: new Date() }).where(eq(clientCompetitor.clientId, clientId));
    });
    return { clientId };
  },
});

export const prospectTools = [listProspects, runProspectSnapshotTool, getProspectReport, convertProspect];
