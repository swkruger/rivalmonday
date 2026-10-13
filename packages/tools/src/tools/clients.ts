import { appLinkFor, canAccessClient, isAgencyRole, toolkit, ToolError } from '@cs/core';
import { client, withTenant } from '@cs/db';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../registry';
import { detailOf, pageOf, pageResult } from '../paging';
import { ClientProfile, ClientSummary, pageFields, pagedItems } from './schemas';

const { defineTool } = toolkit<ToolDeps>();

export const listClients = defineTool({
  name: 'list_clients',
  access: 'read',
  description: 'List the client businesses this agency user can see.',
  input: z.object({ limit: z.number().int().min(1).max(1000).optional(), ...pageFields }),
  output: z.object({ items: pagedItems(ClientSummary), nextCursor: z.string().nullable().optional() }),
  permission: 'agency',
  channels: ['web', 'mcp', 'ask'],
  audit: 'skip-web',
  async handler(ctx, input, deps, meta) {
    const { offset, limit } = pageOf(input, meta, 1000);
    const fetched = await withTenant(deps.app, ctx, (tx) => tx.select().from(client).orderBy(asc(client.name), asc(client.id)).offset(offset).limit(limit + 1));
    const { rows, nextCursor } = pageResult(fetched, limit, offset);
    if (detailOf(input, meta) === 'summary') {
      return { items: rows.map((c) => ({ id: c.id, title: c.name, date: null, evidenceIds: [], url: appLinkFor(deps.appUrl, { t: 'client', clientId: c.id }) })), nextCursor };
    }
    return { items: rows.map((c) => ({ id: c.id, name: c.name, verticalId: c.verticalId, timezone: c.timezone, status: c.status })), nextCursor };
  },
});

export const getClientProfile = defineTool({
  name: 'get_client_profile',
  access: 'read',
  description: 'Get one client business: services, keywords, features and (agency roles) delivery settings.',
  input: z.object({ clientId: z.string().uuid() }),
  output: ClientProfile,
  permission: 'read',
  channels: ['web', 'mcp', 'ask'],
  async handler(ctx, { clientId }, deps) {
    if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
    const [c] = await withTenant(deps.app, ctx, (tx) => tx.select().from(client).where(eq(client.id, clientId)));
    if (!c) throw new ToolError('not_found', 'Client not found');
    const agency = isAgencyRole(ctx.role);
    return {
      id: c.id, name: c.name, verticalId: c.verticalId, timezone: c.timezone, status: c.status, services: c.services, keywords: c.keywords, features: c.features,
      serviceArea: c.serviceArea ?? null, placeId: c.placeId,
      alertMode: agency ? (c.alertMode as ClientProfile['alertMode']) : null, briefAutoSend: agency ? c.briefAutoSend : null,
    };
  },
});

export const clientTools = [listClients, getClientProfile];
