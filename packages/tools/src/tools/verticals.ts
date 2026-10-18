import { redactContactInfo } from '@cs/collectors';
import { type AccessContext, toolkit, ToolError } from '@cs/core';
import { businessArea, client, llmCall, type Tx, vertical, verticalCategory, verticalDraft } from '@cs/db';
import { assemblePack, type BusinessAreaRow, GENERIC_VERTICAL_ID, normaliseName, similarVerticals, type VerticalRow } from '@cs/verticals';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { catalogOf } from '../catalog/access';
import type { ToolDeps } from '../deps';

const { defineTool } = toolkit<ToolDeps>();

const MAX_AREAS = 255;
const aliasesSchema = z.array(z.string().trim().min(1).max(80)).max(8);
const areaInput = z.object({ name: z.string().trim().min(2).max(80), aliases: aliasesSchema.optional() });
const categoriesSchema = z.array(z.string().trim().min(1).max(120));
const themeInput = z.object({ name: z.string().trim().min(2).max(80), description: z.string().trim().max(300).optional() });
const seedKeywordsSchema = z.array(z.string().trim().min(2).max(60)).max(5);
const audienceNounSchema = z.string().trim().min(1).max(40);

/** redactContactInfo covers email and phone; web addresses are caught here. */
const WEB_ADDRESS = /https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|io|co|us|biz|info|app|dev|ai|ca|uk)\b/i;
const NO_CLIENT_DATA = 'Names cannot include a client’s business name, phone number, email or web address.';

/** One small gate for "may this caller change this vertical": the creating agency while it is unreviewed. Task 10 extends it to platform staff. */
function canEditVertical(ctx: AccessContext, row: Pick<VerticalRow, 'status' | 'createdByAgencyId'>): boolean {
  return row.status === 'unreviewed' && row.createdByAgencyId === ctx.agencyId;
}

function requireAgencyStaff(ctx: AccessContext): void {
  if (ctx.role !== 'agency_admin' && ctx.role !== 'account_manager') throw new ToolError('permission_denied', 'Only agency staff change business types');
}

/** D3 "no client data in names": refuse contact details or any of this agency's client names inside catalogue text. */
async function refuseClientData(deps: ToolDeps, ctx: AccessContext, texts: readonly string[]): Promise<void> {
  const clientNames = (await deps.service.select({ name: client.name }).from(client).where(eq(client.agencyId, ctx.agencyId)))
    .map((c) => c.name.trim().toLowerCase())
    .filter((n) => n.length >= 3);
  for (const t of texts) {
    const lc = t.toLowerCase();
    if (redactContactInfo(t) !== t || WEB_ADDRESS.test(t) || clientNames.some((n) => lc.includes(n))) throw new ToolError('invalid_input', NO_CLIENT_DATA, { userFacing: true });
  }
}

const snake = (s: string): string => s.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/** A valid catalogue id (`^[a-z][a-z0-9_]{1,39}$`) from a display name, or null when the name has nothing usable. */
function slugOf(name: string, generic: 'drop' | 'keep'): string | null {
  const base = snake(generic === 'drop' ? normaliseName(name) : name).slice(0, 40).replace(/_+$/, '');
  if (base.length < 2) return null;
  return /^[0-9]/.test(base) ? `v_${base}`.slice(0, 40).replace(/_+$/, '') : base;
}

/** `slug`, then `slug_2`, `slug_3`… until `taken` no longer holds it. */
function uniqueSlug(slug: string, taken: ReadonlySet<string>): string {
  if (!taken.has(slug)) return slug;
  for (let n = 2; ; n++) {
    const suffix = `_${n}`;
    const candidate = `${slug.slice(0, 40 - suffix.length)}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

const lcList = (xs: readonly string[] | undefined): string[] => [...new Set((xs ?? []).map((x) => x.trim().toLowerCase()).filter(Boolean))];

/** Categories another vertical owns are dropped (a category belongs to exactly one vertical); a category listed as both primary and related stays primary. */
async function splitCategories(
  tx: Tx, ownerId: string, primary: string[], related: string[],
): Promise<{ primary: string[]; related: string[]; dropped: string[] }> {
  const wanted = [...new Set([...primary, ...related])];
  const owned = wanted.length
    ? new Set((await tx.select({ c: verticalCategory.categoryLc }).from(verticalCategory).where(and(inArray(verticalCategory.categoryLc, wanted), ne(verticalCategory.verticalId, ownerId)))).map((r) => r.c))
    : new Set<string>();
  const keptPrimary = primary.filter((c) => !owned.has(c));
  const keptRelated = related.filter((c) => !owned.has(c) && !keptPrimary.includes(c));
  return { primary: keptPrimary, related: keptRelated, dropped: wanted.filter((c) => owned.has(c)) };
}

async function writeCategories(tx: Tx, verticalId: string, primary: string[], related: string[]): Promise<void> {
  await tx.delete(verticalCategory).where(eq(verticalCategory.verticalId, verticalId));
  const rows = [...primary.map((c) => ({ categoryLc: c, verticalId, kind: 'primary' as const })), ...related.map((c) => ({ categoryLc: c, verticalId, kind: 'related' as const }))];
  if (!rows.length) return;
  const inserted = await tx.insert(verticalCategory).values(rows).onConflictDoNothing().returning({ c: verticalCategory.categoryLc });
  // A concurrent create claimed one of them between our check and this insert: roll back, the caller retries and sees it dropped.
  if (inserted.length !== rows.length) throw new ToolError('conflict', 'Another business type just claimed one of those categories. Try again.', { userFacing: true });
}

async function genericRow(tx: Tx): Promise<VerticalRow> {
  const [g] = await tx.select().from(vertical).where(eq(vertical.id, GENERIC_VERTICAL_ID));
  if (!g) throw new ToolError('internal', 'Vertical catalogue has no generic row');
  return toRow(g);
}

const toRow = (v: typeof vertical.$inferSelect): VerticalRow => ({
  id: v.id, name: v.name, status: v.status, mergedInto: v.mergedInto, version: v.version, gbpCategories: v.gbpCategories, gbpRelatedCategories: v.gbpRelatedCategories,
  config: v.config, draftEvidence: v.draftEvidence ?? null, createdByAgencyId: v.createdByAgencyId,
});

const toAreaRow = (a: typeof businessArea.$inferSelect): BusinessAreaRow => ({
  verticalId: a.verticalId, id: a.id, name: a.name, aliases: a.aliases, status: a.status, mergedInto: a.mergedInto, evidence: a.evidence ?? null, createdByAgencyId: a.createdByAgencyId,
});

/** The same rule for create and update: the assembled pack must pass the pack schema, else nothing is written. */
function assertValidPack(row: VerticalRow, areas: BusinessAreaRow[], generic: VerticalRow): void {
  try {
    assemblePack(row, areas, generic);
  } catch (e) {
    const detail = e instanceof Error ? e.message.split('\n').slice(1).join('; ').trim() : '';
    throw new ToolError('invalid_input', `That business type is not complete enough to save${detail ? `: ${detail}` : '.'}`);
  }
}

function buildConfig(base: Record<string, unknown>, input: { audienceNoun?: string | undefined; seedKeywords?: string[] | undefined; themes?: { name: string; description?: string | undefined }[] | undefined }): Record<string, unknown> {
  const config = { ...base };
  if (input.audienceNoun !== undefined) config.audience_noun = input.audienceNoun;
  if (input.themes !== undefined) {
    const taken = new Set<string>();
    config.themes = input.themes.map((t) => {
      const id = uniqueSlug(slugOf(t.name, 'keep') ?? 'theme', taken);
      taken.add(id);
      return { id, name: t.name, description: t.description || t.name };
    });
  }
  if (input.seedKeywords !== undefined) {
    const discovery = typeof config.discovery === 'object' && config.discovery !== null ? (config.discovery as Record<string, unknown>) : {};
    config.discovery = { ...discovery, seed_keywords: input.seedKeywords };
  }
  return config;
}

/**
 * Adds one `unreviewed` business area to a vertical, attributed to the agency. Idempotent by normalised name (returns the existing area).
 * Runs on a transaction handle so `save_setup_profile` can reuse it inside its own transaction; the caller invalidates the catalogue.
 */
export async function addBusinessAreaCore(tx: Tx, args: { verticalId: string; name: string; aliases?: readonly string[] | undefined; agencyId: string }): Promise<{ verticalId: string; areaId: string }> {
  const [v] = await tx.select({ id: vertical.id, status: vertical.status }).from(vertical).where(eq(vertical.id, args.verticalId));
  if (!v || v.id === GENERIC_VERTICAL_ID || v.status === 'merged') throw new ToolError('invalid_input', `Unknown business type: ${args.verticalId}`);
  const areas = await tx.select().from(businessArea).where(eq(businessArea.verticalId, v.id));
  const key = normaliseName(args.name);
  const same = areas.find((a) => a.status !== 'merged' && normaliseName(a.name) === key);
  if (same) return { verticalId: v.id, areaId: same.id };
  if (areas.filter((a) => a.status !== 'merged').length >= MAX_AREAS) throw new ToolError('invalid_input', 'This business type has too many areas already.');
  const slug = slugOf(args.name, 'keep');
  if (!slug) throw new ToolError('invalid_input', 'Use a more specific area name.');
  const areaId = uniqueSlug(slug, new Set(areas.map((a) => a.id)));
  await tx.insert(businessArea).values({ verticalId: v.id, id: areaId, name: args.name, aliases: [...(args.aliases ?? [])], status: 'unreviewed', createdByAgencyId: args.agencyId });
  return { verticalId: v.id, areaId };
}

export const listVerticals = defineTool({
  name: 'list_verticals',
  access: 'read',
  description: 'The business types in the catalogue and the areas each covers.',
  input: z.object({}),
  output: z.object({
    verticals: z.array(z.object({
      id: z.string(), name: z.string(), status: z.enum(['reviewed', 'unreviewed', 'merged']),
      services: z.array(z.object({ id: z.string(), name: z.string() })),
    })),
  }),
  permission: 'read',
  channels: ['web', 'mcp', 'ask'],
  async handler(_ctx, _input, deps) {
    return { verticals: await catalogOf(deps).list() };
  },
});

export const createVertical = defineTool({
  name: 'create_vertical',
  access: 'write',
  description: 'Add a new business type to the catalogue with its areas and Google categories (agency admins and account managers). It stays unreviewed until the platform team checks it.',
  input: z.object({
    name: z.string().trim().min(2).max(60),
    areas: z.array(areaInput).min(1).max(20),
    audienceNoun: audienceNounSchema.optional(),
    seedKeywords: seedKeywordsSchema.optional(),
    categories: categoriesSchema.min(1).max(10),
    relatedCategories: categoriesSchema.max(10).optional(),
    themes: z.array(themeInput).max(12).optional(),
    draftPlaceId: z.string().max(300).optional(),
  }),
  output: z.object({ verticalId: z.string(), droppedCategories: z.array(z.string()) }),
  permission: 'manage',
  async handler(ctx, input, deps) {
    requireAgencyStaff(ctx);
    await refuseClientData(deps, ctx, [input.name, ...input.areas.flatMap((a) => [a.name, ...(a.aliases ?? [])]), ...(input.themes ?? []).map((t) => t.name)]);
    const slug = slugOf(input.name, 'drop');
    if (!slug) throw new ToolError('invalid_input', 'Use a more specific business type name.', { userFacing: true });

    const result = await deps.service.transaction(async (tx) => {
      const all = await tx.select().from(vertical);
      const mine = all.find((v) => v.id === slug);
      if (mine && mine.status === 'unreviewed' && mine.createdByAgencyId === ctx.agencyId) return { verticalId: mine.id, droppedCategories: [] as string[] };
      const similar = similarVerticals(input.name, all.filter((v) => v.status !== 'merged' && v.id !== GENERIC_VERTICAL_ID).map((v) => ({ id: v.id, name: v.name, categories: v.gbpCategories })), 1);
      if (similar[0]) throw new ToolError('conflict', `A similar business type already exists: ${similar[0].name}.`, { userFacing: true });
      const id = uniqueSlug(slug, new Set(all.map((v) => v.id)));

      const cats = await splitCategories(tx, id, lcList(input.categories), lcList(input.relatedCategories));
      if (cats.primary.length === 0) throw new ToolError('invalid_input', 'Add at least one Google category that no other business type uses.', { userFacing: true });

      const areaIds = new Set<string>();
      const areas: BusinessAreaRow[] = input.areas.map((a) => {
        const areaId = uniqueSlug(slugOf(a.name, 'keep') ?? 'area', areaIds);
        areaIds.add(areaId);
        return { verticalId: id, id: areaId, name: a.name, aliases: a.aliases ?? [], status: 'unreviewed', mergedInto: null, evidence: null, createdByAgencyId: ctx.agencyId };
      });

      let draftEvidence: unknown = null;
      if (input.draftPlaceId) {
        const [d] = await tx.select({ draft: verticalDraft.draft }).from(verticalDraft).where(and(eq(verticalDraft.placeId, input.draftPlaceId), eq(verticalDraft.agencyId, ctx.agencyId)));
        draftEvidence = d?.draft ?? null;
      }

      const generic = await genericRow(tx);
      const row: VerticalRow = {
        id, name: input.name, status: 'unreviewed', mergedInto: null, version: 1, gbpCategories: cats.primary, gbpRelatedCategories: cats.related,
        config: buildConfig({}, input), draftEvidence, createdByAgencyId: ctx.agencyId,
      };
      assertValidPack(row, areas, generic);

      await tx.insert(vertical).values({
        id, name: row.name, status: 'unreviewed', version: 1, gbpCategories: row.gbpCategories, gbpRelatedCategories: row.gbpRelatedCategories,
        config: row.config, draftEvidence, createdByAgencyId: ctx.agencyId,
      });
      await tx.insert(businessArea).values(areas.map((a) => ({ verticalId: id, id: a.id, name: a.name, aliases: a.aliases, status: 'unreviewed' as const, createdByAgencyId: ctx.agencyId })));
      await writeCategories(tx, id, cats.primary, cats.related);
      if (input.draftPlaceId) await tx.update(llmCall).set({ verticalId: id }).where(eq(llmCall.verticalId, `draft:${input.draftPlaceId}`));
      return { verticalId: id, droppedCategories: cats.dropped };
    });
    catalogOf(deps).invalidate();
    return result;
  },
});

export const addBusinessAreaTool = defineTool({
  name: 'add_business_area',
  access: 'write',
  description: 'Add a business area to an existing business type (agency admins and account managers). It stays unreviewed until the platform team checks it.',
  input: z.object({ verticalId: z.string().max(40), name: z.string().trim().min(2).max(80), aliases: aliasesSchema.optional() }),
  output: z.object({ verticalId: z.string(), areaId: z.string() }),
  permission: 'manage',
  async handler(ctx, input, deps) {
    requireAgencyStaff(ctx);
    await refuseClientData(deps, ctx, [input.name, ...(input.aliases ?? [])]);
    const out = await deps.service.transaction((tx) => addBusinessAreaCore(tx, { verticalId: input.verticalId, name: input.name, aliases: input.aliases, agencyId: ctx.agencyId }));
    catalogOf(deps).invalidate();
    return out;
  },
});

export const updateVertical = defineTool({
  name: 'update_vertical',
  access: 'write',
  description: 'Edit a business type your agency created, until the platform team has reviewed it.',
  input: z.object({
    verticalId: z.string().max(40),
    name: z.string().trim().min(2).max(60).optional(),
    audienceNoun: audienceNounSchema.optional(),
    seedKeywords: seedKeywordsSchema.optional(),
    categories: categoriesSchema.min(1).max(10).optional(),
    relatedCategories: categoriesSchema.max(10).optional(),
    themes: z.array(themeInput).max(12).optional(),
    areas: z.array(z.object({ id: z.string().max(40).optional(), name: z.string().trim().min(2).max(80), aliases: aliasesSchema.optional() })).max(MAX_AREAS).optional(),
  }),
  output: z.object({ verticalId: z.string(), version: z.number().int() }),
  permission: 'manage',
  async handler(ctx, input, deps) {
    requireAgencyStaff(ctx);
    await refuseClientData(deps, ctx, [...(input.name ? [input.name] : []), ...(input.areas ?? []).flatMap((a) => [a.name, ...(a.aliases ?? [])]), ...(input.themes ?? []).map((t) => t.name)]);

    const out = await deps.service.transaction(async (tx) => {
      const [v] = await tx.select().from(vertical).where(eq(vertical.id, input.verticalId)).for('update');
      if (!v || v.id === GENERIC_VERTICAL_ID || !canEditVertical(ctx, v)) throw new ToolError('permission_denied', 'This business type cannot be edited');
      const existing = (await tx.select().from(businessArea).where(eq(businessArea.verticalId, v.id))).map(toAreaRow);

      let areas = existing;
      if (input.areas) {
        const keep = new Map<string, { name: string; aliases: string[] }>();
        const fresh: { name: string; aliases: string[] }[] = [];
        for (const a of input.areas) {
          if (!a.id) fresh.push({ name: a.name, aliases: a.aliases ?? [] });
          else if (!existing.some((e) => e.id === a.id && e.status !== 'merged')) throw new ToolError('invalid_input', `Unknown area: ${a.id}`);
          else keep.set(a.id, { name: a.name, aliases: a.aliases ?? [] });
        }
        const removed = existing.filter((e) => e.status !== 'merged' && !keep.has(e.id));
        for (const r of removed) {
          const [used] = await tx.select({ id: client.id }).from(client).where(and(eq(client.verticalId, v.id), sql`${client.services} @> ${JSON.stringify([r.id])}::jsonb`)).limit(1);
          if (used) throw new ToolError('invalid_input', `Clients use ${r.name}. Ask the platform team to merge it instead.`, { userFacing: true });
        }
        const ids = new Set(existing.map((e) => e.id));
        const added: BusinessAreaRow[] = fresh.map((f) => {
          const id = uniqueSlug(slugOf(f.name, 'keep') ?? 'area', ids);
          ids.add(id);
          return { verticalId: v.id, id, name: f.name, aliases: f.aliases, status: 'unreviewed', mergedInto: null, evidence: null, createdByAgencyId: ctx.agencyId };
        });
        areas = [...existing.filter((e) => e.status === 'merged' || keep.has(e.id)).map((e) => (keep.has(e.id) ? { ...e, ...keep.get(e.id)! } : e)), ...added];
        if (removed.length) await tx.delete(businessArea).where(and(eq(businessArea.verticalId, v.id), inArray(businessArea.id, removed.map((r) => r.id))));
        for (const [id, a] of keep) await tx.update(businessArea).set({ name: a.name, aliases: a.aliases }).where(and(eq(businessArea.verticalId, v.id), eq(businessArea.id, id)));
        if (added.length) await tx.insert(businessArea).values(added.map((a) => ({ verticalId: v.id, id: a.id, name: a.name, aliases: a.aliases, status: 'unreviewed' as const, createdByAgencyId: ctx.agencyId })));
      }

      let primary = v.gbpCategories;
      let related = v.gbpRelatedCategories;
      if (input.categories || input.relatedCategories) {
        const cats = await splitCategories(tx, v.id, input.categories ? lcList(input.categories) : primary, input.relatedCategories ? lcList(input.relatedCategories) : related);
        if (cats.primary.length === 0) throw new ToolError('invalid_input', 'Add at least one Google category that no other business type uses.', { userFacing: true });
        ({ primary, related } = cats);
      }

      const version = v.version + 1;
      const row: VerticalRow = { ...toRow(v), name: input.name ?? v.name, version, gbpCategories: primary, gbpRelatedCategories: related, config: buildConfig(v.config, input) };
      assertValidPack(row, areas, await genericRow(tx));
      await tx.update(vertical).set({ name: row.name, version, gbpCategories: primary, gbpRelatedCategories: related, config: row.config, updatedAt: new Date() }).where(eq(vertical.id, v.id));
      if (input.categories || input.relatedCategories) await writeCategories(tx, v.id, primary, related);
      return { verticalId: v.id, version };
    });
    catalogOf(deps).invalidate();
    return out;
  },
});

export const verticalTools = [listVerticals, createVertical, addBusinessAreaTool, updateVertical];
