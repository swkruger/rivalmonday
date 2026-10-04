import type { Ai } from '@cs/ai';
import { brief, type BriefDropStats, briefItem, type BriefKind, changeEvent, client, type Db } from '@cs/db';
import { and, desc, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import type { PackLoader } from '../tag/tag-stage';
import { candidateEventIds, candidateEvidenceIds, gatherBriefCandidates, loadBriefClient } from './gather';
import { candidateTrigger, playbookFor, resolvePlaybooks } from './playbooks';
import { briefDue, briefPeriod, deliveryDateFor, localParts, safeTimezone } from './schedule';
import { selectBriefItems } from './select';
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
 */
async function claimBrief(db: Db, c: { id: string; agencyId: string }, deliveryDate: string, period: { start: Date; end: Date }): Promise<{ id: string; attempts: number } | { skipped: string }> {
  const rows = (await db.execute(sql`
    INSERT INTO brief (agency_id, client_id, delivery_date, period_start, period_end, status, attempts)
    VALUES (${c.agencyId}::uuid, ${c.id}::uuid, ${deliveryDate}::date, ${period.start.toISOString()}::timestamptz, ${period.end.toISOString()}::timestamptz, 'generating', 1)
    ON CONFLICT (client_id, delivery_date) DO UPDATE
      SET status = 'generating', attempts = brief.attempts + 1, error = NULL, updated_at = now(),
          period_start = EXCLUDED.period_start, period_end = EXCLUDED.period_end
      WHERE (brief.status = 'failed' AND brief.attempts < ${BRIEF_MAX_ATTEMPTS}::int)
         OR (brief.status = 'generating' AND brief.updated_at < now() - make_interval(mins => ${BRIEF_STALE_MINUTES}::int))
    RETURNING brief.id, brief.attempts`)) as unknown as { id: string; attempts: number }[];
  if (rows[0]) return { id: rows[0].id, attempts: Number(rows[0].attempts) };
  const [existing] = await db.select({ status: brief.status, attempts: brief.attempts }).from(brief).where(and(eq(brief.clientId, c.id), eq(brief.deliveryDate, deliveryDate)));
  if (existing?.status === 'failed') return { skipped: `failed after ${existing.attempts} attempts` };
  return { skipped: `a brief for ${deliveryDate} is already ${existing?.status ?? 'claimed'}` };
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
function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as { cause?: unknown }).cause;
    if (cause instanceof Error && cause.message) return cause.message;
    return err.message;
  }
  return String(err);
}

export async function generateBrief(deps: { db: Db; ai: Ai; packs: PackLoader }, clientId: string, opts: { now?: Date } = {}): Promise<BriefRunResult> {
  const now = opts.now ?? new Date();
  const [row] = await deps.db.select({ id: client.id, agencyId: client.agencyId, timezone: client.timezone }).from(client).where(eq(client.id, clientId)).limit(1);
  if (!row) throw new Error(`client ${clientId} not found`);
  const tz = safeTimezone(row.timezone);
  const deliveryDate = deliveryDateFor(now, tz);
  const [prev] = await deps.db
    .select({ end: brief.periodEnd })
    .from(brief)
    .where(and(eq(brief.clientId, clientId), ne(brief.status, 'failed'), ne(brief.status, 'generating'), sql`${brief.deliveryDate} < ${deliveryDate}::date`))
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
    const pack = await deps.packs(c.verticalId);
    const selected = selectBriefItems(await gatherBriefCandidates(deps, c, period));
    const trend = await trendSnapshot(deps, clientId, period);
    let verified = { summary: '', items: [] as Awaited<ReturnType<typeof verifyDraft>>['items'], dropped: { items: 0, sentences: 0 } as BriefDropStats };
    let playbooks: Awaited<ReturnType<typeof resolvePlaybooks>> = [];
    if (selected.length > 0) {
      playbooks = await resolvePlaybooks(deps.db, c.agencyId, pack);
      const draft = await writeBrief(deps.ai, scope, c, selected, playbooks, period);
      verified = await verifyDraft(deps.ai, scope, c, selected, draft, { year: localParts(now, tz).year, period });
    }

    return await deps.db.transaction(async (tx): Promise<BriefRunResult> => {
      // Commit-time re-check (Review Focus 4): an event retracted while the model was writing must not reach the brief.
      const ids = verified.items.flatMap((i) => candidateEventIds(i.candidate));
      const retracted = ids.length === 0 ? [] : (await tx.select({ id: changeEvent.id }).from(changeEvent).where(and(inArray(changeEvent.id, ids), isNotNull(changeEvent.retractedAt)))).map((r) => r.id);
      const items = committableItems(verified.items, retracted);
      const dropped = { items: verified.dropped.items + (verified.items.length - items.length), sentences: verified.dropped.sentences };
      const kind: BriefKind = items.length > 0 ? 'standard' : 'quiet';
      const summary = kind === 'quiet' ? QUIET_SUMMARY : items.length === verified.items.length ? verified.summary : countSummary(items.length);
      // Fence first: if a newer attempt reclaimed this brief, store nothing.
      const won = await tx.update(brief).set({ status: 'ready', kind, summary, trend, dropped, generatedAt: new Date(), updatedAt: new Date() }).where(owned).returning({ id: brief.id });
      if (won.length === 0) return { status: 'skipped', reason: 'superseded by a newer attempt' };
      if (items.length > 0) {
        await tx.insert(briefItem).values(items.map((i, ord) => ({
          briefId, agencyId: row.agencyId, clientId, ord, competitorId: i.candidate.competitorId,
          headline: i.headline, whatChanged: i.what_changed, whyItMatters: i.why_it_matters, recommendedAction: i.recommended_action,
          confidence: i.candidate.confidence, effort: i.effort, impact: i.impact,
          eventIds: candidateEventIds(i.candidate), moveId: i.candidate.kind === 'move' ? i.candidate.moveId : null, evidenceIds: candidateEvidenceIds(i.candidate),
          upsellTag: i.upsell_tag === 'none' ? null : i.upsell_tag, playbookId: playbookFor(playbooks, candidateTrigger(i.candidate))?.id ?? null,
        })));
      }
      return { status: 'ready' as const, briefId, kind, items: items.length, dropped };
    });
  } catch (err) {
    const error = errorMessage(err).slice(0, 2000);
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
 * Clients whose Thursday-night window is open and whose brief for that Monday is missing, retryable or stale.
 * Scans every client with one brief lookup each: fine at pilot scale (≤ 15 clients); Phase 7 scale needs a set-based query.
 */
export async function listBriefDueClients(db: Db, now: Date): Promise<string[]> {
  const clients = await db.select({ id: client.id, timezone: client.timezone }).from(client);
  const due: string[] = [];
  for (const c of clients) {
    const tz = safeTimezone(c.timezone);
    if (!briefDue(now, tz)) continue;
    const [b] = await db.select({ status: brief.status, attempts: brief.attempts, updatedAt: brief.updatedAt }).from(brief).where(and(eq(brief.clientId, c.id), eq(brief.deliveryDate, deliveryDateFor(now, tz))));
    const stale = b?.status === 'generating' && now.getTime() - b.updatedAt.getTime() > BRIEF_STALE_MINUTES * 60_000;
    if (!b || (b.status === 'failed' && b.attempts < BRIEF_MAX_ATTEMPTS) || stale) due.push(c.id);
  }
  return due;
}
