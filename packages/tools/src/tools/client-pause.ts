import { pauseClient, resumeClient } from '@cs/billing';
import { type AccessContext, canAccessClient, toolkit, ToolError } from '@cs/core';
import { client } from '@cs/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { postCommitSeatSync } from '../billing-guard';
import type { ToolDeps } from '../deps';

/**
 * Phase 9b f6: pause / resume one client (agency admin, or account manager in scope). Web only. `client.paused_at` is
 * service-role-only, so the write runs on `deps.service`; the registry records the audit row (actor = ctx.userId).
 */
const { defineTool } = toolkit<ToolDeps>();

const Input = z.object({ clientId: z.string().uuid() });
const Output = z.object({ ok: z.literal(true), changed: z.boolean() });

/** Same 404 for unknown, other-agency and out-of-scope clients. */
async function ownClient(deps: ToolDeps, ctx: AccessContext, clientId: string) {
  if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
  const [c] = await deps.service.select({ agencyId: client.agencyId, status: client.status }).from(client).where(eq(client.id, clientId));
  if (!c || c.agencyId !== ctx.agencyId) throw new ToolError('not_found', 'Client not found');
  return c;
}

export const pauseClientTool = defineTool({
  name: 'pause_client',
  access: 'write',
  description: 'Pause a client: collection, briefs and alerts stop and the seat is released; history stays visible.',
  input: Input,
  output: Output,
  permission: 'agency',
  async handler(ctx, { clientId }, deps) {
    const c = await ownClient(deps, ctx, clientId);
    if (c.status !== 'active') throw new ToolError('invalid_input', 'Only an active client can be paused.');
    const changed = await deps.service.transaction((tx) => pauseClient(tx, clientId, ctx.userId, 'agency'));
    if (changed) await postCommitSeatSync(deps, ctx.agencyId);
    return { ok: true as const, changed };
  },
});

export const resumeClientTool = defineTool({
  name: 'resume_client',
  access: 'write',
  description: 'Resume a paused client. Counts against the seat limit again.',
  input: Input,
  output: Output,
  permission: 'agency',
  async handler(ctx, { clientId }, deps) {
    await ownClient(deps, ctx, clientId);
    const changed = await deps.service.transaction((tx) => resumeClient(tx, clientId, ctx.userId, { role: ctx.role }));
    if (changed) await postCommitSeatSync(deps, ctx.agencyId);
    return { ok: true as const, changed };
  },
});

export const clientPauseTools = [pauseClientTool, resumeClientTool];
