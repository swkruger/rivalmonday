import { z } from 'zod';

const iso = z.string();
const uuid = z.string().uuid();

export const ClientSummary = z.object({ id: uuid, name: z.string(), verticalId: z.string(), timezone: z.string(), status: z.enum(['active', 'prospect']) });
export type ClientSummary = z.infer<typeof ClientSummary>;

export const ServiceAreaInput = z.object({
  center: z.object({ lat: z.number(), lng: z.number() }),
  radiusKm: z.number(),
  zips: z.array(z.string()).max(200),
  towns: z.array(z.string()).max(60).optional(),
});
export type ServiceAreaInput = z.infer<typeof ServiceAreaInput>;

export const ClientProfile = ClientSummary.extend({
  services: z.array(z.string()),
  keywords: z.array(z.string()),
  features: z.array(z.string()),
  serviceArea: ServiceAreaInput.nullable(),
  placeId: z.string().nullable(),
  /** Agency roles only (decision 10); null for client roles. */
  alertMode: z.enum(['direct', 'after_am_check', 'digest_only']).nullable(),
  briefAutoSend: z.boolean().nullable(),
});
export type ClientProfile = z.infer<typeof ClientProfile>;

export const BriefSummary = z.object({
  id: uuid, clientId: uuid, deliveryDate: z.string(), status: z.string(), kind: z.string(), summary: z.string(), sentAt: iso.nullable(), hasPdf: z.boolean(),
});
export type BriefSummary = z.infer<typeof BriefSummary>;

export const BriefItemView = z.object({
  id: uuid, ord: z.number().int(), competitorId: uuid, competitorName: z.string(), headline: z.string(), whatChanged: z.string(), whyItMatters: z.string(),
  recommendedAction: z.string(), confidence: z.number(), effort: z.string(), impact: z.string(), evidenceIds: z.array(z.string()), status: z.string(),
  /** Agency-only (spec §8.5): always null for client roles. */
  upsellTag: z.string().nullable(),
});
export type BriefItemView = z.infer<typeof BriefItemView>;

export const BriefDetail = BriefSummary.extend({ periodStart: iso, periodEnd: iso, approvedAt: iso.nullable(), items: z.array(BriefItemView) });
export type BriefDetail = z.infer<typeof BriefDetail>;

export const BriefQueueRow = z.object({
  briefId: uuid, clientId: uuid, clientName: z.string(), deliveryDate: z.string(), status: z.string(), kind: z.string(),
  activeItems: z.number().int(), droppedItems: z.number().int(), touched: z.boolean(), autoSend: z.boolean(),
});
export type BriefQueueRow = z.infer<typeof BriefQueueRow>;
export const BriefReview = BriefDetail.extend({ clientName: z.string(), autoSend: z.boolean(), touched: z.boolean(), factCheck: z.object({ items: z.number().int(), sentences: z.number().int() }) });
export type BriefReview = z.infer<typeof BriefReview>;

export const AlertSummary = z.object({
  id: uuid, clientId: uuid, competitorName: z.string(), headline: z.string(), score: z.number(), status: z.string(), createdAt: iso, deliveredAt: iso.nullable(),
});
export type AlertSummary = z.infer<typeof AlertSummary>;

export const AlertDetail = AlertSummary.extend({ body: z.string(), evidenceIds: z.array(z.string()), written: z.string().nullable() });
export type AlertDetail = z.infer<typeof AlertDetail>;

export const AlertQueueRow = z.object({
  id: uuid, clientId: uuid, clientName: z.string(), competitorName: z.string(), headline: z.string(), body: z.string(), score: z.number(), status: z.string(),
  heldForDigest: z.boolean(), written: z.string().nullable(), evidenceCount: z.number().int(), createdAt: iso,
});
export type AlertQueueRow = z.infer<typeof AlertQueueRow>;

export const ReportSummary = z.object({ id: uuid, clientId: uuid, quarter: z.string(), status: z.string(), sentAt: iso.nullable(), hasPdf: z.boolean() });
export type ReportSummary = z.infer<typeof ReportSummary>;

export const ReportDetail = ReportSummary.extend({ periodStart: iso, periodEnd: iso, data: z.record(z.string(), z.unknown()).nullable() });
export type ReportDetail = z.infer<typeof ReportDetail>;

export const SuggestionView = z.object({
  id: uuid, name: z.string(), domain: z.string().nullable(), placeId: z.string().nullable(), rating: z.number().nullable(), votes: z.number().nullable(),
  appearances: z.number(), bestRank: z.number().nullable(), overlapScore: z.number(),
});
export type SuggestionView = z.infer<typeof SuggestionView>;

export const TrackedCompetitor = z.object({ id: uuid, name: z.string(), domain: z.string().nullable(), placeId: z.string().nullable(), addedAt: iso, activePages: z.number().int() });
export type TrackedCompetitor = z.infer<typeof TrackedCompetitor>;

export const TrackedPageView = z.object({
  id: uuid, url: z.string(), pageType: z.string(), source: z.string(), pinned: z.boolean(), active: z.boolean(), cadence: z.string(), lastCapturedAt: iso.nullable(),
});
export type TrackedPageView = z.infer<typeof TrackedPageView>;

export const listInput = (max: number) => z.object({ clientId: uuid, limit: z.number().int().min(1).max(max).default(Math.min(20, max)) });
export const toIso = (d: Date | null) => (d ? d.toISOString() : null);

export const RecommendationView = z.object({
  id: uuid, title: z.string(), rationale: z.string(), effort: z.string(), impact: z.string(), owner: z.string(), status: z.enum(['todo', 'in_progress', 'done', 'dismissed']),
  dismissReason: z.string().nullable(), dueAt: iso.nullable(), source: z.string(), evidenceIds: z.array(z.string()), upsellTag: z.string().nullable(), createdAt: iso, updatedAt: iso,
});
export type RecommendationView = z.infer<typeof RecommendationView>;

export const SpendView = z.object({ monthToDateUsd: z.number(), capUsd: z.number(), ratio: z.number(), level: z.enum(['ok', 'warning', 'over']) });
export type SpendView = z.infer<typeof SpendView>;

export const UsageRow = z.object({
  clientId: uuid, name: z.string(), status: z.enum(['active', 'prospect']), spend: SpendView, competitorLimit: z.number().int(), competitors: z.number().int(),
  /** Decision 6: Ask arrives in Phase 6 — always null for now. */
  questions: z.object({ used: z.null(), quota: z.null() }),
});
export type UsageRow = z.infer<typeof UsageRow>;

export const PlaybookView = z.object({
  id: z.string(), trigger: z.string(), packTitle: z.string(), packTemplate: z.string(), title: z.string(), template: z.string(),
  overridden: z.boolean(), disabled: z.boolean(), updatedAt: iso.nullable(),
});
export type PlaybookView = z.infer<typeof PlaybookView>;
export const PlaybookVertical = z.object({ id: z.string(), name: z.string(), playbooks: z.array(PlaybookView) });
export type PlaybookVertical = z.infer<typeof PlaybookVertical>;

export const PressureView = z.object({ score: z.number().int(), level: z.enum(['low', 'elevated', 'high']), reasons: z.array(z.string()) });
export const PortfolioRow = z.object({
  clientId: uuid, name: z.string(), verticalId: z.string(), pressure: PressureView, topCompetitor: z.string().nullable(),
  alertsPending: z.number().int(), alertsDelivered7d: z.number().int(), briefToApprove: z.object({ id: uuid, deliveryDate: z.string() }).nullable(),
  openRecommendations: z.number().int(), lastActivityAt: iso.nullable(), spend: SpendView,
});
export type PortfolioRow = z.infer<typeof PortfolioRow>;

export const ReviewQuestionView = z.object({
  key: z.string(), type: z.enum(['noul', 'choice', 'score']), instructions: z.string(),
  options: z.array(z.object({ value: z.string(), label: z.string() })), modelAnswer: z.string().nullable(), confidence: z.number().nullable(),
});
export type ReviewQuestionView = z.infer<typeof ReviewQuestionView>;
export const DecisionReviewView = z.object({
  id: uuid, createdAt: iso, competitorName: z.string(), source: z.string(), kind: z.string(), beforeText: z.string().nullable(), afterText: z.string().nullable(),
  questions: z.array(ReviewQuestionView),
});
export type DecisionReviewView = z.infer<typeof DecisionReviewView>;

export const ThemeProposalView = z.object({
  id: uuid, verticalId: z.string(), verticalName: z.string(), themeId: z.string(), name: z.string(), description: z.string(),
  status: z.enum(['proposed', 'approved', 'rejected']), otherCount: z.number().int(), createdAt: iso, decidedAt: iso.nullable(), samples: z.array(z.string()),
});
export type ThemeProposalView = z.infer<typeof ThemeProposalView>;
