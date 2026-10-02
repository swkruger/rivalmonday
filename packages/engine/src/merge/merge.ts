import type { Ai, DecisionQuestion } from '@cs/ai';
import { redactContactInfo } from '@cs/collectors';
import type { CallScope, ChangeType } from '@cs/core';
import { changeEvent, type Db, detectedChange, eventChange, type NumericChange, type Tx } from '@cs/db';
import { and, cosineDistance, desc, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import { factsSignature } from '../score/score-stage';

export const MERGE_WINDOW_DAYS = 14;
export const MERGE_MIN_CONFIDENCE = 0.8;
export const MERGE_MAX_CANDIDATES = 3;
/** Offers and service launches — the event types spec §6.2 merges across channels. */
export const MERGEABLE_TYPES: ReadonlySet<ChangeType> = new Set<ChangeType>(['price_change', 'promo', 'ad_started', 'new_service']);
export const SAME_OFFER_QUESTION =
  'Do "new_change" and the existing change describe the same offer or the same service launch by this business (same service, same deal), seen in two places? Answer no if the price, discount or service differs.';
const PLATFORM = { agencyId: null, clientId: null } as const;
const DAY_MS = 86_400_000;

export interface MergeSubject {
  competitorId: string;
  clientId: string | null;
  /** The change's after-capture (null for rank changes): identical facts in one capture are the same offer. */
  captureId: string | null;
  changeType: ChangeType;
  services: Record<string, string | null>;
  facts: NumericChange[];
  embedding: number[] | null;
  occurredAt: Date;
  /** The change's own text (redacted before it reaches a model). */
  text: string;
}

export interface MergeTarget {
  eventId: string;
  via: 'facts' | 'same_offer';
  confidence: number;
}

/** True when some vertical maps both to the same (non-null) service. */
export const sharesService = (a: Record<string, string | null>, b: Record<string, string | null>) => Object.entries(a).some(([v, s]) => s !== null && b[v] === s);
/** True when some vertical maps them to two different services. */
export const conflictingServices = (a: Record<string, string | null>, b: Record<string, string | null>) =>
  Object.entries(a).some(([v, s]) => s !== null && b[v] != null && b[v] !== s);

/**
 * Spec §6.2 cross-channel merge: same competitor, same tenant scope, a mergeable type, within ±14 days.
 * Identical numeric facts merge deterministically when the two also share a mapped service or come from the
 * same capture (the same price on two blocks of one page) — "$20" alone is not enough to call two offers
 * the same, so other identical-facts candidates go to the model. Two price changes with different numbers
 * never merge; otherwise one Noul per candidate (≤ 3 sharing a service or identical facts) in a single
 * decide call, merged into the most confident "yes" at or above MERGE_MIN_CONFIDENCE.
 * `scope` is the usage scope of that call: the tenant for a tenant-private change, platform otherwise.
 */
export async function findMergeTarget(deps: { db: Db; ai: Ai }, s: MergeSubject, scope: CallScope = PLATFORM): Promise<MergeTarget | null> {
  if (!MERGEABLE_TYPES.has(s.changeType)) return null;
  const from = new Date(s.occurredAt.getTime() - MERGE_WINDOW_DAYS * DAY_MS);
  const to = new Date(s.occurredAt.getTime() + MERGE_WINDOW_DAYS * DAY_MS);
  const rows = await deps.db
    .select({ id: changeEvent.id, changeType: changeEvent.changeType, services: changeEvent.services, facts: changeEvent.facts, summary: changeEvent.summary })
    .from(changeEvent)
    .where(
      and(
        eq(changeEvent.competitorId, s.competitorId), s.clientId ? eq(changeEvent.clientId, s.clientId) : isNull(changeEvent.clientId),
        inArray(changeEvent.changeType, [...MERGEABLE_TYPES]), gte(changeEvent.occurredAt, from), lte(changeEvent.occurredAt, to),
      ),
    )
    .orderBy(s.embedding ? cosineDistance(changeEvent.embedding, s.embedding) : desc(changeEvent.occurredAt))
    .limit(20);

  const signature = s.facts.length > 0 ? factsSignature(s.facts) : null;
  const sameFacts = (r: (typeof rows)[number]) => signature !== null && r.facts.length > 0 && factsSignature(r.facts) === signature && !conflictingServices(s.services, r.services);
  const matches = rows.filter(sameFacts);
  if (matches.length > 0) {
    const sameCapture = new Set<string>();
    if (s.captureId) {
      const linked = await deps.db
        .select({ eventId: eventChange.eventId })
        .from(eventChange)
        .innerJoin(detectedChange, eq(detectedChange.id, eventChange.changeId))
        .where(and(inArray(eventChange.eventId, matches.map((r) => r.id)), eq(detectedChange.afterCaptureId, s.captureId)));
      for (const l of linked) sameCapture.add(l.eventId);
    }
    const same = matches.find((r) => sharesService(s.services, r.services) || sameCapture.has(r.id));
    if (same) return { eventId: same.id, via: 'facts', confidence: 1 };
  }

  const bothPriced = (r: (typeof rows)[number]) => s.changeType === 'price_change' && r.changeType === 'price_change' && s.facts.length > 0 && r.facts.length > 0;
  const candidates = rows.filter((r) => sameFacts(r) || (sharesService(s.services, r.services) && !bothPriced(r))).slice(0, MERGE_MAX_CANDIDATES);
  if (candidates.length === 0) return null;

  const questions: Record<string, DecisionQuestion> = Object.fromEntries(
    candidates.map((_, i) => [`same_${i}`, { type: 'noul', instructions: `${SAME_OFFER_QUESTION} The existing change is "existing_${i}".` }]),
  );
  const state = { new_change: redactContactInfo(s.text).slice(0, 1500), ...Object.fromEntries(candidates.map((c, i) => [`existing_${i}`, c.summary])) };
  const result = await deps.ai.decide('decisions', state, questions, scope);
  let best: MergeTarget | null = null;
  for (const [i, c] of candidates.entries()) {
    const a = result.answers[`same_${i}`];
    if (a?.type === 'noul' && a.value === true && a.confidence >= MERGE_MIN_CONFIDENCE && (!best || a.confidence > best.confidence)) {
      best = { eventId: c.id, via: 'same_offer', confidence: a.confidence };
    }
  }
  return best;
}

/**
 * Inserts the event — or, with a merge target, links the change to that event and folds the change in:
 * its channels and ZIPs are added, the event is an offer if either is, and keeps the larger item count.
 * The event is not re-scored. Returns the event id.
 */
export async function writeEvent(tx: Tx, changeId: string, values: typeof changeEvent.$inferInsert, target: MergeTarget | null): Promise<string> {
  if (!target) {
    const [ev] = await tx.insert(changeEvent).values(values).returning({ id: changeEvent.id });
    await tx.insert(eventChange).values({ eventId: ev!.id, changeId });
    return ev!.id;
  }
  const [t] = await tx
    .select({ channels: changeEvent.channels, zips: changeEvent.zips, details: changeEvent.details })
    .from(changeEvent)
    .where(eq(changeEvent.id, target.eventId))
    .for('update');
  if (!t) throw new Error(`merge target event ${target.eventId} vanished`);
  const add = values.details ?? {};
  const details = { ...t.details };
  if (t.details.offer !== undefined || add.offer !== undefined) details.offer = t.details.offer === true || add.offer === true;
  if (t.details.count !== undefined || add.count !== undefined) details.count = Math.max(t.details.count ?? 0, add.count ?? 0);
  await tx
    .update(changeEvent)
    .set({
      channels: [...new Set([...t.channels, ...(values.channels ?? [])])].sort(),
      zips: [...new Set([...t.zips, ...(values.zips ?? [])])].sort(),
      details,
    })
    .where(eq(changeEvent.id, target.eventId));
  await tx.insert(eventChange).values({ eventId: target.eventId, changeId });
  return target.eventId;
}
