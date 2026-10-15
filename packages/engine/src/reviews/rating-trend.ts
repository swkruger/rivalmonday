import { gbpSummary } from '@cs/collectors';
import { client, clientCompetitor, competitor, type Db, evidence, observation, review } from '@cs/db';
import { and, asc, desc, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';

const DAY = 86_400_000;
/** Newest review captures cited per business — enough to back "reviews in 90 days" without padding the evidence list. */
const EVIDENCE_PER_BUSINESS = 10;
const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;

/** UTC calendar months `YYYY-MM`, the last one containing `now`. */
export function monthKeys(now: Date, n: number): string[] {
  return Array.from({ length: n }, (_, k) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (n - 1 - k), 1)).toISOString().slice(0, 7));
}

export interface RatingStat {
  competitorId: string;
  gbpRating: number | null;
  /** Capture of the `gbp_profile` observation the rating came from. */
  gbpCaptureId: string | null;
  reviews90d: number;
  perMonth: number;
  replyRate: number | null;
  mix: number[];
  monthly: { reviews: number; avgRating: number | null }[];
}

/**
 * Per-business rating, 90-day review count, reply rate, star mix and monthly stars for the given competitor ids.
 * Pure data: callers prove visibility of `ids` (the tool through RLS, `ratingTrend` through the client's own links).
 */
export async function ratingStats(db: Db, ids: string[], now: Date, months: string[]): Promise<Map<string, RatingStat>> {
  const out = new Map<string, RatingStat>();
  if (ids.length === 0) return out;
  const since90 = new Date(now.getTime() - 90 * DAY).toISOString();
  const since180 = new Date(now.getTime() - 180 * DAY).toISOString();
  const monthExpr = sql<string>`to_char(date_trunc('month', ${review.postedAt} AT TIME ZONE 'UTC'), 'YYYY-MM')`;
  const monthly = await db
    .select({ competitorId: review.competitorId, month: monthExpr, n: sql<number>`count(*)::int`, avg: sql<number | null>`round(avg(${review.rating})::numeric, 2)::float8` })
    .from(review)
    .where(and(inArray(review.competitorId, ids), gte(review.postedAt, new Date(`${months[0]}-01T00:00:00Z`))))
    .groupBy(review.competitorId, monthExpr);
  const stats = await db
    .select({
      competitorId: review.competitorId,
      n90: sql<number>`count(*) FILTER (WHERE ${review.postedAt} > ${since90}::timestamptz)::int`,
      answered90: sql<number>`count(*) FILTER (WHERE ${review.postedAt} > ${since90}::timestamptz AND ${review.ownerAnswer} IS NOT NULL)::int`,
      n180: sql<number>`count(*) FILTER (WHERE ${review.postedAt} > ${since180}::timestamptz)::int`,
      s1: sql<number>`count(*) FILTER (WHERE ${review.rating} = 1)::int`,
      s2: sql<number>`count(*) FILTER (WHERE ${review.rating} = 2)::int`,
      s3: sql<number>`count(*) FILTER (WHERE ${review.rating} = 3)::int`,
      s4: sql<number>`count(*) FILTER (WHERE ${review.rating} = 4)::int`,
      s5: sql<number>`count(*) FILTER (WHERE ${review.rating} = 5)::int`,
    })
    .from(review).where(inArray(review.competitorId, ids)).groupBy(review.competitorId);
  const gbp = await db.selectDistinctOn([observation.competitorId], { competitorId: observation.competitorId, captureId: observation.captureId, data: observation.data })
    .from(observation).where(and(inArray(observation.competitorId, ids), eq(observation.kind, 'gbp_profile'), eq(observation.key, 'profile')))
    .orderBy(observation.competitorId, desc(observation.observedAt));

  for (const id of ids) {
    const s = stats.find((x) => x.competitorId === id);
    const g = gbp.find((x) => x.competitorId === id);
    const n90 = Number(s?.n90 ?? 0);
    out.set(id, {
      competitorId: id,
      gbpRating: gbpSummary(g?.data ?? null)?.rating ?? null,
      gbpCaptureId: g?.captureId ?? null,
      reviews90d: n90,
      perMonth: r1(Number(s?.n180 ?? 0) / 6),
      replyRate: n90 > 0 ? r2(Number(s!.answered90) / n90) : null,
      mix: [s?.s1, s?.s2, s?.s3, s?.s4, s?.s5].map((v) => Number(v ?? 0)),
      monthly: months.map((m) => {
        const row = monthly.find((x) => x.competitorId === id && x.month === m);
        return { reviews: Number(row?.n ?? 0), avgRating: row?.avg === null || row?.avg === undefined ? null : Number(row.avg) };
      }),
    });
  }
  return out;
}

export interface RatingTrendBusiness {
  competitorId: string;
  name: string;
  self: boolean;
  rating: number | null;
  reviews90d: number;
  replyRate: number | null;
  evidenceIds: string[];
}

/** The client's businesses (self first, then tracked competitors by name): Google rating, 90-day reviews, reply rate and the evidence they came from. */
export async function ratingTrend(deps: { db: Db }, clientId: string, opts: { now?: Date } = {}): Promise<{ businesses: RatingTrendBusiness[] }> {
  const now = opts.now ?? new Date();
  const [c] = await deps.db.select().from(client).where(eq(client.id, clientId)).limit(1);
  if (!c) throw new Error(`client ${clientId} not found`);
  const tracked = await deps.db
    .select({ id: competitor.id, name: competitor.name })
    .from(clientCompetitor)
    .innerJoin(competitor, eq(competitor.id, clientCompetitor.competitorId))
    .where(eq(clientCompetitor.clientId, clientId))
    .orderBy(asc(competitor.name));
  const businesses = [
    ...(c.selfCompetitorId ? [{ id: c.selfCompetitorId, name: c.name, self: true }] : []),
    ...tracked.filter((t) => t.id !== c.selfCompetitorId).map((t) => ({ ...t, self: false })),
  ];
  if (businesses.length === 0) return { businesses: [] };
  const ids = businesses.map((b) => b.id);
  const stats = await ratingStats(deps.db, ids, now, monthKeys(now, 1));

  const since90 = new Date(now.getTime() - 90 * DAY);
  const recent = await deps.db
    .select({ competitorId: review.competitorId, captureId: review.firstCaptureId })
    .from(review)
    .where(and(inArray(review.competitorId, ids), gte(review.postedAt, since90), isNotNull(review.firstCaptureId)))
    .orderBy(desc(review.postedAt));
  const captures = new Map<string, string[]>();
  for (const r of recent) {
    const list = captures.get(r.competitorId) ?? [];
    if (!list.includes(r.captureId!) && list.length < EVIDENCE_PER_BUSINESS) list.push(r.captureId!);
    captures.set(r.competitorId, list);
  }
  for (const s of stats.values()) if (s.gbpCaptureId) captures.set(s.competitorId, [...(captures.get(s.competitorId) ?? []), s.gbpCaptureId]);
  const allCaptures = [...new Set([...captures.values()].flat())];
  const ev = allCaptures.length > 0
    ? await deps.db.select({ id: evidence.id, captureId: evidence.captureId }).from(evidence).where(inArray(evidence.captureId, allCaptures)).orderBy(asc(evidence.id))
    : [];

  return {
    businesses: businesses.map((b) => {
      const s = stats.get(b.id)!;
      const mine = new Set(captures.get(b.id) ?? []);
      return {
        competitorId: b.id, name: b.name, self: b.self, rating: s.gbpRating, reviews90d: s.reviews90d, replyRate: s.replyRate,
        evidenceIds: ev.filter((e) => mine.has(e.captureId)).map((e) => e.id),
      };
    }),
  };
}
