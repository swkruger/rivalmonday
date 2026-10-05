import { canAccessClient, FEATURES, toolkit, ToolError } from '@cs/core';
import { client, withTenant } from '@cs/db';
import type { VerticalPack } from '@cs/verticals';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { type ClientInput, cleanClientInput, clientInputProblems } from '../client-input';
import { packsOf, type ToolDeps } from '../deps';
import { validTimezone } from '../timezone';
import { ServiceAreaInput } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();
const Features = z.array(z.enum(FEATURES)).max(FEATURES.length);

async function packFor(deps: ToolDeps, verticalId: string): Promise<VerticalPack> {
  try {
    return await packsOf(deps)(verticalId);
  } catch {
    throw new ToolError('invalid_input', `Unknown vertical: ${verticalId}`);
  }
}

function validated(input: ClientInput, pack: VerticalPack): ClientInput {
  const clean = cleanClientInput(input);
  const problems = clientInputProblems(clean, pack);
  if (problems.length) throw new ToolError('invalid_input', problems.join('; '));
  return clean;
}

export const createClient = defineTool({
  name: 'create_client',
  description: 'Create a client business for this agency (agency users who cover all clients).',
  input: z.object({
    name: z.string().max(200), verticalId: z.string().max(40), services: z.array(z.string().max(80)).max(255), keywords: z.array(z.string().max(120)).max(20),
    serviceArea: ServiceAreaInput.nullable(), placeId: z.string().max(300).nullable(), timezone: z.string().max(64).optional(), features: Features.default([]),
  }),
  output: z.object({ clientId: uuid }),
  permission: 'agency',
  async handler(ctx, input, deps) {
    // Decision 3: a restricted AM could not see the client they create.
    if (ctx.clientScope !== 'all') throw new ToolError('permission_denied', 'Only users who cover all clients can add a client');
    const pack = await packFor(deps, input.verticalId);
    const c = validated(input, pack);
    if (input.timezone !== undefined && !validTimezone(input.timezone)) throw new ToolError('invalid_input', 'Unknown time zone');
    const [row] = await deps.service
      .insert(client)
      .values({ agencyId: ctx.agencyId, name: c.name, verticalId: pack.id, services: c.services, keywords: c.keywords, serviceArea: c.serviceArea, placeId: c.placeId, features: c.features, ...(input.timezone ? { timezone: input.timezone } : {}) })
      .returning({ id: client.id });
    return { clientId: row!.id };
  },
});

export const updateClientProfile = defineTool({
  name: 'update_client_profile',
  description: 'Update a client’s name, services, keywords, service area, Google place id or client features.',
  input: z.object({
    clientId: uuid, name: z.string().max(200).optional(), services: z.array(z.string().max(80)).max(255).optional(), keywords: z.array(z.string().max(120)).max(20).optional(),
    serviceArea: ServiceAreaInput.nullable().optional(), placeId: z.string().max(300).nullable().optional(), features: Features.optional(),
  }),
  output: z.object({ clientId: uuid }),
  permission: 'agency',
  async handler(ctx, { clientId, ...patch }, deps) {
    if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
    const [current] = await withTenant(deps.app, ctx, (tx) => tx.select().from(client).where(eq(client.id, clientId)));
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
    await withTenant(deps.app, ctx, (tx) =>
      tx.update(client).set({ name: merged.name, services: merged.services, keywords: merged.keywords, serviceArea: merged.serviceArea, placeId: merged.placeId, features: merged.features }).where(eq(client.id, clientId)),
    );
    return { clientId };
  },
});

export const onboardingTools = [createClient, updateClientProfile];
