import { countActiveClients, currentStandardPlan, isReducedTrial, planFor, syncPlanToStripe } from '@cs/billing';
import { type AccessContext, PLAN_FEATURES, type PlanFeature, ToolError, toolkit } from '@cs/core';
import { type AgencyBillingRow, agency, agencyBilling, agencyBillingEvent, BILLING_STATES, type BillingState, type PlanRow, plan } from '@cs/db';
import type { PlanTerms } from '@cs/email';
import { and, eq, isNull, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { requirePlatformOperator } from '../platform';
import { planChangeWorthEmailing, sendAgencyPlanChangeEmail } from '../platform/plan-change-email';
import { operate } from './platform-billing';

/**
 * Phase 15c-3b spec §3.2/§3.3: list the agencies not on the current standard plan version and move chosen ones onto it.
 * The move switches `plan_id` at once (P5) and swaps live Stripe prices from the next billing date (P3, P12, P14).
 */
const { defineTool } = toolkit<ToolDeps>();

const ALL: readonly PlanFeature[] = PLAN_FEATURES;
/**
 * P12: who gets a Stripe price swap — any agency holding a subscription id that is not cancelled (dunning keeps the
 * subscription through `read_only` / `suspended`, so those swap too). Shared by the list's `swapsStripe` and the move.
 */
const swapsStripe = (row: Pick<AgencyBillingRow, 'state' | 'stripeSubscriptionId'>) => !!row.stripeSubscriptionId && row.state !== 'cancelled';
const errName = (e: unknown): string => (e instanceof Error ? e.name : 'unknown');
const isoDate = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);
const termsOf = (p: PlanRow): PlanTerms => ({ basePriceCents: p.basePriceCents, includedSeats: p.includedSeats, seatPriceCents: p.seatPriceCents });
/** P11 / 7a2 D13: no `plan_id` ⇒ every feature (what `planFeaturesFor` gives them until moved). */
const featuresOf = (row: Pick<AgencyBillingRow, 'planId'>, p: PlanRow | null): PlanFeature[] =>
  row.planId === null || !p ? [...ALL] : ALL.filter((f) => p.features.includes(f));

/** Base + max(0, active − included) × seat price, in cents. */
export function monthlyCents(t: PlanTerms, activeClients: number): number {
  return t.basePriceCents + Math.max(0, activeClients - t.includedSeats) * t.seatPriceCents;
}

/**
 * P7: the per-agency warning when the target includes fewer seats than the agency has active clients. Exempt / reduced
 * trial come from the same sources `billingAccess` uses (`seat_cap_exempt`, `isReducedTrial`).
 */
export function seatWarningFor(
  row: { state: BillingState; seatCapExempt: boolean; reducedTrial: boolean }, activeClients: number, target: PlanTerms,
): 'extra_seats' | 'over_cap' | null {
  if (activeClients <= target.includedSeats) return null;
  if (row.state === 'active' || row.state === 'past_due') return 'extra_seats';
  if (row.state === 'pilot' && !row.seatCapExempt) return 'over_cap';
  if (row.state === 'trialing' && !row.reducedTrial) return 'over_cap';
  return null;
}

async function requireCurrentPlan(deps: ToolDeps): Promise<PlanRow> {
  const p = await currentStandardPlan(deps.service);
  if (!p) throw new ToolError('conflict', 'No billing plan is configured.', { userFacing: true });
  return p;
}

// ---- list ----

const AgencyRow = z.object({
  agencyId: z.string(), name: z.string(), state: z.enum(BILLING_STATES), planId: z.string().nullable(), version: z.number().int().nullable(),
  basePriceCents: z.number().int(), includedSeats: z.number().int(), seatPriceCents: z.number().int(), features: z.array(z.enum(PLAN_FEATURES)),
  activeClients: z.number().int(), swapsStripe: z.boolean(), onHold: z.boolean(), seatWarning: z.enum(['extra_seats', 'over_cap']).nullable(),
  extraSeatsAfter: z.number().int(), monthlyNowCents: z.number().int(), monthlyAfterCents: z.number().int(),
});

export const listPlanAgenciesTool = defineTool({
  name: 'list_plan_agencies',
  access: 'read',
  description: 'Platform operators: agencies not on the current standard plan version, with their monthly price now and after a move.',
  input: z.object({}),
  output: z.object({ currentPlanId: z.string(), currentVersion: z.number().int(), agencies: z.array(AgencyRow) }),
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'viewer', 'list_plan_agencies', input, undefined, async () => {
      const target = await requireCurrentPlan(deps);
      const rows = await deps.service
        .select({ billing: agencyBilling, name: agency.name, suspendedAt: agency.suspendedAt, version: plan.version })
        .from(agencyBilling)
        .innerJoin(agency, eq(agency.id, agencyBilling.agencyId))
        .leftJoin(plan, eq(plan.id, agencyBilling.planId))
        .where(and(isNull(agency.archivedAt), or(isNull(agencyBilling.planId), ne(agencyBilling.planId, target.id))))
        .orderBy(sql`${plan.version} asc nulls first`, agency.name, agency.id);
      const targetTerms = termsOf(target);
      const agencies = [];
      for (const r of rows) {
        const row = r.billing;
        const [p, activeClients, reducedTrial] = await Promise.all([planFor(deps.service, row), countActiveClients(deps.service, row.agencyId), isReducedTrial(deps.service, row)]);
        const now = p ? termsOf(p) : targetTerms;
        agencies.push({
          agencyId: row.agencyId, name: r.name, state: row.state, planId: row.planId, version: row.planId ? r.version : null,
          ...now, features: featuresOf(row, p), activeClients, swapsStripe: swapsStripe(row), onHold: r.suspendedAt !== null,
          seatWarning: seatWarningFor({ state: row.state, seatCapExempt: row.seatCapExempt, reducedTrial }, activeClients, targetTerms),
          extraSeatsAfter: Math.max(0, activeClients - target.includedSeats),
          monthlyNowCents: monthlyCents(now, activeClients), monthlyAfterCents: monthlyCents(targetTerms, activeClients),
        });
      }
      return { currentPlanId: target.id, currentVersion: target.version, agencies };
    });
  },
});

// ---- move ----

type Outcome = 'moved' | 'already_current' | 'refused' | 'failed';
type Reason = 'on_hold' | 'cancelled' | 'not_found' | 'stripe_error' | 'db_error';
interface MoveResult { agencyId: string; outcome: Outcome; reason?: Reason; emailed: boolean }

/** The first transaction's verdict: a refusal / no-op, or the committed move plus what the later steps need. */
type Prepared =
  | { done: MoveResult }
  | { row: AgencyBillingRow; old: PlanRow | null; qty: number; swaps: boolean };

/** Thrown inside the first tx when a swap is due but billing is not configured: rolls the move back. */
class NoGateway extends Error { override name = 'NoGateway'; }

export const moveAgenciesToCurrentPlanTool = defineTool({
  name: 'move_agencies_to_current_plan',
  access: 'write',
  description: 'Platform owners: move chosen agencies onto the current standard plan version. Features change now; live subscriptions get the new prices from their next billing date (no proration). Admins are emailed when their price or features change.',
  input: z.object({ agencyIds: z.array(z.string().uuid()).min(1).max(50) }),
  output: z.object({
    targetPlanId: z.string(), targetVersion: z.number().int(),
    results: z.array(z.object({
      agencyId: z.string(), outcome: z.enum(['moved', 'already_current', 'refused', 'failed']),
      reason: z.enum(['on_hold', 'cancelled', 'not_found', 'stripe_error', 'db_error']).optional(), emailed: z.boolean(),
    })),
  }),
  permission: 'agency',
  supportMask: ['results[].emailed'], // a boolean (nothing to mask); listed because the key matches /email/i
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    await requirePlatformOperator(deps, ctx, 'owner');
    let target = await requireCurrentPlan(deps);
    const gw = deps.billing ?? null;
    // A version published by `create_plan_version` is synced already; a seeded/legacy one gets its prices once, up front.
    if (gw && !(target.stripeBasePriceId && target.stripeSeatPriceId)) target = await syncPlanToStripe(deps.service, gw, target.id);
    const t = target;
    const results: MoveResult[] = [];
    for (const id of [...new Set(input.agencyIds)]) {
      try {
        // P15: one audit row per agency, in that agency's own audit log.
        results.push(await operate(deps, ctx, 'owner', 'move_agencies_to_current_plan', { agencyId: id, targetPlanId: t.id }, id, () => moveOne(deps, ctx, id, t)));
      } catch (e) {
        if (e instanceof ToolError && e.code === 'not_found') { results.push({ agencyId: id, outcome: 'refused', reason: 'not_found', emailed: false }); continue; }
        if (e instanceof ToolError && e.code === 'permission_denied') throw e; // the caller lost the role mid-batch
        console.error('[plan-move] move failed', { agencyId: id, error: errName(e) });
        results.push({ agencyId: id, outcome: 'failed', reason: 'db_error', emailed: false });
      }
    }
    return { targetPlanId: t.id, targetVersion: t.version, results };
  },
});

/** Spec §3.3 / P14, for one agency (inside its own `operate` audit row). */
async function moveOne(deps: ToolDeps, ctx: AccessContext, agencyId: string, target: PlanRow): Promise<MoveResult> {
  const gw = deps.billing ?? null;
  const result = (outcome: Outcome, reason?: Reason, emailed = false): MoveResult => ({ agencyId, outcome, ...(reason ? { reason } : {}), emailed });
  let prepared: Prepared;
  try {
    prepared = await deps.service.transaction(async (tx): Promise<Prepared> => {
      // R2 / P14: lock the existing row (never insert one) so a concurrent syncSeats sees the old or the new plan.
      const [row] = await tx.select().from(agencyBilling).where(eq(agencyBilling.agencyId, agencyId)).for('update');
      if (!row) return { done: result('refused', 'not_found') };
      const [a] = await tx.select({ suspendedAt: agency.suspendedAt }).from(agency).where(eq(agency.id, agencyId));
      if (a?.suspendedAt) return { done: result('refused', 'on_hold') };
      if (row.state === 'cancelled') return { done: result('refused', 'cancelled') };
      if (row.planId === target.id) return { done: result('already_current') };
      const swaps = swapsStripe(row);
      if (swaps && !gw) throw new NoGateway();
      const old = await planFor(tx, row);
      const qty = Math.max(0, (await countActiveClients(tx, agencyId)) - target.includedSeats);
      await tx.update(agencyBilling).set({
        planId: target.id,
        billableSeatsSynced: swaps ? qty : row.billableSeatsSynced,
        seatSyncPending: swaps ? false : row.seatSyncPending,
        updatedAt: new Date(),
      }).where(eq(agencyBilling.agencyId, agencyId));
      await tx.insert(agencyBillingEvent).values({ agencyId, fromState: row.state, toState: row.state, reason: 'admin_plan_version_move', actor: ctx.userId });
      return { row, old, qty, swaps };
    });
  } catch (e) {
    if (e instanceof NoGateway) return result('failed', 'stripe_error');
    throw e;
  }
  if ('done' in prepared) return prepared.done;
  const { row, old, qty, swaps } = prepared;

  let periodEnd: Date | null = null;
  if (swaps) {
    try {
      // No Stripe call inside a DB transaction: the swap runs after the commit, and a failure is compensated.
      ({ currentPeriodEnd: periodEnd } = await gw!.swapSubscriptionPlan(row.stripeSubscriptionId!, {
        basePriceId: target.stripeBasePriceId!, seatPriceId: target.stripeSeatPriceId!, seatQuantity: qty,
      }));
    } catch (e) {
      console.error('[plan-move] stripe swap failed', { agencyId, error: errName(e) });
      try {
        await deps.service.transaction(async (tx) => {
          await tx.update(agencyBilling)
            .set({ planId: row.planId, billableSeatsSynced: row.billableSeatsSynced, seatSyncPending: row.seatSyncPending, updatedAt: new Date() })
            .where(eq(agencyBilling.agencyId, agencyId));
          await tx.insert(agencyBillingEvent).values({ agencyId, fromState: row.state, toState: row.state, reason: 'admin_plan_version_move_reverted', actor: ctx.userId });
        });
      } catch (re) {
        console.error('[plan-move] revert failed', { agencyId, error: errName(re) });
        return result('failed', 'db_error');
      }
      return result('failed', 'stripe_error');
    }
  }

  // P8: email only when price or features change, never for pilots; a send failure never changes the outcome.
  let emailed = false;
  const before = { ...(old ? termsOf(old) : termsOf(target)), features: featuresOf(row, old) };
  const after = { ...termsOf(target), features: ALL.filter((f) => target.features.includes(f)) };
  if (row.state !== 'pilot' && planChangeWorthEmailing(before, after)) {
    const sent = await sendAgencyPlanChangeEmail(deps, agencyId, {
      before: termsOf(old ?? target), after: termsOf(target),
      featuresAdded: after.features.filter((f) => !before.features.includes(f)),
      featuresRemoved: before.features.filter((f) => !after.features.includes(f)),
      effective: swaps ? { kind: 'next_billing', date: isoDate(periodEnd) } : { kind: 'on_subscribe' },
    });
    emailed = sent > 0;
  }
  return result('moved', undefined, emailed);
}

export const platformPlanMoveTools = [listPlanAgenciesTool, moveAgenciesToCurrentPlanTool];
