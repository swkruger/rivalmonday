import { clientBillingPill } from '@cs/billing';
import { type AccessContext, canAccessClient, toolkit, ToolError } from '@cs/core';
import { type ClientBillingState, agency, agencyConnect, client, clientBilling } from '@cs/db';
import { resolveBranding } from '@cs/email';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { BILLING_NOT_CONFIGURED_MESSAGE } from './billing';

/**
 * Phase 9b Task 10: the client owner's own billing (agency-branded). Client owner of that client only: viewers, agency
 * roles and guest contacts get `not_found` (a 404 in the web app). Nothing agency-side leaves here (price ids, fee
 * percent, margin) and no platform name appears in any message.
 */
const { defineTool } = toolkit<ToolDeps>();

const NOT_FOUND = 'Not found';
export const NOTHING_TO_MANAGE_MESSAGE = 'There are no payment details to manage yet. Check your email for the payment link.';
export const PORTAL_UNAVAILABLE_MESSAGE = 'Payment management is not available right now. Please contact your agency.';
export const PORTAL_FAILED_MESSAGE = 'Could not open the payment page. Try again shortly.';

const StateEnum = z.enum(['off', 'invited', 'active', 'payment_needed', 'cancelled', 'disconnected']);

/** Same refusal for every other role and any other client, so nothing about billing is confirmed to them. */
function requireOwnerOf(ctx: AccessContext, clientId: string) {
  if (ctx.role !== 'client_owner' || ctx.userId.startsWith('contact:') || !canAccessClient(ctx, clientId)) throw new ToolError('not_found', NOT_FOUND);
}

async function load(deps: ToolDeps, ctx: AccessContext, clientId: string) {
  const [c] = await deps.service
    .select({ agencyId: client.agencyId, pausedAt: client.pausedAt, agencyName: agency.name, branding: agency.branding })
    .from(client).innerJoin(agency, eq(agency.id, client.agencyId)).where(eq(client.id, clientId));
  if (!c || c.agencyId !== ctx.agencyId) throw new ToolError('not_found', NOT_FOUND);
  const [b] = await deps.service.select().from(clientBilling).where(eq(clientBilling.clientId, clientId));
  const [connect] = await deps.service.select({ stripeAccountId: agencyConnect.stripeAccountId, status: agencyConnect.status }).from(agencyConnect).where(eq(agencyConnect.agencyId, c.agencyId));
  const acct = connect?.stripeAccountId && connect.status !== 'disconnected' ? connect.stripeAccountId : null;
  return { c, b: b ?? null, acct, agencyName: resolveBranding(c.agencyName, c.branding ?? null).displayName };
}

export const getMyBillingTool = defineTool({
  name: 'get_my_billing',
  access: 'read',
  description: "A client owner's own billing: status, next charge date and amount (the agency's name, never the platform's).",
  input: z.object({ clientId: z.string().uuid() }),
  output: z.object({
    agencyName: z.string(),
    state: StateEnum,
    pill: z.object({ key: z.enum(['paused', 'payment_needed', 'invited', 'paying', 'off']), label: z.string() }),
    paused: z.boolean(),
    enabled: z.boolean(),
    nextChargeDate: z.string().nullable(),
    nextChargeAmountCents: z.number().int().nullable(),
    /** Set when the subscription is cancelled at period end: the last day of service paid for. */
    endsOn: z.string().nullable(),
    canManagePayment: z.boolean(),
  }),
  permission: 'manage',
  async handler(ctx, { clientId }, deps) {
    requireOwnerOf(ctx, clientId);
    const { c, b, acct, agencyName } = await load(deps, ctx, clientId);
    const state: ClientBillingState = b?.state ?? 'off';
    let nextChargeDate: string | null = null;
    let nextChargeAmountCents: number | null = b?.stripeSubscriptionId ? (b.billedPriceCents ?? null) : null;
    let endsOn: string | null = null;
    // Live read (display only). A failure or a missing gateway degrades to the stored amount with no date.
    if (deps.billing && acct && b?.stripeSubscriptionId) {
      try {
        const sub = await deps.billing.getConnectedSubscription({ stripeAccount: acct, subscriptionId: b.stripeSubscriptionId });
        const end = sub.currentPeriodEnd?.toISOString() ?? null;
        nextChargeAmountCents = sub.unitAmountCents ?? nextChargeAmountCents;
        if (sub.cancelAtPeriodEnd) {
          endsOn = end;
          nextChargeAmountCents = null;
        } else nextChargeDate = end;
      } catch (e) {
        console.error('[billing] getConnectedSubscription failed; showing stored state', { agencyId: ctx.agencyId }, (e as { name?: string } | null)?.name);
      }
    }
    return {
      agencyName, state,
      pill: clientBillingPill({ pausedAt: c.pausedAt, billing: b }),
      paused: c.pausedAt !== null,
      enabled: b?.enabled ?? false,
      nextChargeDate, nextChargeAmountCents, endsOn,
      canManagePayment: !!deps.billing && !!acct && !!b?.stripeCustomerId,
    };
  },
});

export const openBillingPortalTool = defineTool({
  name: 'open_billing_portal',
  access: 'write',
  description: 'Open the payment page where a client owner updates their payment method and sees invoices. Returns a redirect URL.',
  input: z.object({ clientId: z.string().uuid() }),
  output: z.object({ url: z.string() }),
  permission: 'manage',
  async handler(ctx, { clientId }, deps) {
    requireOwnerOf(ctx, clientId);
    if (!deps.billing) throw new ToolError('conflict', BILLING_NOT_CONFIGURED_MESSAGE);
    if (!deps.appUrl) throw new ToolError('internal', 'Billing is not configured (APP_URL)');
    const { b, acct } = await load(deps, ctx, clientId);
    if (!b?.stripeCustomerId) throw new ToolError('conflict', NOTHING_TO_MANAGE_MESSAGE);
    if (!acct) throw new ToolError('conflict', PORTAL_UNAVAILABLE_MESSAGE);
    try {
      const s = await deps.billing.createConnectedPortal({ stripeAccount: acct, customerId: b.stripeCustomerId, returnUrl: `${deps.appUrl.replace(/\/+$/, '')}/c/${clientId}/settings/billing` });
      return { url: s.url };
    } catch (e) {
      console.error('[billing] createConnectedPortal failed', { agencyId: ctx.agencyId }, (e as { name?: string } | null)?.name);
      throw new ToolError('internal', PORTAL_FAILED_MESSAGE);
    }
  },
});

export const myBillingTools = [getMyBillingTool, openBillingPortalTool];
