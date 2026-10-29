import { MAPS_SEARCH_OPERATION } from '@cs/collectors';
import { type AccessContext, canAccessClient, isAgencyRole, toolkit, ToolError } from '@cs/core';
import { client, clientCompetitor, clientSetup, competitorSuggestion, discoveryRun, setupLookupSchema, type SetupSkippedStep, type SetupSuggestions, setupSuggestionsSchema, type Tx, vendorCall, withTenant } from '@cs/db';
import { and, count, desc, eq, gte, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { inviteClientUser } from '../access/client-invite';
import { catalogOf, catalogPacks, packsOf } from '../catalog/access';
import type { ToolDeps } from '../deps';
import { enqueueOf } from '../deps';
import { startCompetitorSearch } from '../rival-search';
import { collapseSameListing, FIND_BUSINESS_DAILY_CAP, possibleDuplicates, preselectVertical, toSetupLookup } from '../setup/lookup';
import { applyClientProfileChange } from '../setup/profile-change';
import { queueCompetitorReview } from '../setup/review-email';
import { completeIfDone, getSetupState, loadSetupInvite, ownerPickOpen, type SetupState } from '../setup/state';
import { refuseSampleContacts } from '../waitlist/sample';
import { normaliseName } from '@cs/verticals';
import { addBusinessAreaCore, lockCatalogue, refuseClientData } from './verticals';
import { acceptSuggestions, dismissSuggestions, preTickTop, RUN_STATUSES, runSuggestionRows, SearchProgress, searchProgress, searchRefusalMessage } from './competitors';
import { ServiceAreaWrite, Tier } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();

const FoundPlace = setupLookupSchema.extend({ suggestedVerticalId: z.string().nullable(), isClaimed: z.boolean().nullable(), possibleDuplicate: z.boolean() });

export const findBusiness = defineTool({
  name: 'find_business',
  access: 'read',
  description: 'Look up a business on Google Maps by name and city/ZIP (agency staff, new-client wizard). Limited to 30 searches per agency per day.',
  input: z.object({ name: z.string().trim().min(1).max(120), location: z.string().trim().min(2).max(120) }),
  output: z.object({ places: z.array(FoundPlace).max(5) }),
  permission: 'agency',
  channels: ['web'],
  async handler(ctx, input, deps) {
    if (ctx.clientScope !== 'all') throw new ToolError('permission_denied', 'Only agency-wide staff can look up businesses');
    if (ctx.support) throw new ToolError('permission_denied', 'Not available in a support session');
    if (!deps.setupLookup) throw new ToolError('internal', 'Business search is not configured', { userFacing: true });

    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const [{ n } = { n: 0 }] = await deps.service
      .select({ n: count() })
      .from(vendorCall)
      .where(and(eq(vendorCall.vendor, 'dataforseo'), eq(vendorCall.operation, MAPS_SEARCH_OPERATION), eq(vendorCall.agencyId, ctx.agencyId), isNull(vendorCall.clientId), gte(vendorCall.createdAt, startOfDay)));
    if (n >= FIND_BUSINESS_DAILY_CAP) {
      throw new ToolError('rate_limited', `You've reached today's limit of ${FIND_BUSINESS_DAILY_CAP} business searches. Try again tomorrow or enter the details by hand.`, { userFacing: true });
    }

    let found: Awaited<ReturnType<NonNullable<typeof deps.setupLookup>>>;
    try {
      found = await deps.setupLookup({ keyword: `${input.name} ${input.location}`, locationName: 'United States' }, { agencyId: ctx.agencyId, clientId: null });
    } catch (e) {
      if (e instanceof ToolError) throw e;
      console.error('[find_business] vendor lookup failed', { agencyId: ctx.agencyId }, (e as { name?: string } | null)?.name);
      throw new ToolError('internal', "Business search isn't available right now. Try again, or enter the details by hand.", { userFacing: true });
    }
    const usable = collapseSameListing(found.filter((p) => !p.closed).flatMap((p) => {
      const lookup = toSetupLookup(p);
      return lookup ? [{ ...lookup, isClaimed: p.isClaimed ?? null, categories: [p.category, ...(p.additionalCategories ?? [])].filter((c): c is string => !!c) }] : [];
    })).slice(0, 5);
    const dup = possibleDuplicates(usable);
    const packs = usable.length ? await catalogPacks(deps) : [];
    return { places: usable.map(({ categories, ...rest }, i) => ({ ...rest, suggestedVerticalId: preselectVertical(packs, categories), possibleDuplicate: dup[i]! })) };
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Phase 11a §8 / Phase 16 O12: the wizard tools. Agency staff (with access to the client); a `client_owner` only for
// picking competitors, and only while the agency asked them to pick (`ownerPickOpen`). Every write re-checks inside
// its write transaction, after the shared `client` row lock, so a concurrent confirm/completion wins (Review focus 1–2).

/** What a setup tool call does, for `assertSetupActor`. */
type SetupOp = 'read' | 'save_profile' | 'pick' | (typeof ACTIONS)[number];
/** The only setup operations a client owner may run (O12, P8): reading the pick screen, picking, confirming. */
const OWNER_OPS = new Set<SetupOp>(['read', 'pick', 'confirm_competitors']);

/**
 * Shared guard (security-sensitive, exact rule). Agency staff always pass (tool permission + client scope are checked
 * by the registry and `assertClientVisible`). A `client_owner` passes ONLY for reading the pick screen,
 * `pick_setup_competitors` and `advance_client_setup` `confirm_competitors`, and ONLY while
 * `owner_pick_requested_at IS NOT NULL AND competitors_done_at IS NULL`. Every other call by any client role is
 * `not_found` (a scope refusal, P13). Callers prove tenant visibility first (`assertClientVisible`): this reads on the
 * service connection.
 */
async function assertSetupActor(ctx: AccessContext, deps: ToolDeps, clientId: string, op: SetupOp): Promise<SetupState> {
  if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
  if (!isAgencyRole(ctx.role)) {
    if (ctx.role !== 'client_owner' || !OWNER_OPS.has(op) || !(await ownerPickOpen(deps.service, clientId))) throw new ToolError('not_found', 'Client not found');
  }
  return getSetupState(deps.service, clientId); // service read; client already scoped above
}

/** RLS proof that the caller's tenant sees the client (another agency's staff pass `canAccessClient` with scope 'all'). */
async function assertClientVisible(ctx: AccessContext, deps: ToolDeps, clientId: string): Promise<void> {
  if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
  const [c] = await withTenant(deps.app, ctx, (tx) => tx.select({ id: client.id }).from(client).where(eq(client.id, clientId)));
  if (!c) throw new ToolError('not_found', 'Client not found');
}

/**
 * The in-transaction re-guard: run it right after the `client` row lock (tenant or service tx). Agency staff pass; a
 * client owner is refused (`not_found`) once the owner-pick window is closed (competitors confirmed, the request
 * cleared or the row gone). The caller already limited owners to the pick operations (`assertSetupActor`).
 */
export function closedSetupRecheck(ctx: AccessContext, clientId: string): (tx: Tx) => Promise<void> {
  return async (tx) => {
    if (isAgencyRole(ctx.role)) return;
    if (ctx.role !== 'client_owner' || !(await ownerPickOpen(tx, clientId))) throw new ToolError('not_found', 'Client not found');
  };
}

/** The shared lock every setup write takes first (the profile change and competitor accept take the same one). */
async function lockClient(tx: Tx, clientId: string): Promise<void> {
  const [c] = await tx.select({ id: client.id }).from(client).where(eq(client.id, clientId)).for('update');
  if (!c) throw new ToolError('not_found', 'Client not found');
}

const changedBy = (ctx: AccessContext, now: Date) => ({ lastChangedBy: ctx.userId, lastChangedRole: ctx.role, lastChangedAt: now });

/** The suggestions job runs once, right after creation; a `pending` older than this is reported as failed (no write). */
export const STALE_PENDING_MS = 15 * 60_000;

/** Pure: a `pending` suggestion set whose setup row is older than 15 minutes reads as `failed`, so the wizard stops waiting. */
export function reportedSuggestions(s: SetupSuggestions, createdAt: Date, now: Date = new Date()): SetupSuggestions {
  return s.status === 'pending' && now.getTime() - createdAt.getTime() > STALE_PENDING_MS ? { status: 'failed' } : s;
}

const StepStatusOut = z.enum(['todo', 'done', 'skipped']);
const CompetitorsStateOut = z.enum(['todo', 'searching', 'blocked', 'ready', 'waiting_owner', 'done', 'skipped']);
const SetupStateOut = z.object({
  open: z.boolean(),
  exists: z.boolean(),
  steps: z.object({
    details: StepStatusOut, lookup: StepStatusOut, profile: StepStatusOut, competitors: CompetitorsStateOut, invite: StepStatusOut, billing: StepStatusOut.optional(),
  }),
  totalSteps: z.union([z.literal(5), z.literal(6)]),
  competitors: CompetitorsStateOut,
  needsLocation: z.boolean(),
  searchRefusal: z.string().nullable(),
  waitingOn: z.enum(['agency', 'client', 'system']).nullable(),
  completedAt: z.date().nullable(),
  dismissedAt: z.date().nullable(),
});

/** Client-safe: never the internal discovery fields (overlap_score, signals, ad_matches, appearances, best_rank). */
const ClientSafeSuggestion = z.object({
  id: uuid, name: z.string(), tier: Tier, rating: z.number().nullable(), votes: z.number().nullable(), distanceKm: z.number().nullable(),
  status: z.enum(['suggested', 'accepted', 'dismissed']), preTicked: z.boolean(),
});
export type ClientSafeSuggestion = z.infer<typeof ClientSafeSuggestion>;

/**
 * Client-safe view of the latest discovery run (the "Finding competitors" step polls it; client owners can't call
 * `get_competitor_search_status`): stage + progress counters + kept count only — never hidden names/reasons, cost or
 * vendor error text.
 */
const SetupSearch = z.object({ status: z.enum(RUN_STATUSES), progress: SearchProgress, kept: z.number().int().nullable(), finishedAt: z.string().nullable() });

export const getClientSetup = defineTool({
  name: 'get_client_setup',
  access: 'read',
  description: 'The client setup wizard: step states, the picked Google place, AI profile suggestions and the competitor suggestions to pick from.',
  input: z.object({ clientId: uuid }),
  output: z.object({
    state: SetupStateOut,
    lookup: setupLookupSchema.nullable(),
    suggestions: setupSuggestionsSchema,
    competitorSuggestions: z.array(ClientSafeSuggestion),
    search: SetupSearch.nullable(),
    vertical: z.object({ name: z.string(), services: z.array(z.object({ id: z.string(), name: z.string() })), seedKeywords: z.array(z.string()) }),
    /** Phase 11b: the invited owner (invite step, "Ask {name} to review"). Name and email are for agency staff only. */
    invite: z.object({ status: z.enum(['none', 'pending', 'accepted']), name: z.string().nullable(), email: z.string().nullable() }),
  }),
  permission: 'read',
  channels: ['web'],
  // Polled by the wizard while suggestions or the search are pending.
  audit: 'skip-web',
  supportMask: ['invite.email', 'invite.name'],
  async handler(ctx, { clientId }, deps) {
    // Agency staff; the client's owner only while asked to pick (O12, P8), for the pick screen.
    await assertSetupActor(ctx, deps, clientId, 'read');
    const r = await withTenant(deps.app, ctx, async (tx) => {
      const [c] = await tx.select({ verticalId: client.verticalId, limit: client.competitorLimit }).from(client).where(eq(client.id, clientId));
      if (!c) return null;
      const [row] = await tx.select({ lookup: clientSetup.lookup, suggestions: clientSetup.suggestions, createdAt: clientSetup.createdAt }).from(clientSetup).where(eq(clientSetup.clientId, clientId));
      const [tracked] = await tx.select({ n: count() }).from(clientCompetitor).where(eq(clientCompetitor.clientId, clientId));
      const { rows } = await runSuggestionRows(tx, clientId, ['suggested', 'accepted']);
      const [run] = await tx.select({ status: discoveryRun.status, progress: discoveryRun.progress, kept: discoveryRun.kept, finishedAt: discoveryRun.finishedAt })
        .from(discoveryRun).where(eq(discoveryRun.clientId, clientId)).orderBy(desc(discoveryRun.startedAt)).limit(1);
      return { c, row: row ?? null, tracked: tracked?.n ?? 0, rows, run: run ?? null };
    });
    if (!r) throw new ToolError('not_found', 'Client not found');
    // Tenant visibility proven above; the state's contact/invite/billing reads need the service connection.
    const state = await getSetupState(deps.service, clientId);
    const staff = isAgencyRole(ctx.role);
    const invite = await loadSetupInvite(deps.service, clientId);

    const pack = await packsOf(deps)(r.c.verticalId);
    const ticked = preTickTop(r.rows.filter((s) => s.status === 'suggested'), r.c.limit, r.tracked);
    const parsed = setupSuggestionsSchema.safeParse(r.row?.suggestions);
    const suggestions: SetupSuggestions = r.row && parsed.success ? reportedSuggestions(parsed.data, r.row.createdAt) : { status: 'none' };
    const lookup = r.row?.lookup ? setupLookupSchema.safeParse(r.row.lookup) : null;
    return {
      state,
      invite: staff ? invite : { status: invite.status, name: null, email: null },
      lookup: lookup?.success ? lookup.data : null,
      suggestions,
      search: r.run ? { status: r.run.status, progress: searchProgress(r.run.progress), kept: r.run.kept, finishedAt: r.run.finishedAt?.toISOString() ?? null } : null,
      competitorSuggestions: r.rows.map((s) => ({
        id: s.id, name: s.name, tier: s.tier ?? 'minor', rating: s.rating, votes: s.votes, distanceKm: s.distanceKm,
        status: s.status as ClientSafeSuggestion['status'], preTicked: ticked.has(s.id),
      })),
      vertical: { name: pack.name, services: pack.services.map((s) => ({ id: s.id, name: s.name })), seedKeywords: [...pack.discovery.seed_keywords] },
    };
  },
});

export const saveSetupProfile = defineTool({
  name: 'save_setup_profile',
  access: 'write',
  description: 'Save the "Your business" step of the client setup wizard: services, keywords, service area and Google place id.',
  input: z.object({
    clientId: uuid, services: z.array(z.string().max(80)).max(255).optional(), keywords: z.array(z.string().max(120)).max(20).optional(),
    serviceArea: ServiceAreaWrite.nullable().optional(), placeId: z.string().max(300).nullable().optional(),
    /** 14a: ticked "New" chips; each becomes an unreviewed business area of the client's vertical and is added to the client's services. */
    newAreas: z.array(z.object({ name: z.string().trim().min(2).max(80) })).max(5).optional(),
  }),
  output: z.object({ state: SetupStateOut, searchRefusal: z.string().nullable() }),
  permission: 'manage',
  channels: ['web'],
  async handler(ctx, { clientId, newAreas, ...input }, deps) {
    await assertClientVisible(ctx, deps, clientId);
    await assertSetupActor(ctx, deps, clientId, 'save_profile'); // staff only: owners edit services/area in Settings (§7)
    const patch = { ...input };
    if (newAreas?.length) {
      // Never free text: each name must be one of this client's stored suggestions.
      const [row] = await deps.service.select({ suggestions: clientSetup.suggestions }).from(clientSetup).where(eq(clientSetup.clientId, clientId));
      const offered = new Set((row?.suggestions.status === 'ready' ? row.suggestions.newAreas ?? [] : []).map((a) => normaliseName(a.name)));
      if (newAreas.some((a) => !offered.has(normaliseName(a.name)))) throw new ToolError('invalid_input', 'Pick new services from the suggestions.', { userFacing: true });
      await refuseClientData(deps, ctx, newAreas.map((a) => a.name));
      // `business_area` is service-only, so the areas are created on the service connection in one short transaction (the catalogue
      // lock is global), BEFORE the tenant-side profile write; the new ids ride in `services`. Creation is idempotent by name, so a
      // failed or repeated save leaves at most an unreviewed area and never a duplicate.
      const ids = await deps.service.transaction(async (tx) => {
        await lockCatalogue(tx); // lock order: catalogue -> vertical rows -> client rows (merges take them in that order)
        await lockClient(tx, clientId);
        await closedSetupRecheck(ctx, clientId)(tx);
        const [c] = await tx.select({ verticalId: client.verticalId, services: client.services }).from(client).where(eq(client.id, clientId));
        if (!c) throw new ToolError('not_found', 'Client not found');
        const made: string[] = [];
        for (const a of newAreas) made.push((await addBusinessAreaCore(tx, { verticalId: c.verticalId, name: a.name, agencyId: ctx.agencyId })).areaId);
        return { made, current: c.services };
      });
      catalogOf(deps).invalidate();
      patch.services = [...new Set([...(input.services ?? ids.current), ...ids.made])];
    }
    // No name/features in the input: this step can't change them.
    const { search } = await applyClientProfileChange(ctx, deps, clientId, patch, { userId: ctx.userId, role: ctx.role }, closedSetupRecheck(ctx, clientId));
    // Spec §4: the write that leaves every step done or skipped sets completed_at (guarded; no-op otherwise).
    await deps.service.transaction(async (tx) => {
      await lockClient(tx, clientId);
      await completeIfDone(tx, clientId, new Date());
    });
    return { state: await getSetupState(deps.service, clientId), searchRefusal: search && 'refused' in search ? searchRefusalMessage(search) : null };
  },
});

const MAX_PICK = 25;

export const pickSetupCompetitors = defineTool({
  name: 'pick_setup_competitors',
  access: 'write',
  description: 'Track the picked competitor suggestions and hide the dismissed ones (client setup wizard).',
  input: z.object({ clientId: uuid, accept: z.array(uuid).max(MAX_PICK), dismiss: z.array(uuid).max(MAX_PICK) }),
  output: z.object({ state: SetupStateOut }),
  permission: 'manage',
  channels: ['web'],
  // D9: the `manage_competitors` feature is bypassed here only, for staff and for an owner asked to pick (guard + locked re-check).
  async handler(ctx, { clientId, accept, dismiss }, deps) {
    await assertClientVisible(ctx, deps, clientId);
    await assertSetupActor(ctx, deps, clientId, 'pick');
    const toDismiss = new Set(dismiss);
    if (accept.some((id) => toDismiss.has(id))) throw new ToolError('invalid_input', 'A competitor can’t be both picked and dismissed');
    const recheck = closedSetupRecheck(ctx, clientId);
    let changed = false;

    if (accept.length > 0) {
      // A re-submit (second tab, double click) must not fail: drop ids this client already accepted.
      const unique = [...new Set(accept)];
      const done = new Set((await withTenant(deps.app, ctx, (tx) => tx.select({ id: competitorSuggestion.id }).from(competitorSuggestion)
        .where(and(inArray(competitorSuggestion.id, unique), eq(competitorSuggestion.clientId, clientId), eq(competitorSuggestion.status, 'accepted'))))).map((r) => r.id));
      const fresh = unique.filter((id) => !done.has(id));
      if (fresh.length > 0) {
        await acceptSuggestions(ctx, deps, clientId, fresh, recheck);
        changed = true;
      }
    }
    if (dismiss.length > 0 && (await dismissSuggestions(ctx, deps, clientId, dismiss, recheck)).length > 0) changed = true;

    if (changed) await deps.service.update(clientSetup).set(changedBy(ctx, new Date())).where(eq(clientSetup.clientId, clientId));
    return { state: await getSetupState(deps.service, clientId) };
  },
});

/** The step already committed: a missing queue or a failed enqueue only means the client keeps the untailored runbook. */
async function enqueueRunbookTailor(deps: ToolDeps, clientId: string): Promise<void> {
  try {
    await enqueueOf(deps)('runbook-tailor', { clientId }, `runbook-tailor:${clientId}`);
  } catch (err) {
    console.warn(`[advance_client_setup] runbook-tailor enqueue for ${clientId} failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * `skip_search` is the legacy 11a skip (competitors read `ready`); `ask_owner` is O12, allowed only from `ready` with at
 * least one open suggestion (final fix I1: never a request the owner cannot answer); `cancel_ask_owner` is the staff way
 * back (clears the request, competitors read `ready` again). Owners may run `confirm_competitors` only (`OWNER_OPS`).
 */
const ACTIONS = ['start_search', 'confirm_competitors', 'skip_search', 'skip_competitors', 'skip_invite', 'skip_billing', 'dismiss', 'ask_owner', 'cancel_ask_owner'] as const;
const INVITE_NEEDED = 'Invite the owner so they can pick the competitors.';
const ALREADY_CHOSEN = 'Competitors are already chosen for this client.';
const ALREADY_ASKED = 'The owner has already been asked to pick.';
const ASK_AFTER_SEARCH = 'You can ask the owner to pick after the search finds businesses to choose from.';
const NOT_ASKED = 'The owner has not been asked to pick.';

export const advanceClientSetup = defineTool({
  name: 'advance_client_setup',
  access: 'write',
  description: 'Move the client setup wizard on: start the competitor search, finish or skip picking competitors, ask the business owner to pick them (or cancel that request), skip the search, or skip the invite or billing step or dismiss the setup.',
  input: z.object({ clientId: uuid, action: z.enum(ACTIONS) }),
  output: z.object({ state: SetupStateOut, searchRefusal: z.string().nullable() }),
  permission: 'manage',
  channels: ['web'],
  async handler(ctx, { clientId, action }, deps) {
    await assertClientVisible(ctx, deps, clientId);
    const state = await assertSetupActor(ctx, deps, clientId, action);
    if (!state.exists) throw new ToolError('not_found', 'Setup not found');
    if (action === 'skip_billing' && !state.steps.billing) throw new ToolError('invalid_input', 'A prospect has no billing step');
    if (action === 'ask_owner') {
      if (state.steps.profile !== 'done') throw new ToolError('invalid_input', 'Add keywords and a location before asking the owner to pick.', { userFacing: true });
      if (state.competitors === 'done' || state.competitors === 'skipped') throw new ToolError('invalid_input', ALREADY_CHOSEN, { userFacing: true });
      if (state.competitors === 'waiting_owner') throw new ToolError('invalid_input', ALREADY_ASKED, { userFacing: true });
      if (state.competitors !== 'ready' || !state.pendingSuggestions) throw new ToolError('invalid_input', ASK_AFTER_SEARCH, { userFacing: true });
    }
    if (action === 'cancel_ask_owner' && state.competitors !== 'waiting_owner') throw new ToolError('invalid_input', NOT_ASKED, { userFacing: true });
    const recheck = closedSetupRecheck(ctx, clientId);
    const now = new Date();

    if (action === 'start_search') {
      // R1: only when nothing ran yet or the last run failed.
      if (state.competitors !== 'todo' && state.competitors !== 'blocked') throw new ToolError('invalid_input', 'A competitor search is already running or has finished for this client');
      await deps.service.transaction(async (tx) => {
        await lockClient(tx, clientId);
        await recheck(tx);
        await tx.update(clientSetup).set(changedBy(ctx, now)).where(eq(clientSetup.clientId, clientId));
      });
      // Automatic-run rules (running, cooldown, pause) — never the manual weekly limit or daily cap. A refusal is
      // reported, not thrown, so the wizard can show it next to Skip.
      const r = await startCompetitorSearch(deps, clientId, 'auto');
      return { state: await getSetupState(deps.service, clientId), searchRefusal: 'refused' in r ? searchRefusalMessage(r) : null };
    }

    let competitorsJustDone = false;
    await deps.service.transaction(async (tx) => {
      await lockClient(tx, clientId);
      const [row] = await tx.select({ skipped: clientSetup.skipped, competitorsDoneAt: clientSetup.competitorsDoneAt, ownerPickRequestedAt: clientSetup.ownerPickRequestedAt, dismissedAt: clientSetup.dismissedAt })
        .from(clientSetup).where(eq(clientSetup.clientId, clientId)).for('update');
      if (!row) throw new ToolError('not_found', 'Setup not found');
      await recheck(tx);
      // Re-checked under the row lock. P12: while the owner is asked to pick they must be invited (the invite sends the review email).
      const competitorsClosed = row.competitorsDoneAt !== null || row.skipped.includes('competitors');
      if (action === 'skip_invite' && row.ownerPickRequestedAt !== null && !competitorsClosed) throw new ToolError('invalid_input', INVITE_NEEDED, { userFacing: true });
      if (action === 'ask_owner' && competitorsClosed) throw new ToolError('invalid_input', ALREADY_CHOSEN, { userFacing: true });
      if (action === 'ask_owner' && row.ownerPickRequestedAt !== null) throw new ToolError('invalid_input', ALREADY_ASKED, { userFacing: true });
      if (action === 'cancel_ask_owner' && (row.ownerPickRequestedAt === null || competitorsClosed)) throw new ToolError('invalid_input', NOT_ASKED, { userFacing: true });
      // Under the row lock: first timestamps win, skipped stays a set.
      const skip = (step: SetupSkippedStep): SetupSkippedStep[] => (row.skipped.includes(step) ? row.skipped : [...row.skipped, step]);
      const competitorsDoneAt = row.competitorsDoneAt ?? now;
      competitorsJustDone = row.competitorsDoneAt === null && (action === 'confirm_competitors' || action === 'skip_competitors');
      const patch =
        action === 'confirm_competitors' ? { competitorsDoneAt }
          : action === 'skip_competitors' ? { competitorsDoneAt, skipped: skip('competitors') }
            : action === 'skip_search' ? { skipped: skip('search') }
              : action === 'skip_invite' ? { skipped: skip('invite') }
                : action === 'skip_billing' ? { skipped: skip('billing') }
                  // O12: no email here (P12); the invite step sends the review email, so an earlier invite skip is
                  // cleared (the invite step is todo again and completion waits for an invitation).
                  : action === 'ask_owner' ? { ownerPickRequestedAt: now, skipped: row.skipped.filter((s) => s !== 'invite') }
                    // I1: staff take the pick back; competitors derive to `ready` again (the run and suggestions are kept).
                    // `waiting_owner` counted as settled, so a completed setup reopens: staff now pick or skip, and the
                    // starting-point clock waits for that instead of starting from activation (setup-clock.ts).
                    : action === 'cancel_ask_owner' ? { ownerPickRequestedAt: null, completedAt: null }
                      : { dismissedAt: row.dismissedAt ?? now };
      await tx.update(clientSetup).set({ ...patch, ...changedBy(ctx, now) }).where(eq(clientSetup.clientId, clientId));
      await completeIfDone(tx, clientId, now);
    });
    // First time the competitors step closes: tailor the client's runbook plays (Phase 14b). After commit; never fails the step.
    if (competitorsJustDone) await enqueueRunbookTailor(deps, clientId);
    return { state: await getSetupState(deps.service, clientId), searchRefusal: null };
  },
});

/**
 * Phase 11b §4: the wizard's "Invite the owner" step. Off the paused-agency allow-list (no new outward client work while
 * paused). P12: once the invitation exists, the competitor-review email is queued for the invited owner (only while
 * competitors are `waiting_owner`; same dedupe as the daily reminder, so it goes out once).
 */
export const inviteClientOwner = defineTool({
  name: 'invite_client_owner',
  access: 'write',
  description: 'Invite the business owner to this client (client setup wizard): creates their invitation and contact and emails them a sign-in link, copying you.',
  input: z.object({ clientId: uuid, name: z.string().trim().min(1).max(120), email: z.email().max(320) }),
  output: z.object({ invitationId: uuid, expiresAt: z.string(), contactId: uuid }),
  permission: 'agency',
  channels: ['web'],
  async handler(ctx, { clientId, name, email }, deps) {
    await refuseSampleContacts(deps, ctx.agencyId);
    const now = new Date();
    const r = await inviteClientUser(ctx, deps, { clientId, email, name, role: 'client_owner', replaceInvitedOwner: true }, now);
    // After commit; the invitation stands even if this fails (the daily reminder retries with the same dedupe).
    if (deps.delivery) {
      try {
        await queueCompetitorReview(deps.service, deps.delivery, { agencyId: ctx.agencyId, clientId, dedupe: `competitor-review:${clientId}`, now });
      } catch (err) {
        console.warn(`[invite_client_owner] competitor review for ${clientId} failed: ${err instanceof Error ? err.name : 'unknown'}`);
      }
    }
    return { invitationId: r.invitationId, expiresAt: r.expiresAt.toISOString(), contactId: r.contactId };
  },
});

/** Phase 11b Task 20: staff re-send of the competitor-review email (Pick step). Off the paused-agency allow-list. Once per UTC day; ignores the competitors step. */
export const sendCompetitorReview = defineTool({
  name: 'send_competitor_review',
  access: 'write',
  description: 'Email the invited business owner the competitors to review (client setup wizard), copying whoever invited them. Sends at most once a day.',
  input: z.object({ clientId: uuid }),
  output: z.object({ queued: z.boolean() }),
  permission: 'agency',
  channels: ['web'],
  async handler(ctx, { clientId }, deps) {
    if (!deps.delivery) throw new ToolError('invalid_input', 'Sending is not configured on this server (APP_URL and LINK_SIGNING_SECRET)');
    await assertClientVisible(ctx, deps, clientId);
    const now = new Date();
    const queued = await queueCompetitorReview(deps.service, deps.delivery, {
      agencyId: ctx.agencyId, clientId, dedupe: `competitor-review:${clientId}:${now.toISOString().slice(0, 10)}`, now, manual: true,
    });
    return { queued };
  },
});

export const setupTools = [findBusiness, getClientSetup, saveSetupProfile, pickSetupCompetitors, advanceClientSetup, inviteClientOwner, sendCompetitorReview];
