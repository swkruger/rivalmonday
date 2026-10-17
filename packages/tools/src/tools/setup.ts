import { MAPS_SEARCH_OPERATION } from '@cs/collectors';
import { type AccessContext, canAccessClient, isAgencyRole, toolkit, ToolError } from '@cs/core';
import { client, clientCompetitor, clientSetup, competitorSuggestion, setupLookupSchema, type SetupSkippedStep, type SetupSuggestions, setupSuggestionsSchema, type Tx, vendorCall, withTenant } from '@cs/db';
import { listVerticalPacks } from '@cs/verticals';
import { and, count, eq, gte, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { packsOf, type ToolDeps } from '../deps';
import { startCompetitorSearch } from '../rival-search';
import { FIND_BUSINESS_DAILY_CAP, preselectVertical, toSetupLookup } from '../setup/lookup';
import { applyClientProfileChange } from '../setup/profile-change';
import { completeIfDone, getSetupState, type SetupState } from '../setup/state';
import { acceptSuggestions, dismissSuggestions, preTickTop, runSuggestionRows, searchRefusalMessage } from './competitors';
import { ServiceAreaInput, Tier } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();

const FoundPlace = setupLookupSchema.extend({ suggestedVerticalId: z.string().nullable() });

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

    const found = await deps.setupLookup({ keyword: `${input.name} ${input.location}`, locationName: 'United States' }, { agencyId: ctx.agencyId, clientId: null });
    const usable = found.filter((p) => !p.closed).flatMap((p) => {
      const lookup = toSetupLookup(p);
      return lookup ? [{ lookup, categories: [p.category, ...(p.additionalCategories ?? [])].filter((c): c is string => !!c) }] : [];
    }).slice(0, 5);
    const packs = usable.length ? await Promise.all((await listVerticalPacks()).map((id) => packsOf(deps)(id))) : [];
    return { places: usable.map(({ lookup, categories }) => ({ ...lookup, suggestedVerticalId: preselectVertical(packs, categories) })) };
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Phase 11a §8: the wizard tools. Agency staff (with access to the client) and the client's own `client_owner`; a
// client owner only while the setup is open. Every write re-checks "still open" inside its write transaction, after
// the shared `client` row lock, so a concurrent completion/dismissal wins (Review focus 1–2).

/**
 * Shared guard (security-sensitive). Clients without a setup row read as closed, so client owners are refused there.
 * Callers prove tenant visibility first (`assertClientVisible`): this reads on the service connection.
 */
async function assertSetupActor(ctx: AccessContext, deps: ToolDeps, clientId: string, opts: { agencyOnly?: boolean } = {}): Promise<SetupState> {
  if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
  const isAgency = isAgencyRole(ctx.role);
  if (opts.agencyOnly && !isAgency) throw new ToolError('permission_denied', 'Only agency staff can do this');
  const state = await getSetupState(deps.service, clientId); // service read; client already scoped above
  if (!isAgency) {
    if (ctx.role !== 'client_owner') throw new ToolError('permission_denied', 'Not allowed');
    if (!state.open) throw new ToolError('permission_denied', 'Setup is finished');
  }
  return state;
}

/** RLS proof that the caller's tenant sees the client (another agency's staff pass `canAccessClient` with scope 'all'). */
async function assertClientVisible(ctx: AccessContext, deps: ToolDeps, clientId: string): Promise<void> {
  if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
  const [c] = await withTenant(deps.app, ctx, (tx) => tx.select({ id: client.id }).from(client).where(eq(client.id, clientId)));
  if (!c) throw new ToolError('not_found', 'Client not found');
}

/**
 * The in-transaction re-guard: run it right after the `client` row lock (tenant or service tx). Agency staff pass; a
 * client owner is refused once `completed_at`/`dismissed_at` is set (or the row is gone).
 */
export function closedSetupRecheck(ctx: AccessContext, clientId: string): (tx: Tx) => Promise<void> {
  return async (tx) => {
    if (isAgencyRole(ctx.role)) return;
    const [row] = await tx.select({ completedAt: clientSetup.completedAt, dismissedAt: clientSetup.dismissedAt }).from(clientSetup).where(eq(clientSetup.clientId, clientId));
    if (!row || row.completedAt || row.dismissedAt) throw new ToolError('permission_denied', 'Setup is finished');
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

const StepStatusOut = z.enum(['todo', 'running', 'done', 'skipped', 'blocked']);
const SetupStateOut = z.object({
  open: z.boolean(),
  exists: z.boolean(),
  steps: z.object({ profile: StepStatusOut, search: StepStatusOut, competitors: StepStatusOut }),
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
    vertical: z.object({ services: z.array(z.object({ id: z.string(), name: z.string() })), seedKeywords: z.array(z.string()) }),
  }),
  permission: 'read',
  channels: ['web'],
  // Polled by the wizard while suggestions or the search are pending.
  audit: 'skip-web',
  async handler(ctx, { clientId }, deps) {
    if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
    // Spec §7: agency staff and the client's owner only.
    if (!isAgencyRole(ctx.role) && ctx.role !== 'client_owner') throw new ToolError('not_found', 'Client not found');
    const r = await withTenant(deps.app, ctx, async (tx) => {
      const [c] = await tx.select({ verticalId: client.verticalId, limit: client.competitorLimit }).from(client).where(eq(client.id, clientId));
      if (!c) return null;
      const [row] = await tx.select({ lookup: clientSetup.lookup, suggestions: clientSetup.suggestions, createdAt: clientSetup.createdAt }).from(clientSetup).where(eq(clientSetup.clientId, clientId));
      const state = await getSetupState(tx, clientId);
      const [tracked] = await tx.select({ n: count() }).from(clientCompetitor).where(eq(clientCompetitor.clientId, clientId));
      const { rows } = await runSuggestionRows(tx, clientId, ['suggested', 'accepted']);
      return { c, row: row ?? null, state, tracked: tracked?.n ?? 0, rows };
    });
    if (!r) throw new ToolError('not_found', 'Client not found');
    if (!isAgencyRole(ctx.role) && !r.state.open) throw new ToolError('not_found', 'Client not found');

    const pack = await packsOf(deps)(r.c.verticalId);
    const ticked = preTickTop(r.rows.filter((s) => s.status === 'suggested'), r.c.limit, r.tracked);
    const parsed = setupSuggestionsSchema.safeParse(r.row?.suggestions);
    const suggestions: SetupSuggestions = r.row && parsed.success ? reportedSuggestions(parsed.data, r.row.createdAt) : { status: 'none' };
    const lookup = r.row?.lookup ? setupLookupSchema.safeParse(r.row.lookup) : null;
    return {
      state: r.state,
      lookup: lookup?.success ? lookup.data : null,
      suggestions,
      competitorSuggestions: r.rows.map((s) => ({
        id: s.id, name: s.name, tier: s.tier ?? 'minor', rating: s.rating, votes: s.votes, distanceKm: s.distanceKm,
        status: s.status as ClientSafeSuggestion['status'], preTicked: ticked.has(s.id),
      })),
      vertical: { services: pack.services.map((s) => ({ id: s.id, name: s.name })), seedKeywords: [...pack.discovery.seed_keywords] },
    };
  },
});

export const saveSetupProfile = defineTool({
  name: 'save_setup_profile',
  access: 'write',
  description: 'Save the "Your business" step of the client setup wizard: services, keywords, service area and Google place id.',
  input: z.object({
    clientId: uuid, services: z.array(z.string().max(80)).max(255).optional(), keywords: z.array(z.string().max(120)).max(20).optional(),
    serviceArea: ServiceAreaInput.nullable().optional(), placeId: z.string().max(300).nullable().optional(),
  }),
  output: z.object({ state: SetupStateOut, searchRefusal: z.string().nullable() }),
  permission: 'manage',
  channels: ['web'],
  async handler(ctx, { clientId, ...patch }, deps) {
    await assertClientVisible(ctx, deps, clientId);
    await assertSetupActor(ctx, deps, clientId);
    // No name/features in the input: client owners can't change them here.
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
  // D9: the `manage_competitors` feature is bypassed here only, while the setup is open (guard + locked re-check).
  async handler(ctx, { clientId, accept, dismiss }, deps) {
    await assertClientVisible(ctx, deps, clientId);
    await assertSetupActor(ctx, deps, clientId);
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

const ACTIONS = ['start_search', 'confirm_competitors', 'skip_search', 'skip_competitors', 'dismiss'] as const;

export const advanceClientSetup = defineTool({
  name: 'advance_client_setup',
  access: 'write',
  description: 'Move the client setup wizard on: start the competitor search, finish or skip picking competitors, skip the search, or (agency staff) dismiss the setup.',
  input: z.object({ clientId: uuid, action: z.enum(ACTIONS) }),
  output: z.object({ state: SetupStateOut, searchRefusal: z.string().nullable() }),
  permission: 'manage',
  channels: ['web'],
  async handler(ctx, { clientId, action }, deps) {
    await assertClientVisible(ctx, deps, clientId);
    const state = await assertSetupActor(ctx, deps, clientId, { agencyOnly: action === 'dismiss' });
    if (!state.exists) throw new ToolError('not_found', 'Setup not found');
    const recheck = closedSetupRecheck(ctx, clientId);
    const now = new Date();

    if (action === 'start_search') {
      // R1: only when nothing ran yet or the last run failed.
      if (state.steps.search !== 'todo' && state.steps.search !== 'blocked') throw new ToolError('invalid_input', 'A competitor search is already running or has finished for this client');
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

    await deps.service.transaction(async (tx) => {
      await lockClient(tx, clientId);
      const [row] = await tx.select({ skipped: clientSetup.skipped, competitorsDoneAt: clientSetup.competitorsDoneAt, dismissedAt: clientSetup.dismissedAt })
        .from(clientSetup).where(eq(clientSetup.clientId, clientId)).for('update');
      if (!row) throw new ToolError('not_found', 'Setup not found');
      await recheck(tx);
      // Under the row lock: first timestamps win, skipped stays a set.
      const skip = (step: SetupSkippedStep): SetupSkippedStep[] => (row.skipped.includes(step) ? row.skipped : [...row.skipped, step]);
      const competitorsDoneAt = row.competitorsDoneAt ?? now;
      const patch =
        action === 'confirm_competitors' ? { competitorsDoneAt }
          : action === 'skip_competitors' ? { competitorsDoneAt, skipped: skip('competitors') }
            : action === 'skip_search' ? { skipped: skip('search') }
              : { dismissedAt: row.dismissedAt ?? now };
      await tx.update(clientSetup).set({ ...patch, ...changedBy(ctx, now) }).where(eq(clientSetup.clientId, clientId));
      await completeIfDone(tx, clientId, now);
    });
    return { state: await getSetupState(deps.service, clientId), searchRefusal: null };
  },
});

export const setupTools = [findBusiness, getClientSetup, saveSetupProfile, pickSetupCompetitors, advanceClientSetup];
