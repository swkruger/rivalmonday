import { type AccessContext, canAccessClient, ToolError } from '@cs/core';
import { client, withTenant } from '@cs/db';
import { asc, eq } from 'drizzle-orm';
import type { ToolDeps } from '../deps';
import { type WorkspaceClient, workspaceClient } from '../workspace/scope';

/** Workspace item types: client roles need the `dashboard` feature for them (`search` drops them, `fetch` is `not_found`). */
export const DASHBOARD_ITEM_TYPES: ReadonlySet<string> = new Set(['event', 'review', 'page']);
/** The 5a client-facing brief rule: client roles see approved/sent briefs; agency roles also the ready ones. */
export const CLIENT_BRIEF_STATUSES = ['approved', 'sent'];
export const AGENCY_BRIEF_STATUSES = ['ready', 'approved', 'sent'];

export interface ActiveClient {
  id: string;
  name: string;
  selfCompetitorId: string | null;
}

/** Active clients in this context's scope (RLS + `canAccessClient`), by name then id — P18's resolution order. */
export async function activeClients(deps: ToolDeps, ctx: AccessContext): Promise<ActiveClient[]> {
  const rows = await withTenant(deps.app, ctx, (tx) =>
    tx.select({ id: client.id, name: client.name, selfCompetitorId: client.selfCompetitorId }).from(client)
      .where(eq(client.status, 'active')).orderBy(asc(client.name), asc(client.id)));
  return rows.filter((r) => canAccessClient(ctx, r.id));
}

/** The client must be in scope and `active` (prospects never reach search/fetch); otherwise `not_found`. */
export async function requireActiveClient(deps: ToolDeps, ctx: AccessContext, clientId: string): Promise<void> {
  if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
  const [row] = await withTenant(deps.app, ctx, (tx) => tx.select({ status: client.status }).from(client).where(eq(client.id, clientId)));
  if (row?.status !== 'active') throw new ToolError('not_found', 'Client not found');
}

/**
 * d6 / Review focus 1: the one client a search runs for. Bound (one-client) contexts use their client; otherwise
 * `clientId` is required unless exactly one active client is in scope. Inaccessible or non-active clients are `not_found`.
 */
export async function searchClient(deps: ToolDeps, ctx: AccessContext, clientId: string | undefined): Promise<WorkspaceClient> {
  let id = clientId;
  if (!id && ctx.clientScope !== 'all' && ctx.clientScope.length === 1) id = ctx.clientScope[0];
  if (!id) {
    const active = await activeClients(deps, ctx);
    if (active.length > 1) throw new ToolError('invalid_input', 'Pass clientId: you can see more than one client.');
    if (!active[0]) throw new ToolError('not_found', 'Client not found');
    id = active[0].id;
  }
  await requireActiveClient(deps, ctx, id);
  return workspaceClient(deps, ctx, id);
}
