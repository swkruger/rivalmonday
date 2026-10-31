import { hasFeature, isAgencyRole } from '@cs/core';
import type { ClientProfile, RatingTrendView, ReviewList, TopicBenchmarkView } from '@cs/tools';
import { Button, HairlineCell, HairlineGrid, Section, toolbarControlClass } from '@cs/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LineChart } from '@/components/charts/line-chart';
import { clientCrumbs } from '@/components/client-crumbs';
import { EmptyState } from '@/components/help/empty-state';
import { HelpText } from '@/components/help/help-context';
import { HelpTip } from '@/components/help/help-tip';
import { PageHeader } from '@/components/page-header';
import { TopicHeatmap } from '@/components/charts/topic-heatmap';
import { StatStrip } from '@/components/stat-strip';
import { PAGE_COPY } from '@/help/copy';
import { requireContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { offsetParam, one, uuidParam } from '@/server/search-params';
import { callTool, tryCallTool } from '@/server/tools';
import { RatingMix } from './rating-mix';
import { ReviewItem } from './review-item';
import { SelfNotice } from './self-notice';
import { trendSeries } from './trend-series';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Reviews' };

const PAGE = 20;
const HELP_KEY = 'page:client.reviews';
const COPY = PAGE_COPY['client.reviews'];
const SELECT = toolbarControlClass;
const LABEL = 'text-xs font-medium text-muted-ink';
const TOPIC = /^[a-z0-9_]{1,64}$/;

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
  const topicParam = one(sp.topic);
  const topicRaw = topicParam && TOPIC.test(topicParam) ? topicParam : undefined;
  const starsN = Number(one(sp.stars));
  const stars = Number.isInteger(starsN) && starsN >= 1 && starsN <= 5 ? starsN : undefined;
  const text = one(sp.q)?.slice(0, 100);
  const daysN = Number(one(sp.days));
  const days = [30, 90, 365].includes(daysN) ? daysN : 90;
  const offset = offsetParam(sp);

  const [profile, benchmark, trend, guides] = await Promise.all([
    callTool<ClientProfile>(ctx, 'get_client_profile', { clientId }),
    callTool<TopicBenchmarkView>(ctx, 'get_topic_benchmark', { clientId }),
    callTool<RatingTrendView>(ctx, 'get_rating_trend', { clientId, months: 12 }),
    helpGuides(ctx, 'client', clientId),
  ]);
  // An unknown topic id (hand-edited URL, retired topic) is dropped rather than hiding the whole list.
  const topicId = topicRaw && benchmark.topics.some((t) => t.id === topicRaw) ? topicRaw : undefined;
  const reviews = await tryCallTool<ReviewList>(ctx, 'search_reviews', {
    clientId, ...(business ? { business } : {}), ...(topicId ? { topicId } : {}), ...(stars ? { stars } : {}), ...(text ? { text } : {}), days, offset,
  });
  const self = trend.businesses.find((b) => b.self) ?? null;
  const more = new URLSearchParams({
    ...(business ? { business } : {}), ...(topicId ? { topic: topicId } : {}), ...(stars ? { stars: String(stars) } : {}), ...(text ? { q: text } : {}),
    days: String(days), offset: String(offset + PAGE),
  });
  const trendSeriesList = trendSeries(trend);

  return (
    <>
      <PageHeader
        title="Reviews"
        breadcrumb={clientCrumbs({ id: clientId, name: profile.name }, 'Insights', 'Reviews')}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />

      {self ? (
        <StatStrip
          items={[
            { title: 'Your rating', value: self.gbpRating === null ? '—' : `${self.gbpRating.toFixed(1)} ★`, hint: 'Google rating', trace: self.monthly.map((m) => m.avgRating), traceLabel: 'Average stars per month, last 12 months' },
            { title: 'New reviews (90 days)', value: String(self.reviews90d), hint: 'Reviews posted in the last 90 days', trace: self.monthly.map((m) => m.reviews), traceLabel: 'Reviews per month, last 12 months', help: <HelpTip tip="client.reviews.newReviews" /> },
            { title: 'Reviews per month', value: self.perMonth.toFixed(1), hint: 'Average over the last 6 months', trace: self.monthly.map((m) => m.reviews), traceLabel: 'Reviews per month, last 12 months', help: <HelpTip term="review-velocity" /> },
            { title: 'Replies to reviews', value: self.replyRate === null ? '—' : `${Math.round(self.replyRate * 100)}%`, hint: 'Share of the last 90 days’ reviews you answered', help: <HelpTip term="reply-rate" /> },
          ]}
        />
      ) : (
        <SelfNotice clientId={clientId} selfPending={trend.selfPending} isAgency={isAgencyRole(ctx.role)} />
      )}

      <Section
        title="What customers talk about"
        titleAside={<HelpTip tip="client.reviews.heatmap" />}
        description="Last 90 days. The number is how often a topic comes up; the colour is how positive those mentions are."
      >
        <TopicHeatmap title="What customers talk about" benchmark={benchmark} />
      </Section>

      <HairlineGrid cols={2}>
        <HairlineCell>
          <Section title="Your rating mix" titleAside={<HelpTip tip="client.reviews.ratingMix" />}>
            {self ? <RatingMix mix={self.mix} /> : <p className="text-sm text-muted-ink">Not available until your business is set up.</p>}
          </Section>
        </HairlineCell>
        <HairlineCell>
          <Section title="Rating trend" titleAside={<HelpTip tip="client.reviews.ratingTrend" />}>
            <LineChart title="Average stars per month" labels={trend.months} series={trendSeriesList} valueLabel="stars" yMax={5} period="month" formatValue={(v) => v.toFixed(1)} />
          </Section>
        </HairlineCell>
      </HairlineGrid>

      <Section title="Reviews">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Business</span>
            <select name="business" defaultValue={business ?? ''} className={SELECT}>
              <option value="">All</option>
              {trend.businesses.map((b) => <option key={b.competitorId} value={b.self ? 'self' : b.competitorId}>{b.self ? 'You' : b.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Topic</span>
            <select name="topic" defaultValue={topicId ?? ''} className={SELECT}>
              <option value="">All topics</option>
              {benchmark.topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Stars</span>
            <select name="stars" defaultValue={stars ? String(stars) : ''} className={SELECT}>
              <option value="">Any</option>
              {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}★</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Period</span>
            <select name="days" defaultValue={String(days)} className={SELECT}>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">12 months</option>
            </select>
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className={LABEL}>Contains</span>
            <input name="q" defaultValue={text ?? ''} maxLength={100} className={SELECT} />
          </label>
          <Button type="submit" variant="outline" size="sm">Search</Button>
        </form>
        {!reviews ? (
          <p className="rounded-md bg-muted-surface p-3 text-ink">
            {business ? 'That business is no longer available.' : 'These reviews could not be loaded.'}
          </p>
        ) : reviews.items.length === 0 ? (
          <EmptyState {...COPY.empty.noMatch} />
        ) : (
          <>
            <div className="flex flex-col divide-y divide-line">{reviews.items.map((r) => <ReviewItem key={r.reviewId} review={r} timezone={profile.timezone} />)}</div>
            {reviews.hasMore && <Link href={`/c/${clientId}/reviews?${more.toString()}`} className="font-semibold text-primary-soft-text">More reviews</Link>}
          </>
        )}
      </Section>
    </>
  );
}
