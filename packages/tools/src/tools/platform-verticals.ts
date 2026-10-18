import { type AccessContext, toolkit, ToolError } from '@cs/core';
import { agency, businessArea, client, llmCall, vertical } from '@cs/db';
import { GENERIC_VERTICAL_ID } from '@cs/verticals';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { catalogOf } from '../catalog/access';
import { mergeAreaTx, mergeVerticalTx } from '../catalog/merge';
import type { ToolDeps } from '../deps';
import { type PlatformRole, requirePlatformOperator } from '../platform';
import { withPlatformAudit } from '../platform/audit';
import { lockCatalogue, refuseClientDataFor } from './verticals';

/**
 * Phase 14a Task 10: operators review the global vertical catalogue (approve, rename, merge). Same pattern as platform-leads.ts:
 * role check first (a refusal never reaches the audit log), then the body under one platform audit row. Every write takes the
 * catalogue lock first so it serialises with create_vertical / add_business_area.
 */
const { defineTool } = toolkit<ToolDeps>();

async function operate<T>(deps: ToolDeps, ctx: AccessContext, min: PlatformRole, tool: string, input: unknown, fn: () => Promise<T>): Promise<T> {
  const role = await requirePlatformOperator(deps, ctx, min);
  return withPlatformAudit(deps, ctx, { tool, input, role }, fn);
}

const idSchema = z.string().min(1).max(40);
const aliasesSchema = z.array(z.string().trim().min(1).max(80)).max(8);
const Creator = z.object({ agencyId: z.string(), name: z.string() }).nullable();

export const listCatalogReviewTool = defineTool({
  name: 'list_catalog_review',
  access: 'read',
  description: 'Platform operators: business types and business areas agencies added that still wait for review, with who added them, how many clients use them and the evidence.',
  input: z.object({}),
  output: z.object({
    verticals: z.array(z.object({
      id: z.string(), name: z.string(), status: z.enum(['reviewed', 'unreviewed', 'merged']),
      services: z.array(z.object({ id: z.string(), name: z.string() })),
      createdBy: Creator, clientCount: z.number().int(), evidence: z.unknown(), draftCostUsd: z.number().nullable(), categories: z.array(z.string()),
    })),
    areas: z.array(z.object({
      verticalId: z.string(), verticalName: z.string(), id: z.string(), name: z.string(), aliases: z.array(z.string()),
      createdBy: Creator, clientCount: z.number().int(), evidence: z.unknown(),
    })),
    count: z.number().int(),
  }),
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'viewer', 'list_catalog_review', input, async () => {
      const db = deps.service;
      const names = new Map((await db.select({ id: agency.id, name: agency.name }).from(agency)).map((a) => [a.id, a.name]));
      const creator = (id: string | null) => (id ? { agencyId: id, name: names.get(id) ?? '' } : null);
      const verticals = await db.select().from(vertical).where(and(ne(vertical.status, 'merged'), ne(vertical.id, GENERIC_VERTICAL_ID))).orderBy(asc(vertical.createdAt));
      const areas = await db.select().from(businessArea).where(ne(businessArea.status, 'merged')).orderBy(asc(businessArea.createdAt));
      const clientsOf = new Map<string, number>();
      for (const r of await db.select({ v: client.verticalId, n: sql<number>`count(*)::int` }).from(client).groupBy(client.verticalId)) clientsOf.set(r.v, r.n);
      const areaClients = new Map<string, number>();
      const usage = await db.execute<{ v: string; s: string; n: number }>(sql`select c.vertical_id as v, e as s, count(*)::int as n from client c, jsonb_array_elements_text(c.services) as e group by 1, 2`);
      for (const r of usage) areaClients.set(`${r.v}/${r.s}`, r.n);
      const costs = new Map<string, number>();
      for (const r of await db.select({ v: llmCall.verticalId, c: sql<number>`sum(${llmCall.costUsd})::float8` }).from(llmCall)
        .where(and(eq(llmCall.task, 'vertical_draft'), inArray(llmCall.verticalId, verticals.map((v) => v.id)))).groupBy(llmCall.verticalId)) costs.set(r.v!, r.c);

      const pending = verticals.filter((v) => v.status === 'unreviewed');
      const pendingAreas = areas.filter((a) => a.status === 'unreviewed' && verticals.some((v) => v.id === a.verticalId && v.status === 'reviewed'));
      const nameOf = new Map(verticals.map((v) => [v.id, v.name]));
      return {
        verticals: pending.map((v) => ({
          id: v.id, name: v.name, status: v.status,
          services: areas.filter((a) => a.verticalId === v.id).map((a) => ({ id: a.id, name: a.name })),
          createdBy: creator(v.createdByAgencyId), clientCount: clientsOf.get(v.id) ?? 0, evidence: v.draftEvidence ?? null,
          draftCostUsd: costs.get(v.id) ?? null, categories: [...v.gbpCategories, ...v.gbpRelatedCategories],
        })),
        areas: pendingAreas.map((a) => ({
          verticalId: a.verticalId, verticalName: nameOf.get(a.verticalId) ?? a.verticalId, id: a.id, name: a.name, aliases: a.aliases,
          createdBy: creator(a.createdByAgencyId), clientCount: areaClients.get(`${a.verticalId}/${a.id}`) ?? 0, evidence: a.evidence ?? null,
        })),
        count: pending.length + pendingAreas.length,
      };
    });
  },
});

export const reviewVerticalTool = defineTool({
  name: 'review_vertical',
  access: 'write',
  description: 'Platform staff: approve a business type (and the areas it came with) or rename it. The id never changes.',
  input: z.object({ verticalId: idSchema, action: z.enum(['approve', 'rename']), name: z.string().trim().min(2).max(60).optional() }),
  output: z.object({ verticalId: z.string(), version: z.number().int() }),
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'staff', 'review_vertical', input, async () => {
      if (input.action === 'rename' && !input.name) throw new ToolError('invalid_input', 'Enter the new name.', { userFacing: true });
      const out = await deps.service.transaction(async (tx) => {
        await lockCatalogue(tx);
        const [v] = await tx.select().from(vertical).where(eq(vertical.id, input.verticalId)).for('update');
        if (!v || v.id === GENERIC_VERTICAL_ID || v.status === 'merged') throw new ToolError('not_found', 'Business type not found');
        const now = new Date();
        if (input.action === 'approve') {
          await tx.update(vertical).set({ status: 'reviewed', reviewedAt: now, reviewedBy: ctx.userId, updatedAt: now }).where(eq(vertical.id, v.id));
          await tx.update(businessArea).set({ status: 'reviewed', reviewedAt: now }).where(and(eq(businessArea.verticalId, v.id), eq(businessArea.status, 'unreviewed')));
          return { verticalId: v.id, version: v.version };
        }
        await refuseClientDataFor(deps, v.createdByAgencyId, [input.name!]);
        const version = v.version + 1;
        await tx.update(vertical).set({ name: input.name!, version, updatedAt: now }).where(eq(vertical.id, v.id));
        return { verticalId: v.id, version };
      });
      catalogOf(deps).invalidate();
      return out;
    });
  },
});

export const reviewBusinessAreaTool = defineTool({
  name: 'review_business_area',
  access: 'write',
  description: 'Platform staff: approve a business area an agency added, or rename it (and set its aliases). The id never changes.',
  input: z.object({ verticalId: idSchema, areaId: idSchema, action: z.enum(['approve', 'rename']), name: z.string().trim().min(2).max(80).optional(), aliases: aliasesSchema.optional() }),
  output: z.object({ ok: z.literal(true) }),
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'staff', 'review_business_area', input, async () => {
      if (input.action === 'rename' && !input.name) throw new ToolError('invalid_input', 'Enter the new name.', { userFacing: true });
      await deps.service.transaction(async (tx) => {
        await lockCatalogue(tx);
        const [v] = await tx.select().from(vertical).where(eq(vertical.id, input.verticalId)).for('update');
        const [a] = await tx.select().from(businessArea).where(and(eq(businessArea.verticalId, input.verticalId), eq(businessArea.id, input.areaId))).for('update');
        if (!v || v.status === 'merged' || !a || a.status === 'merged') throw new ToolError('not_found', 'Business area not found');
        const now = new Date();
        const where = and(eq(businessArea.verticalId, a.verticalId), eq(businessArea.id, a.id));
        if (input.action === 'approve') {
          await tx.update(businessArea).set({ status: 'reviewed', reviewedAt: now }).where(where);
          return;
        }
        await refuseClientDataFor(deps, a.createdByAgencyId, [input.name!, ...(input.aliases ?? [])]);
        // Pack content changed: bump the version so downstream caches re-read it.
        await tx.update(businessArea).set({ name: input.name!, ...(input.aliases ? { aliases: input.aliases } : {}) }).where(where);
        await tx.update(vertical).set({ version: v.version + 1, updatedAt: now }).where(eq(vertical.id, v.id));
      });
      catalogOf(deps).invalidate();
      return { ok: true as const };
    });
  },
});

export const mergeVerticalTool = defineTool({
  name: 'merge_vertical',
  access: 'write',
  description: 'Platform staff: merge one business type into another. Clients, events, prices and agency settings move to the target; the old id keeps resolving to it.',
  input: z.object({ sourceId: idSchema, targetId: idSchema, areaMap: z.record(z.string(), z.string().nullable()) }),
  output: z.object({ clientsMoved: z.number().int() }),
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'staff', 'merge_vertical', input, async () => {
      const out = await deps.service.transaction(async (tx) => {
        await lockCatalogue(tx);
        return mergeVerticalTx(tx, input.sourceId, input.targetId, input.areaMap);
      });
      catalogOf(deps).invalidate();
      return out;
    });
  },
});

export const mergeBusinessAreaTool = defineTool({
  name: 'merge_business_area',
  access: 'write',
  description: 'Platform staff: merge one business area into another inside the same business type. Clients, events and prices move to the target area.',
  input: z.object({ verticalId: idSchema, sourceAreaId: idSchema, targetAreaId: idSchema }),
  output: z.object({ clientsMoved: z.number().int() }),
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'staff', 'merge_business_area', input, async () => {
      const out = await deps.service.transaction(async (tx) => {
        await lockCatalogue(tx);
        return mergeAreaTx(tx, input.verticalId, input.sourceAreaId, input.targetAreaId);
      });
      catalogOf(deps).invalidate();
      return out;
    });
  },
});

export const platformVerticalTools = [listCatalogReviewTool, reviewVerticalTool, reviewBusinessAreaTool, mergeVerticalTool, mergeBusinessAreaTool];
