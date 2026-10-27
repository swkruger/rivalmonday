import { type ClientBillingState, client, clientBilling, clientSetup, competitorSuggestion, contact, discoveryRun, invitation, type Tx } from '@cs/db';
import { and, desc, eq, gt, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { latestDoneRun, searchInputsReady } from '../rival-search';
import { clientBillingEligibility } from '../tools/client-billing';

/** Phase 11a §4. The service Db or a service tx (the invite/billing reads touch service-only tables). */
type Db = Pick<Tx, 'select' | 'update'>;

/** Phase 16 §6: the client setup steps (the wizard's All set screen is not a step). Billing exists for clients only. */
export type SetupStepKey = 'details' | 'lookup' | 'profile' | 'competitors' | 'invite' | 'billing';
/** A plain step's state. */
export type StepStatus = 'todo' | 'done' | 'skipped';
/** The merged search + pick step (O12 adds `waiting_owner`: the owner was asked to pick; settled for staff completion). */
export type CompetitorsStepState = 'todo' | 'searching' | 'blocked' | 'ready' | 'waiting_owner' | 'done' | 'skipped';
/** Any step's state (plain steps use the `StepStatus` subset). */
export type StepState = CompetitorsStepState;
export type InviteStatus = 'none' | 'pending' | 'accepted';
export type SetupState = {
  /** A setup row exists, and neither completed nor dismissed. The staff view (owners never enter setup, P8). */
  open: boolean;
  /** False for clients without a row (old clients, tests): treated as fully set up. */
  exists: boolean;
  steps: { details: StepStatus; lookup: StepStatus; profile: StepStatus; competitors: CompetitorsStepState; invite: StepStatus; billing?: StepStatus };
  /** 6 for clients (and row-less clients), 5 for prospects (no billing). */
  totalSteps: 5 | 6;
  /** Same as `steps.competitors`. */
  competitors: CompetitorsStepState;
  /** The service area has no centre (no listing and no geocoded address): the profile step asks for a location. */
  needsLocation: boolean;
  /** The failed discovery run's reason, if the search is blocked. */
  searchRefusal: string | null;
  waitingOn: 'agency' | 'client' | 'system' | null;
  /** `suggested` rows of the latest done run (or newer runs) are waiting to be picked. */
  pendingSuggestions: boolean;
  completedAt: Date | null;
  dismissedAt: Date | null;
};

export type SetupStateInput = {
  client: { name: string; phone: string | null; keywords: string[]; serviceArea: { center?: unknown } | null; placeId: string | null; status: string };
  setup: { skipped: string[]; competitorsDoneAt: Date | null; ownerPickRequestedAt: Date | null; completedAt: Date | null; dismissedAt: Date | null } | null;
  /** A `client_owner` contact exists for the client (the step 1 contact). */
  hasOwnerContact: boolean;
  latestRun: { status: string; error?: string | null } | null;
  hasPendingSuggestions: boolean;
  /** The invited owner's invitation (pending = unexpired and unrevoked). */
  invite: { status: InviteStatus };
  /** `eligible` = `clientBillingEligibility`; `state` = `client_billing.state` while `enabled`, else null. */
  billing: { eligible: boolean; state: ClientBillingState | null };
};

const RUNNING = new Set(['queued', 'searching', 'checking', 'finalising']);
const BILLING_DONE = new Set<ClientBillingState>(['invited', 'active', 'payment_needed']);
/** Steps that need nothing more from staff (`completeIfDone`). */
const SETTLED = new Set<StepState>(['done', 'skipped', 'waiting_owner']);
export const isSettledStep = (s: StepState | undefined): boolean => s !== undefined && SETTLED.has(s);

/** Pure (spec §6, O12). A client with no setup row reads as complete: closed, every step done. */
export function deriveSetupState({ client: c, setup, hasOwnerContact, latestRun, hasPendingSuggestions, invite: inv, billing: bill }: SetupStateInput): SetupState {
  const needsLocation = c.serviceArea?.center == null;
  if (!setup) {
    return {
      open: false, exists: false, steps: { details: 'done', lookup: 'done', profile: 'done', competitors: 'done', invite: 'done', billing: 'done' }, totalSteps: 6,
      competitors: 'done', needsLocation, searchRefusal: null, waitingOn: null, pendingSuggestions: false, completedAt: null, dismissedAt: null,
    };
  }
  const details: StepStatus = c.name.trim() !== '' && !!c.phone?.trim() && hasOwnerContact ? 'done' : 'todo';
  // The client row exists, so a listing was picked or "continue without" chosen (P4).
  const lookup: StepStatus = 'done';
  // The `startFirstAutoSearch` rule (P5: keywords + a centre).
  const profile: StepStatus = searchInputsReady(c) ? 'done' : 'todo';

  let competitors: CompetitorsStepState;
  let searchRefusal: string | null = null;
  if (setup.skipped.includes('competitors')) competitors = 'skipped';
  else if (setup.competitorsDoneAt) competitors = 'done';
  else if (setup.ownerPickRequestedAt) competitors = 'waiting_owner';
  else if (profile !== 'done') competitors = 'todo';
  else if (setup.skipped.includes('search')) competitors = 'ready'; // legacy "skip the search": pick from what exists
  else if (!latestRun) competitors = 'todo'; // refusals of the auto start aren't stored (R1): the wizard offers "Find competitors"
  else if (RUNNING.has(latestRun.status)) competitors = 'searching';
  else if (latestRun.status === 'done') competitors = 'ready';
  else {
    competitors = 'blocked';
    searchRefusal = latestRun.error ?? null;
  }

  // An actual invitation / live billing beats an earlier skip (it says more); an ineligible agency can't bill (spec §7).
  const invite: StepStatus = inv.status !== 'none' ? 'done' : setup.skipped.includes('invite') ? 'skipped' : 'todo';
  const prospect = c.status === 'prospect';
  const billing: StepStatus = bill.state && BILLING_DONE.has(bill.state) ? 'done' : setup.skipped.includes('billing') || !bill.eligible ? 'skipped' : 'todo';

  const open = setup.completedAt == null && setup.dismissedAt == null;
  let waitingOn: SetupState['waitingOn'] = null;
  if (open) {
    if (details === 'todo' || profile === 'todo') waitingOn = 'agency';
    else if (competitors === 'searching') waitingOn = 'system';
    // Picking (or "Done picking" on zero rivals) is the agency's move, open suggestions or not, so idle reminders fire.
    else if (competitors === 'todo' || competitors === 'blocked' || competitors === 'ready') waitingOn = 'agency';
    // 11b: invite and billing are staff steps; idle reminders keep firing until they're done or skipped.
    else if (invite === 'todo' || (!prospect && billing === 'todo')) waitingOn = 'agency';
    else if (competitors === 'waiting_owner') waitingOn = 'client';
  }
  const steps: SetupState['steps'] = prospect ? { details, lookup, profile, competitors, invite } : { details, lookup, profile, competitors, invite, billing };
  return {
    open, exists: true, steps, totalSteps: prospect ? 5 : 6, competitors, needsLocation, searchRefusal, waitingOn, pendingSuggestions: hasPendingSuggestions,
    completedAt: setup.completedAt, dismissedAt: setup.dismissedAt,
  };
}

async function loadCore(db: Pick<Tx, 'select'>, clientId: string) {
  const [[c], [setup], [latestRun]] = await Promise.all([
    db.select({ agencyId: client.agencyId, name: client.name, phone: client.phone, keywords: client.keywords, serviceArea: client.serviceArea, placeId: client.placeId, status: client.status })
      .from(client).where(eq(client.id, clientId)),
    db.select().from(clientSetup).where(eq(clientSetup.clientId, clientId)),
    db.select({ status: discoveryRun.status, error: discoveryRun.error }).from(discoveryRun).where(eq(discoveryRun.clientId, clientId)).orderBy(desc(discoveryRun.startedAt)).limit(1),
  ]);
  return { c: c ?? null, setup: setup ?? null, latestRun: latestRun ?? null };
}

const NO_ROW: Omit<SetupStateInput, 'setup'> = {
  client: { name: '', phone: null, keywords: [], serviceArea: null, placeId: null, status: 'active' }, hasOwnerContact: false, latestRun: null, hasPendingSuggestions: false,
  invite: { status: 'none' }, billing: { eligible: false, state: null },
};

/**
 * Loads the client, its setup row, latest discovery run, open suggestions, the owner contact, the owner invitation and
 * billing, then derives. Pass the service connection (or a service tx): the contact, invite and billing reads touch
 * tables tenant roles can't read.
 */
export async function getSetupState(db: Db, clientId: string, now: Date = new Date()): Promise<SetupState> {
  const { c, setup, latestRun } = await loadCore(db, clientId);
  if (!c || !setup) return deriveSetupState({ ...NO_ROW, client: c ?? NO_ROW.client, setup: null });
  const prospect = c.status === 'prospect';
  const [hasPendingSuggestions, invite, owner, eligibility, [bill]] = await Promise.all([
    hasPending(db, clientId),
    inviteStatus(db, clientId, setup, now),
    db.select({ id: contact.id }).from(contact).where(and(eq(contact.agencyId, c.agencyId), eq(contact.clientId, clientId), eq(contact.role, 'client_owner'))).limit(1),
    prospect ? null : clientBillingEligibility(db, c.agencyId),
    prospect ? [] : db.select({ enabled: clientBilling.enabled, state: clientBilling.state }).from(clientBilling).where(eq(clientBilling.clientId, clientId)),
  ]);
  return deriveSetupState({
    client: c, setup, hasOwnerContact: owner.length > 0, latestRun, hasPendingSuggestions, invite: { status: invite.status },
    billing: { eligible: !!eligibility?.ok, state: bill?.enabled ? bill.state : null },
  });
}

/**
 * O12 owner-pick window (security-sensitive; `assertSetupActor`): the agency asked the owner to pick
 * (`owner_pick_requested_at IS NOT NULL`) and competitors are not confirmed yet (`competitors_done_at IS NULL`).
 * Reads only `client_setup`, so it runs in the owner's tenant transaction (the locked re-check) or on the service connection.
 */
export async function ownerPickOpen(db: Pick<Tx, 'select'>, clientId: string): Promise<boolean> {
  const [row] = await db.select({ id: clientSetup.clientId }).from(clientSetup)
    .where(and(eq(clientSetup.clientId, clientId), isNotNull(clientSetup.ownerPickRequestedAt), isNull(clientSetup.competitorsDoneAt)));
  return !!row;
}

/** Same notion as `list_competitor_suggestions`: `suggested` rows of the latest done run and of runs started after it. */
async function hasPending(db: Db, clientId: string): Promise<boolean> {
  const run = await latestDoneRun(db, clientId);
  if (!run) return false;
  const newer = (await db.select({ id: discoveryRun.id }).from(discoveryRun).where(and(eq(discoveryRun.clientId, clientId), gt(discoveryRun.startedAt, run.startedAt)))).map((x) => x.id);
  const [row] = await db.select({ id: competitorSuggestion.id }).from(competitorSuggestion)
    .where(and(eq(competitorSuggestion.clientId, clientId), inArray(competitorSuggestion.runId, [run.id, ...newer]), eq(competitorSuggestion.status, 'suggested')))
    .limit(1);
  return !!row;
}

export type SetupInvite = { status: InviteStatus; name: string | null; email: string | null };
const NO_INVITE: SetupInvite = { status: 'none', name: null, email: null };

/**
 * Phase 11b §8: the invitation matching (agency, client, lower(email) of `invited_contact_id`'s contact, role
 * `client_owner`) — accepted, else pending (unrevoked, unexpired). `name`/`email` are the invited contact's.
 */
async function inviteStatus(db: Pick<Tx, 'select'>, clientId: string, setup: { invitedContactId: string | null; agencyId: string }, now: Date): Promise<SetupInvite> {
  if (!setup.invitedContactId) return NO_INVITE;
  const [ct] = await db.select({ name: contact.name, email: contact.email }).from(contact)
    .where(and(eq(contact.id, setup.invitedContactId), eq(contact.agencyId, setup.agencyId), eq(contact.clientId, clientId)));
  if (!ct) return NO_INVITE;
  const rows = await db.select({ acceptedAt: invitation.acceptedAt }).from(invitation).where(and(
    eq(invitation.agencyId, setup.agencyId), eq(invitation.clientId, clientId), eq(invitation.role, 'client_owner'),
    sql`lower(${invitation.email}) = lower(${ct.email})`,
    or(isNotNull(invitation.acceptedAt), and(isNull(invitation.revokedAt), gt(invitation.expiresAt, now))),
  ));
  const status: InviteStatus = rows.some((r) => r.acceptedAt) ? 'accepted' : rows.length > 0 ? 'pending' : 'none';
  return { status, name: ct.name, email: ct.email };
}

/** The setup's invited owner for `get_client_setup` (service connection). `none` without a setup row or invited contact. */
export async function loadSetupInvite(db: Pick<Tx, 'select'>, clientId: string, now: Date = new Date()): Promise<SetupInvite> {
  const [setup] = await db.select({ invitedContactId: clientSetup.invitedContactId, agencyId: clientSetup.agencyId }).from(clientSetup).where(eq(clientSetup.clientId, clientId));
  return setup ? inviteStatus(db, clientId, setup, now) : NO_INVITE;
}

/**
 * Sets `completed_at` once every step of the client's list (6 for clients, 5 for prospects) is settled: done, skipped or
 * `waiting_owner` (O12: staff finish while the owner picks; `competitors_done_at` stays unset until they confirm).
 * `details` is informational (controller ruling): it never blocks completion, so pre-16 setups, prospects and
 * `accept_lead` clients without a phone or owner contact complete as before. Guarded
 * UPDATE: never overwrites or clears an existing `completed_at`, and never completes a dismissed row (its starting-point
 * clock must not move to activation, spec §9). Pass a service-role tx (`app_user` can't write). Returns true if it just closed.
 */
export async function completeIfDone(tx: Db, clientId: string, now: Date): Promise<boolean> {
  const s = await getSetupState(tx, clientId, now);
  if (!s.exists || s.completedAt) return false;
  if (!Object.entries(s.steps).every(([k, v]) => k === 'details' || isSettledStep(v))) return false;
  const done = await tx.update(clientSetup).set({ completedAt: now }).where(and(eq(clientSetup.clientId, clientId), isNull(clientSetup.completedAt), isNull(clientSetup.dismissedAt))).returning({ id: clientSetup.clientId });
  return done.length > 0;
}
