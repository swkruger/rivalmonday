import type { DecisionQuestion, DecisionResult } from '@cs/ai';
import { redactContactInfo } from '@cs/collectors';
import type { ChangeType } from '@cs/core';
import type { NumericChange } from '@cs/db';
import type { VerticalPack } from '@cs/verticals';
import { MONEY_KINDS } from '../facts/numeric';

/** Change types a website diff can show (ads/reviews types come from structured sources in Phase 3b). */
export const WEB_CHANGE_TYPES = [
  'price_change', 'promo', 'new_service', 'service_removed', 'service_area_change', 'new_location', 'hiring', 'content', 'cosmetic',
] as const satisfies readonly ChangeType[];
export type WebChangeType = (typeof WEB_CHANGE_TYPES)[number];

export const CHANGE_TYPE_OPTIONS: Record<WebChangeType, string> = {
  price_change: 'A price, fee or rate for a service changed, appeared or disappeared',
  promo: 'A special offer, coupon, discount, financing offer or seasonal promotion',
  new_service: 'The business now offers a service it did not list before',
  service_removed: 'The business no longer lists a service',
  service_area_change: 'Towns, cities, ZIP codes or areas served changed',
  new_location: 'A new office, branch or location',
  hiring: 'Job openings or a hiring announcement',
  content: 'Other meaningful content: policies, guarantees, hours, credentials, team',
  cosmetic: 'Wording, formatting, typos, testimonials, post dates or reordering with no business meaning',
};

const MEANINGFUL =
  'Does this change on a local service business website matter to a competing business — prices, offers, services, areas served, locations, hiring, policies or guarantees — rather than being cosmetic (rewording, formatting, typos, testimonials, post dates, reordering)?';

export const serviceQuestionKey = (verticalId: string) => `service_${verticalId}`;

export function buildTagQuestions(packs: VerticalPack[]): Record<string, DecisionQuestion> {
  const questions: Record<string, DecisionQuestion> = {
    meaningful: { type: 'noul', instructions: MEANINGFUL },
    change_type: { type: 'choice', instructions: 'Which kind of change is this?', options: CHANGE_TYPE_OPTIONS },
  };
  for (const pack of packs) {
    if (pack.services.length > 254) throw new Error(`Vertical ${pack.id} has more than 254 services (choice limit with "none")`);
    questions[serviceQuestionKey(pack.id)] = {
      type: 'choice',
      instructions: `Which ${pack.name} service does this change concern? Answer "none" if it concerns no single service.`,
      options: {
        none: 'No single service, or general',
        ...Object.fromEntries(pack.services.map((s) => [s.id, s.aliases.length > 0 ? `${s.name} (${s.aliases.join(', ')})` : s.name])),
      },
    };
  }
  return questions;
}

export interface TagStateInput {
  competitorName: string;
  pageUrl: string | null;
  pageType: string | null;
  kind: string;
  beforeText: string | null;
  afterText: string | null;
  numericChanges: NumericChange[];
}

const MAX_STATE_TEXT = 1500;
const clean = (t: string | null) => (t === null ? null : redactContactInfo(t).slice(0, MAX_STATE_TEXT));
const showFact = (f: NumericChange['before']) => (f ? f.raw : 'none');

export function describeNumeric(n: NumericChange): string {
  return `${n.kind}: ${showFact(n.before)} → ${showFact(n.after)}${n.pct !== null ? ` (${n.pct > 0 ? '+' : ''}${n.pct}%)` : ''}`;
}

/** Decision state. Untrusted scraped text: redacted (spec §4.5) and length-capped. */
export function buildTagState(input: TagStateInput): Record<string, unknown> {
  return {
    competitor: input.competitorName,
    page_url: input.pageUrl,
    page_type: input.pageType,
    change: input.kind,
    before: clean(input.beforeText),
    after: clean(input.afterText),
    numeric_changes: input.numericChanges.map(describeNumeric),
  };
}

export interface TagResolution {
  meaningful: boolean;
  type: ChangeType;
  services: Record<string, string | null>;
  confidence: number;
  needsReview: string[];
}

export function resolveTag(numeric: NumericChange[], result: DecisionResult<string>, packs: VerticalPack[]): TagResolution {
  const a = result.answers;
  const forced = numeric.length > 0; // spec §6.1: any numeric change is always flagged
  const money = numeric.some((n) => MONEY_KINDS.has(n.kind));
  const rawType = String(a.change_type?.value ?? 'content');
  let type: ChangeType = (WEB_CHANGE_TYPES as readonly string[]).includes(rawType) ? (rawType as ChangeType) : 'content';
  const meaningful = forced || (a.meaningful?.type === 'noul' ? a.meaningful.value : true);
  if (money && (type === 'cosmetic' || type === 'content')) type = numeric.some((n) => n.kind === 'price') ? 'price_change' : 'promo';
  if (meaningful && type === 'cosmetic') type = 'content';
  if (!meaningful) type = 'cosmetic';
  const services = Object.fromEntries(
    packs.map((p) => {
      const v = a[serviceQuestionKey(p.id)]?.value;
      return [p.id, typeof v === 'string' && p.services.some((s) => s.id === v) ? v : null];
    }),
  );
  const counted = Object.entries(a).filter(([k]) => !(forced && k === 'meaningful')).map(([, v]) => v.confidence);
  return {
    meaningful,
    type,
    services,
    confidence: counted.length > 0 ? Math.min(...counted) : 1,
    needsReview: result.needsReview.filter((k) => !(forced && k === 'meaningful')),
  };
}
