import { hasFeature, isAgencyRole } from '@cs/core';
import type { RatingTrendView, ReviewList, ThemeBenchmarkView } from '@cs/tools';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LineChart } from '@/components/charts/line-chart';
import { ThemeHeatmap } from '@/components/charts/theme-heatmap';
import { StatCard } from '@/components/stat-card';
import { requireContext } from '@/server/current-viewer';
import { offsetParam, one, uuidParam } from '@/server/search-params';
import { callTool, tryCallTool } from '@/server/tools';
import { RatingMix } from './rating-mix';
import { ReviewItem } from './review-item';
import { SelfNotice } from './self-notice';
import { trendSeries } from './trend-series';

export const dynamic = 'force-dynamic';

const PAGE = 20;
const THEME = /^[a-z0-9_]{1,64}$/;

/** Module 6 (mockup 03, decisions 6–8). */
export default async function ReviewsPage({ params, searchParams }: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { clientId } = await params;
  const sp = await searchParams;
  const { ctx } = await requireContext();
  if (!hasFeature(ctx, 'dashboard')) notFound();

  const business = one(sp.business) === 'self' ? 'self' : uuidParam(sp, 'business');
  const themeParam = one(sp.theme);
  const themeRaw = themeParam && THEME.test(themeParam) ? themeParam : undefined;
  const starsN = Number(one(sp.stars));
  const stars = Number.isInteger(starsN) && starsN >= 1 && starsN <= 5 ? starsN : undefined;
  const text = one(sp.q)?.slice(0, 100);
  const daysN = Number(one(sp.days));
  const days = [30, 90, 365].includes(daysN) ? daysN : 90;
  const offset = offsetParam(sp);

  const [benchmark, trend] = await Promise.all([
    callTool<ThemeBenchmarkView>(ctx, 'get_theme_benchmark', { clientId }),
    callTool<RatingTrendView>(ctx, 'get_rating_trend', { clientId, months: 12 }),
  ]);
  // An unknown theme id (hand-edited URL, retired theme) is dropped rather than hiding the whole list.
  const themeId = themeRaw && benchmark.themes.some((t) => t.id === themeRaw) ? themeRaw : undefined;
  const reviews = await tryCallTool<ReviewList>(ctx, 'search_reviews', {
    clientId, ...(business ? { business } : {}), ...(themeId ? { themeId } : {}), ...(stars ? { stars } : {}), ...(text ? { text } : {}), days, offset,
  });
  const self = trend.businesses.find((b) => b.self) ?? null;
  const more = new URLSearchParams({
    ...(business ? { business } : {}), ...(themeId ? { theme: themeId } : {}), ...(stars ? { stars: String(stars) } : {}), ...(text ? { q: text } : {}),
    days: String(days), offset: String(offset + PAGE),
  });
  const trendSeriesList = trendSeries(trend);

  return (
    <>
      <div>
        <h1 className="text-[26px] font-extrabold tracking-tight">Reviews &amp; reputation</h1>
        <p className="mt-1 text-muted-foreground">What customers say about you and your competitors on Google.</p>
      </div>

      {self ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Your rating" value={self.gbpRating === null ? '—' : `${self.gbpRating.toFixed(1)} ★`} hint="Google rating" />
          <StatCard title="New reviews (90 days)" value={String(self.reviews90d)} hint="Reviews posted in the last 90 days" />
          <StatCard title="Reviews per month" value={self.perMonth.toFixed(1)} hint="Average over the last 6 months" />
          <StatCard title="Replies to reviews" value={self.replyRate === null ? '—' : `${Math.round(self.replyRate * 100)}%`} hint="Share of the last 90 days’ reviews you answered" />
        </div>
      ) : (
        <SelfNotice clientId={clientId} selfPending={trend.selfPending} isAgency={isAgencyRole(ctx.role)} />
      )}

      <section className="rounded-[14px] bg-surface p-6 shadow-card">
        <h2 className="mb-1 text-lg font-bold text-ink">What customers talk about</h2>
        <p className="mb-3 text-sm text-muted-foreground">Last 90 days. The number is how often a theme comes up; the colour is how positive those mentions are.</p>
        <ThemeHeatmap title="What customers talk about" benchmark={benchmark} />
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <section className="rounded-[14px] bg-surface p-6 shadow-card">
          <h2 className="mb-3 text-lg font-bold text-ink">Your rating mix</h2>
          {self ? <RatingMix mix={self.mix} /> : <p className="text-sm text-muted-foreground">Not available until your business is set up.</p>}
        </section>
        <section className="rounded-[14px] bg-surface p-6 shadow-card">
          <h2 className="mb-3 text-lg font-bold text-ink">Rating trend</h2>
          <LineChart title="Average stars per month" labels={trend.months} series={trendSeriesList} valueLabel="stars" yMax={5} period="month" formatValue={(v) => v.toFixed(1)} />
        </section>
      </div>

      <section className="flex flex-col gap-3 rounded-[14px] bg-surface p-6 shadow-card">
        <h2 className="text-lg font-bold text-ink">Reviews</h2>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold text-ink">Business</span>
            <select name="business" defaultValue={business ?? ''} className="rounded-md border border-line bg-surface px-2 py-1.5">
              <option value="">All</option>
              {trend.businesses.map((b) => <option key={b.competitorId} value={b.self ? 'self' : b.competitorId}>{b.self ? 'You' : b.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold text-ink">Theme</span>
            <select name="theme" defaultValue={themeId ?? ''} className="rounded-md border border-line bg-surface px-2 py-1.5">
              <option value="">All themes</option>
              {benchmark.themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold text-ink">Stars</span>
            <select name="stars" defaultValue={stars ? String(stars) : ''} className="rounded-md border border-line bg-surface px-2 py-1.5">
              <option value="">Any</option>
              {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}★</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold text-ink">Period</span>
            <select name="days" defaultValue={String(days)} className="rounded-md border border-line bg-surface px-2 py-1.5">
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">12 months</option>
            </select>
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
            <span className="font-semibold text-ink">Contains</span>
            <input name="q" defaultValue={text ?? ''} maxLength={100} className="rounded-md border border-line bg-surface px-2 py-1.5" />
          </label>
          <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white">Search</button>
        </form>
        {!reviews ? (
          <p className="rounded-lg bg-muted-surface p-3 text-ink">
            {business ? 'That business is no longer available.' : 'These reviews could not be loaded.'}
          </p>
        ) : reviews.items.length === 0 ? (
          <p className="text-muted-foreground">No reviews match.</p>
        ) : (
          <>
            <div className="flex flex-col divide-y divide-line">{reviews.items.map((r) => <ReviewItem key={r.reviewId} review={r} />)}</div>
            {reviews.hasMore && <Link href={`/c/${clientId}/reviews?${more.toString()}`} className="font-semibold text-primary-soft-text">More reviews</Link>}
          </>
        )}
      </section>
    </>
  );
}
