import { z } from 'zod';

export const GRADES = ['major', 'notable', 'minor'] as const;
export type Grade = (typeof GRADES)[number];
export const GRADE_LABEL: Record<Grade, string> = { major: 'Major', notable: 'Notable', minor: 'Minor' };

export const REPORT_TOPICS = ['reviews', 'ads', 'rankings', 'offers', 'moves'] as const;
export type ReportTopic = (typeof REPORT_TOPICS)[number];
export const TOPIC_LABEL: Record<ReportTopic, string> = {
  reviews: 'Reviews & rating', ads: 'Ads', rankings: 'Map rankings', offers: 'Website, prices & services', moves: 'Moves',
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
