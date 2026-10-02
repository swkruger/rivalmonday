import type { Ai, DecisionQuestion } from '@cs/ai';
import { redactContactInfo } from '@cs/collectors';
import { CHANGE_TYPES, type ChangeType } from '@cs/core';
import { capture, type ChangeDetails, changeEvent, client, competitor, type Db, decisionReview, detectedChange, rankScan } from '@cs/db';
import type { VerticalPack } from '@cs/verticals';
import { eq } from 'drizzle-orm';
import { diffFacts, extractNumericFacts, MONEY_KINDS } from '../facts/numeric';
import { findMergeTarget, writeEvent } from '../merge/merge';
import { runStage, type StageOutcome } from '../stage';
import { serviceQuestionKey } from './questions';
import { competitorVerticals, extractZips, type PackLoader, TAG_STAGE, TAG_VERSION, type TagOutcome } from './tag-stage';

const PLATFORM = { agencyId: null, clientId: null } as const;
const MAX_STATE_TEXT = 1500;

/** Structured change types whose text names a service (ad copy, job titles, GBP categories/services): ask the service mapping. */
export const SERVICE_MAPPED_TYPES: ReadonlySet<ChangeType> = new Set<ChangeType>(['ad_started', 'ad_stopped', 'hiring', 'new_service', 'service_removed']);
export const OFFER_QUESTION =
  'Does this ad copy advertise a specific offer — a price, discount, coupon, financing deal, free add-on or limited-time promotion — rather than general branding?';

const CHANNEL_LABEL: Record<string, string> = { meta_ads: 'Meta', google_ads: 'Google' };
const trunc = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const pct = (x: number | undefined) => `${Math.round((x ?? 0) * 100)}%`;

export function buildStructuredQuestions(type: ChangeType, packs: VerticalPack[]): Record<string, DecisionQuestion> {
  const questions: Record<string, DecisionQuestion> = {};
  for (const pack of packs) {
    questions[serviceQuestionKey(pack.id)] = {
      type: 'choice',
      instructions: `Which ${pack.name} service does this concern? Answer "none" if it concerns no single service.`,
      options: { none: 'No single service, or general', ...Object.fromEntries(pack.services.map((s) => [s.id, s.aliases.length > 0 ? `${s.name} (${s.aliases.join(', ')})` : s.name])) },
    };
  }
  if (type === 'ad_started') questions.offer = { type: 'noul', instructions: OFFER_QUESTION };
  return questions;
}

/** Whole-word match of a service name or alias in a rank keyword, longest phrase first (no model call: keywords are short and tenant-private). */
export function serviceForKeyword(keyword: string, pack: VerticalPack): string | null {
  const k = ` ${keyword.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
  const phrases = pack.services
    .flatMap((s) => [s.name, ...s.aliases].map((p) => ({ id: s.id, p: ` ${p.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} ` })))
    .sort((a, b) => b.p.length - a.p.length);
  return phrases.find((x) => k.includes(x.p))?.id ?? null;
}

/** One-line, redacted event summary of a structured change (summaries are later sent to models, Phase 4). */
export function buildStructuredSummary(change: { source: string; beforeText: string | null; afterText: string | null; details: ChangeDetails }): string {
  const d = change.details;
  const first = d.items?.[0]?.label ?? '';
  const more = (d.count ?? 0) > 1 ? ` and ${(d.count ?? 0) - 1} more` : '';
  const before = change.beforeText ?? '';
  const after = change.afterText ?? '';
  const adWord = CHANNEL_LABEL[change.source] ? `${CHANNEL_LABEL[change.source]} ad` : 'ad';
  let s: string;
  switch (d.changeType) {
    case 'ad_started':
      s = `${plural(d.count ?? 1, `new ${adWord}`)}: "${trunc(first, 80)}"${more}`;
      break;
    case 'ad_stopped':
      s = `${plural(d.count ?? 1, adWord)} stopped: "${trunc(first, 80)}"${more}`;
      break;
    case 'hiring':
      s = `${plural(d.count ?? 1, 'new job posting')}: ${(d.items ?? []).slice(0, 3).map((i) => i.label).join('; ')}${(d.count ?? 0) > 3 ? ` and ${(d.count ?? 0) - 3} more` : ''}`;
      break;
    case 'new_service':
      s = `Google Business Profile ${d.field ?? 'service'} added: "${trunc(after, 80)}"`;
      break;
    case 'service_removed':
      s = `Google Business Profile ${d.field ?? 'service'} removed: "${trunc(before, 80)}"`;
      break;
    case 'new_location':
      s = `Google Business Profile address changed from "${trunc(before, 80)}" to "${trunc(after, 80)}"`;
      break;
    case 'rating_change':
      s = `Google rating ${d.ratingBefore} → ${d.ratingAfter}${d.votesAfter != null ? ` (${d.votesAfter} reviews)` : ''}`;
      break;
    case 'review_spike':
      s = `${d.count} new Google reviews in ${d.windowDays} days (${d.z}σ above the usual ${d.baselineMean}/week)${d.avgRating != null ? `, average rating ${d.avgRating}` : ''}`;
      break;
    case 'rank_change':
      s = `"${d.keyword}": average map position ${d.avgRankBefore} → ${d.avgRankAfter}, top-3 share ${pct(d.top3Before)} → ${pct(d.top3After)}`;
      break;
    default: {
      // gbp.ts stores scalar fields as "<field>: <value>"; the label is already in the sentence.
      const label = `${d.field ?? ''}: `;
      const bare = (t: string) => (d.field && t.startsWith(label) ? t.slice(label.length) : t);
      s = `Google Business Profile ${d.field ?? 'profile'} changed: ${trunc(bare(before), 60)} → ${trunc(bare(after), 60)}`;
    }
  }
  return redactContactInfo(s);
}

/**
 * Tag stage for structured changes (spec §6.2): the type is fixed by the diff (`details.changeType`);
 * the DecisionProvider only maps services (ads, jobs, GBP services) and says whether an ad is an offer.
 * Rank changes stay tenant-private and map their keyword to a service from the client's pack.
 */
export async function tagStructuredChange(deps: { db: Db; ai: Ai; packs: PackLoader }, changeId: string): Promise<StageOutcome<TagOutcome>> {
  return runStage(
    deps.db,
    { stage: TAG_STAGE, version: TAG_VERSION, subjectId: changeId },
    async () => {
      const [row] = await deps.db
        .select({ change: detectedChange, competitorName: competitor.name, capturedAt: capture.capturedAt, scannedAt: rankScan.finishedAt })
        .from(detectedChange)
        .innerJoin(competitor, eq(competitor.id, detectedChange.competitorId))
        .leftJoin(capture, eq(capture.id, detectedChange.afterCaptureId))
        .leftJoin(rankScan, eq(rankScan.id, detectedChange.rankScanId))
        .where(eq(detectedChange.id, changeId))
        .limit(1);
      if (!row) throw new Error(`detected_change ${changeId} not found`);
      if (row.change.status !== 'pending') return null;
      const c = row.change;
      const type = c.details.changeType as ChangeType | undefined;
      if (!type || !(CHANGE_TYPES as readonly string[]).includes(type)) throw new Error(`detected_change ${changeId} has no valid details.changeType`);
      const occurredAt = row.capturedAt ?? row.scannedAt;
      if (!occurredAt) throw new Error(`detected_change ${changeId} has no capture or finished rank scan`);

      const verticalIds = c.clientId
        ? (await deps.db.select({ v: client.verticalId }).from(client).where(eq(client.id, c.clientId))).map((r) => r.v)
        : await competitorVerticals(deps.db, c.competitorId);
      const packs = await Promise.all(verticalIds.map(deps.packs));
      // Usage is logged against the tenant for tenant-private (rank) changes; the null scope is reserved for global changes.
      const scope = c.clientId ? { agencyId: c.agencyId, clientId: c.clientId } : PLATFORM;
      const text = (c.afterText ?? c.beforeText ?? '').slice(0, MAX_STATE_TEXT);

      let services: Record<string, string | null> = Object.fromEntries(packs.map((p) => [p.id, null]));
      let confidence = 1;
      let needsReview: string[] = [];
      let answers: Record<string, unknown> = {};
      let modelOffer = false;
      if (type === 'rank_change') {
        services = Object.fromEntries(packs.map((p) => [p.id, serviceForKeyword(c.details.keyword ?? '', p)]));
      } else if (SERVICE_MAPPED_TYPES.has(type) && packs.length > 0) {
        const state = { competitor: row.competitorName, channel: c.source, change: type, text: redactContactInfo(text) };
        const result = await deps.ai.decide('decisions', state, buildStructuredQuestions(type, packs), scope);
        services = Object.fromEntries(
          packs.map((p) => {
            const v = result.answers[serviceQuestionKey(p.id)]?.value;
            return [p.id, typeof v === 'string' && p.services.some((s) => s.id === v) ? v : null];
          }),
        );
        const offer = result.answers.offer;
        modelOffer = offer?.type === 'noul' && offer.value === true;
        confidence = Math.min(...Object.values(result.answers).map((a) => a.confidence));
        needsReview = result.needsReview;
        answers = result.answers as Record<string, unknown>;
      }

      // Facts keep ~40 characters of context around each number: extract from redacted text so no phone/email lands in event.facts.
      const facts = type === 'ad_started' ? diffFacts([], extractNumericFacts(redactContactInfo(text))) : [];
      const money = facts.some((f) => MONEY_KINDS.has(f.kind));
      const details: ChangeDetails = type === 'ad_started' ? { ...c.details, offer: modelOffer || money } : c.details;
      const summary = buildStructuredSummary({ source: c.source, beforeText: c.beforeText, afterText: c.afterText, details: c.details });
      const zips = type === 'hiring' || type === 'new_location' || type === 'ad_started' ? extractZips(redactContactInfo(text)) : [];
      const { vectors } = await deps.ai.embed('embeddings', [summary], scope);
      const target = await findMergeTarget(
        deps,
        { competitorId: c.competitorId, clientId: c.clientId, captureId: c.afterCaptureId, changeType: type, services, facts, embedding: vectors[0] ?? null, occurredAt, text },
        scope,
      );
      return {
        needsReview, answers, target,
        values: {
          competitorId: c.competitorId, agencyId: c.agencyId, clientId: c.clientId, changeType: type, channels: [c.source], services, summary, facts, details, zips,
          embedding: vectors[0] ?? null, confidence, needsReview: needsReview.length > 0, occurredAt,
        } satisfies typeof changeEvent.$inferInsert,
      };
    },
    async (tx, computed) => {
      if (!computed) return { eventId: null, merged: false };
      if (computed.needsReview.length > 0) {
        await tx.insert(decisionReview).values({ subjectType: 'detected_change', subjectId: changeId, keys: computed.needsReview, answers: computed.answers });
      }
      const eventId = await writeEvent(tx, changeId, computed.values, computed.target);
      await tx.update(detectedChange).set({ status: 'event' }).where(eq(detectedChange.id, changeId));
      return { eventId, merged: computed.target !== null };
    },
  );
}
