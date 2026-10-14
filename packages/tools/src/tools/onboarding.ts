import { assertCanActivateClient } from '@cs/billing';
import { canAccessClient, FEATURES, toolkit, ToolError } from '@cs/core';
import { client, CLIENT_STATUSES, withTenant } from '@cs/db';
import { listVerticalPacks, type VerticalPack } from '@cs/verticals';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { type ClientInput, cleanClientInput, clientInputProblems } from '../client-input';
import { postCommitSeatSync } from '../billing-guard';
import { packsOf, type ToolDeps } from '../deps';
import { startFirstAutoSearch } from '../rival-search';
import { validTimezone } from '../timezone';
import { ServiceAreaInput } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();
const Features = z.array(z.enum(FEATURES)).max(FEATURES.length);

/**
 * Fix round 1 (#2): decide "unknown vertical" against the real pack catalog instead of
 * swallowing every loader error into invalid_input. A genuine loader failure (corrupt/missing
 * YAML for a vertical id that IS in the catalog) propagates uncaught and the registry reports
 * it as `internal`, not a user-fixable input error.
 */
async function packFor(deps: ToolDeps, verticalId: string): Promise<VerticalPack> {
  if (!(await listVerticalPacks()).includes(verticalId)) throw new ToolError('invalid_input', `Unknown vertical: ${verticalId}`);
  return packsOf(deps)(verticalId);
}

/** Key-order-independent JSON (jsonb returns object keys in its own order). */
function canonical(v: unknown): string {
  return JSON.stringify(v, (_k, x: unknown) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));
}

function validated(input: ClientInput, pack: VerticalPack): ClientInput {
  const clean = cleanClientInput(input);
  const problems = clientInputProblems(clean, pack);
  if (problems.length) throw new ToolError('invalid_input', problems.join('; '));
  return clean;
}

export const createClient = defineTool({
  name: 'create_client',
  access: 'write',
  description: 'Create a client business — or a prospect being pitched — for this agency (agency users who cover all clients).',
  input: z.object({
    name: z.string().max(200), verticalId: z.string().max(40), services: z.array(z.string().max(80)).max(255), keywords: z.array(z.string().max(120)).max(20),
    serviceArea: ServiceAreaInput.nullable(), placeId: z.string().max(300).nullable(), timezone: z.string().max(64).optional(), features: Features.default([]),
    status: z.enum(CLIENT_STATUSES).default('active'),
  }),
  output: z.object({ clientId: uuid }),
  permission: 'agency',
  async handler(ctx, input, deps) {
    // Decision 3: a restricted AM could not see the client they create.
    if (ctx.clientScope !== 'all') throw new ToolError('permission_denied', 'Only users who cover all clients can add a client');
    const pack = await packFor(deps, input.verticalId);
    const c = validated(input, pack);
    if (input.timezone !== undefined && !validTimezone(input.timezone)) throw new ToolError('invalid_input', 'Unknown time zone');
    const values = { agencyId: ctx.agencyId, status: input.status, name: c.name, verticalId: pack.id, services: c.services, keywords: c.keywords, serviceArea: c.serviceArea, placeId: c.placeId, features: c.features, ...(input.status === 'active' ? { activatedAt: new Date() } : {}), ...(input.timezone ? { timezone: input.timezone } : {}) };
    // P5/R5: an active client takes a seat, so the cap check and the insert share one transaction (the check locks the agency's billing row).
    const [row] = await deps.service.transaction(async (tx) => {
      if (input.status === 'active') await assertCanActivateClient(tx, ctx.agencyId);
      return tx.insert(client).values(values).returning({ id: client.id });
    });
    if (input.status === 'active' && deps.billing) await postCommitSeatSync(deps, ctx.agencyId);
    // 12a D4: a client (active or prospect) with keywords, a service area and a place id gets its first search.
    if (c.keywords.length > 0 && c.serviceArea && c.placeId) await startFirstAutoSearch(deps, row!.id);
    return { clientId: row!.id };
  },
});

export const updateClientProfile = defineTool({
  name: 'update_client_profile',
  access: 'write',
  description: 'Update a client’s name, services, keywords, service area, Google place id or client features.',
  input: z.object({
    clientId: uuid, name: z.string().max(200).optional(), services: z.array(z.string().max(80)).max(255).optional(), keywords: z.array(z.string().max(120)).max(20).optional(),
    serviceArea: ServiceAreaInput.nullable().optional(), placeId: z.string().max(300).nullable().optional(), features: Features.optional(),
    askReviewAllowed: z.boolean().optional(),
  }),
  output: z.object({ clientId: uuid }),
  permission: 'agency',
  channels: ['web', 'mcp'],
  mcpScope: 'manage',
  async handler(ctx, { clientId, askReviewAllowed, ...patch }, deps) {
    if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
    if (askReviewAllowed !== undefined && ctx.role !== 'agency_admin') throw new ToolError('permission_denied', 'Only agency admins change this setting');
    // Fix round 1 (#1): read-modify-write in ONE transaction with `for('update')`, so two
    // concurrent partial updates can't interleave and clobber each other (lost-update race).
    const { placeChanged, searchInputsReady } = await withTenant(deps.app, ctx, async (tx) => {
      const [current] = await tx.select().from(client).where(eq(client.id, clientId)).for('update');
      if (!current) throw new ToolError('not_found', 'Client not found');
      const pack = await packFor(deps, current.verticalId);
      // `current.features` may hold unknown legacy strings; drop them here so an unknown value never survives a save.
      const currentFeatures = (current.features as string[]).filter((f) => (FEATURES as readonly string[]).includes(f));
      const merged = validated(
        {
          name: patch.name ?? current.name, services: patch.services ?? current.services, keywords: patch.keywords ?? current.keywords,
          serviceArea: patch.serviceArea === undefined ? current.serviceArea : patch.serviceArea, placeId: patch.placeId === undefined ? current.placeId : patch.placeId,
          features: (patch.features ?? currentFeatures) as ClientInput['features'],
        },
        pack,
      );
      await tx.update(client).set({ name: merged.name, services: merged.services, keywords: merged.keywords, serviceArea: merged.serviceArea, placeId: merged.placeId, features: merged.features }).where(eq(client.id, clientId));
      const searchInputsChanged = canonical(merged.keywords) !== canonical(current.keywords)
        || canonical(merged.serviceArea) !== canonical(current.serviceArea) || merged.placeId !== current.placeId;
      return { placeChanged: merged.placeId !== current.placeId, searchInputsReady: searchInputsChanged && merged.keywords.length > 0 && !!merged.serviceArea && !!merged.placeId };
    });
    // Final review: the self business was found by the old place id. Unlink it so benchmarks stop using the wrong
    // business and its paid gbp/reviews sources stop being claimed (unless something else still needs them); the next
    // schedule tick re-links from the new place id (`ensureSelfCompetitors`). app_user cannot write this column
    // (migration 0026), so the service Db writes it, after the RLS-checked update above proved access.
    if (placeChanged) await deps.service.update(client).set({ selfCompetitorId: null }).where(eq(client.id, clientId));
    // app_user cannot write ask_review_allowed (column grants), so the service Db does, after the RLS-checked read above proved access.
    if (askReviewAllowed !== undefined) await deps.service.update(client).set({ askReviewAllowed }).where(and(eq(client.id, clientId), eq(client.agencyId, ctx.agencyId)));
    // 12a D4 + owner decision 2026-10-15: after commit, the profile's first completion starts discovery once; a client
    // with any earlier run is never auto re-run by later edits (refusals stay silent).
    if (searchInputsReady) await startFirstAutoSearch(deps, clientId);
    return { clientId };
  },
});

export const onboardingTools = [createClient, updateClientProfile];
