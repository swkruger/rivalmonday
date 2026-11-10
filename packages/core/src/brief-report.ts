import { z } from 'zod';

export const GRADES = ['major', 'notable', 'minor'] as const;
export type Grade = (typeof GRADES)[number];
export const GRADE_LABEL: Record<Grade, string> = { major: 'Major', notable: 'Notable', minor: 'Minor' };

export const REPORT_TOPICS = ['reviews', 'ads', 'rankings', 'offers', 'moves'] as const;
export type ReportTopic = (typeof REPORT_TOPICS)[number];
export const TOPIC_LABEL: Record<ReportTopic, string> = {
  reviews: 'Reviews & rating', ads: 'Ads', rankings: 'Rankings & listings', offers: 'Website, prices & services', moves: 'Moves',
};

/** Major at or above the threshold, Notable from half of it, Minor below. */
export const gradeFor = (score: number, t: number): Grade => (score >= t ? 'major' : score >= t / 2 ? 'notable' : 'minor');

/** Report topic of a change type; 'moves' is only for move-based items and is never returned here. */
export const topicOf = (changeType: string): ReportTopic => {
  switch (changeType) {
    case 'rating_change':
    case 'review_spike':
      return 'reviews';
    case 'ad_started':
    case 'ad_stopped':
      return 'ads';
    case 'rank_change':
    case 'citation_added':
      return 'rankings';
    default:
      return 'offers';
  }
};

export const ChangeLine = z.object({
  grade: z.enum(GRADES),
  topic: z.enum(REPORT_TOPICS),
  competitorId: z.uuid(),
  competitorName: z.string(),
  changeType: z.string(),
  channel: z.string().nullable(),
  count: z.number().int().min(1),
  text: z.string().max(400),
  firstAt: z.iso.datetime(),
  lastAt: z.iso.datetime(),
  eventIds: z.array(z.uuid()).min(1),
  evidenceIds: z.array(z.uuid()),
});
export type ChangeLine = z.infer<typeof ChangeLine>;

export const GradeTotals = z.object({ major: z.number().int(), notable: z.number().int(), minor: z.number().int() });
export type GradeTotals = z.infer<typeof GradeTotals>;

export const GradedChanges = z.object({ v: z.literal(1), threshold: z.number(), lines: z.array(ChangeLine), totals: GradeTotals });
export type GradedChanges = z.infer<typeof GradedChanges>;

/** Client-facing view: no threshold or score. */
export const GradedChangesView = z.object({ lines: z.array(ChangeLine), totals: GradeTotals });
export type GradedChangesView = z.infer<typeof GradedChangesView>;

/** `lines` = Major one-liners + Notable (P2). */
export const REPORT_CAPS = { app: { lines: 10, minor: 20 }, pdf: { lines: 12, minor: 12 }, emailLines: 3 } as const;

export function capTopic(
  lines: ChangeLine[],
  topic: ReportTopic,
  caps: { lines: number; minor: number },
): { lines: ChangeLine[]; moreLines: number; minor: ChangeLine[]; moreMinor: number } {
  const inTopic = lines.filter((l) => l.topic === topic);
  const major = inTopic.filter((l) => l.grade === 'major');
  const notable = inTopic.filter((l) => l.grade === 'notable');
  const minor = inTopic.filter((l) => l.grade === 'minor');
  const main = [...major, ...notable];
  return {
    lines: main.slice(0, caps.lines),
    moreLines: Math.max(0, main.length - caps.lines),
    minor: minor.slice(0, caps.minor),
    moreMinor: Math.max(0, minor.length - caps.minor),
  };
}

/** Event counts per grade (line.count), plus the live events of written items added to major. */
export function totalsOf(lines: ChangeLine[], writtenMajorEvents: number): GradeTotals {
  const t: GradeTotals = { major: writtenMajorEvents, notable: 0, minor: 0 };
  for (const l of lines) t[l.grade] += l.count;
  return t;
}

/** One chart line: `points` oldest → newest, `null` = no data at that point (never 0). Same shape as the web LineChart series. */
export const ChartSeries = z.object({ key: z.string(), name: z.string(), points: z.array(z.number().nullable()), you: z.boolean().optional() });
export type ChartSeries = z.infer<typeof ChartSeries>;

/** One business's map-pack position on one keyword of a scan; `avgRank` null when the business cannot be matched. */
export const RankMetric = z.object({ avgRank: z.number().nullable(), top3Share: z.number(), points: z.number() });
export type RankMetric = z.infer<typeof RankMetric>;

const iso = z.iso.datetime();
const count = z.number().int().min(0);

/** Spec §4.4: the weekly report snapshot, built at generation and stored on `brief.report`. */
export const BriefReport = z.object({
  v: z.literal(1),
  asOf: iso,
  changes: GradedChanges,
  kpis: z.object({
    changes7d: count, alerts7d: count, priceMoves7d: count, priceCuts7d: count,
    activeAds: count.nullable(), activeAds7dAgo: count.nullable(),
    ratingSelf: z.number().nullable(), ratingAvg: z.number().nullable(),
    weekly: z.object({ changes: z.array(count).length(8), priceMoves: z.array(count).length(8), activeAds: z.array(count.nullable()).length(8) }),
  }),
  pressure: z.array(z.object({
    competitorId: z.uuid(), name: z.string(), score: z.number().min(0).max(100), level: z.enum(['low', 'elevated', 'high']), reason: z.string().nullable(),
  })).max(5),
  rating: z.object({ months: z.array(z.string()).length(12), series: z.array(ChartSeries) }),
  ads: z.object({ weeks: z.array(z.string()).length(12), series: z.array(ChartSeries) }),
  rankings: z.object({
    scanAt: iso,
    prevScanAt: iso.nullable(),
    keywords: z.array(z.object({
      keyword: z.string(), you: RankMetric, prev: RankMetric.nullable(), rivals: z.array(z.object({ name: z.string(), metric: RankMetric })).max(2),
    })).max(5),
    map: z.object({
      keyword: z.string(), objectKey: z.string(),
      bounds: z.object({ west: z.number(), south: z.number(), east: z.number(), north: z.number() }),
      width: z.number().int(), height: z.number().int(),
      points: z.array(z.object({ lat: z.number(), lng: z.number(), rank: z.number().nullable() })),
    }).nullable(),
  }).nullable(),
  moves: z.array(z.object({ id: z.uuid(), competitorName: z.string(), moveType: z.string(), label: z.string(), status: z.string(), firstDetectedAt: iso })).max(6),
  recommendations: z.array(z.object({ id: z.uuid(), title: z.string(), status: z.enum(['todo', 'in_progress']), createdThisWeek: z.boolean() })).max(8),
  alerts: z.array(z.object({ headline: z.string(), competitorName: z.string(), deliveredAt: iso })).max(5),
});
export type BriefReport = z.infer<typeof BriefReport>;
