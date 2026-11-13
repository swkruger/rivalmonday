import type { Ai, DecisionQuestion } from '@cs/ai';
import { redactForModel } from '@cs/collectors';
import { type CallScope, CHANGE_TYPES, type ChangeType, SITE_FEATURE_CATEGORY_LABEL, type SiteFeatureCategory, TIER_LABELS } from '@cs/core';
import { capture, type ChangeDetails, changeEvent, client, competitor, type Db, decisionReview, detectedChange, rankScan } from '@cs/db';
import type { VerticalPack } from '@cs/verticals';
import { and, eq } from 'drizzle-orm';
import { diffFacts, extractNumericFacts, MONEY_KINDS } from '../facts/numeric';
import { findMergeTarget, writeEvent } from '../merge/merge';
import { runStage, type StageOutcome } from '../stage';
import { GBP_STATUS_PHRASE } from '../structured/gbp-status';
import { humanizeAttribute } from '../structured/gbp';
import { serviceQuestionKey } from './questions';
import { competitorVerticals, extractZips, type PackLoader, singleVerticalScope, TAG_STAGE, TAG_VERSION, type TagOutcome } from './tag-stage';

const MAX_STATE_TEXT = 1500;

/** Web changes are text diffs unless the web channel stamped a `details.changeType` (site_feature, new_page, 18a-2). */
export const isStructuredChange = (c: { source: string; details: ChangeDetails }): boolean => c.source !== 'web' || typeof c.details?.changeType === 'string';

export const STRUCTURED_DECISION_TASK = 'structured_decisions';

/** Structured change types whose text names a service (ad copy, job titles, GBP categories/services): ask the service mapping. */
export const SERVICE_MAPPED_TYPES: ReadonlySet<ChangeType> = new Set<ChangeType>(['ad_started', 'ad_stopped', 'hiring', 'new_service', 'service_removed', 'new_page']);
/** 18b-1: a new Google post (single, not the `gbp_post:more` aggregate) is service-mapped like an ad; web promos and content are not. */
export const isMappedPost = (type: ChangeType, d: ChangeDetails): boolean => (type === 'promo' || type === 'content') && d.field === 'post' && !!d.postId;
export const OFFER_QUESTION =
  'Does this ad copy advertise a specific offer — a price, discount, coupon, financing deal, free add-on or limited-time promotion — rather than general branding?';

const CHANNEL_LABEL: Record<string, string> = { meta_ads: 'Meta', google_ads: 'Google' };
const trunc = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
/** `YYYY-MM-DD` → "Dec 4" (UTC, so the stored calendar date never shifts). */
const monthDay = (ymd: string | undefined) =>
  ymd ? new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
const pct = (x: number | undefined) => `${Math.round((x ?? 0) * 100)}%`;
/** gbp.ts stores scalar fields as "<field>: <value>"; strips that label, when present, to get the bare value. */
const stripFieldLabel = (field: string | undefined, text: string): string => {
  const label = `${field ?? ''}: `;
  return field && text.startsWith(label) ? text.slice(label.length) : text;
};

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
export function buildStructuredSummary(change: { source: string; beforeText: string | null; afterText: string | null; details: ChangeDetails }, businessNames: readonly (string | null)[] = []): string {
  const d = change.details;
  const first = d.items?.[0]?.label ?? '';
  const more = (d.count ?? 0) > 1 ? ` and ${(d.count ?? 0) - 1} more` : '';
  const before = change.beforeText ?? '';
  const after = change.afterText ?? '';
  const adWord = CHANNEL_LABEL[change.source] ? `${CHANNEL_LABEL[change.source]} ad` : 'ad';
  let s: string;
  if ((d.changeType === 'promo' || d.changeType === 'content') && d.field === 'post') {
    s = d.postId
      ? `${d.changeType === 'promo' ? 'Posted an offer on Google' : 'Posted on Google'}: "${trunc(after, 80)}"`
      : `Posted ${d.count ?? 0} more updates on Google`;
    return redactForModel(s, { businessNames });
  }
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
      s = `${d.platform === 'tripadvisor' ? 'Tripadvisor' : 'Google'} rating ${d.ratingBefore} → ${d.ratingAfter}${d.votesAfter != null ? ` (${d.votesAfter} reviews)` : ''}`;
      break;
    case 'review_spike':
      s = d.topic
        ? `Complaints about ${d.topicName ?? d.topic} up: ${d.count} in ${d.windowDays} days vs ${d.baselineMean} a month before`
        : `${d.count} new Google reviews in ${d.windowDays} days (${d.z}σ above the usual ${d.baselineMean}/week)${d.avgRating != null ? `, average rating ${d.avgRating}` : ''}`;
      break;
    case 'rank_change':
      if (d.surface === 'organic') {
        s = d.direction === 'entered' ? `Now on page one of Google for "${d.keyword}" (position ${d.position})` : `Dropped off page one of Google for "${d.keyword}"`;
        break;
      }
      s = `"${d.keyword}": average map position ${d.avgRankBefore} → ${d.avgRankAfter}, top-3 share ${pct(d.top3Before)} → ${pct(d.top3After)}`;
      break;
    case 'audience_growth':
      s = `Facebook Page likes grew ${d.pct}% (${(d.likesBefore ?? 0).toLocaleString('en-US')} → ${(d.likesAfter ?? 0).toLocaleString('en-US')}) in ${d.days} days`;
      break;
    case 'tier_change':
      s = `Now rated "${d.to ? TIER_LABELS[d.to] : after}" (was "${d.from ? TIER_LABELS[d.from] : before}")`;
      break;
    case 'status_change': {
      const phrase = (raw: string | undefined) => GBP_STATUS_PHRASE[(raw ?? '').replace(/^status:\s*/, '').toLowerCase()] ?? 'open';
      s = d.direction === 'reopened'
        ? `Google Business Profile reopened (was ${phrase(d.statusBefore ?? before)})`
        : `Google Business Profile marked ${phrase(d.statusAfter ?? after)}`;
      break;
    }
    case 'profile_change':
      // 18b-1: booking link, attributes and photo push (copy decided in the 18b-1 spec § Copy). Added = no before text, removed = no after text.
      if (d.field === 'booking') {
        s = !change.beforeText ? 'Added an online booking link to its Google profile'
          : !change.afterText ? 'Removed the online booking link from its Google profile'
          : 'Changed the online booking link on its Google profile';
        break;
      }
      if (d.field === 'attribute') {
        const label = humanizeAttribute(stripFieldLabel(d.field, change.afterText ?? change.beforeText ?? ''));
        s = change.beforeText ? `Google profile no longer shows "${label}"` : `Google profile now shows "${label}"`;
        break;
      }
      if (d.field === 'photos') {
        s = `Added ${d.count ?? 0} photos to its Google profile in ${d.days ?? 0} days`;
        break;
      }
      s = d.field === 'hours' || d.field === 'description'
        ? `Changed its ${d.field} on Google: ${trunc(stripFieldLabel(d.field, before), 60)} → ${trunc(stripFieldLabel(d.field, after), 60)}`
        : `Google Business Profile ${d.field ?? 'profile'} changed: ${trunc(stripFieldLabel(d.field, before), 60)} → ${trunc(stripFieldLabel(d.field, after), 60)}`;
      break;
    case 'site_feature': {
      // Category label only: the vendor stays in details.vendor and never reaches a summary (Ruling J1).
      const label = SITE_FEATURE_CATEGORY_LABEL[d.category as SiteFeatureCategory] ?? 'a tool';
      s = d.direction === 'removed' ? `Removed ${label} from its website` : `Added ${label} to its website`;
      break;
    }
    case 'new_page': {
      let path = '';
      try { path = d.pageUrl ? new URL(d.pageUrl).pathname : ''; } catch { path = d.pageUrl ?? ''; }
      s = `Added a new page to its website: "${trunc(d.items?.[0]?.label || path || 'untitled', 80)}"`;
      break;
    }
    case 'citation_added':
      s = `Now found on ${d.label ?? d.directory} in Google search`;
      break;
    case 'event_listed': {
      // 18d § Copy: the aggregate (no eventKey) counts the rest; afterText is a placeholder, never client text.
      if (!d.eventKey && d.count !== undefined) {
        s = `Listed ${d.count} more events`;
        break;
      }
      const name = trunc(d.eventName ?? '', 80);
      const date = monthDay(d.startDate);
      s = d.lifecycle === 'cancelled' ? `Cancelled its event "${name}" (${date})`
        : d.lifecycle === 'postponed' ? `Postponed its event "${name}" (was ${date})`
        : d.lifecycle === 'sold_out' ? `Sold out its event "${name}" (${date})`
        : d.source === 'google_panel' ? `Google shows an upcoming event: "${name}" on ${date}`
        : `Listed an event: "${name}" on ${date}`;
      break;
    }
    default: {
      s = `Google Business Profile ${d.field ?? 'profile'} changed: ${trunc(stripFieldLabel(d.field, before), 60)} → ${trunc(stripFieldLabel(d.field, after), 60)}`;
    }
  }
  return redactForModel(s, { businessNames });
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
      // A tier change happened when the signals job ran (block_key tier:YYYY-MM-DD), not when the latest done scan finished.
      const tierDay = type === 'tier_change' ? /^tier:(\d{4}-\d{2}-\d{2})$/.exec(c.blockKey ?? '')?.[1] : undefined;
      const tierAt = tierDay ? new Date(`${tierDay}T00:00:00Z`) : null;
      const occurredAt = (tierAt && !Number.isNaN(tierAt.getTime()) ? tierAt : null) ?? row.capturedAt ?? row.scannedAt;
      if (!occurredAt) throw new Error(`detected_change ${changeId} has no capture or finished rank scan`);

      const verticalIds = c.clientId
        ? (await deps.db.select({ v: client.verticalId }).from(client).where(eq(client.id, c.clientId))).map((r) => r.v)
        : await competitorVerticals(deps.db, c.competitorId);
      const packs = await Promise.all(verticalIds.map(deps.packs));
      // Usage is logged against the tenant for tenant-private (rank) changes; the null scope is reserved for global changes.
      const scope: CallScope = c.clientId ? { agencyId: c.agencyId, clientId: c.clientId, ...(verticalIds.length === 1 ? { verticalId: verticalIds[0]! } : {}) } : singleVerticalScope(verticalIds);
      const text = (c.afterText ?? c.beforeText ?? '').slice(0, MAX_STATE_TEXT);

      // A GBP title rename's new (and old) public name must never be mistaken for a person — it's
      // the business's own name, just not yet (or no longer) the one stored on the competitor row.
      const names: (string | null)[] = [row.competitorName];
      if (c.details.field === 'title') {
        if (c.beforeText) names.push(stripFieldLabel(c.details.field, c.beforeText));
        if (c.afterText) names.push(stripFieldLabel(c.details.field, c.afterText));
      }
      const clean = redactForModel(text, { businessNames: names });

      let services: Record<string, string | null> = Object.fromEntries(packs.map((p) => [p.id, null]));
      let confidence = 1;
      let needsReview: string[] = [];
      let answers: Record<string, unknown> = {};
      let sampleId: string | null = null;
      let modelOffer = false;
      if (type === 'rank_change') {
        services = Object.fromEntries(packs.map((p) => [p.id, serviceForKeyword(c.details.keyword ?? '', p)]));
      } else if ((SERVICE_MAPPED_TYPES.has(type) || isMappedPost(type, c.details)) && packs.length > 0) {
        const state = { competitor: row.competitorName, channel: c.source, change: type, text: clean };
        const result = await deps.ai.decide(STRUCTURED_DECISION_TASK, state, buildStructuredQuestions(type, packs), scope);
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
        sampleId = result.sampleId ?? null;
      }

      // Facts keep ~40 characters of context around each number: extract from redacted text so no phone/email lands in event.facts.
      const facts = type === 'ad_started' ? diffFacts([], extractNumericFacts(clean)) : [];
      const money = facts.some((f) => MONEY_KINDS.has(f.kind));
      const details: ChangeDetails = type === 'ad_started' ? { ...c.details, offer: modelOffer || money } : c.details;
      const summary = buildStructuredSummary({ source: c.source, beforeText: c.beforeText, afterText: c.afterText, details: c.details }, names);
      const zips = type === 'hiring' || type === 'new_location' || type === 'ad_started' ? extractZips(clean) : [];
      const { vectors } = await deps.ai.embed('embeddings', [summary], scope);
      const target = await findMergeTarget(
        deps,
        { competitorId: c.competitorId, clientId: c.clientId, captureId: c.afterCaptureId, changeType: type, services, facts, embedding: vectors[0] ?? null, occurredAt, text, businessNames: names },
        scope,
      );
      return {
        needsReview, answers, sampleId, target,
        values: {
          competitorId: c.competitorId, agencyId: c.agencyId, clientId: c.clientId, changeType: type, channels: [c.source], services, summary, facts, details, zips,
          embedding: vectors[0] ?? null, confidence, needsReview: needsReview.length > 0, occurredAt,
        } satisfies typeof changeEvent.$inferInsert,
      };
    },
    async (tx, computed) => {
      if (!computed) return { eventId: null, merged: false };
      // Claim the transition first: a diff at a stage-version bump may have superseded the change while the model ran.
      const [claimed] = await tx
        .update(detectedChange)
        .set({ status: 'event' })
        .where(and(eq(detectedChange.id, changeId), eq(detectedChange.status, 'pending')))
        .returning({ id: detectedChange.id });
      if (!claimed) return { eventId: null, merged: false };
      if (computed.needsReview.length > 0) {
        await tx.insert(decisionReview).values({ subjectType: 'detected_change', subjectId: changeId, keys: computed.needsReview, answers: computed.answers, sampleId: computed.sampleId });
      }
      const eventId = await writeEvent(tx, changeId, computed.values, computed.target);
      return { eventId, merged: computed.target !== null };
    },
  );
}
