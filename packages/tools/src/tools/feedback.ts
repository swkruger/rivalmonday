import { canAccessClient, toolkit, ToolError } from '@cs/core';
import { client, withTenant } from '@cs/db';
import { replyToFor } from '@cs/engine';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../registry';

const { defineTool } = toolkit<ToolDeps>();

/** Who a client writes to about a brief: `replyToFor` (the AM covering the client, else the first agency admin). */
export const FeedbackContact = z.object({ email: z.string(), name: z.string().nullable() }).nullable();
export type FeedbackContact = z.infer<typeof FeedbackContact>;

/**
 * 7c2: the brief page's "Something look off? Email {name|your agency}." line (client roles). Null = no agency contact
 * (the page hides the line). Never names the platform; masked in support sessions (the key matches /email/i).
 */
export const getFeedbackContact = defineTool({
  name: 'get_feedback_contact',
  access: 'read',
  description: "The agency contact a client writes to about a brief: the client's account manager, else the agency admin.",
  input: z.object({ clientId: z.string().uuid() }),
  output: FeedbackContact,
  permission: 'read',
  channels: ['web'],
  supportMask: ['email', 'name'],
  async handler(ctx, { clientId }, deps) {
    if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
    // The tenant-scoped lookup proves access (RLS hides other agencies' and archived clients); contacts are then read on the service connection.
    const [c] = await withTenant(deps.app, ctx, (tx) => tx.select({ agencyId: client.agencyId }).from(client).where(eq(client.id, clientId)).limit(1));
    if (!c) throw new ToolError('not_found', 'Client not found');
    return replyToFor(deps.service, c.agencyId, clientId);
  },
});

export const feedbackTools = [getFeedbackContact];
