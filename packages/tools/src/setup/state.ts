import { type ClientBillingState, client, clientBilling, clientSetup, competitorSuggestion, contact, discoveryRun, invitation, type Tx } from '@cs/db';
import { and, desc, eq, gt, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { latestDoneRun, searchInputsReady } from '../rival-search';
import { clientBillingEligibility } from '../tools/client-billing';

/** Phase 11a §4. The service Db or a service tx (the invite/billing reads touch service-only tables). */
type Db = Pick<Tx, 'select' | 'update'>;

export type StepStatus = 'todo' | 'running' | 'done' | 'skipped' | 'blocked';
export type InviteStatus = 'none' | 'pending' | 'accepted';
export type SetupState = {
  /** A setup row exists, and neither completed nor dismissed. The staff view. */
  open: boolean;
  /**
   * The client owner's view (controller ruling 2026-10-17): `open` and one of the owner's own steps (profile, search,
   * competitors) still todo/running/blocked. Invite and billing are staff steps, so the owner's setup ends before them.
   */
  clientOpen: boolean;
  /** False for clients without a row (old clients, tests): treated as fully set up. */
  exists: boolean;
  /** Phase 11b §8: `invite` for clients and prospects, `billing` for clients only. */
  steps: { profile: StepStatus; search: StepStatus; competitors: StepStatus; invite?: StepStatus; billing?: StepStatus };
  /** 4 for prospects, 5 for clients (and row-less clients). */
  totalSteps: 4 | 5;
  /** The failed discovery run's reason, if the search is blocked. */
  searchRefusal: string | null;
  waitingOn: 'agency' | 'client' | 'system' | null;
  /** `suggested` rows of the latest done run (or newer runs) are waiting to be picked. */
  pendingSuggestions: boolean;
  completedAt: Date | null;
  dismissedAt: Date | null;
};

export type SetupStateInput = {
  client: { keywords: string[]; serviceArea: { center?: unknown } | null; placeId: string | null; status: string };
  setup: { skipped: string[]; competitorsDoneAt: Date | null; completedAt: Date | null; dismissedAt: Date | null } | null;
  latestRun: { status: string; error?: string | null } | null;
  hasPendingSuggestions: boolean;
  /** The invited owner's invitation (pending = unexpired and unrevoked). */
  invite: { status: InviteStatus };
  /** `eligible` = `clientBillingEligibility`; `state` = `client_billing.state` while `enabled`, else null. */
  billing: { eligible: boolean; state: ClientBillingState | null };
};

const RUNNING = new Set(['queued', 'searching', 'checking', 'finalising']);
const BILLING_DONE = new Set<ClientBillingState>(['invited', 'active', 'payment_needed']);
const OPEN_STEP = new Set<StepStatus>(['todo', 'running', 'blocked']);

/** Pure (spec §4, 11b §8). A client with no setup row reads as complete: closed, every step done. */
export function deriveSetupState({ client: c, setup, latestRun, hasPendingSuggestions, invite: inv, billing: bill }: SetupStateInput): SetupState {
  if (!setup) {
    return {
      open: false, clientOpen: false, exists: false, steps: { profile: 'done', search: 'done', competitors: 'done', invite: 'done', billing: 'done' }, totalSteps: 5,
      searchRefusal: null, waitingOn: null, pendingSuggestions: false, completedAt: null, dismissedAt: null,
    };
  }
  // The `startFirstAutoSearch` rule.
  const profile: StepStatus = searchInputsReady(c) ? 'done' : 'todo';

  let search: StepStatus;
  let searchRefusal: string | null = null;
  if (setup.skipped.includes('search')) search = 'skipped';
  else if (!latestRun) search = 'todo'; // refusals of the auto start aren't stored (R1): the wizard offers "Find competitors"
  else if (RUNNING.has(latestRun.status)) search = 'running';
  else if (latestRun.status === 'done') search = 'done';
  else {
    search = 'blocked';
    searchRefusal = latestRun.error ?? null;
  }

  const competitors: StepStatus = setup.skipped.includes('competitors') ? 'skipped' : setup.competitorsDoneAt ? 'done' : 'todo';
  // An actual invitation / live billing beats an earlier skip (it says more); an ineligible agency can't bill (spec §7).
  const invite: StepStatus = inv.status !== 'none' ? 'done' : setup.skipped.includes('invite') ? 'skipped' : 'todo';
  const prospect = c.status === 'prospect';
  const billing: StepStatus = bill.state && BILLING_DONE.has(bill.state) ? 'done' : setup.skipped.includes('billing') || !bill.eligible ? 'skipped' : 'todo';

  const open = setup.completedAt == null && setup.dismissedAt == null;
  const clientOpen = open && [profile, search, competitors].some((s) => OPEN_STEP.has(s));
  let waitingOn: SetupState['waitingOn'] = null;
  if (open) {
    if (profile === 'todo') waitingOn = 'agency';
    else if (search === 'running') waitingOn = 'system';
    else if (search === 'todo' || search === 'blocked') waitingOn = 'agency';
    // Picking (or "Done picking" on zero rivals) is the agency's move, open suggestions or not, so idle reminders fire.
    else if (competitors === 'todo') waitingOn = 'agency';
    // 11b: invite and billing are staff steps; idle reminders keep firing until they're done or skipped.
    else if (invite === 'todo' || (!prospect && billing === 'todo')) waitingOn = 'agency';
  }
  const steps: SetupState['steps'] = prospect ? { profile, search, competitors, invite } : { profile, search, competitors, invite, billing };
  return {
    open, clientOpen, exists: true, steps, totalSteps: prospect ? 4 : 5, searchRefusal, waitingOn, pendingSuggestions: hasPendingSuggestions,
    completedAt: setup.completedAt, dismissedAt: setup.dismissedAt,
  };
}

/** The tables every viewer of the setup may read (client owners included, under RLS). */
async function loadCore(db: Pick<Tx, 'select'>, clientId: string) {
  const [[c], [setup], [latestRun]] = await Promise.all([
    db.select({ agencyId: client.agencyId, keywords: client.keywords, serviceArea: client.serviceArea, placeId: client.placeId, status: client.status }).from(client).where(eq(client.id, clientId)),
    db.select().from(clientSetup).where(eq(clientSetup.clientId, clientId)),
    db.select({ status: discoveryRun.status, error: discoveryRun.error }).from(discoveryRun).where(eq(discoveryRun.clientId, clientId)).orderBy(desc(discoveryRun.startedAt)).limit(1),
  ]);
  return { c: c ?? null, setup: setup ?? null, latestRun: latestRun ?? null };
}

const NO_ROW: Omit<SetupStateInput, 'setup'> = {
  client: { keywords: [], serviceArea: null, placeId: null, status: 'active' }, latestRun: null, hasPendingSuggestions: false, invite: { status: 'none' }, billing: { eligible: false, state: null },
};

/**
 * Loads the client, its setup row, latest discovery run, open suggestions, the owner invitation and billing, then derives.
 * Pass the service connection (or a service tx): the invite and billing reads touch tables tenant roles can't read.
 */
export async function getSetupState(db: Db, clientId: string, now: Date = new Date()): Promise<SetupState> {
  const { c, setup, latestRun } = await loadCore(db, clientId);
  if (!c || !setup) return deriveSetupState({ ...NO_ROW, client: c ?? NO_ROW.client, setup: null });
  const prospect = c.status === 'prospect';
  const [hasPendingSuggestions, invite, eligibility, [bill]] = await Promise.all([
    hasPending(db, clientId),
    inviteStatus(db, clientId, setup, now),
    prospect ? null : clientBillingEligibility(db, c.agencyId),
    prospect ? [] : db.select({ enabled: clientBilling.enabled, state: clientBilling.state }).from(clientBilling).where(eq(clientBilling.clientId, clientId)),
  ]);
  return deriveSetupState({
    client: c, setup, latestRun, hasPendingSuggestions, invite: { status: invite.status },
    billing: { eligible: !!eligibility?.ok, state: bill?.enabled ? bill.state : null },
  });
}

/**
 * The client owner's view only (`clientOpen`), from the tables a client owner's tenant transaction may read — for the
 * in-transaction re-guard of setup writes. Clients without a row read as closed.
 */
export async function clientSetupOpen(db: Pick<Tx, 'select'>, clientId: string): Promise<boolean> {
  const { c, setup, latestRun } = await loadCore(db, clientId);
  if (!c || !setup) return false;
  // Invite/billing never change `clientOpen`; neutral values avoid the service-only reads.
  return deriveSetupState({ ...NO_ROW, client: c, setup, latestRun }).clientOpen;
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
 * Sets `completed_at` once every step of the client's list (5 for clients, 4 for prospects) is done or skipped. Guarded
 * UPDATE: never overwrites or clears an existing `completed_at`, and never completes a dismissed row (its starting-point
 * clock must not move to activation, spec §9). Pass a service-role tx (`app_user` can't write). Returns true if it just closed.
 */
export async function completeIfDone(tx: Db, clientId: string, now: Date): Promise<boolean> {
  const s = await getSetupState(tx, clientId, now);
  if (!s.exists || s.completedAt) return false;
  if (!Object.values(s.steps).every((v) => v === 'done' || v === 'skipped')) return false;
  const done = await tx.update(clientSetup).set({ completedAt: now }).where(and(eq(clientSetup.clientId, clientId), isNull(clientSetup.completedAt), isNull(clientSetup.dismissedAt))).returning({ id: clientSetup.clientId });
  return done.length > 0;
}
