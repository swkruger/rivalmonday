import {
  type ClientBillingSignal, effectiveConnectFeePercent, LIVE_SUBSCRIPTION_STATUSES, applyClientBillingSignal, connectStatusFor, clientBillingPill, countActiveClients,
  disconnectAgencyConnect, isPaymentProcessing, isSubscribed, planFor,
} from '@cs/billing';
import { type AccessContext, canAccessClient, toolkit, ToolError, type ToolErrorCode } from '@cs/core';
import { type ClientBillingRow, type ClientBillingState, type Tx, agency, agencyBilling, agencyConnect, client, clientBilling } from '@cs/db';
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
export const STRIPE_FAILED_MESSAGE = "Stripe couldn't complete that. Please try again.";

/** R19: a refusal whose message is decided copy: shown as is by the web forms and MCP (`conflict` included). */
const refuse = (code: ToolErrorCode, message: string) => new ToolError(code, message, { userFacing: true });
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

/**
 * R25: the agency's Customer Portal configuration on its connected account (payment method update, invoice history, no
 * cancel), created once and stored in `agency_connect.portal_configuration_id`. A concurrent creator's stored id wins.
 * Throws the gateway error (logged by name only).
 */
export async function ensurePortalConfiguration(deps: ToolDeps, agencyId: string, stripeAccount: string): Promise<string> {
  const [cur] = await deps.service.select({ id: agencyConnect.portalConfigurationId }).from(agencyConnect).where(and(eq(agencyConnect.agencyId, agencyId), eq(agencyConnect.stripeAccountId, stripeAccount)));
  if (cur?.id) return cur.id;
  let id: string;
  try {
    id = (await deps.billing!.createConnectedPortalConfiguration({ stripeAccount })).id;
  } catch (e) {
    console.error('[billing] createConnectedPortalConfiguration failed', { agencyId }, (e as { name?: string } | null)?.name);
    throw e;
  }
  await deps.service
    .update(agencyConnect)
    .set({ portalConfigurationId: id, updatedAt: new Date() })
    .where(and(eq(agencyConnect.agencyId, agencyId), eq(agencyConnect.stripeAccountId, stripeAccount), sql`${agencyConnect.portalConfigurationId} IS NULL`));
  const [after] = await deps.service.select({ id: agencyConnect.portalConfigurationId }).from(agencyConnect).where(eq(agencyConnect.agencyId, agencyId));
  return after?.id ?? id;
}

/** Stripe failures never leak their message to the caller (it can carry account detail); R19: the form shows the fixed copy inline. */
function stripeFailed(agencyId: string, what: string, e: unknown): never {
  console.error('[billing] connect gateway call failed', { agencyId, what }, (e as { name?: string } | null)?.name);
  throw refuse('internal', STRIPE_FAILED_MESSAGE);
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
    // Live refresh: lets the page show the result right after onboarding returns. R26: a live state that differs from the
    // stored one is persisted (same rule as the account.updated webhook, so a missed webhook cannot leave enable refusing);
    // never in a read-only support session, and never over a disconnect that landed meanwhile.
    let connectedAt = row?.connectedAt ?? null;
    if (deps.billing && row?.stripeAccountId && row.status !== 'disconnected') {
      try {
        const live = await deps.billing.getAccount({ stripeAccount: row.stripeAccountId });
        chargesEnabled = live.chargesEnabled;
        detailsSubmitted = live.detailsSubmitted;
        status = connectStatusFor(live);
        if (!ctx.support && (status !== row.status || chargesEnabled !== row.chargesEnabled || detailsSubmitted !== row.detailsSubmitted)) {
          const now = new Date();
          if (chargesEnabled && !connectedAt) connectedAt = now;
          await deps.service
            .update(agencyConnect)
            .set({ status, chargesEnabled, detailsSubmitted, connectedAt, updatedAt: now })
            .where(and(eq(agencyConnect.agencyId, ctx.agencyId), eq(agencyConnect.stripeAccountId, row.stripeAccountId), sql`${agencyConnect.status} <> 'disconnected'`));
        }
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
      connectedAt: iso(connectedAt),
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
    // R24: an admin disconnect keeps the account id, so reconnecting reuses the same account (its product, prices, portal
    // configuration and client subscriptions live there). Only a deauthorization (Stripe revoked access) clears it.
    const reuse = row?.stripeAccountId ?? undefined;
    let link: { url: string; accountId: string };
    try {
      link = await gw.createAccountLink({ accountId: reuse, returnUrl, refreshUrl });
    } catch (e) {
      stripeFailed(ctx.agencyId, 'createAccountLink', e);
    }
    const now = new Date();
    if (!row || row.status === 'disconnected') {
      // Pending until the live state (account.updated, or get_connect_status R26) says otherwise.
      const pending = { stripeAccountId: link.accountId, status: 'pending' as const, chargesEnabled: false, detailsSubmitted: false, disconnectedAt: null, updatedAt: now };
      // A fresh account: nothing of the old one carries over.
      const fresh = reuse ? {} : { stripeProductId: null, stripeDefaultPriceId: null, portalConfigurationId: null, connectedAt: null };
      await deps.service.insert(agencyConnect).values({ agencyId: ctx.agencyId, ...pending, ...fresh }).onConflictDoUpdate({ target: agencyConnect.agencyId, set: { ...pending, ...fresh } });
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
    if (!row?.stripeAccountId || row.status === 'disconnected') throw refuse('conflict', CONNECT_FIRST_MESSAGE);
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
    if (saved.length === 0) throw refuse('conflict', CONNECT_FIRST_MESSAGE);
    // R25: the clients' "Manage payment" page needs a portal configuration on the connected account. Best effort here
    // (open_billing_portal creates it lazily when missing).
    if (!row.portalConfigurationId) await ensurePortalConfiguration(deps, ctx.agencyId, acct).catch(() => null);
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
export const PAYMENT_PROCESSING_MESSAGE = "This client's first payment is still processing.";
const ALREADY_BILLING_MESSAGE = 'Billing is already on for this client.';
export const SUBSCRIPTION_ENDING_MESSAGE = "This client's subscription ends at the end of the billing period. Turn billing on again after that.";
export const STRIPE_SUBSCRIPTION_EXISTS_MESSAGE = 'This client already has a subscription in your Stripe account. Cancel it there first.';

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
  if (state !== 'active' && state !== 'pilot') throw refuse('billing_not_eligible', BILLING_NOT_ELIGIBLE_MESSAGE);
  const connect = await connectRowOf(deps, agencyId);
  if (!connect?.stripeAccountId || connect.status === 'disconnected') throw refuse('conflict', CONNECT_FIRST_MESSAGE);
  if (connect.status !== 'connected' || !connect.chargesEnabled) throw refuse('connect_not_ready', CONNECT_NOT_READY_MESSAGE);
  return { connect, acct: connect.stripeAccountId };
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
  i: { acct: string; clientId: string; priceId: string; setupFeeCents: number; email: string },
): Promise<{ url: string; id: string }> {
  const fee = await effectiveConnectFeePercent(deps.service, ctx.agencyId);
  const base = appBase(deps);
  try {
    return await deps.billing!.createConnectedCheckout({
      stripeAccount: i.acct, priceId: i.priceId, customerEmail: i.email, clientReferenceId: i.clientId,
      ...(i.setupFeeCents > 0 && { setupFeeCents: i.setupFeeCents }),
      ...(fee > 0 && { applicationFeePercent: fee }),
      successUrl: `${base}/c/${i.clientId}/settings/billing?checkout=done`, cancelUrl: `${base}/c/${i.clientId}/settings/billing?checkout=cancelled`,
    });
  } catch (e) {
    stripeFailed(ctx.agencyId, 'createConnectedCheckout', e);
  }
}

type ConnectRow = typeof agencyConnect.$inferSelect;

/**
 * R20: Checkout price resolution at creation time. A stored price is reused only when it is the agency's current default
 * or a still-active per-client price (an override in use is never archived, so an archived stored id can only be an old
 * default). Otherwise: null, and the caller falls back to the CURRENT default.
 */
async function storedPriceUsable(deps: ToolDeps, ctx: AccessContext, connect: ConnectRow, acct: string, priceId: string | null, priceCents: number | null): Promise<{ priceId: string; priceCents: number } | null> {
  if (!priceId || priceCents === null) return null;
  if (priceId === connect.stripeDefaultPriceId) return { priceId, priceCents };
  if (connect.stripeDefaultPriceId && priceCents === connect.defaultPriceCents) return { priceId: connect.stripeDefaultPriceId, priceCents };
  let active: boolean;
  try {
    active = (await deps.billing!.getConnectedPrice({ stripeAccount: acct, priceId })).active;
  } catch (e) {
    if ((e as { code?: string } | null)?.code !== 'resource_missing') stripeFailed(ctx.agencyId, 'getConnectedPrice', e);
    active = false;
  }
  return active ? { priceId, priceCents } : null;
}

/** The agency's current default price, or the set-defaults refusal. */
function currentDefault(connect: ConnectRow): { priceId: string; priceCents: number } {
  if (connect.defaultPriceCents === null || !connect.stripeDefaultPriceId) throw refuse('conflict', NO_DEFAULT_PRICE_MESSAGE);
  return { priceId: connect.stripeDefaultPriceId, priceCents: connect.defaultPriceCents };
}

async function connectedPrice(deps: ToolDeps, ctx: AccessContext, connect: { stripeProductId: string | null; currency: string }, acct: string, cents: number): Promise<string> {
  if (!connect.stripeProductId) throw refuse('conflict', NO_DEFAULT_PRICE_MESSAGE);
  try {
    return (await deps.billing!.createConnectedPrice({ stripeAccount: acct, productId: connect.stripeProductId, unitAmountCents: cents, currency: connect.currency })).id;
  } catch (e) {
    stripeFailed(ctx.agencyId, 'createConnectedPrice', e);
  }
}

/** R10: the previous Checkout link must stop working. Best effort (an already completed/expired session rejects): logs the error name only. */
async function expireQuietly(deps: ToolDeps, agencyId: string, acct: string, sessionId: string | null): Promise<void> {
  if (!sessionId) return;
  await deps.billing!.expireConnectedCheckout({ stripeAccount: acct, sessionId }).catch((e: unknown) =>
    console.error('[billing] expireConnectedCheckout failed', { agencyId }, (e as { name?: string } | null)?.name));
}

const JUST_PAID_MESSAGE = 'This client has just paid. Refresh to see the latest status.';
const INVITE_CHANGED_MESSAGE = 'This payment link was just changed. Refresh to see the latest status.';

/** R13b: a link that was already paid must not be replaced by (and mailed as) a new one. Read the session before creating anything. */
async function assertNotPaid(deps: ToolDeps, ctx: AccessContext, acct: string, sessionId: string | null): Promise<void> {
  if (!sessionId) return;
  let status: string;
  try {
    status = (await deps.billing!.getConnectedCheckout({ stripeAccount: acct, sessionId })).status;
  } catch (e) {
    if ((e as { code?: string } | null)?.code === 'resource_missing') return;
    stripeFailed(ctx.agencyId, 'getConnectedCheckout', e);
  }
  if (status === 'complete') throw refuse('conflict', JUST_PAID_MESSAGE);
}

/**
 * R13a/d: commits an `invited` signal for a Checkout session created beforehand. The row is re-read `FOR UPDATE` inside the
 * transaction and `guard` refuses when it changed since the tool looked (a concurrent enable/resend/payment). On any failure
 * the unmailed new session is expired best-effort; on success the session it replaced is, after the commit.
 */
async function commitInvite(
  deps: ToolDeps,
  ctx: AccessContext,
  clientId: string,
  acct: string,
  signal: Extract<ClientBillingSignal, { type: 'invited' }>,
  replaced: string | null,
  guard: (cur: ClientBillingRow) => void,
  unchanged: string,
): Promise<{ state: ClientBillingState }> {
  try {
    const r = await deps.service.transaction(async (tx) => {
      await assertConnectLive(tx, ctx.agencyId);
      await tx.insert(clientBilling).values({ clientId, agencyId: ctx.agencyId, state: 'off' }).onConflictDoNothing();
      const [cur] = await tx.select().from(clientBilling).where(eq(clientBilling.clientId, clientId)).for('update');
      guard(cur!);
      return applyClientBillingSignal(tx, clientId, signal, ctx.userId);
    });
    if (!r.changed) throw refuse('conflict', unchanged);
    await expireQuietly(deps, ctx.agencyId, acct, replaced);
    return { state: r.state! };
  } catch (e) {
    await expireQuietly(deps, ctx.agencyId, acct, signal.checkoutSessionId);
    throw e;
  }
}

/** R13d: the invite being replaced must still be the pending one the tool read (not paid, not replaced meanwhile). */
function guardPendingInvite(cur: ClientBillingRow, expectedSessionId: string | null): void {
  if (cur.state === 'active' || cur.state === 'payment_needed') throw refuse('conflict', JUST_PAID_MESSAGE);
  if (cur.state !== 'invited' || !cur.enabled) throw refuse('conflict', NO_PENDING_LINK_MESSAGE);
  // R21: an async Checkout completed meanwhile (R16): its first payment is processing, a second link must not go out.
  if (isPaymentProcessing(cur)) throw refuse('conflict', PAYMENT_PROCESSING_MESSAGE);
  if (cur.checkoutSessionId !== expectedSessionId) throw refuse('conflict', INVITE_CHANGED_MESSAGE);
}

/** R12b: a disconnect can land between the eligibility check and the write; re-check inside the writing transaction. */
async function assertConnectLive(tx: Tx, agencyId: string): Promise<void> {
  const [c] = await tx.select({ status: agencyConnect.status }).from(agencyConnect).where(eq(agencyConnect.agencyId, agencyId)).for('share');
  if (!c || c.status === 'disconnected') throw refuse('connect_not_ready', CONNECT_NOT_READY_MESSAGE);
}

/** R11: a stored subscription id means Stripe may still bill this client. Live -> refuse; ended or gone -> forget it. */
async function clearEndedSubscription(deps: ToolDeps, agencyId: string, acct: string, row: ClientBillingRow): Promise<void> {
  if (!row.stripeSubscriptionId) return;
  let live: boolean;
  try {
    // A paused subscription (Stripe pause_collection) can resume and bill again: live.
    live = [...LIVE_SUBSCRIPTION_STATUSES, 'paused'].includes((await deps.billing!.getConnectedSubscription({ stripeAccount: acct, subscriptionId: row.stripeSubscriptionId })).status);
  } catch (e) {
    if ((e as { code?: string } | null)?.code !== 'resource_missing') stripeFailed(agencyId, 'getConnectedSubscription', e);
    live = false;
  }
  if (live) throw refuse('conflict', STRIPE_SUBSCRIPTION_EXISTS_MESSAGE);
  await deps.service.update(clientBilling).set({ stripeSubscriptionId: null, updatedAt: new Date() }).where(eq(clientBilling.clientId, row.clientId));
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
    if (existing?.enabled && ['invited', 'active', 'payment_needed'].includes(existing.state)) throw refuse('conflict', ALREADY_BILLING_MESSAGE);
    // R21: a tracked subscription (also an invited one whose first payment is processing) must end first.
    if (existing && !existing.enabled && isSubscribed(existing)) throw refuse('conflict', SUBSCRIPTION_ENDING_MESSAGE);
    const emails = await clientOwnerEmails(deps, c.id);
    if (emails.length === 0) throw refuse('no_client_owner', NO_CLIENT_OWNER_MESSAGE);
    if (existing) await clearEndedSubscription(deps, ctx.agencyId, acct, existing);

    // Price: explicit override > a usable price stored earlier for this client (set_client_price new_only) > the CURRENT default (R20).
    let priceCents: number;
    let priceId: string;
    const storedRow = existing && (existing.state === 'off' || existing.state === 'cancelled' || existing.state === 'disconnected') ? existing : null;
    const stored = input.priceCents === undefined && storedRow ? await storedPriceUsable(deps, ctx, connect, acct, storedRow.stripePriceId, storedRow.priceCents) : null;
    if (stored) {
      ({ priceId, priceCents } = stored);
    } else if (input.priceCents !== undefined && input.priceCents !== connect.defaultPriceCents) {
      priceCents = input.priceCents;
      priceId = await connectedPrice(deps, ctx, connect, acct, priceCents);
    } else {
      ({ priceId, priceCents } = currentDefault(connect));
    }
    // The one-time setup fee is only for a client who has never paid.
    const setupFeeCents = existing?.lastPaidAt ? 0 : input.setupFeeCents ?? (stored ? storedRow!.setupFeeCents : null) ?? connect.defaultSetupFeeCents ?? 0;
    const checkout = await checkoutFor(deps, ctx, { acct, clientId: c.id, priceId, setupFeeCents, email: emails[0]! });
    const r = await commitInvite(
      deps, ctx, c.id, acct,
      { type: 'invited', priceCents, setupFeeCents, stripePriceId: priceId, checkoutUrl: checkout.url, checkoutSessionId: checkout.id },
      null,
      (cur) => {
        // R13d: another enable (or a payment) won the race since the check above.
        if (cur.enabled && ['invited', 'active', 'payment_needed'].includes(cur.state)) throw refuse('conflict', ALREADY_BILLING_MESSAGE);
        if (!cur.enabled && isSubscribed(cur)) throw refuse('conflict', SUBSCRIPTION_ENDING_MESSAGE);
      },
      ALREADY_BILLING_MESSAGE,
    );
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
    if (!row || !row.enabled || row.state !== 'invited' || row.priceCents === null) throw refuse('conflict', NO_PENDING_LINK_MESSAGE);
    if (isPaymentProcessing(row)) throw refuse('conflict', PAYMENT_PROCESSING_MESSAGE);
    const emails = await clientOwnerEmails(deps, c.id);
    if (emails.length === 0) throw refuse('no_client_owner', NO_CLIENT_OWNER_MESSAGE);
    const setupFeeCents = row.setupFeeCents ?? 0;
    await assertNotPaid(deps, ctx, acct, row.checkoutSessionId);
    // R20: the client's own price while still usable, else the CURRENT default (never an archived old default).
    const price = (await storedPriceUsable(deps, ctx, connect, acct, row.stripePriceId, row.priceCents)) ?? currentDefault(connect);
    const checkout = await checkoutFor(deps, ctx, { acct, clientId: c.id, priceId: price.priceId, setupFeeCents, email: emails[0]! });
    const r = await commitInvite(
      deps, ctx, c.id, acct,
      { type: 'invited', priceCents: price.priceCents, setupFeeCents, stripePriceId: price.priceId, checkoutUrl: checkout.url, checkoutSessionId: checkout.id },
      row.checkoutSessionId,
      (cur) => guardPendingInvite(cur, row.checkoutSessionId),
      NO_PENDING_LINK_MESSAGE,
    );
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
    // R21: an invited row with a tracked subscription (first payment processing) is subscribed too.
    if (row.enabled && isSubscribed(row)) {
      // After a disconnect Rival Monday no longer touches the agency's Stripe account: the change is local only.
      const connect = await connectRowOf(deps, ctx.agencyId);
      if (connect?.stripeAccountId && connect.status !== 'disconnected') {
        try {
          await gw.cancelConnectedSubscriptionAtPeriodEnd({ stripeAccount: connect.stripeAccountId, subscriptionId: row.stripeSubscriptionId! });
        } catch (e) {
          stripeFailed(ctx.agencyId, 'cancelConnectedSubscriptionAtPeriodEnd', e);
        }
        cancelAtPeriodEnd = true;
      }
    }
    if (row.state === 'invited' && !row.stripeSubscriptionId) {
      const connect = await connectRowOf(deps, ctx.agencyId);
      if (connect?.stripeAccountId && connect.status !== 'disconnected') await expireQuietly(deps, ctx.agencyId, connect.stripeAccountId, row.checkoutSessionId);
    }
    const r = await deps.service.transaction((tx) => applyClientBillingSignal(tx, c.id, { type: 'disabled' }, ctx.userId));
    return { ok: true as const, state: r.state ?? 'off', cancelAtPeriodEnd };
  },
});

export const setClientPriceTool = defineTool({
  name: 'set_client_price',
  access: 'write',
  description: "Change one client's monthly price. 'next_bill' moves a running subscription to the new price from the next bill (no immediate charge); 'new_only' only sets the price of the next payment link. A pending invite gets a fresh link at the new price.",
  input: z.object({ clientId: ClientId, priceCents: Cents, applyTo: z.enum(['next_bill', 'new_only']) }),
  output: z.object({ ok: z.literal(true), priceCents: z.number().int(), appliedToSubscription: z.boolean(), linkResent: z.boolean() }),
  permission: 'agency',
  async handler(ctx, input, deps) {
    requireAdmin(ctx);
    const gw = gatewayOf(deps);
    const c = await ownClient(deps, ctx, input.clientId);
    const { connect, acct } = await eligibleConnect(deps, ctx.agencyId);
    const row = await billingRowOf(deps, c.id);
    // R21: while an async first payment is processing, no new link (or price) is issued.
    if (row && isPaymentProcessing(row)) throw refuse('conflict', PAYMENT_PROCESSING_MESSAGE);
    const invited = !!row && row.enabled && row.state === 'invited';
    const live = !!row && row.enabled && !!row.stripeSubscriptionId && SUBSCRIBED.includes(row.state);
    const apply = input.applyTo === 'next_bill' && live;
    let emails: string[] = [];
    if (invited) {
      emails = await clientOwnerEmails(deps, c.id);
      if (emails.length === 0) throw refuse('no_client_owner', NO_CLIENT_OWNER_MESSAGE);
    }
    if (invited) await assertNotPaid(deps, ctx, acct, row!.checkoutSessionId);
    // An unchanged amount never creates a new Stripe price: reuse the default or the client's stored price while it is
    // still usable (R20: never an archived one).
    const reusable =
      input.priceCents === connect.defaultPriceCents && connect.stripeDefaultPriceId
        ? connect.stripeDefaultPriceId
        : row?.stripePriceId && row.priceCents === input.priceCents
          ? (await storedPriceUsable(deps, ctx, connect, acct, row.stripePriceId, row.priceCents))?.priceId ?? null
          : null;
    const priceId = reusable ?? (await connectedPrice(deps, ctx, connect, acct, input.priceCents));
    if (apply && row!.billedPriceCents !== input.priceCents) {
      try {
        await gw.updateConnectedSubscriptionPrice({ stripeAccount: acct, subscriptionId: row!.stripeSubscriptionId!, priceId, prorate: false });
      } catch (e) {
        stripeFailed(ctx.agencyId, 'updateConnectedSubscriptionPrice', e);
      }
    }
    if (invited) {
      // The mailed link still charges the old price: replace it (R9/R10). New link first, old one expired after the commit (R13).
      const setupFeeCents = row!.setupFeeCents ?? 0;
      const checkout = await checkoutFor(deps, ctx, { acct, clientId: c.id, priceId, setupFeeCents, email: emails[0]! });
      await commitInvite(
        deps, ctx, c.id, acct,
        { type: 'invited', priceCents: input.priceCents, setupFeeCents, stripePriceId: priceId, checkoutUrl: checkout.url, checkoutSessionId: checkout.id },
        row!.checkoutSessionId,
        (cur) => guardPendingInvite(cur, row!.checkoutSessionId),
        NO_PENDING_LINK_MESSAGE,
      );
    } else {
      await deps.service.transaction(async (tx) => {
        await assertConnectLive(tx, ctx.agencyId);
        return applyClientBillingSignal(tx, c.id, { type: 'price_changed', priceCents: input.priceCents, stripePriceId: priceId, ...(apply && { billed: true }) }, ctx.userId);
      });
    }
    // A per-client price nothing uses any more (the subscription moved off it, the invite was re-issued, or there is none) is archived best-effort.
    if (apply || !live) await archiveQuietly(deps, ctx.agencyId, acct, row?.stripePriceId ?? null, [priceId, connect.stripeDefaultPriceId]);
    return { ok: true as const, priceCents: input.priceCents, appliedToSubscription: apply, linkResent: invited };
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
      /** What the live subscription charges (null until one exists). */
      priceCents: z.number().int().nullable().optional(), nextPriceCents: z.number().int().nullable().optional(), setupFeeCents: z.number().int().nullable().optional(),
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
        ...(admin && { priceCents: r.b?.billedPriceCents ?? null, nextPriceCents: r.b?.priceCents ?? null, setupFeeCents: r.b?.setupFeeCents ?? null }),
      })),
    };
  },
});

export const getClientRevenueTool = defineTool({
  name: 'get_client_revenue',
  access: 'read',
  description: 'Revenue from client billing: monthly recurring revenue of active subscriptions (what they are billed now), paying and payment-needed counts, and our subscription cost (plan base plus extra seats) for margin.',
  input: z.object({}),
  output: z.object({
    currency: z.string(), mrrCents: z.number().int(), payingCount: z.number().int(), paymentNeededCount: z.number().int(), invitedCount: z.number().int(),
    ourCostCents: z.number().int(), marginCents: z.number().int(),
  }),
  permission: 'agency',
  async handler(ctx, _input, deps) {
    requireAdmin(ctx);
    const rows = await deps.service
      .select({ state: clientBilling.state, billedPriceCents: clientBilling.billedPriceCents })
      .from(clientBilling)
      .innerJoin(client, eq(client.id, clientBilling.clientId))
      .where(and(eq(clientBilling.agencyId, ctx.agencyId), eq(clientBilling.enabled, true), eq(client.status, 'active')));
    const active = rows.filter((r) => r.state === 'active');
    const mrrCents = active.reduce((n, r) => n + (r.billedPriceCents ?? 0), 0);
    // Our cost is the 9a invoice before discounts: plan base + seats beyond the included ones; a pilot agency pays nothing.
    const [ab] = await deps.service.select().from(agencyBilling).where(eq(agencyBilling.agencyId, ctx.agencyId));
    const [p, used] = await Promise.all([planFor(deps.service, ab ?? null), countActiveClients(deps.service, ctx.agencyId)]);
    const ourCostCents = !p || (ab?.state ?? 'pilot') === 'pilot' ? 0 : p.basePriceCents + Math.max(0, used - p.includedSeats) * p.seatPriceCents;
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
