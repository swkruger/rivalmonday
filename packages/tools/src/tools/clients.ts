import { canAccessClient, isAgencyRole, toolkit, ToolError } from '@cs/core';
import { client, withTenant } from '@cs/db';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../registry';
import { ClientProfile, ClientSummary } from './schemas';

const { defineTool } = toolkit<ToolDeps>();

export const listClients = defineTool({
  name: 'list_clients',
  description: 'List the client businesses this agency user can see.',
  input: z.object({}),
  output: z.object({ items: z.array(ClientSummary) }),
  permission: 'agency',
  async handler(ctx, _input, deps) {
    const rows = await withTenant(deps.app, ctx, (tx) => tx.select().from(client).orderBy(asc(client.name)));
    return { items: rows.map((c) => ({ id: c.id, name: c.name, verticalId: c.verticalId, timezone: c.timezone })) };
  },
});

export const getClientProfile = defineTool({
  name: 'get_client_profile',
  description: 'Get one client business: services, keywords, features and (agency roles) delivery settings.',
  input: z.object({ clientId: z.string().uuid() }),
  output: ClientProfile,
  permission: 'read',
  async handler(ctx, { clientId }, deps) {
    if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
    const [c] = await withTenant(deps.app, ctx, (tx) => tx.select().from(client).where(eq(client.id, clientId)));
    if (!c) throw new ToolError('not_found', 'Client not found');
    const agency = isAgencyRole(ctx.role);
    return {
      id: c.id, name: c.name, verticalId: c.verticalId, timezone: c.timezone, services: c.services, keywords: c.keywords, features: c.features,
      serviceArea: c.serviceArea ?? null, placeId: c.placeId,
      alertMode: agency ? (c.alertMode as ClientProfile['alertMode']) : null, briefAutoSend: agency ? c.briefAutoSend : null,
    };
  },
});

export const clientTools = [listClients, getClientProfile];
