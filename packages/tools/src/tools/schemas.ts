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

const ProspectRankView = z.object({ keyword: z.string(), found: z.number().int(), top3: z.number().int(), averageRank: z.number().nullable() });
const ProspectBusinessView = z.object({
  competitorId: uuid, name: z.string(), self: z.boolean(),
  gbp: z.object({ rating: z.number().nullable(), reviews: z.number().nullable(), category: z.string().nullable(), extraCategories: z.number().int() }).nullable(),
  ads: z.object({ google: z.number().int().nullable(), meta: z.number().int().nullable() }), ranks: z.array(ProspectRankView),
});
/** Zod mirror of `ProspectReportData` (5b-2 decision 11). */
export const ProspectReportDataView = z.object({
  generatedAt: iso, keywords: z.array(z.string()), points: z.number().int(), scanId: uuid.nullable(), businesses: z.array(ProspectBusinessView), notes: z.array(z.string()),
});
const ProspectReportStatus = z.enum(['running', 'ready', 'failed']);
export const ProspectReportView = z.object({
  id: uuid, status: ProspectReportStatus, createdAt: iso, finishedAt: iso.nullable(), error: z.string().nullable(), data: ProspectReportDataView.nullable(),
});
export type ProspectReportView = z.infer<typeof ProspectReportView>;
export const ProspectRow = z.object({
  clientId: uuid, name: z.string(), verticalId: z.string(), createdAt: iso, competitors: z.number().int(), keywords: z.number().int(), hasServiceArea: z.boolean(),
  report: z.object({ id: uuid, status: ProspectReportStatus, createdAt: iso }).nullable(),
});
export type ProspectRow = z.infer<typeof ProspectRow>;

/** 5c-1 workspace: one scored event as a client sees it (decision 3). */
export const EventRow = z.object({
  eventId: uuid, competitorId: uuid, competitorName: z.string(), changeType: z.string(), typeLabel: z.string(), channels: z.array(z.string()), summary: z.string(),
  score: z.number().int(), route: z.enum(['alert', 'brief', 'archive']), serviceId: z.string().nullable(), serviceName: z.string().nullable(),
  occurredAt: iso, scoredAt: iso, evidenceCount: z.number().int(),
});
export type EventRow = z.infer<typeof EventRow>;
export const FactView = z.object({ kind: z.string(), before: z.string().nullable(), after: z.string().nullable(), pct: z.number().nullable() });
export type FactView = z.infer<typeof FactView>;
export const DetailLineView = z.object({ label: z.string(), value: z.string() });
export const ScoreFactorsView = z.object({
  typeWeight: z.number(), size: z.number(), relevance: z.number(), serviceOverlap: z.number(), territoryOverlap: z.number(), novelty: z.number(),
  thresholds: z.object({ alert: z.number(), brief: z.number() }),
});
export type ScoreFactorsView = z.infer<typeof ScoreFactorsView>;
export const ChangeView = z.object({
  changeId: uuid, channel: z.string(), channelLabel: z.string(), kind: z.string(), pageUrl: z.string().nullable(),
  beforeCaptureId: uuid.nullable(), afterCaptureId: uuid.nullable(), detectedAt: iso, hasTextDiff: z.boolean(),
});
export type ChangeView = z.infer<typeof ChangeView>;
/** 5c-1 Task 7: the viewer's own verdict on an event, via `submit_feedback`. */
export const FEEDBACK_VERDICTS = ['useful', 'not_relevant', 'wrong'] as const;
export const EventDetail = EventRow.extend({
  facts: z.array(FactView), details: z.array(DetailLineView), factors: ScoreFactorsView, changes: z.array(ChangeView),
  moves: z.array(z.object({ id: uuid, label: z.string(), status: z.string() })),
  myFeedback: z.enum(FEEDBACK_VERDICTS).nullable(),
});
export type EventDetail = z.infer<typeof EventDetail>;

// 5c-1 evidence (Task 4).
export const SnapshotSide = z.object({
  captureId: uuid, capturedAt: iso, status: z.string(),
  screenshot: z.object({ evidenceId: uuid, capturedAt: iso, fallback: z.boolean() }).nullable(),
  textEvidenceId: uuid.nullable(), hash: z.string().nullable(),
});
export type SnapshotSide = z.infer<typeof SnapshotSide>;
export const CompareView = z.object({
  changeId: uuid, eventId: uuid, channel: z.string(), channelLabel: z.string(), kind: z.string(), pageUrl: z.string().nullable(),
  before: SnapshotSide.nullable(), after: SnapshotSide.nullable(),
  diff: z.array(z.object({ op: z.enum(['equal', 'insert', 'delete']), text: z.string() })), facts: z.array(FactView), details: z.array(DetailLineView),
});
export type CompareView = z.infer<typeof CompareView>;
export const EvidenceView = z.object({
  evidenceId: uuid, kind: z.string(), sha256: z.string(), bytes: z.number().int(), contentType: z.string(), captureId: uuid, capturedAt: iso, captureStatus: z.string(),
  channel: z.string(), channelLabel: z.string(), url: z.string().nullable(), collectorVersion: z.string(), legalHold: z.boolean(),
  competitorId: uuid, competitorName: z.string(), servable: z.boolean(),
  citedBy: z.array(z.object({ eventId: uuid, summary: z.string(), typeLabel: z.string(), occurredAt: iso })),
});
export type EvidenceView = z.infer<typeof EvidenceView>;

// 5c-1 moves (Task 10): currently tracked competitors with at least one live event (decision 10).
export const MoveRow = z.object({
  id: uuid, competitorId: uuid, competitorName: z.string(), moveType: z.string(), label: z.string(),
  status: z.enum(['emerging', 'active', 'fading', 'closed']), confidence: z.number(), summary: z.string(), eventCount: z.number().int(),
  channels: z.array(z.string()), firstDetectedAt: iso, lastEvidenceAt: iso.nullable(), closedAt: iso.nullable(),
});
export type MoveRow = z.infer<typeof MoveRow>;
export const MoveDetail = MoveRow.extend({ facts: z.array(DetailLineView), events: z.array(EventRow) });
export type MoveDetail = z.infer<typeof MoveDetail>;

// 5c-1 competitor profile and timeline (Task 12).
export const CompetitorProfile = z.object({
  competitorId: uuid, name: z.string(), domain: z.string().nullable(), placeId: z.string().nullable(), addedAt: iso,
  gbp: z.object({ rating: z.number().nullable(), reviews: z.number().nullable(), category: z.string().nullable() }).nullable(), gbpAsOf: iso.nullable(),
  activeAds: z.object({ google: z.number().int(), meta: z.number().int() }), pressure: PressureView, openMoves: z.number().int(),
  sources: z.array(z.object({ source: z.string(), label: z.string(), active: z.boolean(), lastRunAt: iso.nullable(), lastStatus: z.string().nullable() })),
  pages: z.object({ active: z.number().int(), blocked: z.number().int() }),
});
export type CompetitorProfile = z.infer<typeof CompetitorProfile>;
export const TimelineItem = z.object({
  kind: z.enum(['event', 'move']), id: uuid, at: iso, title: z.string(), label: z.string(), score: z.number().int().nullable(),
  route: z.enum(['alert', 'brief', 'archive']).nullable(), status: z.string().nullable(),
});
export type TimelineItem = z.infer<typeof TimelineItem>;

// 5c-1 overview (Task 15). Ad points are null before the competitor's first ad check (decision 13).
export const AdActivityView = z.object({
  weeks: z.array(z.string()),
  series: z.array(z.object({ competitorId: uuid, name: z.string(), points: z.array(z.number().int().nullable()) })),
});
export type AdActivityView = z.infer<typeof AdActivityView>;
export const WorkspaceOverview = z.object({
  clientId: uuid, trackedCompetitors: z.number().int(), zips: z.number().int(),
  changes7d: z.number().int(), alerts7d: z.number().int(), priceMoves7d: z.number().int(), priceCuts7d: z.number().int(),
  activeAds: z.number().int().nullable(), activeAds7dAgo: z.number().int().nullable(),
  rating: z.object({ self: z.number().nullable(), competitorAverage: z.number().nullable() }),
  pressure: z.array(z.object({ competitorId: uuid, name: z.string(), pressure: PressureView })),
  pitchSnapshot: z.boolean(),
});
export type WorkspaceOverview = z.infer<typeof WorkspaceOverview>;

// 5c-1 alert rules (Task 18): a client score thresholds, or the pack defaults when none are set.
export const AlertRulesView = z.object({
  alert: z.number().int(), brief: z.number().int(), custom: z.boolean(),
  defaults: z.object({ alert: z.number().int(), brief: z.number().int() }),
});
export type AlertRulesView = z.infer<typeof AlertRulesView>;

// 5c-2 data views. A business is the client's own ('self') or a tracked competitor id.
export const BusinessKey = z.union([z.literal('self'), uuid]);

export const PriceNowView = z.object({ amount: z.number(), unit: z.string(), qualifier: z.enum(['exact', 'from', 'up_to']), promo: z.boolean(), since: iso });
export type PriceNowView = z.infer<typeof PriceNowView>;
export const PriceMatrixView = z.object({
  services: z.array(z.object({ id: z.string(), name: z.string(), offered: z.boolean() })),
  rows: z.array(z.object({
    competitorId: uuid, name: z.string(),
    cells: z.array(z.object({ serviceId: z.string(), prices: z.array(PriceNowView), change: z.object({ before: z.number(), after: z.number() }).nullable() })),
  })),
});
export type PriceMatrixView = z.infer<typeof PriceMatrixView>;

export const PriceHistoryView = z.object({
  serviceId: z.string(), serviceName: z.string(), labels: z.array(z.string()),
  series: z.array(z.object({ competitorId: uuid, name: z.string(), points: z.array(z.number().nullable()) })),
});
export type PriceHistoryView = z.infer<typeof PriceHistoryView>;
