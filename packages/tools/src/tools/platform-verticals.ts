import { type AccessContext, toolkit, ToolError } from '@cs/core';
import { agency, businessArea, client, llmCall, type Tx, vertical } from '@cs/db';
import { assemblePack, type BusinessAreaRow, CITATION_GROUPS, GENERIC_VERTICAL_ID, type VerticalRow } from '@cs/verticals';
import { and, asc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
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
const strings = (x: unknown): string[] => (Array.isArray(x) ? x.filter((e): e is string => typeof e === 'string') : []);
const groupsOf = (config: unknown): string[] => {
  const g = (config as { citations?: { groups?: unknown } } | null)?.citations?.groups;
  return Array.isArray(g) ? g.filter((e): e is string => typeof e === 'string') : [];
};
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
      /** What the Edit form starts from (update_vertical leaves omitted fields unchanged, so the form sends back what it shows). */
      detail: z.object({
        audienceNoun: z.string(), seedKeywords: z.array(z.string()), primaryCategories: z.array(z.string()), relatedCategories: z.array(z.string()),
        topics: z.array(z.string()), areas: z.array(z.object({ id: z.string(), name: z.string(), aliases: z.array(z.string()) })),
      }),
      /** The directory groups the type checks now (its own pick, else the generic default). */
      citationGroups: z.array(z.enum(CITATION_GROUPS)),
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
      // 7a2 D16: archived clients are deleted, so they do not count as users of an entry.
      for (const r of await db.select({ v: client.verticalId, n: sql<number>`count(*)::int` }).from(client).where(isNull(client.archivedAt)).groupBy(client.verticalId)) clientsOf.set(r.v, r.n);
      const areaClients = new Map<string, number>();
      const usage = await db.execute<{ v: string; s: string; n: number }>(sql`select c.vertical_id as v, e as s, count(*)::int as n from client c, jsonb_array_elements_text(c.services) as e where c.archived_at is null group by 1, 2`);
      for (const r of usage) areaClients.set(`${r.v}/${r.s}`, r.n);
      const costs = new Map<string, number>();
      for (const r of await db.select({ v: llmCall.verticalId, c: sql<number>`sum(${llmCall.costUsd})::float8` }).from(llmCall)
        .where(and(eq(llmCall.task, 'vertical_draft'), inArray(llmCall.verticalId, verticals.map((v) => v.id)))).groupBy(llmCall.verticalId)) costs.set(r.v!, r.c);

      const [generic] = await db.select({ config: vertical.config }).from(vertical).where(eq(vertical.id, GENERIC_VERTICAL_ID));
      const pending = verticals.filter((v) => v.status === 'unreviewed');
      const pendingAreas = areas.filter((a) => a.status === 'unreviewed' && verticals.some((v) => v.id === a.verticalId && v.status === 'reviewed'));
      const nameOf = new Map(verticals.map((v) => [v.id, v.name]));
      return {
        verticals: pending.map((v) => ({
          id: v.id, name: v.name, status: v.status,
          services: areas.filter((a) => a.verticalId === v.id).map((a) => ({ id: a.id, name: a.name })),
          createdBy: creator(v.createdByAgencyId), clientCount: clientsOf.get(v.id) ?? 0, evidence: v.draftEvidence ?? null,
          draftCostUsd: costs.get(v.id) ?? null, categories: [...v.gbpCategories, ...v.gbpRelatedCategories],
          citationGroups: CITATION_GROUPS.filter((g) => (groupsOf(v.config).length ? groupsOf(v.config) : groupsOf(generic?.config)).includes(g)),
          detail: {
            audienceNoun: typeof v.config.audience_noun === 'string' ? v.config.audience_noun : '',
            seedKeywords: strings((v.config.discovery as { seed_keywords?: unknown } | undefined)?.seed_keywords),
            primaryCategories: v.gbpCategories, relatedCategories: v.gbpRelatedCategories,
            topics: Array.isArray(v.config.topics) ? (v.config.topics as { name?: unknown }[]).flatMap((t) => (typeof t.name === 'string' ? [t.name] : [])) : [],
            areas: areas.filter((a) => a.verticalId === v.id && a.status !== 'merged').map((a) => ({ id: a.id, name: a.name, aliases: a.aliases })),
          },
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

/**
 * The nav badge: the same two sets as `list_catalog_review` (unreviewed non-merged types except generic, plus unreviewed areas of reviewed types) as two
 * `count(*)` queries. Deliberately unaudited and cheap: the shell calls it on every operator page, like the Leads badge. It returns a number only.
 */
export const countCatalogReviewTool = defineTool({
  name: 'count_catalog_review',
  access: 'read',
  description: 'Platform operators: how many business types and areas wait for review (for the sidebar badge).',
  input: z.object({}),
  output: z.object({ count: z.number().int() }),
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, _input, deps) {
    try {
      await requirePlatformOperator(deps, ctx, 'viewer');
    } catch (e) {
      // The shell calls this for operators only; anyone else is told it doesn't exist, like an unknown tool.
      if (e instanceof ToolError && e.code === 'permission_denied') throw new ToolError('not_found', 'Unknown tool: count_catalog_review');
      throw e;
    }
    const db = deps.service;
    const [v] = await db.select({ n: sql<number>`count(*)::int` }).from(vertical).where(and(eq(vertical.status, 'unreviewed'), ne(vertical.id, GENERIC_VERTICAL_ID)));
    const [a] = await db.select({ n: sql<number>`count(*)::int` }).from(businessArea)
      .innerJoin(vertical, eq(vertical.id, businessArea.verticalId))
      .where(and(eq(businessArea.status, 'unreviewed'), eq(vertical.status, 'reviewed'), ne(vertical.id, GENERIC_VERTICAL_ID)));
    return { count: (v?.n ?? 0) + (a?.n ?? 0) };
  },
});

/** `config` with `citations.groups` set (a merge, so the rest of `citations` stays); throws `invalid_input` when the assembled pack would not validate. */
async function groupsConfig(tx: Tx, v: typeof vertical.$inferSelect, groups: string[]): Promise<Record<string, unknown>> {
  const citations = (v.config.citations && typeof v.config.citations === 'object' ? v.config.citations : {}) as Record<string, unknown>;
  const config = { ...v.config, citations: { ...citations, groups } };
  const [g] = await tx.select().from(vertical).where(eq(vertical.id, GENERIC_VERTICAL_ID));
  if (!g) throw new ToolError('internal', 'Vertical catalogue has no generic row');
  const rowOf = (x: typeof vertical.$inferSelect): VerticalRow => ({
    id: x.id, name: x.name, status: x.status, mergedInto: x.mergedInto, version: x.version, gbpCategories: x.gbpCategories, gbpRelatedCategories: x.gbpRelatedCategories,
    config: x.config, draftEvidence: x.draftEvidence ?? null, createdByAgencyId: x.createdByAgencyId,
  });
  const areas: BusinessAreaRow[] = (await tx.select().from(businessArea).where(eq(businessArea.verticalId, v.id))).map((a) => ({
    verticalId: a.verticalId, id: a.id, name: a.name, aliases: a.aliases, status: a.status, mergedInto: a.mergedInto, evidence: a.evidence ?? null, createdByAgencyId: a.createdByAgencyId,
  }));
  try {
    assemblePack({ ...rowOf(v), config }, areas, rowOf(g));
  } catch {
    throw new ToolError('invalid_input', 'Pick fewer directory groups (15 directories at most).', { userFacing: true });
  }
  return config;
}

export const reviewVerticalTool = defineTool({
  name: 'review_vertical',
  access: 'write',
  description: 'Platform staff: approve a business type (and the areas it came with), rename it, or pick the directory groups its listings check covers. The id never changes.',
  input: z.object({
    verticalId: idSchema, action: z.enum(['approve', 'rename', 'groups']), name: z.string().trim().min(2).max(60).optional(),
    citationGroups: z.array(z.enum(CITATION_GROUPS)).min(1).optional(),
  }),
  output: z.object({ verticalId: z.string(), version: z.number().int() }),
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'staff', 'review_vertical', input, async () => {
      if (input.action === 'rename' && !input.name) throw new ToolError('invalid_input', 'Enter the new name.', { userFacing: true });
      if (input.action === 'groups' && !input.citationGroups) throw new ToolError('invalid_input', 'Pick at least one directory group.', { userFacing: true });
      const out = await deps.service.transaction(async (tx) => {
        await lockCatalogue(tx);
        const [v] = await tx.select().from(vertical).where(eq(vertical.id, input.verticalId)).for('update');
        if (!v || v.id === GENERIC_VERTICAL_ID || v.status === 'merged') throw new ToolError('not_found', 'Business type not found');
        const now = new Date();
        const groups = input.action === 'rename' ? undefined : input.citationGroups;
        // Groups: the assembled pack must still pass the schema (at most 15 directories) before anything is written.
        const config = groups ? await groupsConfig(tx, v, groups) : v.config;
        const version = groups ? v.version + 1 : v.version;
        if (input.action === 'approve') {
          await tx.update(vertical).set({ status: 'reviewed', reviewedAt: now, reviewedBy: ctx.userId, updatedAt: now, ...(groups ? { config, version } : {}) }).where(eq(vertical.id, v.id));
          await tx.update(businessArea).set({ status: 'reviewed', reviewedAt: now }).where(and(eq(businessArea.verticalId, v.id), eq(businessArea.status, 'unreviewed')));
          return { verticalId: v.id, version };
        }
        if (input.action === 'groups') {
          await tx.update(vertical).set({ config, version, updatedAt: now }).where(eq(vertical.id, v.id));
          return { verticalId: v.id, version };
        }
        await refuseClientDataFor(deps, v.createdByAgencyId, [input.name!]);
        const renamed = v.version + 1;
        await tx.update(vertical).set({ name: input.name!, version: renamed, updatedAt: now }).where(eq(vertical.id, v.id));
        return { verticalId: v.id, version: renamed };
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

export const platformVerticalTools = [listCatalogReviewTool, countCatalogReviewTool, reviewVerticalTool, reviewBusinessAreaTool, mergeVerticalTool, mergeBusinessAreaTool];
