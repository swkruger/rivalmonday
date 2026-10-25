import { DEFAULT_SUPPORT_EMAIL, ToolError } from '@cs/core';
import { type AgencyBillingRow, type BillingState, type Db, type PlanRow, type Tx, agency, agencyBilling, agencyOnboarding, client, clientServiceable, plan } from '@cs/db';
import { and, count, eq } from 'drizzle-orm';

/** Anything that can run queries: the root db or an open transaction. */
export type BillingDb = Db | Tx;

export const DEFAULT_PLAN_CODE = 'standard';

export interface BillingAccess {
  state: BillingState;
  canAddActiveClient: boolean;
  readOnly: boolean;
  suspended: boolean;
  activeClients: number;
  includedSeats: number;
  seatCapExempt: boolean;
  /** Phase 10 f12: open sign-up still on its trial (see `isReducedTrial`). */
  reducedTrial: boolean;
  /** The active-client cap the decision uses: `TRIAL_ACTIVE_CLIENTS` when `reducedTrial`, else the plan's included seats. */
  maxActiveClients: number;
  /** Phase 15c3a: platform staff put the agency on hold (`agency.suspended_at`); implies `readOnly`. */
  onHold: boolean;
}

/** Phase 10 f12: active clients an open sign-up may monitor while trialing. */
export const TRIAL_ACTIVE_CLIENTS = 1;

export async function currentStandardPlan(db: BillingDb): Promise<PlanRow | null> {
  const [p] = await db.select().from(plan).where(and(eq(plan.code, DEFAULT_PLAN_CODE), eq(plan.isCurrent, true)));
  return p ?? null;
}

/** The plan the agency is on, falling back to the current `standard` plan (also for agencies with no row). */
export async function planFor(db: BillingDb, row: AgencyBillingRow | null): Promise<PlanRow | null> {
  if (row?.planId) {
    const [p] = await db.select().from(plan).where(eq(plan.id, row.planId));
    if (p) return p;
  }
  return currentStandardPlan(db);
}

export async function countActiveClients(db: BillingDb, agencyId: string): Promise<number> {
  const [r] = await db.select({ n: count() }).from(client).where(and(eq(client.agencyId, agencyId), clientServiceable(client)));
  return r?.n ?? 0;
}

/**
 * Phase 10 f12: `trialing`, not seat-cap exempt, and signed up through the open sign-up. A missing billing or onboarding
 * row is never reduced. Mirrors `agencyReducedTrial` in `@cs/db` (filters.ts) for SQL schedulers.
 */
export async function isReducedTrial(db: BillingDb, row: AgencyBillingRow | null): Promise<boolean> {
  if (row?.state !== 'trialing' || row.seatCapExempt) return false;
  const [o] = await db.select({ source: agencyOnboarding.source }).from(agencyOnboarding).where(eq(agencyOnboarding.agencyId, row.agencyId));
  return o?.source === 'open';
}

interface Allowance { reducedTrial: boolean; includedSeats: number; maxActiveClients: number; activeClients: number }

async function allowanceFor(db: BillingDb, agencyId: string, row: AgencyBillingRow | null): Promise<Allowance> {
  const [p, activeClients, reducedTrial] = await Promise.all([planFor(db, row), countActiveClients(db, agencyId), isReducedTrial(db, row)]);
  const includedSeats = p?.includedSeats ?? 0;
  return { reducedTrial, includedSeats, maxActiveClients: reducedTrial ? TRIAL_ACTIVE_CLIENTS : includedSeats, activeClients };
}

type Decision = { ok: true } | { ok: false; reason: 'cap' | 'state' };

/** Spec § `@cs/billing`: cap applies in `pilot` (unless exempt) and `trialing`; unpaid/suspended states refuse; `active` always allows. */
function decide(row: AgencyBillingRow | null, activeClients: number, maxActiveClients: number, now: Date): Decision {
  const state: BillingState = row?.state ?? 'pilot';
  const under = activeClients < maxActiveClients;
  switch (state) {
    case 'active':
      return { ok: true };
    case 'cancelled':
      // The subscription still runs until cancel_at; after that (or with no date) activation is refused.
      return row?.cancelAt && row.cancelAt > now ? { ok: true } : { ok: false, reason: 'state' };
    case 'pilot':
      return row?.seatCapExempt || under ? { ok: true } : { ok: false, reason: 'cap' };
    case 'trialing':
      return under ? { ok: true } : { ok: false, reason: 'cap' };
    default:
      return { ok: false, reason: 'state' };
  }
}

/** Phase 15c3a: true when platform staff hold the agency (`agency.suspended_at IS NOT NULL`). */
export async function isOnHold(db: BillingDb, agencyId: string): Promise<boolean> {
  const [a] = await db.select({ suspendedAt: agency.suspendedAt }).from(agency).where(eq(agency.id, agencyId));
  return a?.suspendedAt != null;
}

/** Read-only view of what the agency may do (a missing row counts as a non-exempt pilot). */
export async function billingAccess(db: BillingDb, agencyId: string, now: Date = new Date()): Promise<BillingAccess> {
  const [row = null] = await db.select().from(agencyBilling).where(eq(agencyBilling.agencyId, agencyId));
  const { reducedTrial, includedSeats, maxActiveClients, activeClients } = await allowanceFor(db, agencyId, row);
  const state: BillingState = row?.state ?? 'pilot';
  const onHold = await isOnHold(db, agencyId);
  return {
    state,
    canAddActiveClient: decide(row, activeClients, maxActiveClients, now).ok,
    readOnly: state === 'read_only' || onHold,
    suspended: state === 'suspended',
    activeClients,
    includedSeats,
    seatCapExempt: row?.seatCapExempt ?? false,
    reducedTrial,
    maxActiveClients,
    onHold,
  };
}

export const PAYMENT_NEEDED_MESSAGE = 'Payment needed — update your payment method to add clients.';
/** R28: refused-state copy for agency staff who cannot fix billing (only the admin sees payment words). */
export const ACCOUNT_NEEDS_ATTENTION_MESSAGE = "Your agency's account needs attention.";
/** Phase 15c3a: the hold copy shown to agency admins / account managers. */
export const HOLD_MESSAGE = (supportEmail: string) => `This account is on hold. Contact ${supportEmail} to restore it.`;
/** Agency staff see the hold copy; every other role (client roles, contacts) the generic needs-attention line. */
export function holdMessage(role: string, supportEmail?: string): string {
  return role === 'agency_admin' || role === 'account_manager' ? HOLD_MESSAGE(supportEmail ?? DEFAULT_SUPPORT_EMAIL) : ACCOUNT_NEEDS_ATTENTION_MESSAGE;
}
const refusedStateMessage = (role: string | undefined) => (role === undefined || role === 'agency_admin' ? PAYMENT_NEEDED_MESSAGE : ACCOUNT_NEEDS_ATTENTION_MESSAGE);
export const seatLimitMessage = (includedSeats: number) => `You've used your ${includedSeats} included clients. Upgrade to add more.`;
/** Phase 10 f12 (R7): the reduced-trial cap copy (decided; with the standard plan: "…monitor up to 3."). */
export const reducedTrialMessage = (includedSeats: number) =>
  `Your trial includes ${TRIAL_ACTIVE_CLIENTS} active client. Add a payment method to monitor up to ${includedSeats}.`;

/**
 * Call inside the transaction that sets a client `active`. Serialises concurrent activations for one agency by locking
 * `agency_billing` (or, with no row yet, the `agency` row) `FOR UPDATE`, then counts active clients inside the same tx.
 * `role` (the caller's) picks the refused-state copy; the seat-cap copy is the same for everyone.
 */
export async function assertCanActivateClient(tx: Tx, agencyId: string, opts: { role?: string; now?: Date } = {}): Promise<void> {
  const now = opts.now ?? new Date();
  const [row = null] = await tx.select().from(agencyBilling).where(eq(agencyBilling.agencyId, agencyId)).for('update');
  if (!row) await tx.select({ id: agency.id }).from(agency).where(eq(agency.id, agencyId)).for('update');
  // 15c-3a: a held agency activates nothing, whatever its seats or Stripe state.
  if (await isOnHold(tx, agencyId)) throw new ToolError('service_paused', holdMessage(opts.role ?? 'agency_admin'), { userFacing: true });
  const { reducedTrial, includedSeats, maxActiveClients, activeClients } = await allowanceFor(tx, agencyId, row);
  const d = decide(row, activeClients, maxActiveClients, now);
  if (d.ok) return;
  if (d.reason === 'cap' && reducedTrial) throw new ToolError('billing_seat_limit', reducedTrialMessage(includedSeats), { userFacing: true });
  throw new ToolError('billing_seat_limit', d.reason === 'cap' ? seatLimitMessage(includedSeats) : refusedStateMessage(opts.role));
}
