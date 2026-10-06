import { z } from 'zod';

const iso = z.string();
const uuid = z.string().uuid();

export const ClientSummary = z.object({ id: uuid, name: z.string(), verticalId: z.string(), timezone: z.string() });
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

export const AlertSummary = z.object({
  id: uuid, clientId: uuid, competitorName: z.string(), headline: z.string(), score: z.number(), status: z.string(), createdAt: iso, deliveredAt: iso.nullable(),
});
export type AlertSummary = z.infer<typeof AlertSummary>;

export const AlertDetail = AlertSummary.extend({ body: z.string(), evidenceIds: z.array(z.string()), written: z.string().nullable() });
export type AlertDetail = z.infer<typeof AlertDetail>;

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

export const PressureView = z.object({ score: z.number().int(), level: z.enum(['low', 'elevated', 'high']), reasons: z.array(z.string()) });
export const PortfolioRow = z.object({
  clientId: uuid, name: z.string(), verticalId: z.string(), pressure: PressureView, topCompetitor: z.string().nullable(),
  alertsPending: z.number().int(), alertsDelivered7d: z.number().int(), briefToApprove: z.object({ id: uuid, deliveryDate: z.string() }).nullable(),
  openRecommendations: z.number().int(), lastActivityAt: iso.nullable(),
});
export type PortfolioRow = z.infer<typeof PortfolioRow>;
