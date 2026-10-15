import { disconnectAgencyConnect } from '@cs/billing';
import { type AccessContext, toolkit, ToolError } from '@cs/core';
import { agency, agencyConnect } from '@cs/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { gatewayOf } from './billing';

/**
 * Phase 9b Connect onboarding + defaults (agency -> client billing). Agency admin only, web channel only. All access
 * is on `deps.service` (the Connect tables are service-role only); the registry records the audit row.
 */
const { defineTool } = toolkit<ToolDeps>();

const BILLING_PATH = '/agency/settings/billing';
export const CONNECT_FIRST_MESSAGE = 'Connect Stripe first.';
/** $100,000 / month: a sanity bound well under Stripe's own limit. */
export const MAX_PRICE_CENTS = 10_000_000;

const Status = z.enum(['not_connected', 'pending', 'connected', 'restricted', 'disconnected']);

function requireAdmin(ctx: AccessContext) {
  if (ctx.role !== 'agency_admin' || ctx.userId.startsWith('contact:')) throw new ToolError('permission_denied', 'Only the agency admin can manage client billing');
}

const connectRowOf = async (deps: ToolDeps, agencyId: string) =>
  (await deps.service.select().from(agencyConnect).where(eq(agencyConnect.agencyId, agencyId)))[0] ?? null;

function billingUrl(deps: ToolDeps, query: string): string {
  if (!deps.appUrl) throw new ToolError('internal', 'Billing is not configured (APP_URL)');
  return `${deps.appUrl.replace(/\/+$/, '')}${BILLING_PATH}${query}`;
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** Stripe failures never leak their message to the caller (it can carry account detail). */
function stripeFailed(agencyId: string, what: string, e: unknown): never {
  console.error('[billing] connect gateway call failed', { agencyId, what }, (e as { name?: string } | null)?.name);
  throw new ToolError('internal', 'Could not reach Stripe. Try again shortly.');
}

export const getConnectStatusTool = defineTool({
  name: 'get_connect_status',
  access: 'read',
  description: "The agency's Stripe Connect status and client billing defaults. Reads Stripe live when it can; otherwise returns the stored state.",
  input: z.object({}),
  output: z.object({
    status: Status,
    chargesEnabled: z.boolean(),
    detailsSubmitted: z.boolean(),
    defaultPriceCents: z.number().int().nullable(),
    defaultSetupFeeCents: z.number().int().nullable(),
    currency: z.string(),
    autoPauseAfterDays: z.number().int().nullable(),
    connectedAt: z.string().nullable(),
    disconnectedAt: z.string().nullable(),
    billingConfigured: z.boolean(),
  }),
  permission: 'agency',
  async handler(ctx, _input, deps) {
    requireAdmin(ctx);
    const row = await connectRowOf(deps, ctx.agencyId);
    let status: z.infer<typeof Status> = row?.status ?? 'not_connected';
    let chargesEnabled = row?.chargesEnabled ?? false;
    let detailsSubmitted = row?.detailsSubmitted ?? false;
    // Live refresh (display only; the webhook persists): lets the page show the result right after onboarding returns.
    if (deps.billing && row?.stripeAccountId && row.status !== 'disconnected') {
      try {
        const live = await deps.billing.getAccount({ stripeAccount: row.stripeAccountId });
        chargesEnabled = live.chargesEnabled;
        detailsSubmitted = live.detailsSubmitted;
        if (live.chargesEnabled && live.detailsSubmitted) status = 'connected';
        else if (row.status === 'connected') status = 'restricted';
      } catch (e) {
        console.error('[billing] getAccount failed; showing stored state', { agencyId: ctx.agencyId }, (e as { name?: string } | null)?.name);
      }
    }
    return {
      status,
      chargesEnabled,
      detailsSubmitted,
      defaultPriceCents: row?.defaultPriceCents ?? null,
      defaultSetupFeeCents: row?.defaultSetupFeeCents ?? null,
      currency: row?.currency ?? 'usd',
      autoPauseAfterDays: row?.autoPauseAfterDays ?? null,
      connectedAt: iso(row?.connectedAt),
      disconnectedAt: iso(row?.disconnectedAt),
      billingConfigured: !!deps.billing,
    };
  },
});

export const startStripeConnectTool = defineTool({
  name: 'start_stripe_connect',
  access: 'write',
  description: 'Start (or resume) Stripe Connect onboarding for the agency. Returns the Stripe-hosted onboarding URL.',
  input: z.object({}),
  output: z.object({ url: z.string() }),
  permission: 'agency',
  async handler(ctx, _input, deps) {
    requireAdmin(ctx);
    const gw = gatewayOf(deps);
    const returnUrl = billingUrl(deps, '?connect=done');
    const refreshUrl = billingUrl(deps, '?connect=retry');
    const row = await connectRowOf(deps, ctx.agencyId);
    // A disconnected account was deauthorized: onboard a fresh one (the old product/price live on the old account).
    const reuse = row?.stripeAccountId && row.status !== 'disconnected' ? row.stripeAccountId : undefined;
    let link: { url: string; accountId: string };
    try {
      link = await gw.createAccountLink({ accountId: reuse, returnUrl, refreshUrl });
    } catch (e) {
      stripeFailed(ctx.agencyId, 'createAccountLink', e);
    }
    const now = new Date();
    if (!row || row.status === 'disconnected') {
      const fresh = {
        stripeAccountId: link.accountId, status: 'pending' as const, chargesEnabled: false, detailsSubmitted: false,
        stripeProductId: null, stripeDefaultPriceId: null, connectedAt: null, disconnectedAt: null, updatedAt: now,
      };
      await deps.service.insert(agencyConnect).values({ agencyId: ctx.agencyId, ...fresh }).onConflictDoUpdate({ target: agencyConnect.agencyId, set: fresh });
    } else {
      await deps.service.update(agencyConnect).set({ stripeAccountId: link.accountId, updatedAt: now }).where(eq(agencyConnect.agencyId, ctx.agencyId));
    }
    return { url: link.url };
  },
});

export const disconnectStripeTool = defineTool({
  name: 'disconnect_stripe',
  access: 'write',
  description: "Disconnect Stripe: client subscriptions keep running in the agency's own Stripe account, but Rival Monday stops tracking payments.",
  input: z.object({ confirm: z.literal(true) }),
  output: z.object({ ok: z.literal(true), changed: z.boolean() }),
  permission: 'agency',
  async handler(ctx, _input, deps) {
    requireAdmin(ctx);
    const { changed } = await deps.service.transaction((tx) => disconnectAgencyConnect(tx, ctx.agencyId, ctx.userId));
    return { ok: true as const, changed };
  },
});

const Defaults = z.object({
  priceCents: z.number().int().min(0).max(MAX_PRICE_CENTS),
  /** Omitted = unchanged; 0 = no setup fee. */
  setupFeeCents: z.number().int().min(0).max(MAX_PRICE_CENTS).optional(),
  /** Omitted = unchanged; null = never auto-pause. */
  autoPauseAfterDays: z.number().int().min(1).max(90).nullable().optional(),
});

export const setClientBillingDefaultsTool = defineTool({
  name: 'set_client_billing_defaults',
  access: 'write',
  description: 'Set the default monthly price, setup fee and auto-pause delay for client billing. A changed price creates a new Stripe price and archives the old one; existing client subscriptions are untouched.',
  input: Defaults,
  output: z.object({
    ok: z.literal(true),
    defaultPriceCents: z.number().int(),
    defaultSetupFeeCents: z.number().int().nullable(),
    autoPauseAfterDays: z.number().int().nullable(),
    priceChanged: z.boolean(),
  }),
  permission: 'agency',
  async handler(ctx, input, deps) {
    requireAdmin(ctx);
    const gw = gatewayOf(deps);
    const row = await connectRowOf(deps, ctx.agencyId);
    if (!row?.stripeAccountId || row.status === 'disconnected') throw new ToolError('conflict', CONNECT_FIRST_MESSAGE);
    const acct = row.stripeAccountId;
    const save = (v: Partial<typeof agencyConnect.$inferInsert>) =>
      deps.service.update(agencyConnect).set({ ...v, updatedAt: new Date() }).where(eq(agencyConnect.agencyId, ctx.agencyId));

    let productId = row.stripeProductId;
    let priceId = row.stripeDefaultPriceId;
    const oldPriceId = priceId;
    const priceChanged = !priceId || row.defaultPriceCents !== input.priceCents;
    if (priceChanged) {
      try {
        if (!productId) {
          const [a] = await deps.service.select({ name: agency.name }).from(agency).where(eq(agency.id, ctx.agencyId));
          productId = (await gw.createConnectedProduct({ stripeAccount: acct, name: `${a?.name ?? 'Agency'} competitor monitoring` })).id;
          await save({ stripeProductId: productId }); // kept even if the price step fails, so a retry reuses it
        }
        priceId = (await gw.createConnectedPrice({ stripeAccount: acct, productId, unitAmountCents: input.priceCents, currency: row.currency })).id;
      } catch (e) {
        stripeFailed(ctx.agencyId, 'createConnectedPrice', e);
      }
    }
    await save({
      ...(priceChanged ? { defaultPriceCents: input.priceCents, stripeDefaultPriceId: priceId } : {}),
      ...(input.setupFeeCents !== undefined ? { defaultSetupFeeCents: input.setupFeeCents } : {}),
      ...(input.autoPauseAfterDays !== undefined ? { autoPauseAfterDays: input.autoPauseAfterDays } : {}),
    });
    if (priceChanged && oldPriceId) {
      // Best-effort: an unarchived old price is harmless (nothing references it as the default any more).
      await gw.archiveConnectedPrice({ stripeAccount: acct, priceId: oldPriceId }).catch((e: unknown) =>
        console.error('[billing] archiveConnectedPrice failed', { agencyId: ctx.agencyId }, (e as { name?: string } | null)?.name));
    }
    const fresh = (await connectRowOf(deps, ctx.agencyId))!;
    return { ok: true as const, defaultPriceCents: fresh.defaultPriceCents!, defaultSetupFeeCents: fresh.defaultSetupFeeCents, autoPauseAfterDays: fresh.autoPauseAfterDays, priceChanged };
  },
});

export const clientBillingTools = [getConnectStatusTool, startStripeConnectTool, disconnectStripeTool, setClientBillingDefaultsTool];
