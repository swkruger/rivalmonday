import type { Ai } from '@cs/ai';
import { agencyServiceable, clientWorkAllowed, brief, type BriefDropStats, briefItem, type BriefKind, changeEvent, client, type Db, recommendation } from '@cs/db';
import { and, asc, desc, eq, inArray, isNotNull, ne, notInArray, sql } from 'drizzle-orm';
import type { VerticalPack } from '@cs/verticals';
import type { PackLoader } from '../tag/tag-stage';
import { candidateEventIds, candidateEvidenceIds, gatherBriefCandidates, loadBriefClient } from './gather';
import { loadClientRunbook } from '../runbook/store';
import { type Playbook, playbookRef } from './playbooks';
import { briefDue, briefPeriod, deliveryDateFor, localParts, safeTimezone } from './schedule';
import { selectBriefItems } from './select';
import { buildScorecard, Scorecard } from './scorecard';
import { countSummary } from './summary';
import { trendSnapshot } from './trend';
import { verifyDraft, type VerifiedItem } from './verify';
import { writeBrief } from './writer';

export const BRIEF_MAX_ATTEMPTS = 3;
export const BRIEF_STALE_MINUTES = 30;
export const QUIET_SUMMARY = 'No significant competitor moves this week.';

export type BriefRunResult =
  | { status: 'ready'; briefId: string; kind: BriefKind; items: number; dropped: BriefDropStats }
  | { status: 'failed'; briefId: string; error: string }
  | { status: 'skipped'; reason: string };

/**
 * Claims the (client, delivery date) brief: new, or failed with attempts left, or a stale 'generating' row.
 * The returned `attempts` is the fencing token: a reclaim bumps it, so a superseded run's writes match zero rows.
 * A starting point on the same date is never reclaimed (Phase 12b Q3): the weekly brief for that date is skipped.
 */
async function claimBrief(db: Db, c: { id: string; agencyId: string }, deliveryDate: string, period: { start: Date; end: Date }): Promise<{ id: string; attempts: number } | { skipped: string }> {
  const rows = (await db.execute(sql`
    INSERT INTO brief (agency_id, client_id, delivery_date, period_start, period_end, status, attempts)
    VALUES (${c.agencyId}::uuid, ${c.id}::uuid, ${deliveryDate}::date, ${period.start.toISOString()}::timestamptz, ${period.end.toISOString()}::timestamptz, 'generating', 1)
    ON CONFLICT (client_id, delivery_date) DO UPDATE
      SET status = 'generating', attempts = brief.attempts + 1, error = NULL, updated_at = now(),
          period_start = EXCLUDED.period_start, period_end = EXCLUDED.period_end
      WHERE brief.kind <> 'starting_point'
        AND ((brief.status = 'failed' AND brief.attempts < ${BRIEF_MAX_ATTEMPTS}::int)
         OR (brief.status = 'generating' AND brief.updated_at < now() - make_interval(mins => ${BRIEF_STALE_MINUTES}::int)))
    RETURNING brief.id, brief.attempts`)) as unknown as { id: string; attempts: number }[];
  if (rows[0]) return { id: rows[0].id, attempts: Number(rows[0].attempts) };
  const [existing] = await db.select({ status: brief.status, attempts: brief.attempts }).from(brief).where(and(eq(brief.clientId, c.id), eq(brief.deliveryDate, deliveryDate)));
  if (existing?.status === 'failed') return { skipped: `failed after ${existing.attempts} attempts` };
  return { skipped: `a brief for ${deliveryDate} is already ${existing?.status ?? 'claimed'}` };
}

const OPEN_FIRST_MOVES_MAX = 3;

/** The client's approved or sent starting point (its scorecard is the baseline; Ruling 14) and the first moves still open from it. */
async function startingPointBaseline(db: Db, clientId: string): Promise<{ briefId: string; scorecard: Scorecard | null; openFirstMoves: { recommendationId: string; title: string }[] } | null> {
  const [sp] = await db.select({ id: brief.id, scorecard: brief.scorecard }).from(brief)
    .where(and(eq(brief.clientId, clientId), eq(brief.kind, 'starting_point'), inArray(brief.status, ['approved', 'sent'])))
    .orderBy(desc(brief.deliveryDate)).limit(1);
  if (!sp) return null;
  const parsed = Scorecard.safeParse(sp.scorecard);
  const moves = await db.select({ recommendationId: recommendation.id, title: recommendation.title }).from(recommendation)
    .innerJoin(briefItem, eq(briefItem.id, recommendation.briefItemId))
    .where(and(eq(briefItem.briefId, sp.id), eq(recommendation.clientId, clientId), notInArray(recommendation.status, ['done', 'dismissed'])))
    .orderBy(asc(briefItem.ord)).limit(OPEN_FIRST_MOVES_MAX);
  return { briefId: sp.id, scorecard: parsed.success ? parsed.data : null, openFirstMoves: moves };
}

/**
 * Items that may be stored: each must cite at least one event (no evidence, no claim — never a move with nothing
 * left behind it) and none of its events may have been retracted since it was gathered.
 */
export function committableItems(items: VerifiedItem[], retractedIds: string[]): VerifiedItem[] {
  return items.filter((i) => {
    const ids = candidateEventIds(i.candidate);
    return ids.length > 0 && ids.every((id) => !retractedIds.includes(id));
  });
}

/** Drizzle wraps driver errors; the Postgres message is on `cause`. */
export function briefErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as { cause?: unknown }).cause;
    if (cause instanceof Error && cause.message) return cause.message;
    return err.message;
  }
  return String(err);
}

export async function generateBrief(deps: { db: Db; ai: Ai; packs: PackLoader; generic: () => Promise<VerticalPack> }, clientId: string, opts: { now?: Date } = {}): Promise<BriefRunResult> {
  const now = opts.now ?? new Date();
  const [row] = await deps.db.select({ id: client.id, agencyId: client.agencyId, timezone: client.timezone }).from(client).where(eq(client.id, clientId)).limit(1);
  if (!row) throw new Error(`client ${clientId} not found`);
  const tz = safeTimezone(row.timezone);
  const deliveryDate = deliveryDateFor(now, tz);
  const [prev] = await deps.db
    .select({ end: brief.periodEnd })
    .from(brief)
    .where(and(eq(brief.clientId, clientId), ne(brief.status, 'failed'), ne(brief.status, 'generating'), ne(brief.kind, 'starting_point'), sql`${brief.deliveryDate} < ${deliveryDate}::date`))
    .orderBy(desc(brief.deliveryDate))
    .limit(1);
  const period = briefPeriod(now, prev?.end ?? null);
  const claim = await claimBrief(deps.db, row, deliveryDate, period);
  if ('skipped' in claim) return { status: 'skipped', reason: claim.skipped };
  const briefId = claim.id;
  /** Only the run holding the current claim may write: a stale run reclaimed by a newer attempt matches zero rows. */
  const owned = and(eq(brief.id, briefId), eq(brief.status, 'generating'), eq(brief.attempts, claim.attempts));
  const scope = { agencyId: row.agencyId, clientId };

  try {
    const c = await loadBriefClient(deps, clientId);
    const selected = selectBriefItems(await gatherBriefCandidates(deps, c, period), { focusAreaIds: c.focusAreaIds });
    const trend = await trendSnapshot(deps, clientId, period);
    let verified = { summary: '', items: [] as Awaited<ReturnType<typeof verifyDraft>>['items'], dropped: { items: 0, sentences: 0 } as BriefDropStats, checked: 0 };
    let playbooks: (Playbook & { version: number })[] = [];
    if (selected.length > 0) {
      playbooks = (await loadClientRunbook(deps, clientId)).plays;
      const draft = await writeBrief(deps.ai, scope, c, selected, playbooks, period);
      verified = await verifyDraft(deps.ai, scope, c, selected, draft, { year: localParts(now, tz).year, period });
    }

    // Built before the commit transaction: a scorecard failure must never fail the brief (it is stored only if the week turns out quiet).
    let quietScorecard: Scorecard | null = null;
    try {
      const sp = await startingPointBaseline(deps.db, clientId);
      quietScorecard = { ...(await buildScorecard(deps, clientId, { now, baseline: sp?.scorecard ?? null, openFirstMoves: sp?.openFirstMoves ?? [] })), baselineBriefId: sp?.briefId ?? null };
    } catch (err) {
      console.warn(`[briefs] scorecard skipped: ${clientId}: ${briefErrorMessage(err)}`);
    }

    return await deps.db.transaction(async (tx): Promise<BriefRunResult> => {
      // Commit-time re-check (Review Focus 4): an event retracted while the model was writing must not reach the brief.
      const ids = verified.items.flatMap((i) => candidateEventIds(i.candidate));
      const retracted = ids.length === 0 ? [] : (await tx.select({ id: changeEvent.id }).from(changeEvent).where(and(inArray(changeEvent.id, ids), isNotNull(changeEvent.retractedAt)))).map((r) => r.id);
      const items = committableItems(verified.items, retracted);
      const dropped = { items: verified.dropped.items + (verified.items.length - items.length), sentences: verified.dropped.sentences };
      const kind: BriefKind = items.length > 0 ? 'standard' : 'quiet';
      const summary = kind === 'quiet' ? QUIET_SUMMARY : items.length === verified.items.length ? verified.summary : countSummary(items.length);
      const scorecard = kind === 'quiet' ? quietScorecard : null;
      // Fence first: if a newer attempt reclaimed this brief, store nothing.
      const won = await tx.update(brief).set({ status: 'ready', kind, summary, scorecard, trend, dropped, claimsChecked: verified.checked, generatedAt: new Date(), updatedAt: new Date() }).where(owned).returning({ id: brief.id });
      if (won.length === 0) return { status: 'skipped', reason: 'superseded by a newer attempt' };
      if (items.length > 0) {
        await tx.insert(briefItem).values(items.map((i, ord) => ({
          briefId, agencyId: row.agencyId, clientId, ord, competitorId: i.candidate.competitorId,
          headline: i.headline, whatChanged: i.what_changed, whyItMatters: i.why_it_matters, recommendedAction: i.recommended_action,
          confidence: i.candidate.confidence, effort: i.effort, impact: i.impact,
          eventIds: candidateEventIds(i.candidate), moveId: i.candidate.kind === 'move' ? i.candidate.moveId : null, evidenceIds: candidateEvidenceIds(i.candidate),
          upsellTag: i.upsell_tag === 'none' ? null : i.upsell_tag, ...playbookRef(playbooks, i.candidate),
        })));
      }
      return { status: 'ready' as const, briefId, kind, items: items.length, dropped };
    });
  } catch (err) {
    const error = briefErrorMessage(err).slice(0, 2000);
    const marked = await deps.db.update(brief).set({ status: 'failed', error, updatedAt: new Date() }).where(owned).returning({ id: brief.id });
    if (marked.length === 0) {
      console.warn(`[briefs] superseded brief ${briefId} attempt ${claim.attempts} for client ${clientId} failed: ${error}`);
      return { status: 'skipped', reason: 'superseded by a newer attempt' };
    }
    console.warn(`[briefs] brief ${briefId} for client ${clientId} failed: ${error}`);
    return { status: 'failed', briefId, error };
  }
}

/**
 * Active clients (prospects get no briefs, 5b-2 decision 9) whose Thursday-night window is open and whose brief for that Monday is missing, retryable or stale.
 * Starting points are ignored (Phase 12b Q3); one holding that Monday makes the weekly run skip.
 * Two queries regardless of client count: the serviceable clients, then one anti-join against `brief` for those in their window.
 * The time-zone math stays in JS (SQL `AT TIME ZONE` throws on a bad zone name).
 */
export async function listBriefDueClients(db: Db, now: Date): Promise<string[]> {
  const clients = await db.select({ id: client.id, timezone: client.timezone }).from(client).where(and(clientWorkAllowed(client), agencyServiceable(client.agencyId)));
  const ids: string[] = [];
  const dates: string[] = [];
  for (const c of clients) {
    const tz = safeTimezone(c.timezone);
    if (!briefDue(now, tz)) continue;
    ids.push(c.id);
    dates.push(deliveryDateFor(now, tz));
  }
  if (ids.length === 0) return [];
  const staleBefore = new Date(now.getTime() - BRIEF_STALE_MINUTES * 60_000).toISOString();
  const rows = await db.execute<{ id: string }>(sql`
    SELECT d.client_id AS id
      FROM unnest(ARRAY[${sql.join(ids.map((x) => sql`${x}`), sql`, `)}]::uuid[],
                  ARRAY[${sql.join(dates.map((x) => sql`${x}`), sql`, `)}]::date[]) WITH ORDINALITY AS d(client_id, delivery_date, ord)
      LEFT JOIN brief b ON b.client_id = d.client_id AND b.delivery_date = d.delivery_date AND b.kind <> 'starting_point'
     WHERE b.id IS NULL
        OR (b.status = 'failed' AND b.attempts < ${BRIEF_MAX_ATTEMPTS})
        OR (b.status = 'generating' AND b.updated_at < ${staleBefore}::timestamptz)
     ORDER BY d.ord`);
  return [...rows].map((r) => r.id);
}
