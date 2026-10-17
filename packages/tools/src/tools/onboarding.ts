import { assertCanActivateClient } from '@cs/billing';
import { canAccessClient, FEATURES, toolkit, ToolError } from '@cs/core';
import { agencyOnboarding, client, clientSetup, CLIENT_STATUSES, setupLookupSchema } from '@cs/db';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { postCommitSeatSync } from '../billing-guard';
import type { ToolDeps } from '../deps';
import { enqueueOf } from '../deps';
import { startFirstAutoSearch } from '../rival-search';
import { validTimezone } from '../timezone';
import { reevaluateOnboardingCompletion } from './agency-onboarding';
import { applyClientProfileChange, packFor, validated } from '../setup/profile-change';
import { ServiceAreaInput } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();
const Features = z.array(z.enum(FEATURES)).max(FEATURES.length);

/** No queue or a failed enqueue must not leave the wizard spinning: mark the pending suggestions failed (guarded). */
async function enqueueSetupSuggestions(deps: ToolDeps, clientId: string): Promise<void> {
  try {
    await enqueueOf(deps)('setup-suggestions', { clientId }, `setup-suggestions:${clientId}`);
  } catch (err) {
    console.warn(`[create_client] setup-suggestions enqueue for ${clientId} failed: ${err instanceof Error ? err.message : String(err)}`);
    await deps.service.update(clientSetup).set({ suggestions: { status: 'failed' } })
      .where(and(eq(clientSetup.clientId, clientId), sql`${clientSetup.suggestions}->>'status' = 'pending'`));
  }
}

export const createClient = defineTool({
  name: 'create_client',
  access: 'write',
  description: 'Create a client business — or a prospect being pitched — for this agency (agency users who cover all clients).',
  input: z.object({
    name: z.string().max(200), verticalId: z.string().max(40), services: z.array(z.string().max(80)).max(255), keywords: z.array(z.string().max(120)).max(20),
    serviceArea: ServiceAreaInput.nullable(), placeId: z.string().max(300).nullable(), timezone: z.string().max(64).optional(), features: Features.default([]),
    status: z.enum(CLIENT_STATUSES).default('active'), lookup: setupLookupSchema.optional(),
  }),
  output: z.object({ clientId: uuid }),
  permission: 'agency',
  async handler(ctx, rawInput, deps) {
    // Decision 3: a restricted AM could not see the client they create.
    if (ctx.clientScope !== 'all') throw new ToolError('permission_denied', 'Only users who cover all clients can add a client');
    const { lookup, ...base } = rawInput;
    // 11a: a picked Google place prefills the profile. Keywords stay empty (the wizard's suggestions fill them), so the
    // first auto search does not fire until the profile is complete.
    const input = lookup
      ? { ...base, name: base.name.trim() ? base.name : lookup.title.slice(0, 120), placeId: lookup.placeId, keywords: [] as string[], serviceArea: { center: { lat: lookup.lat, lng: lookup.lng }, radiusKm: 15, zips: [] } }
      : base;
    const pack = await packFor(deps, input.verticalId);
    const c = validated(input, pack);
    if (input.timezone !== undefined && !validTimezone(input.timezone)) throw new ToolError('invalid_input', 'Unknown time zone');
    const values = { agencyId: ctx.agencyId, status: input.status, name: c.name, verticalId: pack.id, services: c.services, keywords: c.keywords, serviceArea: c.serviceArea, placeId: c.placeId, features: c.features, ...(input.status === 'active' ? { activatedAt: new Date() } : {}), ...(input.timezone ? { timezone: input.timezone } : {}) };
    // P5/R5: an active client takes a seat, so the cap check and the insert share one transaction (the check locks the agency's billing row).
    const [row] = await deps.service.transaction(async (tx) => {
      if (input.status === 'active') await assertCanActivateClient(tx, ctx.agencyId, { role: ctx.role });
      const inserted = await tx.insert(client).values(values).returning({ id: client.id });
      // 11a: the setup row (service-only table) joins this service-role transaction.
      await tx.insert(clientSetup).values({ clientId: inserted[0]!.id, agencyId: ctx.agencyId, source: 'staff', lookup: lookup ?? null, suggestions: { status: lookup ? 'pending' : 'none' } });
      // Phase 10 R8: the agency's first client (prospects included) starts the guarded stamp; app_user cannot write
      // agency_onboarding, so this runs on the service connection in the same transaction as the insert.
      const stamped = await tx.update(agencyOnboarding).set({ firstClientAt: new Date() })
        .where(and(eq(agencyOnboarding.agencyId, ctx.agencyId), isNull(agencyOnboarding.firstClientAt))).returning({ id: agencyOnboarding.agencyId });
      if (stamped.length > 0) await reevaluateOnboardingCompletion(tx, ctx.agencyId);
      return inserted;
    });
    if (input.status === 'active' && deps.billing) await postCommitSeatSync(deps, ctx.agencyId);
    if (lookup) await enqueueSetupSuggestions(deps, row!.id);
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
    // Fix round 1 (#1) lives in applyClientProfileChange: read-modify-write in ONE transaction with `for('update')`.
    await applyClientProfileChange(ctx, deps, clientId, patch);
    // app_user cannot write ask_review_allowed (column grants), so the service Db does, after the RLS-checked read above proved access.
    if (askReviewAllowed !== undefined) await deps.service.update(client).set({ askReviewAllowed }).where(and(eq(client.id, clientId), eq(client.agencyId, ctx.agencyId)));
    return { clientId };
  },
});

export const onboardingTools = [createClient, updateClientProfile];
