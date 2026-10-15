import {
  type BillingGateway, type BillingSignal, applyBillingSignal, currentStandardPlan, generateInviteToken, planFor, syncPlanToStripe,
} from '@cs/billing';
import { type AccessContext, ToolError, toolkit } from '@cs/core';
import { agency, agencyBilling, agencyBillingEvent, agencyDailyStat, agencyInviteLink, BILLING_STATES, discountCode, plan } from '@cs/db';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { type PlatformRole, requirePlatformOperator } from '../platform';
import { withPlatformAudit } from '../platform/audit';
import { ensureCustomer, gatewayOf, hasLiveSubscription } from './billing';

/**
 * Phase 9a platform billing tools (spec § Tools, platform line; rulings R7, R8, R23). Each tool starts with
 * `requirePlatformOperator` (role minimum per spec) and runs under `withPlatformAudit` (per-agency into the target
 * agency's `audit_log` when there is one). Service role only: the billing tables have no app policies.
 */
const { defineTool } = toolkit<ToolDeps>();

const DAY = 86_400_000;
const DEFAULT_TRIAL_DAYS = 30;
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const IsoOrNull = z.string().nullable();
const Id = z.string().uuid();
const IsoDate = z.string().datetime();

const logDegraded = (what: string, e: unknown) => console.error('[billing] gateway call failed', { what }, (e as { name?: string } | null)?.name);

async function requireAgency(deps: ToolDeps, agencyId: string): Promise<void> {
  const [a] = await deps.service.select({ id: agency.id }).from(agency).where(eq(agency.id, agencyId));
  if (!a) throw new ToolError('not_found', 'Agency not found');
}

const isUniqueViolation = (e: unknown) => {
  const x = e as { code?: string; cause?: { code?: string } } | null;
  return x?.code === '23505' || x?.cause?.code === '23505';
};

/** Role check first (refusals never reach the audit log), then the body under one audit row. */
async function operate<T>(
  deps: ToolDeps, ctx: AccessContext, min: PlatformRole, tool: string, input: unknown, agencyId: string | undefined,
  fn: (role: PlatformRole) => Promise<T>,
): Promise<T> {
  const role = await requirePlatformOperator(deps, ctx, min);
  if (agencyId) await requireAgency(deps, agencyId);
  return withPlatformAudit(deps, ctx, { tool, input, role, ...(agencyId ? { agencyId } : {}) }, () => fn(role));
}

// ---- plans ----

const PlanOut = z.object({
  id: z.string(), code: z.string(), version: z.number().int(), name: z.string(), basePriceCents: z.number().int(), includedSeats: z.number().int(),
  seatPriceCents: z.number().int(), trialDays: z.number().int(), isCurrent: z.boolean(), synced: z.boolean(), createdAt: z.string(), createdBy: z.string(),
});

export const listPlansTool = defineTool({
  name: 'list_plans',
  access: 'read',
  description: 'Platform operators: every billing plan version, newest first.',
  input: z.object({}),
  output: z.object({ plans: z.array(PlanOut) }),
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'viewer', 'list_plans', input, undefined, async () => {
      const rows = await deps.service.select().from(plan).orderBy(desc(plan.code), desc(plan.version));
      return {
        plans: rows.map((p) => ({
          id: p.id, code: p.code, version: p.version, name: p.name, basePriceCents: p.basePriceCents, includedSeats: p.includedSeats,
          seatPriceCents: p.seatPriceCents, trialDays: p.trialDays, isCurrent: p.isCurrent, synced: !!(p.stripeBasePriceId && p.stripeSeatPriceId),
          createdAt: p.createdAt.toISOString(), createdBy: p.createdBy,
        })),
      };
    });
  },
});

export const createPlanVersionTool = defineTool({
  name: 'create_plan_version',
  access: 'write',
  description: 'Platform owners: publish a new version of the standard plan (creates its Stripe prices, then makes it current). Existing subscriptions keep their prices.',
  input: z.object({
    name: z.string().trim().min(1).max(80),
    basePriceCents: z.number().int().min(0).max(10_000_000),
    includedSeats: z.number().int().min(0).max(10_000),
    seatPriceCents: z.number().int().min(0).max(10_000_000),
    trialDays: z.number().int().min(0).max(90),
  }),
  output: z.object({ id: z.string(), version: z.number().int() }),
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'owner', 'create_plan_version', input, undefined, async () => {
      const gw = gatewayOf(deps);
      // One transaction: a Stripe failure (or any later step) rolls the new version back, leaving the old plan current.
      return deps.service.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext('plan:standard'))`);
        const [{ max } = { max: 0 }] = await tx.select({ max: sql<number>`coalesce(max(${plan.version}), 0)::int` }).from(plan).where(eq(plan.code, 'standard'));
        const [row] = await tx.insert(plan).values({ ...input, code: 'standard', version: max + 1, isCurrent: false, createdBy: ctx.userId }).returning({ id: plan.id, version: plan.version });
        await syncPlanToStripe(tx, gw, row!.id);
        await tx.update(plan).set({ isCurrent: false }).where(and(eq(plan.code, 'standard'), eq(plan.isCurrent, true)));
        await tx.update(plan).set({ isCurrent: true }).where(eq(plan.id, row!.id));
        return { id: row!.id, version: row!.version };
      });
    });
  },
});

// ---- discount codes ----

const CodeOut = z.object({
  id: z.string(), code: z.string(), percentOff: z.number().nullable(), amountOffCents: z.number().int().nullable(),
  appliesTo: z.enum(['base', 'seats', 'both']), duration: z.enum(['once', 'repeating', 'forever']), durationMonths: z.number().int().nullable(),
  restrictedAgencyIds: z.array(z.string()).nullable(), expiresAt: IsoOrNull, maxRedemptions: z.number().int().nullable(),
  createdAt: z.string(), createdBy: z.string(), revokedAt: IsoOrNull,
});

export const listDiscountCodesTool = defineTool({
  name: 'list_discount_codes',
  access: 'read',
  description: 'Platform operators: every discount code, newest first.',
  input: z.object({}),
  output: z.object({ codes: z.array(CodeOut) }),
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'viewer', 'list_discount_codes', input, undefined, async () => {
      const rows = await deps.service.select().from(discountCode).orderBy(desc(discountCode.createdAt), desc(discountCode.id));
      return {
        codes: rows.map((d) => ({
          id: d.id, code: d.code, percentOff: d.percentOff === null ? null : Number(d.percentOff), amountOffCents: d.amountOffCents,
          appliesTo: d.appliesTo, duration: d.duration, durationMonths: d.durationMonths, restrictedAgencyIds: d.restrictedAgencyIds,
          expiresAt: iso(d.expiresAt), maxRedemptions: d.maxRedemptions, createdAt: d.createdAt.toISOString(), createdBy: d.createdBy, revokedAt: iso(d.revokedAt),
        })),
      };
    });
  },
});

export const createDiscountCodeTool = defineTool({
  name: 'create_discount_code',
  access: 'write',
  description: 'Platform owners: create a Stripe coupon and promotion code (percent or amount off; base, seats or both; optionally restricted to agencies).',
  input: z.object({
    code: z.string().trim().min(3).max(64).regex(/^[A-Za-z0-9_-]+$/, 'Letters, digits, - and _ only'),
    percentOff: z.number().gt(0).max(100).refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-9, 'At most 2 decimals').optional(),
    amountOffCents: z.number().int().min(1).max(10_000_000).optional(),
    appliesTo: z.enum(['base', 'seats', 'both']),
    duration: z.enum(['once', 'repeating', 'forever']),
    durationMonths: z.number().int().min(1).max(36).optional(),
    restrictedAgencyIds: z.array(Id).max(100).optional(),
    expiresAt: IsoDate.optional(),
    maxRedemptions: z.number().int().min(1).max(1_000_000).optional(),
  }),
  output: z.object({ id: z.string(), code: z.string() }),
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'owner', 'create_discount_code', input, undefined, async () => {
      if ((input.percentOff === undefined) === (input.amountOffCents === undefined)) throw new ToolError('invalid_input', 'Set exactly one of percentOff or amountOffCents');
      if ((input.duration === 'repeating') !== (input.durationMonths !== undefined)) throw new ToolError('invalid_input', 'durationMonths is required for (and only for) a repeating duration');
      const restricted = input.restrictedAgencyIds?.length ? [...new Set(input.restrictedAgencyIds)] : null;
      if (restricted) {
        const found = await deps.service.select({ id: agency.id }).from(agency).where(inArray(agency.id, restricted));
        if (found.length !== restricted.length) throw new ToolError('invalid_input', 'One or more restricted agencies do not exist');
      }
      const [dup] = await deps.service.select({ id: discountCode.id }).from(discountCode).where(sql`lower(${discountCode.code}) = lower(${input.code})`);
      if (dup) throw new ToolError('conflict', 'A discount code with that name already exists');

      const gw = gatewayOf(deps);
      let p = await currentStandardPlan(deps.service);
      if (!p) throw new ToolError('internal', 'No billing plan is configured');
      if (!p.stripeProductId || !p.stripeSeatProductId) p = await syncPlanToStripe(deps.service, gw, p.id);
      const base = p.stripeProductId!;
      const seats = p.stripeSeatProductId!;
      const appliesToProductIds = input.appliesTo === 'base' ? [base] : input.appliesTo === 'seats' ? [seats] : [base, seats];

      const expiresAt = input.expiresAt ? new Date(input.expiresAt) : undefined;
      // Nothing is stored unless both Stripe objects exist; an orphaned coupon after a later failure is harmless.
      const coupon = await gw.createCoupon({
        ...(input.percentOff !== undefined ? { percentOff: input.percentOff } : { amountOffCents: input.amountOffCents }),
        duration: input.duration,
        ...(input.durationMonths !== undefined ? { durationInMonths: input.durationMonths } : {}),
        appliesToProductIds,
        name: input.code,
        ...(input.maxRedemptions ? { maxRedemptions: input.maxRedemptions } : {}),
        ...(expiresAt ? { redeemBy: expiresAt } : {}),
      });
      // R24: a restricted code gets no promotion code (Checkout would let anyone type it); it is applied only by coupon id
      // via redeem_discount_code / attach_agency_discount, which enforce the restriction.
      const promo = restricted
        ? null
        : await gw.createPromotionCode({
            couponId: coupon.id, code: input.code,
            ...(expiresAt ? { expiresAt } : {}),
            ...(input.maxRedemptions ? { maxRedemptions: input.maxRedemptions } : {}),
          });
      try {
        const [row] = await deps.service.insert(discountCode).values({
          code: input.code, stripeCouponId: coupon.id, stripePromotionCodeId: promo?.id ?? null,
          percentOff: input.percentOff !== undefined ? String(input.percentOff) : null, amountOffCents: input.amountOffCents ?? null,
          appliesTo: input.appliesTo, duration: input.duration, durationMonths: input.durationMonths ?? null,
          restrictedAgencyIds: restricted, expiresAt: expiresAt ?? null, maxRedemptions: input.maxRedemptions ?? null, createdBy: ctx.userId,
        }).returning({ id: discountCode.id, code: discountCode.code });
        return row!;
      } catch (e) {
        if (isUniqueViolation(e)) throw new ToolError('conflict', 'A discount code with that name already exists');
        throw e;
      }
    });
  },
});

export const revokeDiscountCodeTool = defineTool({
  name: 'revoke_discount_code',
  access: 'write',
  description: 'Platform owners: revoke a discount code so it can no longer be redeemed or attached.',
  input: z.object({ id: Id }),
  output: z.object({ revoked: z.literal(true) }),
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'owner', 'revoke_discount_code', input, undefined, async () => {
      const [existing] = await deps.service.select({ promo: discountCode.stripePromotionCodeId }).from(discountCode).where(eq(discountCode.id, input.id));
      // R27: a promotion code we cannot deactivate would stay redeemable at Checkout, so a local-only revoke would mislead.
      if (existing?.promo) gatewayOf(deps);
      const [row] = await deps.service
        .update(discountCode).set({ revokedAt: sql`coalesce(${discountCode.revokedAt}, now())` }).where(eq(discountCode.id, input.id))
        .returning({ promo: discountCode.stripePromotionCodeId });
      if (!row) throw new ToolError('not_found', 'Discount code not found');
      if (row.promo && deps.billing) {
        await deps.billing.deactivatePromotionCode(row.promo).catch((e: unknown) => logDegraded('deactivatePromotionCode', e));
      }
      return { revoked: true as const };
    });
  },
});

// ---- invite links ----

const InviteOut = z.object({
  id: z.string(), tokenPrefix: z.string(), offer: z.enum(['pilot', 'trial']), pilotEndsAt: IsoOrNull, discountCodeId: z.string().nullable(),
  emailLock: z.string().nullable(), maxUses: z.number().int(), uses: z.number().int(), expiresAt: z.string(), note: z.string().nullable(),
  createdAt: z.string(), createdBy: z.string(), revokedAt: IsoOrNull,
});

export const listInviteLinksTool = defineTool({
  name: 'list_invite_links',
  access: 'read',
  description: 'Platform staff: agency invite links (token prefix only; the full link is shown once at creation).',
  input: z.object({}),
  output: z.object({ links: z.array(InviteOut) }),
  permission: 'agency',
  supportMask: ['links[].emailLock'],
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'staff', 'list_invite_links', input, undefined, async () => {
      const rows = await deps.service.select().from(agencyInviteLink).orderBy(desc(agencyInviteLink.createdAt), desc(agencyInviteLink.id)).limit(200);
      return {
        links: rows.map((l) => ({
          id: l.id, tokenPrefix: l.tokenPrefix, offer: l.offer, pilotEndsAt: iso(l.pilotEndsAt), discountCodeId: l.discountCodeId, emailLock: l.emailLock,
          maxUses: l.maxUses, uses: l.uses, expiresAt: l.expiresAt.toISOString(), note: l.note, createdAt: l.createdAt.toISOString(), createdBy: l.createdBy, revokedAt: iso(l.revokedAt),
        })),
      };
    });
  },
});

export const createInviteLinkTool = defineTool({
  name: 'create_invite_link',
  access: 'write',
  description: 'Platform staff: create an agency invite link. The full link is returned once and cannot be retrieved later.',
  input: z.object({
    offer: z.enum(['pilot', 'trial']),
    pilotEndsAt: IsoDate.optional(),
    discountCodeId: Id.optional(),
    emailLock: z.string().trim().toLowerCase().email().max(254).optional(),
    maxUses: z.number().int().min(1).max(1000).default(1),
    expiresInDays: z.number().int().min(1).max(90).default(14),
    note: z.string().trim().max(500).optional(),
  }),
  output: z.object({ url: z.string(), token: z.string() }),
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'staff', 'create_invite_link', input, undefined, async () => {
      if (!deps.appUrl) throw new ToolError('internal', 'Invite links are not configured (APP_URL)');
      if (input.offer === 'pilot' && !input.pilotEndsAt) throw new ToolError('invalid_input', 'A pilot offer needs pilotEndsAt');
      if (input.offer === 'trial' && input.pilotEndsAt) throw new ToolError('invalid_input', 'pilotEndsAt only applies to a pilot offer');
      if (input.discountCodeId) {
        const [d] = await deps.service.select({ id: discountCode.id }).from(discountCode).where(and(eq(discountCode.id, input.discountCodeId), isNull(discountCode.revokedAt)));
        if (!d) throw new ToolError('invalid_input', 'Discount code not found or revoked');
      }
      const { token, hash, prefix } = generateInviteToken();
      await deps.service.insert(agencyInviteLink).values({
        tokenHash: hash, tokenPrefix: prefix, offer: input.offer, pilotEndsAt: input.pilotEndsAt ? new Date(input.pilotEndsAt) : null,
        discountCodeId: input.discountCodeId ?? null, emailLock: input.emailLock ?? null, maxUses: input.maxUses,
        expiresAt: new Date(Date.now() + input.expiresInDays * DAY), note: input.note ?? null, createdBy: ctx.userId,
      });
      return { url: `${deps.appUrl.replace(/\/+$/, '')}/join/${token}`, token };
    });
  },
});

export const revokeInviteLinkTool = defineTool({
  name: 'revoke_invite_link',
  access: 'write',
  description: 'Platform staff: revoke an agency invite link.',
  input: z.object({ id: Id }),
  output: z.object({ revoked: z.literal(true) }),
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'staff', 'revoke_invite_link', input, undefined, async () => {
      const rows = await deps.service
        .update(agencyInviteLink).set({ revokedAt: sql`coalesce(${agencyInviteLink.revokedAt}, now())` }).where(eq(agencyInviteLink.id, input.id))
        .returning({ id: agencyInviteLink.id });
      if (rows.length === 0) throw new ToolError('not_found', 'Invite link not found');
      return { revoked: true as const };
    });
  },
});

// ---- per-agency billing ----

const State = z.enum(BILLING_STATES);

export const getAgencyBillingTool = defineTool({
  name: 'get_agency_billing',
  access: 'read',
  description: 'Platform operators: one agency’s billing state, plan, dates, seats, discount and Stripe ids, with recent invoices and state history.',
  input: z.object({ agencyId: Id }),
  output: z.object({
    agencyId: z.string(), state: State, plan: z.object({ name: z.string(), version: z.number().int() }).nullable(),
    trialEndsAt: IsoOrNull, pilotEndsAt: IsoOrNull, pastDueSince: IsoOrNull, cancelAt: IsoOrNull, stateChangedAt: IsoOrNull,
    seatsSynced: z.number().int().nullable(), seatSyncPending: z.boolean(), seatCapExempt: z.boolean(), attachedCouponId: z.string().nullable(),
    stripeCustomerId: z.string().nullable(), stripeSubscriptionId: z.string().nullable(),
    invoices: z.array(z.object({ id: z.string(), number: z.string().nullable(), amountPaidCents: z.number().int(), status: z.string().nullable(), hostedInvoiceUrl: z.string().nullable(), created: z.string() })),
    events: z.array(z.object({ fromState: z.string().nullable(), toState: z.string(), reason: z.string(), actor: z.string(), createdAt: z.string() })),
  }),
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'viewer', 'get_agency_billing', input, input.agencyId, async () => {
      const [row = null] = await deps.service.select().from(agencyBilling).where(eq(agencyBilling.agencyId, input.agencyId));
      const [p, events] = await Promise.all([
        planFor(deps.service, row),
        deps.service.select().from(agencyBillingEvent).where(eq(agencyBillingEvent.agencyId, input.agencyId)).orderBy(desc(agencyBillingEvent.createdAt), desc(agencyBillingEvent.id)).limit(20),
      ]);
      let invoices: { id: string; number: string | null; amountPaidCents: number; status: string | null; hostedInvoiceUrl: string | null; created: string }[] = [];
      if (deps.billing && row?.stripeCustomerId) {
        try {
          invoices = (await deps.billing.listInvoices(row.stripeCustomerId, 10)).map((i) => ({
            id: i.id, number: i.number, amountPaidCents: i.amountPaidCents, status: i.status, hostedInvoiceUrl: i.hostedInvoiceUrl, created: i.created.toISOString(),
          }));
        } catch (e) { logDegraded('listInvoices', e); }
      }
      return {
        agencyId: input.agencyId,
        state: row?.state ?? 'pilot',
        plan: p ? { name: p.name, version: p.version } : null,
        trialEndsAt: iso(row?.trialEndsAt), pilotEndsAt: iso(row?.pilotEndsAt), pastDueSince: iso(row?.pastDueSince), cancelAt: iso(row?.cancelAt), stateChangedAt: iso(row?.stateChangedAt),
        seatsSynced: row?.billableSeatsSynced ?? null, seatSyncPending: row?.seatSyncPending ?? false, seatCapExempt: row?.seatCapExempt ?? false,
        attachedCouponId: row?.attachedCouponId ?? null, stripeCustomerId: row?.stripeCustomerId ?? null, stripeSubscriptionId: row?.stripeSubscriptionId ?? null,
        invoices,
        events: events.map((e) => ({ fromState: e.fromState, toState: e.toState, reason: e.reason, actor: e.actor, createdAt: e.createdAt.toISOString() })),
      };
    });
  },
});

export const getBillingOverviewTool = defineTool({
  name: 'get_billing_overview',
  access: 'read',
  description: 'Platform operators: MRR and paid seats from the latest daily stats, and how many agencies are in each billing state.',
  input: z.object({}),
  output: z.object({ mrrCents: z.number().int(), paidSeats: z.number().int(), agenciesByState: z.record(z.string(), z.number().int()) }),
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'viewer', 'get_billing_overview', input, undefined, async () => {
      const d = agencyDailyStat;
      const [sums] = await deps.service
        .select({ mrr: sql<number>`coalesce(sum(${d.mrrCents}), 0)::int`, seats: sql<number>`coalesce(sum(${d.paidSeats}), 0)::int` })
        .from(d)
        .where(eq(d.day, sql`(select max(day) from agency_daily_stat)`));
      const counted = await deps.service.select({ state: agencyBilling.state, n: sql<number>`count(*)::int` }).from(agencyBilling).groupBy(agencyBilling.state);
      const [{ total } = { total: 0 }] = await deps.service.select({ total: sql<number>`count(*)::int` }).from(agency);
      const byState: Record<string, number> = Object.fromEntries(BILLING_STATES.map((s) => [s, 0]));
      let withRow = 0;
      for (const c of counted) { byState[c.state] = c.n; withRow += c.n; }
      byState.pilot = (byState.pilot ?? 0) + Math.max(0, total - withRow);
      return { mrrCents: sums?.mrr ?? 0, paidSeats: sums?.seats ?? 0, agenciesByState: byState };
    });
  },
});

// ---- admin state actions ----

/** Runs one admin signal through `applyBillingSignal` in a transaction; a `null` transition rolls back and is a `conflict`. */
async function adminSignal(deps: ToolDeps, ctx: AccessContext, agencyId: string, action: string, build: (trialDays: number, now: Date) => BillingSignal) {
  return deps.service.transaction(async (tx) => {
    const [row = null] = await tx.select().from(agencyBilling).where(eq(agencyBilling.agencyId, agencyId));
    const p = await planFor(tx, row);
    const result = await applyBillingSignal(tx, agencyId, build(p?.trialDays ?? DEFAULT_TRIAL_DAYS, new Date()), ctx.userId);
    if (!result.changed) throw new ToolError('conflict', `Cannot ${action} while the agency is ${result.state}.`);
    return { state: result.state };
  });
}

const StateOut = z.object({ state: State });
const FutureIsoDate = IsoDate.refine((s) => new Date(s).getTime() > Date.now(), 'Must be in the future');

/**
 * R26: staff may not put an agency on a free pilot/trial while Stripe still bills it. A stored id whose subscription is
 * canceled or gone is stale (a missed deletion event); the state signal then forgets it (`FORGET_SUBSCRIPTION`).
 */
async function assertNoLiveStripeSubscription(deps: ToolDeps, agencyId: string): Promise<void> {
  const [row] = await deps.service.select({ sub: agencyBilling.stripeSubscriptionId }).from(agencyBilling).where(eq(agencyBilling.agencyId, agencyId));
  if (!row?.sub) return;
  if (await hasLiveSubscription(gatewayOf(deps), agencyId, row.sub)) {
    throw new ToolError('conflict', 'This agency has a live Stripe subscription. Cancel it in Stripe first.');
  }
}

export const grantPilotTool = defineTool({
  name: 'grant_pilot',
  access: 'write',
  description: 'Platform staff: put an agency on a free pilot, with an optional end date.',
  input: z.object({ agencyId: Id, endsAt: FutureIsoDate.optional() }),
  output: StateOut,
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'staff', 'grant_pilot', input, input.agencyId, async () => {
      await assertNoLiveStripeSubscription(deps, input.agencyId);
      return adminSignal(deps, ctx, input.agencyId, 'grant a pilot', (_t, now) => ({ kind: 'admin_grant_pilot', endsAt: input.endsAt ? new Date(input.endsAt) : null, now }));
    });
  },
});

export const endPilotTool = defineTool({
  name: 'end_pilot',
  access: 'write',
  description: 'Platform staff: end an agency’s pilot now and start its trial.',
  input: z.object({ agencyId: Id }),
  output: StateOut,
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'staff', 'end_pilot', input, input.agencyId, () =>
      adminSignal(deps, ctx, input.agencyId, 'end a pilot', (trialDays, now) => ({ kind: 'admin_end_pilot', now, trialDays })));
  },
});

export const extendTrialTool = defineTool({
  name: 'extend_trial',
  access: 'write',
  description: 'Platform staff: move an agency’s trial end date.',
  input: z.object({ agencyId: Id, until: FutureIsoDate }),
  output: StateOut,
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'staff', 'extend_trial', input, input.agencyId, async () => {
      await assertNoLiveStripeSubscription(deps, input.agencyId);
      return adminSignal(deps, ctx, input.agencyId, 'extend the trial', (_t, now) => ({ kind: 'admin_extend_trial', until: new Date(input.until), now }));
    });
  },
});

export const attachAgencyDiscountTool = defineTool({
  name: 'attach_agency_discount',
  access: 'write',
  description: 'Platform staff: attach a discount code to an agency (applies to its subscription now, or at checkout).',
  input: z.object({ agencyId: Id, discountCodeId: Id }),
  output: z.object({ attached: z.literal(true), appliesAtCheckout: z.boolean() }),
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'staff', 'attach_agency_discount', input, input.agencyId, async () => {
      const [dc] = await deps.service.select().from(discountCode).where(eq(discountCode.id, input.discountCodeId));
      if (!dc) throw new ToolError('not_found', 'Discount code not found');
      if (dc.revokedAt || (dc.expiresAt && dc.expiresAt.getTime() <= Date.now())) throw new ToolError('invalid_input', 'That discount code is revoked or expired');
      if (dc.restrictedAgencyIds && !dc.restrictedAgencyIds.includes(input.agencyId)) throw new ToolError('invalid_input', 'That discount code is restricted to other agencies');
      const gw = gatewayOf(deps);
      await ensureCustomer(deps, input.agencyId);
      const [row] = await deps.service.select({ sub: agencyBilling.stripeSubscriptionId }).from(agencyBilling).where(eq(agencyBilling.agencyId, input.agencyId));
      const hasSubscription = !!row?.sub;
      if (row?.sub) await gw.attachSubscriptionDiscount({ subscriptionId: row.sub, couponId: dc.stripeCouponId });
      await deps.service.update(agencyBilling).set({ attachedCouponId: dc.stripeCouponId, updatedAt: new Date() }).where(eq(agencyBilling.agencyId, input.agencyId));
      return { attached: true as const, appliesAtCheckout: !hasSubscription };
    });
  },
});

export const setSeatCapExemptTool = defineTool({
  name: 'set_seat_cap_exempt',
  access: 'write',
  description: 'Platform owners: lift (or restore) the pilot client cap for one agency. Only has an effect while the agency is in pilot.',
  input: z.object({ agencyId: Id, exempt: z.boolean() }),
  output: z.object({ exempt: z.boolean(), meaningful: z.boolean() }),
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'owner', 'set_seat_cap_exempt', input, input.agencyId, async () => {
      const std = await currentStandardPlan(deps.service);
      const [row] = await deps.service
        .insert(agencyBilling)
        .values({ agencyId: input.agencyId, state: 'pilot', planId: std?.id ?? null, seatCapExempt: input.exempt })
        .onConflictDoUpdate({ target: agencyBilling.agencyId, set: { seatCapExempt: input.exempt, updatedAt: new Date() } })
        .returning({ state: agencyBilling.state });
      return { exempt: input.exempt, meaningful: row!.state === 'pilot' };
    });
  },
});

export const platformBillingTools = [
  listPlansTool, createPlanVersionTool, listDiscountCodesTool, createDiscountCodeTool, revokeDiscountCodeTool,
  listInviteLinksTool, createInviteLinkTool, revokeInviteLinkTool, getAgencyBillingTool, getBillingOverviewTool,
  grantPilotTool, endPilotTool, extendTrialTool, attachAgencyDiscountTool, setSeatCapExemptTool,
];
