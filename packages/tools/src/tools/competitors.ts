import { type AccessContext, appLinkFor, canAccessClient, SPEND_PAUSED_COPY, toolkit, ToolError } from '@cs/core';
import { ensureCompetitorSources, findExistingCompetitor, patchReusedCompetitor } from '@cs/collectors';
import { ad, client, clientCompetitor, competitor, competitorSignal, competitorSuggestion, discoveryRun, type DiscoveryRunRow, trackedPage, type Tx, withTenant } from '@cs/db';
import { and, asc, count, desc, eq, gt, inArray, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { enqueueOf, type ToolDeps } from '../deps';
import { latestDoneRun, nextManualSearchAt, type SearchRefusal, type SearchStart, startCompetitorSearch, weeklyLimitMessage } from '../rival-search';
import { detailOf, pageOf, pageResult } from '../paging';
import { AdMatch, CompetitorSignalView, HiddenReason, pageFields, pagedItems, Signals, SuggestionView, Tier, TrackedCompetitor } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();

export type Discovery = 'queued' | 'disabled' | 'not_needed';

/** Decision 7: page discovery crawls the competitor's site, so it only runs with website monitoring switched on. */
export async function startDiscovery(deps: ToolDeps, competitorId: string): Promise<Discovery> {
  if (!deps.webMonitoring) return 'disabled';
  const [c] = await deps.service.select({ domain: competitor.domain }).from(competitor).where(eq(competitor.id, competitorId));
  if (!c?.domain) return 'not_needed';
  const [pages] = await deps.service.select({ n: count() }).from(trackedPage).where(eq(trackedPage.competitorId, competitorId));
  if ((pages?.n ?? 0) > 0) return 'not_needed';
  await enqueueOf(deps)('discover-pages', { competitorId }, `discover:${competitorId}`);
  return 'queued';
}

/**
 * Decision 6 (5b-2) + 12a atomic limit, step 1: lock the client row and read its `competitor_limit`. Call first inside
 * the service transaction that then reads the tracked set and inserts the links. The row stays locked until commit, so
 * a concurrent accept waits here and then sees this transaction's links (READ COMMITTED: each later statement gets a
 * fresh snapshot).
 */
export async function lockClientLimit(tx: Tx, clientId: string): Promise<number> {
  const [c] = (await tx.execute(sql`SELECT competitor_limit FROM client WHERE id = ${clientId} FOR UPDATE;`)) as unknown as { competitor_limit: number }[];
  if (!c) throw new ToolError('not_found', 'Client not found');
  return c.competitor_limit;
}

/** Step 2, after `lockClientLimit` in the same transaction: refuse when the current links plus `newLinks` exceed the limit. */
export async function assertRoomForCompetitors(tx: Tx, clientId: string, limit: number, newLinks: number): Promise<void> {
  const [row] = (await tx.execute(sql`SELECT count(*) FROM client_competitor WHERE client_id = ${clientId};`)) as unknown as { count: string | number }[];
  if (Number(row?.count ?? 0) + newLinks > limit) throw new ToolError('invalid_input', `This client can track at most ${limit} competitor${limit === 1 ? '' : 's'} — remove one first or raise its limit`);
}

const SIGNAL_KEYS = Object.keys(Signals.shape) as (keyof Signals)[];
const NULL_SIGNALS = Object.fromEntries(SIGNAL_KEYS.map((k) => [k, null])) as Signals;

/** Stored signals jsonb → `Signals`; missing or malformed keys stay `null` (not checked), never 0 (D8). */
export function toSignals(raw: unknown): Signals {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {};
  for (const k of SIGNAL_KEYS) {
    const v = Signals.shape[k].safeParse(obj[k] ?? null);
    out[k] = v.success ? v.data : null;
  }
  return out as Signals;
}

const HIDDEN_REASONS = HiddenReason.options;
const hiddenCounts = (raw: Record<string, number> | null | undefined): Record<HiddenReason, number> =>
  Object.fromEntries(HIDDEN_REASONS.map((r) => [r, typeof raw?.[r] === 'number' ? raw[r] : 0])) as Record<HiddenReason, number>;

const TIER_ORDER = sql`CASE ${competitorSuggestion.tier} WHEN 'top' THEN 0 WHEN 'watch' THEN 1 WHEN 'minor' THEN 2 ELSE 3 END`;

type SuggestionRow = typeof competitorSuggestion.$inferSelect;
type SuggestionStatus = 'suggested' | 'accepted' | 'dismissed';

/**
 * The suggestion set a client sees: the latest done run's suggestions plus those of any run started after it (live, or
 * failed after writing them: its upsert moved run_id on, Ruling 11). Older runs' leftovers (and pre-12a rows, run_id
 * NULL) stay hidden. Ordered Top rival → Worth watching → Minor, strongest overlap first; at most 100 rows.
 * Shared by `list_competitor_suggestions` and the setup wizard (`get_client_setup`).
 */
export async function runSuggestionRows(tx: Pick<Tx, 'select'>, clientId: string, statuses: readonly SuggestionStatus[]): Promise<{ run: DiscoveryRunRow | null; rows: SuggestionRow[] }> {
  const run = await latestDoneRun(tx, clientId);
  if (!run) return { run: null, rows: [] };
  const newer = (await tx.select({ id: discoveryRun.id }).from(discoveryRun).where(and(eq(discoveryRun.clientId, clientId), gt(discoveryRun.startedAt, run.startedAt)))).map((x) => x.id);
  const rows = await tx.select().from(competitorSuggestion)
    .where(and(eq(competitorSuggestion.clientId, clientId), inArray(competitorSuggestion.runId, [run.id, ...newer]), inArray(competitorSuggestion.status, [...statuses])))
    .orderBy(TIER_ORDER, sql`${competitorSuggestion.overlap} DESC NULLS LAST`, desc(competitorSuggestion.overlapScore), desc(competitorSuggestion.appearances), asc(competitorSuggestion.id))
    .limit(100);
  return { run, rows };
}

/**
 * D5: Top rivals are pre-ticked, strongest overlap first (`rows` already in display order), only up to the room left
 * under the competitor limit — ticking every top rival could exceed it, and the all-or-nothing accept would refuse all.
 */
export function preTickTop<T extends { id: string; tier: string | null }>(rows: readonly T[], limit: number, tracked: number): Set<string> {
  let room = Math.max(0, limit - tracked);
  const ticked = new Set<string>();
  for (const s of rows) {
    if (room <= 0) break;
    if (s.tier !== 'top') continue;
    ticked.add(s.id);
    room--;
  }
  return ticked;
}

export const listCompetitorSuggestions = defineTool({
  name: 'list_competitor_suggestions',
  access: 'read',
  description: 'List the latest competitor search’s open suggestions for a client: Top rival → Worth watching → Minor, strongest overlap first, plus what the search hid and why.',
  input: z.object({ clientId: uuid }),
  output: z.object({
    suggestions: z.array(SuggestionView),
    hidden: z.record(HiddenReason, z.number().int()),
    hiddenList: z.array(z.object({ name: z.string(), reason: HiddenReason })),
  }),
  permission: 'agency',
  async handler(ctx, { clientId }, deps) {
    if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
    const r = await withTenant(deps.app, ctx, async (tx) => {
      const [c] = await tx.select({ limit: client.competitorLimit }).from(client).where(eq(client.id, clientId));
      if (!c) return null;
      const [tracked] = await tx.select({ n: count() }).from(clientCompetitor).where(eq(clientCompetitor.clientId, clientId));
      const { run, rows } = await runSuggestionRows(tx, clientId, ['suggested']);
      return { limit: c.limit, tracked: tracked?.n ?? 0, run, rows };
    });
    if (!r) throw new ToolError('not_found', 'Client not found');
    const ticked = preTickTop(r.rows, r.limit, r.tracked);
    const suggestions = r.rows.map((s) => {
      const preselected = ticked.has(s.id);
      return {
        id: s.id, name: s.name, domain: s.domain, placeId: s.placeId, rating: s.rating, votes: s.votes, appearances: s.appearances, bestRank: s.bestRank, overlapScore: s.overlapScore,
        tier: s.tier, category: s.category, distanceKm: s.distanceKm, signals: toSignals(s.signals),
        adMatches: s.adMatches.filter((m) => AdMatch.safeParse(m).success), preselected,
      };
    });
    const hiddenList = (r.run?.progress.hiddenList ?? [])
      .filter((h): h is { name: string; reason: HiddenReason } => (HIDDEN_REASONS as readonly string[]).includes(h.reason))
      .slice(0, 50)
      .map((h) => ({ name: h.name, reason: h.reason }));
    return { suggestions, hidden: hiddenCounts(r.run?.hidden), hiddenList };
  },
});

/** Refusal copy for the manual search (daily cap copy decided in the 12a plan; weekly copy is `weeklyLimitMessage`). */
export const REFUSAL: Record<Exclude<SearchRefusal, 'weekly_limit'>, string> = {
  missing_profile: 'Add keywords and a service area (a location) to the client profile first',
  running: 'A competitor search is already running for this client',
  cooldown: 'A search just finished — its suggestions are below. You can search again in a few minutes.',
  daily_cap: 'Daily search limit reached. Try again tomorrow.',
  service_paused: 'This client is paused. Resume it to search for competitors.',
  spend_paused: SPEND_PAUSED_COPY,
  enqueue_failed: 'The search could not be started. Try again in a few minutes.',
};

/** The plain-words copy of a refused search start. */
export function searchRefusalMessage(r: Extract<SearchStart, { refused: string }>): string {
  return r.refused === 'weekly_limit' ? weeklyLimitMessage(r.nextLabel) : REFUSAL[r.refused];
}

export const requestCompetitorSuggestions = defineTool({
  name: 'request_competitor_suggestions',
  access: 'write',
  description: 'Search Google Maps around the client’s service area for likely competitors and rate them (paid; runs in the background).',
  input: z.object({ clientId: uuid }),
  output: z.object({ queued: z.literal(true), runId: uuid }),
  permission: 'agency',
  async handler(ctx, { clientId }, deps) {
    if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
    const [c] = await withTenant(deps.app, ctx, (tx) => tx.select({ id: client.id }).from(client).where(eq(client.id, clientId)));
    if (!c) throw new ToolError('not_found', 'Client not found');
    const r = await startCompetitorSearch(deps, clientId, 'manual');
    if ('refused' in r) throw new ToolError('invalid_input', searchRefusalMessage(r));
    return { queued: true as const, runId: r.runId };
  },
});

export const RUN_STATUSES = ['queued', 'searching', 'checking', 'finalising', 'done', 'failed'] as const;
const count0 = (n: number | undefined) => (typeof n === 'number' ? n : 0);
export const SearchProgress = z.object({ searchesDone: z.number().int(), searchesTotal: z.number().int(), checksDone: z.number().int(), checksTotal: z.number().int() });

/** A run's progress counters (missing ones read 0). Shared with the setup wizard's `get_client_setup.search`. */
export function searchProgress(p: DiscoveryRunRow['progress']): z.infer<typeof SearchProgress> {
  return { searchesDone: count0(p.searchesDone), searchesTotal: count0(p.searchesTotal), checksDone: count0(p.checksDone), checksTotal: count0(p.checksTotal) };
}

export const getCompetitorSearchStatus = defineTool({
  name: 'get_competitor_search_status',
  access: 'read',
  description: 'The client’s latest competitor search: its stage, progress, what it kept and hid — the web page polls it after "Find competitors".',
  input: z.object({ clientId: uuid }),
  output: z.union([
    z.object({ status: z.literal('none'), nextManualSearchAt: z.string().nullable() }),
    z.object({
      status: z.enum(RUN_STATUSES),
      /** When the next manual "Find competitors" is allowed (one per client-local week); null when allowed now. */
      nextManualSearchAt: z.string().nullable(),
      progress: SearchProgress,
      kept: z.number().int().nullable(),
      hidden: z.record(HiddenReason, z.number().int()),
      finishedAt: z.string().nullable(),
    }),
  ]),
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx, { clientId }, deps) {
    if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
    const r = await withTenant(deps.app, ctx, async (tx) => {
      const [c] = await tx.select({ timezone: client.timezone }).from(client).where(eq(client.id, clientId));
      if (!c) return null;
      const [run] = await tx.select().from(discoveryRun).where(eq(discoveryRun.clientId, clientId)).orderBy(desc(discoveryRun.startedAt)).limit(1);
      return { run, next: await nextManualSearchAt(tx, clientId, c.timezone) };
    });
    if (!r) throw new ToolError('not_found', 'Client not found');
    const { run, next } = r;
    if (!run) return { status: 'none' as const, nextManualSearchAt: next };
    return {
      status: run.status,
      nextManualSearchAt: next,
      progress: searchProgress(run.progress),
      kept: run.kept, hidden: hiddenCounts(run.hidden), finishedAt: run.finishedAt?.toISOString() ?? null,
    };
  },
});

export const getCompetitorSignals = defineTool({
  name: 'get_competitor_signals',
  access: 'read',
  description: 'Rating of each competitor a client tracks: tier (top rival / worth watching / minor) and the public signals behind it (reviews, ads, local presence). Null signals were not checked.',
  input: z.object({ clientId: uuid }),
  output: z.object({ competitors: z.array(CompetitorSignalView) }),
  permission: 'read',
  channels: ['web', 'mcp', 'ask'],
  async handler(ctx, { clientId }, deps) {
    if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
    const r = await withTenant(deps.app, ctx, async (tx) => {
      const [c] = await tx.select({ id: client.id }).from(client).where(eq(client.id, clientId));
      if (!c) return null;
      // Currently tracked competitors only; never suggestion or ad-match data (client roles read this).
      return tx
        .select({ competitorId: competitorSignal.competitorId, tier: competitorSignal.tier, signals: competitorSignal.signals, computedAt: competitorSignal.computedAt })
        .from(competitorSignal)
        .innerJoin(clientCompetitor, and(eq(clientCompetitor.clientId, competitorSignal.clientId), eq(clientCompetitor.competitorId, competitorSignal.competitorId)))
        .where(eq(competitorSignal.clientId, clientId))
        .orderBy(asc(competitorSignal.competitorId));
    });
    if (!r) throw new ToolError('not_found', 'Client not found');
    return { competitors: r.map((x) => ({ competitorId: x.competitorId, tier: Tier.parse(x.tier), signals: toSignals(x.signals), computedAt: x.computedAt.toISOString() })) };
  },
});

type AdMatchRow = z.infer<typeof AdMatch>;

/** Locks the shared competitor row and returns its ad-account arrays. */
async function lockedAccounts(tx: Tx, competitorId: string): Promise<{ google: string[]; meta: string[] }> {
  const [row] = await tx.select({ google: competitor.googleAdvertiserIds, meta: competitor.metaPageIds }).from(competitor).where(eq(competitor.id, competitorId)).for('update');
  if (!row) throw new ToolError('not_found', 'Competitor not found');
  return { google: [...row.google], meta: [...row.meta] };
}

async function writeAccounts(tx: Tx, competitorId: string, before: { google: string[]; meta: string[] }, after: { google: string[]; meta: string[] }): Promise<void> {
  const patch: { googleAdvertiserIds?: string[]; metaPageIds?: string[] } = {};
  if (after.google.join('\n') !== before.google.join('\n')) patch.googleAdvertiserIds = after.google;
  if (after.meta.join('\n') !== before.meta.join('\n')) patch.metaPageIds = after.meta;
  if (Object.keys(patch).length > 0) await tx.update(competitor).set(patch).where(eq(competitor.id, competitorId));
}

export type Accepted = { suggestionId: string; competitorId: string; discovery: Discovery };
/** A caller's re-guard, run inside the write transaction right after the client row lock (Phase 11a wizard). */
export type LockedRecheck = (tx: Tx) => Promise<void>;

/**
 * Accepts suggestions of one client in ONE service transaction with the atomic limit check (12a; single and bulk
 * accept share it). Visibility is proved through RLS as the caller first. `strong` ad matches attach to the shared
 * competitor (append, no duplicates); `weak` ones wait in `client_competitor.pending_ad_matches` (D6). Permission and
 * feature checks are the caller's; `recheck` runs right after the client lock.
 */
export async function acceptSuggestions(ctx: AccessContext, deps: ToolDeps, clientId: string, ids: string[], recheck?: LockedRecheck): Promise<Accepted[]> {
  if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Suggestion not found');
  const unique = [...new Set(ids)];
  const rows = await withTenant(deps.app, ctx, (tx) => tx.select().from(competitorSuggestion).where(inArray(competitorSuggestion.id, unique)));
  if (rows.length !== unique.length || rows.some((s) => s.clientId !== clientId)) throw new ToolError('not_found', 'Suggestion not found');

  const linked = await deps.service.transaction(async (tx) => {
    // Lock first, then read the tracked set and count, so nothing read below can be stale.
    const limit = await lockClientLimit(tx, clientId);
    if (recheck) await recheck(tx);
    // Only open suggestions (re-read under the lock: a concurrent accept or dismiss may have changed them).
    const open = await tx.select({ id: competitorSuggestion.id }).from(competitorSuggestion).where(and(inArray(competitorSuggestion.id, unique), eq(competitorSuggestion.status, 'suggested')));
    if (open.length !== unique.length) throw new ToolError('not_found', 'Suggestion not found');
    const existing = await Promise.all(rows.map((s) => findExistingCompetitor(tx, s)));
    const current = new Set((await tx.select({ id: clientCompetitor.competitorId }).from(clientCompetitor).where(eq(clientCompetitor.clientId, clientId))).map((r) => r.id));
    const fresh = new Set<string>();
    existing.forEach((e, i) => { if (!e) fresh.add(`new:${rows[i]!.id}`); else if (!current.has(e.id)) fresh.add(e.id); });
    await assertRoomForCompetitors(tx, clientId, limit, fresh.size);

    const out: { suggestionId: string; competitorId: string }[] = [];
    for (const [i, s] of rows.entries()) {
      let competitorId: string;
      const found = existing[i] ?? (await findExistingCompetitor(tx, s));
      if (found) {
        competitorId = found.id;
        await patchReusedCompetitor(tx, found, s);
      } else {
        // Never insert a second row with a domain another competitor already holds (same guard as patchReusedCompetitor).
        let domain = s.domain;
        if (domain && (await tx.select({ id: competitor.id }).from(competitor).where(eq(competitor.domain, domain)).limit(1))[0]) domain = null;
        const inserted = await tx.insert(competitor).values({ name: s.name, domain, placeId: s.placeId, cid: s.cid }).onConflictDoNothing().returning({ id: competitor.id });
        const id = inserted[0]?.id ?? (await findExistingCompetitor(tx, { placeId: s.placeId, cid: s.cid, domain: null }))?.id;
        if (!id) throw new ToolError('internal', 'That competitor could not be added — try again');
        competitorId = id;
      }
      const matches = s.adMatches.filter((m): m is AdMatchRow => AdMatch.safeParse(m).success);
      const before = await lockedAccounts(tx, competitorId);
      const after = { google: [...before.google], meta: [...before.meta] };
      for (const m of matches) if (m.strength === 'strong' && !after[m.platform].includes(m.accountId)) after[m.platform].push(m.accountId);
      await writeAccounts(tx, competitorId, before, after);
      const pending = matches.filter((m) => m.strength === 'weak' && !after[m.platform].includes(m.accountId));
      const link = await tx.insert(clientCompetitor).values({ agencyId: s.agencyId, clientId, competitorId, pendingAdMatches: pending }).onConflictDoNothing().returning({ id: clientCompetitor.competitorId });
      // M2: a newly tracked competitor is rated at once from its suggestion (until the weekly signals job takes over),
      // so it never shows "Not rated yet". An existing rating (already tracked) is never overwritten; no tier, no row.
      if (link.length > 0 && s.tier) {
        await tx.insert(competitorSignal).values({ agencyId: s.agencyId, clientId, competitorId, tier: s.tier, overlap: s.overlap, activity: s.activity, signals: s.signals }).onConflictDoNothing();
      }
      await tx.update(competitorSuggestion).set({ status: 'accepted' }).where(eq(competitorSuggestion.id, s.id));
      out.push({ suggestionId: s.id, competitorId });
    }
    return out;
  });

  const accepted: Accepted[] = [];
  for (const l of linked) {
    await ensureCompetitorSources(deps.service, l.competitorId);
    accepted.push({ ...l, discovery: await startDiscovery(deps, l.competitorId) });
  }
  return accepted;
}

export const acceptCompetitorSuggestion = defineTool({
  name: 'accept_competitor_suggestion',
  access: 'write',
  description: 'Start tracking a suggested competitor for its client.',
  input: z.object({ suggestionId: uuid }),
  output: z.object({ competitorId: uuid, discovery: z.enum(['queued', 'disabled', 'not_needed']) }),
  permission: 'manage',
  feature: 'manage_competitors',
  async handler(ctx, { suggestionId }, deps) {
    const [s] = await withTenant(deps.app, ctx, (tx) => tx.select({ clientId: competitorSuggestion.clientId }).from(competitorSuggestion).where(eq(competitorSuggestion.id, suggestionId)));
    if (!s) throw new ToolError('not_found', 'Suggestion not found');
    const [a] = await acceptSuggestions(ctx, deps, s.clientId, [suggestionId]);
    return { competitorId: a!.competitorId, discovery: a!.discovery };
  },
});

export const acceptCompetitorSuggestions = defineTool({
  name: 'accept_competitor_suggestions',
  access: 'write',
  description: 'Start tracking several suggested competitors of one client at once ("Track selected"); all or none, within the client’s competitor limit.',
  input: z.object({ clientId: uuid, ids: z.array(uuid).min(1).max(10) }),
  output: z.object({ items: z.array(z.object({ suggestionId: uuid, competitorId: uuid, discovery: z.enum(['queued', 'disabled', 'not_needed']) })) }),
  permission: 'manage',
  feature: 'manage_competitors',
  async handler(ctx, { clientId, ids }, deps) {
    return { items: await acceptSuggestions(ctx, deps, clientId, ids) };
  },
});

const AdMatchInput = z.object({ clientId: uuid, competitorId: uuid, platform: z.enum(['google', 'meta']), accountId: z.string().min(1).max(200) });

/** The competitor must be tracked by this (RLS-visible) client before a shared competitor row is touched. */
async function assertTracked(ctx: AccessContext, deps: ToolDeps, clientId: string, competitorId: string): Promise<void> {
  if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Competitor not found');
  const [link] = await withTenant(deps.app, ctx, (tx) =>
    tx.select({ id: clientCompetitor.competitorId }).from(clientCompetitor).where(and(eq(clientCompetitor.clientId, clientId), eq(clientCompetitor.competitorId, competitorId))));
  if (!link) throw new ToolError('not_found', 'Competitor not found');
}

async function lockedPending(tx: Tx, clientId: string, competitorId: string): Promise<AdMatchRow[]> {
  const [row] = await tx.select({ pending: clientCompetitor.pendingAdMatches }).from(clientCompetitor)
    .where(and(eq(clientCompetitor.clientId, clientId), eq(clientCompetitor.competitorId, competitorId))).for('update');
  if (!row) throw new ToolError('not_found', 'Competitor not found');
  return row.pending;
}

const setPending = (tx: Tx, clientId: string, competitorId: string, pending: AdMatchRow[]) =>
  tx.update(clientCompetitor).set({ pendingAdMatches: pending }).where(and(eq(clientCompetitor.clientId, clientId), eq(clientCompetitor.competitorId, competitorId)));

export const confirmAdMatch = defineTool({
  name: 'confirm_ad_match',
  access: 'write',
  description: 'Confirm a possible Google Ads or Meta account match for a tracked competitor, so its ads are collected.',
  input: AdMatchInput,
  output: z.object({ confirmed: z.literal(true) }),
  // Ruling 7: competitor rows are global, so ad-account writes are agency-only.
  permission: 'agency',
  feature: 'manage_competitors',
  async handler(ctx, { clientId, competitorId, platform, accountId }, deps) {
    await assertTracked(ctx, deps, clientId, competitorId);
    // app_user has no UPDATE on client_competitor / competitor: the service role writes, after the RLS check above.
    await deps.service.transaction(async (tx) => {
      const pending = await lockedPending(tx, clientId, competitorId);
      const rest = pending.filter((m) => !(m.platform === platform && m.accountId === accountId));
      if (rest.length === pending.length) throw new ToolError('not_found', 'That ad account match was not found');
      await setPending(tx, clientId, competitorId, rest);
      const before = await lockedAccounts(tx, competitorId);
      const after = { ...before, [platform]: before[platform].includes(accountId) ? before[platform] : [...before[platform], accountId] };
      await writeAccounts(tx, competitorId, before, after);
    });
    return { confirmed: true as const };
  },
});

export const removeAdMatch = defineTool({
  name: 'remove_ad_match',
  access: 'write',
  description: 'Remove a matched or possible Google Ads or Meta account from a tracked competitor. A removed Google account’s ads are retired silently.',
  input: AdMatchInput,
  output: z.object({ removed: z.literal(true) }),
  // Ruling 7: competitor rows are global, so ad-account writes are agency-only.
  permission: 'agency',
  feature: 'manage_competitors',
  async handler(ctx, { clientId, competitorId, platform, accountId }, deps) {
    await assertTracked(ctx, deps, clientId, competitorId);
    const shared = await deps.service.transaction(async (tx) => {
      const pending = await lockedPending(tx, clientId, competitorId);
      const rest = pending.filter((m) => !(m.platform === platform && m.accountId === accountId));
      const before = await lockedAccounts(tx, competitorId);
      const attached = before[platform].includes(accountId);
      if (!attached && rest.length === pending.length) throw new ToolError('not_found', 'That ad account match was not found');
      if (rest.length !== pending.length) await setPending(tx, clientId, competitorId, rest);
      if (!attached) return false;
      // Ruling 7: detach from the shared row (and retire its ads) only when this client is the sole tracker.
      const [others] = await tx.select({ n: count() }).from(clientCompetitor).where(and(eq(clientCompetitor.competitorId, competitorId), ne(clientCompetitor.clientId, clientId)));
      if ((others?.n ?? 0) > 0) return true;
      await writeAccounts(tx, competitorId, before, { ...before, [platform]: before[platform].filter((id) => id !== accountId) });
      // D6/P3: that advertiser's ads stop being tracked — retire them silently (no ended capture, so no "stopped"
      // change), as the Google collector does for unpinned advertisers (ads/google.ts).
      if (platform === 'google') {
        await tx.update(ad).set({ isActive: false, endedAt: sql`${ad.lastSeenAt}` })
          .where(and(eq(ad.competitorId, competitorId), eq(ad.platform, 'google'), eq(ad.isActive, true), eq(ad.advertiserId, accountId)));
      }
      return false;
    });
    // This client's pending entry (if any) is removed and committed; the shared detach is refused.
    if (shared) throw new ToolError('invalid_input', "Other clients also track this competitor, so this account can't be removed here. Contact support.");
    return { removed: true as const };
  },
});

export const getCompetitorAdMatches = defineTool({
  name: 'get_competitor_ad_matches',
  access: 'read',
  description: 'Ad accounts (Google Ads advertisers, Meta pages) matched to a tracked competitor, and possible matches awaiting confirmation.',
  input: z.object({ clientId: uuid, competitorId: uuid }),
  output: z.object({
    matched: z.array(z.object({ platform: z.enum(['google', 'meta']), accountId: z.string(), name: z.string().nullable() })),
    pending: z.array(AdMatch),
  }),
  // Ruling 7: ad-account data is agency-only (the competitor row is shared across clients).
  permission: 'agency',
  feature: 'manage_competitors',
  async handler(ctx, { clientId, competitorId }, deps) {
    await assertTracked(ctx, deps, clientId, competitorId);
    const [link] = await withTenant(deps.app, ctx, (tx) =>
      tx.select({ pending: clientCompetitor.pendingAdMatches }).from(clientCompetitor).where(and(eq(clientCompetitor.clientId, clientId), eq(clientCompetitor.competitorId, competitorId))));
    const [c] = await deps.service.select({ google: competitor.googleAdvertiserIds, meta: competitor.metaPageIds }).from(competitor).where(eq(competitor.id, competitorId));
    if (!link || !c) throw new ToolError('not_found', 'Competitor not found');
    // `matched` comes from the shared competitor row (agency-only per Ruling 7). Names are only known for suggestions; a matched id keeps `name: null` rather than a guess.
    return {
      matched: [...c.google.map((accountId) => ({ platform: 'google' as const, accountId, name: null })), ...c.meta.map((accountId) => ({ platform: 'meta' as const, accountId, name: null }))],
      pending: link.pending.filter((m) => AdMatch.safeParse(m).success),
    };
  },
});

/**
 * Dismisses this client's still-open suggestions among `ids` through RLS (app_user may update `status` only); ids of
 * other clients or no longer `suggested` are ignored. Returns the ids dismissed. Permission and feature checks are the
 * caller's; with `recheck`, the client row is locked first and `recheck` runs right after, in the same transaction.
 */
export async function dismissSuggestions(ctx: AccessContext, deps: ToolDeps, clientId: string, ids: string[], recheck?: LockedRecheck): Promise<string[]> {
  if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Suggestion not found');
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const rows = await withTenant(deps.app, ctx, async (tx) => {
    if (recheck) {
      const [c] = await tx.select({ id: client.id }).from(client).where(eq(client.id, clientId)).for('update');
      if (!c) throw new ToolError('not_found', 'Client not found');
      await recheck(tx);
    }
    return tx.update(competitorSuggestion).set({ status: 'dismissed' })
      .where(and(inArray(competitorSuggestion.id, unique), eq(competitorSuggestion.clientId, clientId), eq(competitorSuggestion.status, 'suggested')))
      .returning({ id: competitorSuggestion.id });
  });
  return rows.map((r) => r.id);
}

export const dismissCompetitorSuggestion = defineTool({
  name: 'dismiss_competitor_suggestion',
  access: 'write',
  description: 'Hide a competitor suggestion.',
  input: z.object({ suggestionId: uuid }),
  output: z.object({ dismissed: z.literal(true) }),
  permission: 'manage',
  feature: 'manage_competitors',
  async handler(ctx, { suggestionId }, deps) {
    const [s] = await withTenant(deps.app, ctx, (tx) => tx.select({ clientId: competitorSuggestion.clientId }).from(competitorSuggestion).where(eq(competitorSuggestion.id, suggestionId)));
    if (!s) throw new ToolError('not_found', 'Suggestion not found');
    const dismissed = await dismissSuggestions(ctx, deps, s.clientId, [suggestionId]);
    if (dismissed.length === 0) throw new ToolError('not_found', 'Suggestion not found');
    return { dismissed: true as const };
  },
});

const HOST = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** "https://www.Smith.com/x" → "smith.com"; null when it isn't a host name. */
export function normalizeDomain(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  let host: string;
  try {
    host = new URL(/^https?:\/\//.test(s) ? s : `https://${s}`).hostname;
  } catch {
    return null;
  }
  host = host.replace(/^www\./, '');
  return HOST.test(host) ? host : null;
}

export const listClientCompetitors = defineTool({
  name: 'list_client_competitors',
  access: 'read',
  description: 'List the competitors a client tracks, with their number of active tracked pages.',
  input: z.object({ clientId: uuid, limit: z.number().int().min(1).max(200).optional(), ...pageFields }),
  output: z.object({ items: pagedItems(TrackedCompetitor), limit: z.number().int(), nextCursor: z.string().nullable().optional() }),
  permission: 'read',
  channels: ['web', 'mcp', 'ask'],
  async handler(ctx, input, deps, meta) {
    const { clientId } = input;
    const { offset, limit: pageLimit } = pageOf(input, meta, 200);
    if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
    const { c, rows } = await withTenant(deps.app, ctx, async (tx) => {
      const [c] = await tx.select({ limit: client.competitorLimit }).from(client).where(eq(client.id, clientId));
      const rows = await tx
        .select({
          id: competitor.id, name: competitor.name, domain: competitor.domain, placeId: competitor.placeId, addedAt: clientCompetitor.createdAt,
          activePages: sql<number>`(select count(*)::int from tracked_page tp where tp.competitor_id = ${competitor.id} and tp.active)`,
        })
        .from(clientCompetitor)
        .innerJoin(competitor, eq(competitor.id, clientCompetitor.competitorId))
        .where(eq(clientCompetitor.clientId, clientId))
        .orderBy(asc(competitor.name), asc(competitor.id)).offset(offset).limit(pageLimit + 1);
      return { c, rows };
    });
    if (!c) throw new ToolError('not_found', 'Client not found');
    const page = pageResult(rows, pageLimit, offset);
    if (detailOf(input, meta) === 'summary') {
      return {
        items: page.rows.map((r) => ({ id: r.id, title: r.name, date: r.addedAt.toISOString(), evidenceIds: [], url: appLinkFor(deps.appUrl, { t: 'competitor', clientId, id: r.id }) })),
        limit: c.limit, nextCursor: page.nextCursor,
      };
    }
    return { items: page.rows.map((r) => ({ ...r, addedAt: r.addedAt.toISOString() })), limit: c.limit, nextCursor: page.nextCursor };
  },
});

export const addCompetitor = defineTool({
  name: 'add_competitor',
  access: 'write',
  description: 'Track a competitor by website and/or Google place id.',
  input: z.object({ clientId: uuid, name: z.string().min(1).max(120), domain: z.string().max(300).optional(), placeId: z.string().max(300).optional() }),
  output: z.object({ competitorId: uuid, discovery: z.enum(['queued', 'disabled', 'not_needed']) }),
  permission: 'manage',
  feature: 'manage_competitors',
  async handler(ctx, input, deps) {
    if (!canAccessClient(ctx, input.clientId)) throw new ToolError('not_found', 'Client not found');
    const domain = input.domain?.trim() ? normalizeDomain(input.domain) : null;
    if (input.domain?.trim() && !domain) throw new ToolError('invalid_input', 'That website doesn’t look like a domain (e.g. smithhvac.com)');
    const placeId = input.placeId?.trim() || null;
    if (placeId && !/^[A-Za-z0-9_-]{10,200}$/.test(placeId)) throw new ToolError('invalid_input', 'Google place id looks wrong');
    if (!domain && !placeId) throw new ToolError('invalid_input', 'Give the competitor’s website or Google place id');
    const [visible] = await withTenant(deps.app, ctx, (tx) => tx.select({ id: client.id }).from(client).where(eq(client.id, input.clientId)));
    if (!visible) throw new ToolError('not_found', 'Client not found');

    // Reuse a global row by place/cid first; for a typed website, the exact domain owner is that business.
    let row = await findExistingCompetitor(deps.service, { placeId, cid: null, domain });
    if (!row && domain) row = (await deps.service.select().from(competitor).where(eq(competitor.domain, domain)).limit(1))[0];
    // 12a atomic limit: lock, count, create and link in one service transaction (the RLS read above proved access).
    const competitorId = await deps.service.transaction(async (tx) => {
      const limit = await lockClientLimit(tx, input.clientId);
      const linked = row ? (await tx.select({ id: clientCompetitor.competitorId }).from(clientCompetitor).where(and(eq(clientCompetitor.clientId, input.clientId), eq(clientCompetitor.competitorId, row.id)))).length > 0 : false;
      await assertRoomForCompetitors(tx, input.clientId, limit, linked ? 0 : 1);
      let id = row?.id;
      // Final review: if the reused row is any client's self business (named from that client's private client.name),
      // rename it to the name typed here. No identifier backfill: typed place ids/domains are unverified and must not
      // be written onto a shared row another agency already collects for.
      if (row) await patchReusedCompetitor(tx, row, { placeId, cid: null, domain, name: input.name.trim() }, { backfill: false });
      if (!id) {
        const inserted = await tx.insert(competitor).values({ name: input.name.trim(), domain, placeId }).onConflictDoNothing().returning({ id: competitor.id });
        id = inserted[0]?.id ?? (await findExistingCompetitor(tx, { placeId, cid: null, domain }))?.id;
        if (!id) throw new ToolError('internal', 'That competitor could not be added — try again');
      }
      await tx.insert(clientCompetitor).values({ agencyId: ctx.agencyId, clientId: input.clientId, competitorId: id }).onConflictDoNothing();
      return id;
    });
    await ensureCompetitorSources(deps.service, competitorId);
    return { competitorId, discovery: await startDiscovery(deps, competitorId) };
  },
});

export const removeCompetitor = defineTool({
  name: 'remove_competitor',
  access: 'write',
  description: 'Stop tracking a competitor for a client. History is kept; collection stops once no client tracks it.',
  input: z.object({ clientId: uuid, competitorId: uuid }),
  output: z.object({ removed: z.literal(true) }),
  permission: 'manage',
  feature: 'manage_competitors',
  async handler(ctx, { clientId, competitorId }, deps) {
    if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Competitor not found');
    const rows = await withTenant(deps.app, ctx, (tx) =>
      tx.delete(clientCompetitor).where(and(eq(clientCompetitor.clientId, clientId), eq(clientCompetitor.competitorId, competitorId))).returning({ id: clientCompetitor.competitorId }));
    if (rows.length === 0) throw new ToolError('not_found', 'Competitor not found');
    return { removed: true as const };
  },
});

export const competitorTools = [
  listCompetitorSuggestions, requestCompetitorSuggestions, getCompetitorSearchStatus, getCompetitorSignals, acceptCompetitorSuggestion, acceptCompetitorSuggestions,
  getCompetitorAdMatches, confirmAdMatch, removeAdMatch, dismissCompetitorSuggestion, listClientCompetitors, addCompetitor, removeCompetitor,
];
