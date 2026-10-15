import { type BillingGateway, countActiveClients, currentStandardPlan, LIVE_SUBSCRIPTION_STATUSES, planFor, syncPlanToStripe, trialEndUsable } from '@cs/billing';
import { type AccessContext, toolkit, ToolError } from '@cs/core';
import { agency, agencyBilling, client, clientServiceable, discountCode } from '@cs/db';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';

/**
 * Phase 9a agency billing tools. Agency admin only (R21), web channel only: billing never reaches MCP, Ask or clients.
 * All reads/writes use `deps.service` (the billing tables are service-role only).
 */
const { defineTool } = toolkit<ToolDeps>();

const DAY = 86_400_000;
const PAUSE_AFTER_DAYS = 7;
const BILLING_PATH = '/agency/settings/billing';
export const INVALID_CODE_MESSAGE = "That code isn't valid for your account.";

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

function requireAdmin(ctx: AccessContext) {
  if (ctx.role !== 'agency_admin' || ctx.userId.startsWith('contact:')) throw new ToolError('permission_denied', 'Only the agency admin can manage billing');
}

export const BILLING_NOT_CONFIGURED_MESSAGE = 'Billing is not configured.';

/** R27: no gateway (keyless DEV/production) => tools that need Stripe refuse; reads degrade instead of calling this. */
export function gatewayOf(deps: ToolDeps): BillingGateway {
  if (!deps.billing) throw new ToolError('conflict', BILLING_NOT_CONFIGURED_MESSAGE, { userFacing: true });
  return deps.billing;
}

function billingUrl(deps: ToolDeps, query = ''): string {
  if (!deps.appUrl) throw new ToolError('internal', 'Billing is not configured (APP_URL)');
  return `${deps.appUrl.replace(/\/+$/, '')}${BILLING_PATH}${query}`;
}

const logDegraded = (agencyId: string, what: string, e: unknown) =>
  console.error('[billing] gateway call failed', { agencyId, what }, (e as { name?: string } | null)?.name);

async function billingRowOf(deps: ToolDeps, agencyId: string) {
  const [row = null] = await deps.service.select().from(agencyBilling).where(eq(agencyBilling.agencyId, agencyId));
  return row;
}

/** Returns the agency's Stripe customer id, creating (and storing) it when missing. A lost race leaves one orphan customer, never two stored ids. */
export async function ensureCustomer(deps: ToolDeps, agencyId: string): Promise<string> {
  const existing = (await billingRowOf(deps, agencyId))?.stripeCustomerId;
  if (existing) return existing;
  const [a] = await deps.service.select({ name: agency.name }).from(agency).where(eq(agency.id, agencyId));
  const created = await gatewayOf(deps).createCustomer({ agencyId, name: a?.name ?? 'Agency' });
  await deps.service
    .insert(agencyBilling)
    .values({ agencyId, state: 'pilot', stripeCustomerId: created.id })
    .onConflictDoUpdate({ target: agencyBilling.agencyId, set: { stripeCustomerId: sql`coalesce(${agencyBilling.stripeCustomerId}, ${created.id})`, updatedAt: new Date() } });
  return (await billingRowOf(deps, agencyId))!.stripeCustomerId!;
}

/**
 * R22/R26: whether the stored subscription is still live in Stripe (a missed `subscription.deleted` can leave a stale id).
 * canceled / incomplete_expired / not found => false; a lookup failure fails closed (`internal`).
 */
export async function hasLiveSubscription(gw: BillingGateway, agencyId: string, subscriptionId: string): Promise<boolean> {
  try {
    return LIVE_SUBSCRIPTION_STATUSES.includes((await gw.getSubscription(subscriptionId)).status);
  } catch (e) {
    if ((e as { code?: string } | null)?.code === 'resource_missing') return false;
    logDegraded(agencyId, 'getSubscription', e);
    throw new ToolError('internal', 'Could not check the subscription. Try again shortly.');
  }
}

/** R22: one subscription per agency. Live => conflict (use the portal); canceled/missing => allow; lookup failure => fail closed. */
async function assertNoLiveSubscription(gw: BillingGateway, agencyId: string, subscriptionId: string): Promise<void> {
  if (await hasLiveSubscription(gw, agencyId, subscriptionId)) throw new ToolError('conflict', 'This agency already has a subscription. Manage it from the billing portal.');
}

const Plan = z.object({ name: z.string(), version: z.number().int(), basePriceCents: z.number().int(), includedSeats: z.number().int(), seatPriceCents: z.number().int() });
const IsoOrNull = z.string().nullable();

export const getBillingSummaryTool = defineTool({
  name: 'get_billing_summary',
  access: 'read',
  description: 'The agency’s plan, billing state, seats, next invoice, discount and recent invoices (agency admins).',
  input: z.object({}),
  output: z.object({
    state: z.enum(['pilot', 'trialing', 'active', 'past_due', 'read_only', 'suspended', 'cancelled']),
    plan: Plan.nullable(),
    dates: z.object({ trialEndsAt: IsoOrNull, pilotEndsAt: IsoOrNull, pastDueSince: IsoOrNull, pausesOn: IsoOrNull, cancelAt: IsoOrNull }),
    seats: z.object({ used: z.number().int(), included: z.number().int(), extra: z.number().int() }),
    nextInvoice: z.object({ amountDueCents: z.number().int(), periodEnd: z.string(), discountCents: z.number().int() }).nullable(),
    discount: z.object({ code: z.string().optional(), couponId: z.string() }).nullable(),
    recentInvoices: z.array(z.object({
      id: z.string(), number: z.string().nullable(), amountPaidCents: z.number().int(), status: z.string().nullable(), hostedInvoiceUrl: z.string().nullable(), created: z.string(),
    })).max(5),
  }),
  permission: 'agency',
  async handler(ctx, _input, deps) {
    requireAdmin(ctx);
    const row = await billingRowOf(deps, ctx.agencyId);
    const [p, used] = await Promise.all([planFor(deps.service, row), countActiveClients(deps.service, ctx.agencyId)]);
    const included = p?.includedSeats ?? 0;
    const state = row?.state ?? 'pilot';

    let nextInvoice: { amountDueCents: number; periodEnd: string; discountCents: number } | null = null;
    let recentInvoices: { id: string; number: string | null; amountPaidCents: number; status: string | null; hostedInvoiceUrl: string | null; created: string }[] = [];
    if (deps.billing && row?.stripeSubscriptionId) {
      try {
        const u = await deps.billing.upcomingInvoice(row.stripeSubscriptionId);
        if (u) nextInvoice = { amountDueCents: u.amountDueCents, periodEnd: u.periodEnd.toISOString(), discountCents: u.discountCents };
      } catch (e) { logDegraded(ctx.agencyId, 'upcomingInvoice', e); }
    }
    if (deps.billing && row?.stripeCustomerId) {
      try {
        const list = await deps.billing.listInvoices(row.stripeCustomerId, 5);
        recentInvoices = list.slice(0, 5).map((i) => ({
          id: i.id, number: i.number, amountPaidCents: i.amountPaidCents, status: i.status, hostedInvoiceUrl: i.hostedInvoiceUrl, created: i.created.toISOString(),
        }));
      } catch (e) { logDegraded(ctx.agencyId, 'listInvoices', e); }
    }

    let discount: { code?: string; couponId: string } | null = null;
    if (row?.attachedCouponId) {
      const [c] = await deps.service.select({ code: discountCode.code }).from(discountCode).where(eq(discountCode.stripeCouponId, row.attachedCouponId)).limit(1);
      discount = c ? { code: c.code, couponId: row.attachedCouponId } : { couponId: row.attachedCouponId };
    }

    return {
      state,
      plan: p ? { name: p.name, version: p.version, basePriceCents: p.basePriceCents, includedSeats: p.includedSeats, seatPriceCents: p.seatPriceCents } : null,
      dates: {
        trialEndsAt: iso(row?.trialEndsAt),
        pilotEndsAt: iso(row?.pilotEndsAt),
        pastDueSince: iso(row?.pastDueSince),
        pausesOn: state === 'past_due' && row?.pastDueSince ? new Date(row.pastDueSince.getTime() + PAUSE_AFTER_DAYS * DAY).toISOString() : null,
        cancelAt: iso(row?.cancelAt),
      },
      seats: { used, included, extra: Math.max(0, used - included) },
      nextInvoice,
      discount,
      recentInvoices,
    };
  },
});

export const createCheckoutSessionTool = defineTool({
  name: 'create_checkout_session',
  access: 'write',
  description: 'Start Stripe Checkout to subscribe the agency to its plan (agency admins).',
  input: z.object({}),
  output: z.object({ url: z.string() }),
  permission: 'agency',
  async handler(ctx, _input, deps) {
    requireAdmin(ctx);
    const gw = gatewayOf(deps);
    const success = billingUrl(deps, '?done=1');
    const cancel = billingUrl(deps);
    const before = await billingRowOf(deps, ctx.agencyId);
    if (before?.stripeSubscriptionId) await assertNoLiveSubscription(gw, ctx.agencyId, before.stripeSubscriptionId);

    let p = await planFor(deps.service, before);
    if (!p) p = await currentStandardPlan(deps.service);
    if (!p) throw new ToolError('internal', 'No billing plan is configured');
    if (!p.stripeBasePriceId || !p.stripeSeatPriceId) p = await syncPlanToStripe(deps.service, gw, p.id);

    const customerId = await ensureCustomer(deps, ctx.agencyId);
    const row = (await billingRowOf(deps, ctx.agencyId))!;
    const active = await countActiveClients(deps.service, ctx.agencyId);
    // I2: Stripe rejects a Checkout trial_end under 48 h away; closer than that the subscription simply starts now.
    const trialEnd = row.state === 'trialing' && row.trialEndsAt && trialEndUsable(row.trialEndsAt) ? row.trialEndsAt : undefined;
    return gw.createCheckoutSession({
      customerId,
      basePriceId: p.stripeBasePriceId!,
      seatPriceId: p.stripeSeatPriceId!,
      seatQty: Math.max(0, active - p.includedSeats),
      ...(trialEnd ? { trialEnd } : {}),
      ...(row.attachedCouponId ? { couponId: row.attachedCouponId } : {}),
      allowPromotionCodes: !row.attachedCouponId,
      successUrl: success,
      cancelUrl: cancel,
    }).then((s) => ({ url: s.url }));
  },
});

export const createPortalSessionTool = defineTool({
  name: 'create_portal_session',
  access: 'write',
  description: 'Open the Stripe billing portal (payment method, invoices, cancel) (agency admins).',
  input: z.object({}),
  output: z.object({ url: z.string() }),
  permission: 'agency',
  async handler(ctx, _input, deps) {
    requireAdmin(ctx);
    const gw = gatewayOf(deps);
    const returnUrl = billingUrl(deps, '?done=1');
    const row = await billingRowOf(deps, ctx.agencyId);
    if (!row?.stripeCustomerId) throw new ToolError('conflict', 'Subscribe first to manage billing.');
    const s = await gw.createPortalSession({ customerId: row.stripeCustomerId, returnUrl });
    return { url: s.url };
  },
});

export const redeemDiscountCodeTool = defineTool({
  name: 'redeem_discount_code',
  access: 'write',
  description: 'Apply a discount code to the agency’s billing (agency admins).',
  input: z.object({ code: z.string().trim().min(1).max(64) }),
  output: z.object({ applied: z.literal(true), appliesAtCheckout: z.boolean() }),
  permission: 'agency',
  async handler(ctx, { code }, deps) {
    requireAdmin(ctx);
    const gw = gatewayOf(deps);
    // One message for every refusal reason, so a code cannot be probed (no oracle).
    const [dc] = await deps.service.select().from(discountCode).where(and(sql`lower(${discountCode.code}) = lower(${code})`, isNull(discountCode.revokedAt)));
    const valid = dc
      && (!dc.expiresAt || dc.expiresAt.getTime() > Date.now())
      && (!dc.restrictedAgencyIds || dc.restrictedAgencyIds.includes(ctx.agencyId));
    if (!dc || !valid) throw new ToolError('invalid_code', INVALID_CODE_MESSAGE);

    await ensureCustomer(deps, ctx.agencyId);
    const subscriptionId = (await billingRowOf(deps, ctx.agencyId))?.stripeSubscriptionId;
    const hasSubscription = !!subscriptionId;
    if (subscriptionId) await gw.attachSubscriptionDiscount({ subscriptionId, couponId: dc.stripeCouponId });
    await deps.service.update(agencyBilling).set({ attachedCouponId: dc.stripeCouponId, updatedAt: new Date() }).where(eq(agencyBilling.agencyId, ctx.agencyId));
    return { applied: true as const, appliesAtCheckout: !hasSubscription };
  },
});

export const getSeatReportTool = defineTool({
  name: 'get_seat_report',
  access: 'read',
  description: 'The agency’s active clients (billable seats) with the date each was added (agency admins).',
  input: z.object({}),
  output: z.object({ clients: z.array(z.object({ id: z.string().uuid(), name: z.string(), activatedAt: z.string() })) }),
  permission: 'agency',
  async handler(ctx, _input, deps) {
    requireAdmin(ctx);
    // No status-change timestamp exists on `client`; `created_at` is the closest (a prospect converted later shows its creation date).
    const rows = await deps.service
      .select({ id: client.id, name: client.name, createdAt: client.createdAt })
      .from(client)
      .where(and(eq(client.agencyId, ctx.agencyId), clientServiceable(client)))
      .orderBy(asc(client.name), asc(client.id));
    return { clients: rows.map((r) => ({ id: r.id, name: r.name, activatedAt: r.createdAt.toISOString() })) };
  },
});

export const billingTools = [getBillingSummaryTool, createCheckoutSessionTool, createPortalSessionTool, redeemDiscountCodeTool, getSeatReportTool];
