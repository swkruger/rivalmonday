import { type AccessContext, toolkit, ToolError } from '@cs/core';
import { agency, agencyServiceable, client, lead, leadPreviewSchema } from '@cs/db';
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { pageOf, pageResult, prevCursorOf } from '../paging';
import { type PlatformRole, requirePlatformOperator } from '../platform';
import { withPlatformAudit } from '../platform/audit';
import { sendAfterCommit } from './leads';

/**
 * Phase 11c §6: the platform pool of unassigned verified leads. Same pattern as platform-signups.ts: role check first (a refusal
 * never reaches the audit log), then the body under one platform audit row. Pool rows are reachable through the service role only.
 */
const { defineTool } = toolkit<ToolDeps>();

async function operate<T>(deps: ToolDeps, ctx: AccessContext, min: PlatformRole, tool: string, input: unknown, fn: () => Promise<T>): Promise<T> {
  const role = await requirePlatformOperator(deps, ctx, min);
  return withPlatformAudit(deps, ctx, { tool, input, role }, fn);
}

const PoolLead = z.object({
  id: z.string().uuid(),
  ref: z.string().nullable(),
  businessName: z.string(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  category: z.string().nullable(),
  contactName: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  message: z.string().nullable(),
  preview: leadPreviewSchema,
  createdAt: z.date(),
  verifiedAt: z.date().nullable(),
  /** Returned to the pool by an agency that declined it (decided_at survives the return). */
  declinedBack: z.boolean(),
});
export type PoolLead = z.infer<typeof PoolLead>;
const RecentAssignment = z.object({ leadId: z.string().uuid(), businessName: z.string(), agencyName: z.string(), assignedAt: z.date() });
export type RecentAssignment = z.infer<typeof RecentAssignment>;
const PoolAgency = z.object({ id: z.string().uuid(), name: z.string(), verticals: z.array(z.string()), activeClients: z.number().int() });

export const listPoolLeadsTool = defineTool({
  name: 'list_pool_leads',
  access: 'read',
  description: 'Platform operators: verified leads from the platform intake that no agency holds yet, plus the agencies that can take one (with their verticals and active-client counts) and the last 20 assignments. Leads are paged (newest first, 25 per page on the web, at most 100).',
  input: z.object({ cursor: z.string().max(200).optional(), limit: z.number().int().min(1).max(100).optional() }),
  output: z.object({
    leads: z.array(PoolLead), nextCursor: z.string().nullable(), prevCursor: z.string().nullable(), total: z.number().int(),
    agencies: z.array(PoolAgency), recentAssignments: z.array(RecentAssignment),
  }),
  supportMask: ['leads[].email', 'leads[].phone', 'leads[].message'],
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps, meta) {
    return operate(deps, ctx, 'viewer', 'list_pool_leads', input, async () => {
      const { offset, limit } = pageOf(input, meta, 25);
      const poolWhere = and(isNull(lead.agencyId), eq(lead.status, 'verified'));
      const fetched = await deps.service.select().from(lead).where(poolWhere).orderBy(desc(lead.createdAt), asc(lead.id)).limit(limit + 1).offset(offset);
      const { rows, nextCursor } = pageResult(fetched, limit, offset);
      const [{ n: total } = { n: 0 }] = await deps.service.select({ n: count() }).from(lead).where(poolWhere);
      const agencies = await deps.service
        .select({
          id: agency.id,
          name: agency.name,
          verticals: sql<string[]>`coalesce(array_agg(distinct ${client.verticalId}) filter (where ${client.status} = 'active'), '{}')`,
          activeClients: sql<number>`(count(${client.id}) filter (where ${client.status} = 'active'))::int`,
        })
        .from(agency)
        .leftJoin(client, and(eq(client.agencyId, agency.id), isNull(client.archivedAt)))
        .where(agencyServiceable(agency.id))
        .groupBy(agency.id, agency.name)
        .orderBy(asc(agency.name));
      const assigned = await deps.service
        .select({ leadId: lead.id, lookup: lead.lookup, agencyName: agency.name, assignedAt: lead.assignedAt })
        .from(lead)
        .innerJoin(agency, eq(agency.id, lead.agencyId))
        .where(and(eq(lead.source, 'platform'), isNotNull(lead.assignedAt), isNull(agency.archivedAt)))
        .orderBy(desc(lead.assignedAt))
        .limit(20);
      return {
        nextCursor, prevCursor: prevCursorOf(offset, limit), total,
        recentAssignments: assigned.map((r) => ({ leadId: r.leadId, businessName: r.lookup.title, agencyName: r.agencyName, assignedAt: r.assignedAt! })),
        leads: rows.map((r) => ({
          id: r.id, ref: r.ref, businessName: r.lookup.title, address: r.lookup.address, city: r.lookup.city, category: r.lookup.category,
          contactName: r.contactName, email: r.email, phone: r.phone, message: r.message, preview: r.preview, createdAt: r.createdAt, verifiedAt: r.verifiedAt, declinedBack: r.decidedAt !== null,
        })),
        agencies,
      };
    });
  },
});

export const assignLeadTool = defineTool({
  name: 'assign_lead',
  access: 'write',
  description: 'Platform operators: give a pool lead to an agency. The agency is notified by email.',
  input: z.object({ leadId: z.string().uuid(), agencyId: z.string().uuid() }),
  output: z.object({ ok: z.literal(true) }),
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'staff', 'assign_lead', input, async () => {
      await deps.service.transaction(async (tx) => {
        const [row] = await tx.select().from(lead).where(and(eq(lead.id, input.leadId), isNull(lead.agencyId), eq(lead.status, 'verified'))).for('update');
        if (!row) throw new ToolError('not_found', 'Lead not found');
        const [target] = await tx.select({ id: agency.id }).from(agency).where(and(eq(agency.id, input.agencyId), agencyServiceable(agency.id)));
        if (!target) throw new ToolError('not_found', 'Agency not found');
        // The target may already hold this visitor (same email + place) from its own link: lead_dedupe_idx would collide.
        const [twin] = await tx
          .select({ id: lead.id })
          .from(lead)
          .where(and(
            eq(lead.agencyId, input.agencyId), inArray(lead.status, ['unverified', 'verified']),
            sql`lower(${lead.email}) = lower(${row.email})`, sql`${lead.lookup}->>'placeId' = ${row.lookup.placeId}`,
          ));
        if (twin) throw new ToolError('conflict', 'This agency already has this lead.', { userFacing: true });
        const now = new Date();
        // decided_* belongs to the agency that declined it back (pool marker only); the new agency must not see it.
        await tx.update(lead).set({ agencyId: input.agencyId, assignedBy: ctx.userId, assignedAt: now, agencyNotifiedAt: null, decidedBy: null, decidedAt: null, updatedAt: now }).where(eq(lead.id, row.id));
      });
      await sendAfterCommit(deps, input.leadId, 'agency_new');
      return { ok: true as const };
    });
  },
});

export const platformLeadTools = [listPoolLeadsTool, assignLeadTool];
