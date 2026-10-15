import { applyClientBillingSignal, clientBillingPill, countActiveClients, disconnectAgencyConnect, planFor } from '@cs/billing';
import { type AccessContext, canAccessClient, toolkit, ToolError } from '@cs/core';
import { type ClientBillingRow, agency, agencyBilling, agencyConnect, client, clientBilling, platformSetting } from '@cs/db';
import { and, asc, eq, sql } from 'drizzle-orm';
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
    // `status <> 'disconnected'`: a disconnect landing during the Stripe calls above must not be overwritten.
    const saved = await deps.service
      .update(agencyConnect)
      .set({
        ...(priceChanged ? { defaultPriceCents: input.priceCents, stripeDefaultPriceId: priceId } : {}),
        ...(input.setupFeeCents !== undefined ? { defaultSetupFeeCents: input.setupFeeCents } : {}),
        ...(input.autoPauseAfterDays !== undefined ? { autoPauseAfterDays: input.autoPauseAfterDays } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(agencyConnect.agencyId, ctx.agencyId), sql`${agencyConnect.status} <> 'disconnected'`))
      .returning({ agencyId: agencyConnect.agencyId });
    if (saved.length === 0) throw new ToolError('conflict', CONNECT_FIRST_MESSAGE);
    if (priceChanged && oldPriceId) {
      // Best-effort: an unarchived old price is harmless (nothing references it as the default any more).
      await gw.archiveConnectedPrice({ stripeAccount: acct, priceId: oldPriceId }).catch((e: unknown) =>
        console.error('[billing] archiveConnectedPrice failed', { agencyId: ctx.agencyId }, (e as { name?: string } | null)?.name));
    }
    const fresh = (await connectRowOf(deps, ctx.agencyId))!;
    return { ok: true as const, defaultPriceCents: fresh.defaultPriceCents!, defaultSetupFeeCents: fresh.defaultSetupFeeCents, autoPauseAfterDays: fresh.autoPauseAfterDays, priceChanged };
  },
});


// ---------------------------------------------------------------------------------------------------------------------
// Task 5: per-client billing (agency admin; the list is also open to in-scope account managers, states only)
// ---------------------------------------------------------------------------------------------------------------------

export const BILLING_NOT_ELIGIBLE_MESSAGE = 'Client billing is available once your Rival Monday subscription is active.';
export const CONNECT_NOT_READY_MESSAGE = 'Finish your Stripe setup first.';
export const NO_CLIENT_OWNER_MESSAGE = 'Invite a client owner first.';
export const NO_DEFAULT_PRICE_MESSAGE = 'Set a default price first, or give this client a price.';
const NO_PENDING_LINK_MESSAGE = 'No payment link is pending for this client.';
const ALREADY_BILLING_MESSAGE = 'Billing is already on for this client.';

const ClientId = z.string().uuid();
const Cents = z.number().int().min(0).max(MAX_PRICE_CENTS);
const StateEnum = z.enum(['off', 'invited', 'active', 'payment_needed', 'cancelled', 'disconnected']);
const SUBSCRIBED = ['active', 'payment_needed'];

/** Same 404 for unknown, other-agency and out-of-scope clients. */
async function ownClient(deps: ToolDeps, ctx: AccessContext, clientId: string) {
  if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
  const [c] = await deps.service.select({ id: client.id, agencyId: client.agencyId, status: client.status }).from(client).where(eq(client.id, clientId));
  if (!c || c.agencyId !== ctx.agencyId) throw new ToolError('not_found', 'Client not found');
  return c;
}

const billingRowOf = async (deps: ToolDeps, clientId: string): Promise<ClientBillingRow | null> =>
  (await deps.service.select().from(clientBilling).where(eq(clientBilling.clientId, clientId)))[0] ?? null;

/** f8: 9a state `active|pilot` (a missing row counts as the default pilot), then a connected account with charges enabled. */
async function eligibleConnect(deps: ToolDeps, agencyId: string) {
  const [b] = await deps.service.select({ state: agencyBilling.state }).from(agencyBilling).where(eq(agencyBilling.agencyId, agencyId));
  const state = b?.state ?? 'pilot';
  if (state !== 'active' && state !== 'pilot') throw new ToolError('billing_not_eligible', BILLING_NOT_ELIGIBLE_MESSAGE);
  const connect = await connectRowOf(deps, agencyId);
  if (!connect?.stripeAccountId || connect.status === 'disconnected') throw new ToolError('conflict', CONNECT_FIRST_MESSAGE);
  if (connect.status !== 'connected' || !connect.chargesEnabled) throw new ToolError('connect_not_ready', CONNECT_NOT_READY_MESSAGE);
  return { connect, acct: connect.stripeAccountId };
}

/** Q3: the agency's own percent when set (even 0), else the platform default. Read at Checkout creation only. */
async function effectiveFeePercent(deps: ToolDeps, connect: { applicationFeePercent: string | null }): Promise<number> {
  if (connect.applicationFeePercent !== null) return Number(connect.applicationFeePercent) || 0;
  const [s] = await deps.service.select({ value: platformSetting.value }).from(platformSetting).where(eq(platformSetting.key, 'connect_application_fee_percent'));
  return Number(s?.value) || 0;
}

/** Client owner emails in a deterministic order (membership age, then id), de-duplicated case-insensitively. */
async function clientOwnerEmails(deps: ToolDeps, clientId: string): Promise<string[]> {
  const rows = await deps.service.execute<{ email: string }>(sql`
    select u.email from membership m join auth."user" u on u.id = m.user_id
    where m.client_id = ${clientId} and m.role = 'client_owner' order by m.created_at, m.id`);
  const seen = new Set<string>();
  return [...rows].map((r) => r.email).filter((e) => {
    const k = e.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function appBase(deps: ToolDeps): string {
  if (!deps.appUrl) throw new ToolError('internal', 'Billing is not configured (APP_URL)');
  return deps.appUrl.replace(/\/+$/, '');
}

/** The Checkout URL is returned only to be stored in the outbox row; it is never logged or put in a tool result. */
async function checkoutFor(
  deps: ToolDeps,
  ctx: AccessContext,
  connect: { applicationFeePercent: string | null },
  i: { acct: string; priceId: string; setupFeeCents: number; email: string },
): Promise<string> {
  const fee = await effectiveFeePercent(deps, connect);
  const base = appBase(deps);
  try {
    return (
      await deps.billing!.createConnectedCheckout({
        stripeAccount: i.acct, priceId: i.priceId, customerEmail: i.email,
        ...(i.setupFeeCents > 0 && { setupFeeCents: i.setupFeeCents }),
        ...(fee > 0 && { applicationFeePercent: fee }),
        successUrl: `${base}/?billing=thanks`, cancelUrl: `${base}/?billing=cancelled`,
      })
    ).url;
  } catch (e) {
    stripeFailed(ctx.agencyId, 'createConnectedCheckout', e);
  }
}

async function connectedPrice(deps: ToolDeps, ctx: AccessContext, connect: { stripeProductId: string | null; currency: string }, acct: string, cents: number): Promise<string> {
  if (!connect.stripeProductId) throw new ToolError('conflict', NO_DEFAULT_PRICE_MESSAGE);
  try {
    return (await deps.billing!.createConnectedPrice({ stripeAccount: acct, productId: connect.stripeProductId, unitAmountCents: cents, currency: connect.currency })).id;
  } catch (e) {
    stripeFailed(ctx.agencyId, 'createConnectedPrice', e);
  }
}

const archiveQuietly = (deps: ToolDeps, agencyId: string, acct: string, priceId: string | null, keep: (string | null)[]) =>
  priceId && !keep.includes(priceId)
    ? deps.billing!.archiveConnectedPrice({ stripeAccount: acct, priceId }).catch((e: unknown) =>
        console.error('[billing] archiveConnectedPrice failed', { agencyId }, (e as { name?: string } | null)?.name))
    : Promise.resolve();

export const enableClientBillingTool = defineTool({
  name: 'enable_client_billing',
  access: 'write',
  description: "Turn on billing for a client: emails the client owner(s) a Stripe Checkout link (valid 24 hours) on the agency's account. Optional per-client price and setup fee override the defaults.",
  input: z.object({ clientId: ClientId, priceCents: Cents.optional(), setupFeeCents: Cents.optional() }),
  output: z.object({ ok: z.literal(true), state: StateEnum, priceCents: z.number().int(), setupFeeCents: z.number().int(), recipients: z.number().int() }),
  permission: 'agency',
  async handler(ctx, input, deps) {
    requireAdmin(ctx);
    gatewayOf(deps);
    const c = await ownClient(deps, ctx, input.clientId);
    const { connect, acct } = await eligibleConnect(deps, ctx.agencyId);
    if (c.status !== 'active') throw new ToolError('invalid_input', 'Only an active client can be billed.');
    const existing = await billingRowOf(deps, c.id);
    if (existing?.enabled && ['invited', 'active', 'payment_needed'].includes(existing.state)) throw new ToolError('conflict', ALREADY_BILLING_MESSAGE);
    const emails = await clientOwnerEmails(deps, c.id);
    if (emails.length === 0) throw new ToolError('no_client_owner', NO_CLIENT_OWNER_MESSAGE);

    // Price: explicit override > a price stored earlier for this client (set_client_price new_only) > the agency default.
    let priceCents: number;
    let priceId: string;
    const stored = existing && (existing.state === 'off' || existing.state === 'cancelled') && existing.stripePriceId && existing.priceCents !== null ? existing : null;
    if (input.priceCents === undefined && stored) {
      priceCents = stored.priceCents!;
      priceId = stored.stripePriceId!;
    } else if (input.priceCents !== undefined && input.priceCents !== connect.defaultPriceCents) {
      priceCents = input.priceCents;
      priceId = await connectedPrice(deps, ctx, connect, acct, priceCents);
    } else {
      if (connect.defaultPriceCents === null || !connect.stripeDefaultPriceId) throw new ToolError('conflict', NO_DEFAULT_PRICE_MESSAGE);
      priceCents = connect.defaultPriceCents;
      priceId = connect.stripeDefaultPriceId;
    }
    const setupFeeCents = input.setupFeeCents ?? (stored ? stored.setupFeeCents : null) ?? connect.defaultSetupFeeCents ?? 0;
    const checkoutUrl = await checkoutFor(deps, ctx, connect, { acct, priceId, setupFeeCents, email: emails[0]! });
    const r = await deps.service.transaction((tx) =>
      applyClientBillingSignal(tx, c.id, { type: 'invited', priceCents, setupFeeCents, stripePriceId: priceId, checkoutUrl }, ctx.userId));
    if (!r.changed) throw new ToolError('conflict', ALREADY_BILLING_MESSAGE);
    return { ok: true as const, state: r.state!, priceCents, setupFeeCents, recipients: emails.length };
  },
});

export const resendClientPaymentLinkTool = defineTool({
  name: 'resend_client_payment_link',
  access: 'write',
  description: 'Send the client owner(s) a fresh Stripe Checkout link (the previous one is replaced; each link is valid 24 hours).',
  input: z.object({ clientId: ClientId }),
  output: z.object({ ok: z.literal(true), state: StateEnum, recipients: z.number().int() }),
  permission: 'agency',
  async handler(ctx, { clientId }, deps) {
    requireAdmin(ctx);
    gatewayOf(deps);
    const c = await ownClient(deps, ctx, clientId);
    const { connect, acct } = await eligibleConnect(deps, ctx.agencyId);
    const row = await billingRowOf(deps, c.id);
    if (!row || !row.enabled || row.state !== 'invited' || !row.stripePriceId || row.priceCents === null) throw new ToolError('conflict', NO_PENDING_LINK_MESSAGE);
    const emails = await clientOwnerEmails(deps, c.id);
    if (emails.length === 0) throw new ToolError('no_client_owner', NO_CLIENT_OWNER_MESSAGE);
    const setupFeeCents = row.setupFeeCents ?? 0;
    const checkoutUrl = await checkoutFor(deps, ctx, connect, { acct, priceId: row.stripePriceId, setupFeeCents, email: emails[0]! });
    const r = await deps.service.transaction((tx) =>
      applyClientBillingSignal(tx, c.id, { type: 'invited', priceCents: row.priceCents!, setupFeeCents, stripePriceId: row.stripePriceId!, checkoutUrl }, ctx.userId));
    if (!r.changed) throw new ToolError('conflict', NO_PENDING_LINK_MESSAGE);
    return { ok: true as const, state: r.state!, recipients: emails.length };
  },
});

export const disableClientBillingTool = defineTool({
  name: 'disable_client_billing',
  access: 'write',
  description: "Turn off billing for a client. A running subscription is cancelled at the end of the current period; an unpaid invite is withdrawn. Allowed while the agency's own account is paused.",
  input: z.object({ clientId: ClientId, confirm: z.literal(true) }),
  output: z.object({ ok: z.literal(true), state: StateEnum, cancelAtPeriodEnd: z.boolean() }),
  permission: 'agency',
  async handler(ctx, { clientId }, deps) {
    requireAdmin(ctx);
    const gw = gatewayOf(deps);
    const c = await ownClient(deps, ctx, clientId);
    const row = await billingRowOf(deps, c.id);
    if (!row) return { ok: true as const, state: 'off' as const, cancelAtPeriodEnd: false };
    let cancelAtPeriodEnd = false;
    if (row.enabled && row.stripeSubscriptionId && SUBSCRIBED.includes(row.state)) {
      // After a disconnect Rival Monday no longer touches the agency's Stripe account: the change is local only.
      const connect = await connectRowOf(deps, ctx.agencyId);
      if (connect?.stripeAccountId && connect.status !== 'disconnected') {
        try {
          await gw.cancelConnectedSubscriptionAtPeriodEnd({ stripeAccount: connect.stripeAccountId, subscriptionId: row.stripeSubscriptionId });
        } catch (e) {
          stripeFailed(ctx.agencyId, 'cancelConnectedSubscriptionAtPeriodEnd', e);
        }
        cancelAtPeriodEnd = true;
      }
    }
    const r = await deps.service.transaction((tx) => applyClientBillingSignal(tx, c.id, { type: 'disabled' }, ctx.userId));
    return { ok: true as const, state: r.state ?? 'off', cancelAtPeriodEnd };
  },
});

export const setClientPriceTool = defineTool({
  name: 'set_client_price',
  access: 'write',
  description: "Change one client's monthly price. 'next_bill' moves a running subscription to the new price from the next bill (no immediate charge); 'new_only' only stores it for the next payment link.",
  input: z.object({ clientId: ClientId, priceCents: Cents, applyTo: z.enum(['next_bill', 'new_only']) }),
  output: z.object({ ok: z.literal(true), priceCents: z.number().int(), appliedToSubscription: z.boolean() }),
  permission: 'agency',
  async handler(ctx, input, deps) {
    requireAdmin(ctx);
    const gw = gatewayOf(deps);
    const c = await ownClient(deps, ctx, input.clientId);
    const { connect, acct } = await eligibleConnect(deps, ctx.agencyId);
    const row = await billingRowOf(deps, c.id);
    const priceId =
      input.priceCents === connect.defaultPriceCents && connect.stripeDefaultPriceId
        ? connect.stripeDefaultPriceId
        : await connectedPrice(deps, ctx, connect, acct, input.priceCents);
    const live = !!row && row.enabled && !!row.stripeSubscriptionId && SUBSCRIBED.includes(row.state);
    const apply = input.applyTo === 'next_bill' && live;
    if (apply) {
      try {
        await gw.updateConnectedSubscriptionPrice({ stripeAccount: acct, subscriptionId: row.stripeSubscriptionId!, priceId, prorate: false });
      } catch (e) {
        stripeFailed(ctx.agencyId, 'updateConnectedSubscriptionPrice', e);
      }
    }
    await deps.service.transaction((tx) => applyClientBillingSignal(tx, c.id, { type: 'price_changed', priceCents: input.priceCents, stripePriceId: priceId }, ctx.userId));
    // A per-client price nothing uses any more (the subscription moved off it, or there is none) is archived best-effort.
    if (apply || !live) await archiveQuietly(deps, ctx.agencyId, acct, row?.stripePriceId ?? null, [priceId, connect.stripeDefaultPriceId]);
    return { ok: true as const, priceCents: input.priceCents, appliedToSubscription: apply };
  },
});

const Pill = z.object({ key: z.enum(['paused', 'payment_needed', 'invited', 'paying', 'off']), label: z.string() });

export const listClientBillingStatusTool = defineTool({
  name: 'list_client_billing_status',
  access: 'read',
  description: "Each client's billing state and status pill. Agency admins also see the price and setup fee; account managers see states only.",
  input: z.object({}),
  output: z.object({
    clients: z.array(z.object({
      clientId: z.string(), name: z.string(), state: StateEnum, enabled: z.boolean(), pill: Pill,
      priceCents: z.number().int().nullable().optional(), setupFeeCents: z.number().int().nullable().optional(),
    })),
  }),
  permission: 'agency',
  async handler(ctx, _input, deps) {
    if (ctx.role !== 'agency_admin' && ctx.role !== 'account_manager') throw new ToolError('permission_denied', 'Not allowed');
    const admin = ctx.role === 'agency_admin';
    const rows = await deps.service
      .select({ id: client.id, name: client.name, pausedAt: client.pausedAt, b: clientBilling })
      .from(client)
      .leftJoin(clientBilling, eq(clientBilling.clientId, client.id))
      .where(and(eq(client.agencyId, ctx.agencyId), eq(client.status, 'active')))
      .orderBy(asc(client.name), asc(client.id));
    return {
      clients: rows.filter((r) => canAccessClient(ctx, r.id)).map((r) => ({
        clientId: r.id, name: r.name, state: r.b?.state ?? ('off' as const), enabled: r.b?.enabled ?? false,
        pill: clientBillingPill({ pausedAt: r.pausedAt, billing: r.b }),
        ...(admin && { priceCents: r.b?.priceCents ?? null, setupFeeCents: r.b?.setupFeeCents ?? null }),
      })),
    };
  },
});

export const getClientRevenueTool = defineTool({
  name: 'get_client_revenue',
  access: 'read',
  description: 'Revenue from client billing: monthly recurring revenue of active subscriptions, paying and payment-needed counts, and our subscription cost (plan base plus extra seats) for margin.',
  input: z.object({}),
  output: z.object({
    currency: z.string(), mrrCents: z.number().int(), payingCount: z.number().int(), paymentNeededCount: z.number().int(), invitedCount: z.number().int(),
    ourCostCents: z.number().int(), marginCents: z.number().int(),
  }),
  permission: 'agency',
  async handler(ctx, _input, deps) {
    requireAdmin(ctx);
    const rows = await deps.service
      .select({ state: clientBilling.state, priceCents: clientBilling.priceCents })
      .from(clientBilling)
      .innerJoin(client, eq(client.id, clientBilling.clientId))
      .where(and(eq(clientBilling.agencyId, ctx.agencyId), eq(clientBilling.enabled, true), eq(client.status, 'active')));
    const active = rows.filter((r) => r.state === 'active');
    const mrrCents = active.reduce((n, r) => n + (r.priceCents ?? 0), 0);
    // Our cost is the 9a invoice before discounts: plan base + seats beyond the included ones.
    const [ab] = await deps.service.select().from(agencyBilling).where(eq(agencyBilling.agencyId, ctx.agencyId));
    const [p, used] = await Promise.all([planFor(deps.service, ab ?? null), countActiveClients(deps.service, ctx.agencyId)]);
    const ourCostCents = p ? p.basePriceCents + Math.max(0, used - p.includedSeats) * p.seatPriceCents : 0;
    const connect = await connectRowOf(deps, ctx.agencyId);
    return {
      currency: connect?.currency ?? 'usd', mrrCents, payingCount: active.length,
      paymentNeededCount: rows.filter((r) => r.state === 'payment_needed').length,
      invitedCount: rows.filter((r) => r.state === 'invited').length,
      ourCostCents, marginCents: mrrCents - ourCostCents,
    };
  },
});

export const clientBillingTools = [
  getConnectStatusTool, startStripeConnectTool, disconnectStripeTool, setClientBillingDefaultsTool,
  enableClientBillingTool, disableClientBillingTool, resendClientPaymentLinkTool, setClientPriceTool, getClientRevenueTool, listClientBillingStatusTool,
];
