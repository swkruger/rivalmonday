import { ToolError } from '@cs/core';
import { type AgencyBillingRow, type BillingState, type Db, type PlanRow, type Tx, agency, agencyBilling, client, clientServiceable, plan } from '@cs/db';
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
}

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

type Decision = { ok: true } | { ok: false; reason: 'cap' | 'state' };

/** Spec § `@cs/billing`: cap applies in `pilot` (unless exempt) and `trialing`; unpaid/suspended states refuse; `active` always allows. */
function decide(row: AgencyBillingRow | null, activeClients: number, includedSeats: number, now: Date): Decision {
  const state: BillingState = row?.state ?? 'pilot';
  const under = activeClients < includedSeats;
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

/** Read-only view of what the agency may do (a missing row counts as a non-exempt pilot). */
export async function billingAccess(db: BillingDb, agencyId: string, now: Date = new Date()): Promise<BillingAccess> {
  const [row = null] = await db.select().from(agencyBilling).where(eq(agencyBilling.agencyId, agencyId));
  const [p, activeClients] = await Promise.all([planFor(db, row), countActiveClients(db, agencyId)]);
  const includedSeats = p?.includedSeats ?? 0;
  const state: BillingState = row?.state ?? 'pilot';
  return {
    state,
    canAddActiveClient: decide(row, activeClients, includedSeats, now).ok,
    readOnly: state === 'read_only',
    suspended: state === 'suspended',
    activeClients,
    includedSeats,
    seatCapExempt: row?.seatCapExempt ?? false,
  };
}

export const PAYMENT_NEEDED_MESSAGE = 'Payment needed — update your payment method to add clients.';
/** R28: refused-state copy for agency staff who cannot fix billing (only the admin sees payment words). */
export const ACCOUNT_NEEDS_ATTENTION_MESSAGE = "Your agency's account needs attention.";
const refusedStateMessage = (role: string | undefined) => (role === undefined || role === 'agency_admin' ? PAYMENT_NEEDED_MESSAGE : ACCOUNT_NEEDS_ATTENTION_MESSAGE);
export const seatLimitMessage = (includedSeats: number) => `You've used your ${includedSeats} included clients. Upgrade to add more.`;

/**
 * Call inside the transaction that sets a client `active`. Serialises concurrent activations for one agency by locking
 * `agency_billing` (or, with no row yet, the `agency` row) `FOR UPDATE`, then counts active clients inside the same tx.
 * `role` (the caller's) picks the refused-state copy; the seat-cap copy is the same for everyone.
 */
export async function assertCanActivateClient(tx: Tx, agencyId: string, opts: { role?: string; now?: Date } = {}): Promise<void> {
  const now = opts.now ?? new Date();
  const [row = null] = await tx.select().from(agencyBilling).where(eq(agencyBilling.agencyId, agencyId)).for('update');
  if (!row) await tx.select({ id: agency.id }).from(agency).where(eq(agency.id, agencyId)).for('update');
  const [p, activeClients] = await Promise.all([planFor(tx, row), countActiveClients(tx, agencyId)]);
  const includedSeats = p?.includedSeats ?? 0;
  const d = decide(row, activeClients, includedSeats, now);
  if (d.ok) return;
  throw new ToolError('billing_seat_limit', d.reason === 'cap' ? seatLimitMessage(includedSeats) : refusedStateMessage(opts.role));
}
