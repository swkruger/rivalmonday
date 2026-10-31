import { formatDate, formatRelative } from '@/lib/format';
import { CADENCE, PAGE_TYPE, labelFor } from '@/lib/labels';
import { canManageCompetitors, hasFeature, isAgencyRole, PAGE_TYPES } from '@cs/core';
import type { AdActivityView, AdList, AdMatch, ClientProfile, CompetitorProfile, CompetitorSignalView, GeoGridView, PriceMatrixView, RatingTrendView, TopicBenchmarkView, TrackedPageView } from '@cs/tools';
import { Card, CardContent, CardHeader, HairlineCell, HairlineGrid, Kpi, KpiStrip, Section, segmentedItemClass, segmentedTrackClass, StatusChip, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache, Suspense } from 'react';
import { BusinessAvatar } from '@/components/business-avatar';
import { clientCrumbs } from '@/components/client-crumbs';
import { EmptyState } from '@/components/help/empty-state';
import { HelpText } from '@/components/help/help-context';
import { HelpTip } from '@/components/help/help-tip';
import { PageHeader } from '@/components/page-header';
import { SectionSkeleton } from '@/components/page-skeleton';
import { PressureBadge } from '@/components/pressure-badge';
import { AdMatchChips } from '@/components/rival/ad-match-chips';
import { ratedLabel } from '@/components/rival/rated-label';
import { SignalPills } from '@/components/rival/signal-pills';
import { TierChip } from '@/components/rival/tier-chip';
import { WriteGuard } from '@/components/read-only';
import { PAGE_COPY } from '@/help/copy';
import { requireContext } from '@/server/current-viewer';
import { webEnv } from '@/server/env';
import { helpGuides } from '@/server/help';
import { callTool, tryCallTool } from '@/server/tools';
import { AddPageForm, PinPageSwitch } from './page-controls';
import { AdsSection, PricesSection, RankingsSection, ReviewsSection } from './sections';
import { sourceStatusLabel } from './source-status';
import { TimelineCard } from './timeline';

export const dynamic = 'force-dynamic';

const PERIODS = [30, 90, 365] as const;
const HELP_KEY = 'page:client.competitors.detail';
const COPY = PAGE_COPY['client.competitors.detail'];

/** KPI label with its help tip beside the text (tip stays outside the label text). */
const kpiLabel = (text: string, help?: React.ReactNode) => (
  <span className="flex items-center gap-1.5">
    {text}
    {help}
  </span>
);

type Ctx = Awaited<ReturnType<typeof requireContext>>['ctx'];
/** One `get_competitor_profile` per request (keyed by the request's cached ctx), shared by the tab title and the page. */
const loadCompetitor = cache((ctx: Ctx, clientId: string, competitorId: string) => callTool<CompetitorProfile>(ctx, 'get_competitor_profile', { clientId, competitorId }));

/** The tab title is the competitor's name; a refusal still 404s. */
export async function generateMetadata({ params }: { params: Promise<{ clientId: string; competitorId: string }> }): Promise<Metadata> {
  const { clientId, competitorId } = await params;
  const { ctx } = await requireContext();
  if (!hasFeature(ctx, 'dashboard')) notFound();
  return { title: (await loadCompetitor(ctx, clientId, competitorId)).name };
}

export default async function CompetitorProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string; competitorId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { clientId, competitorId } = await params;
  const sp = await searchParams;
  const { ctx } = await requireContext();
  if (!hasFeature(ctx, 'dashboard')) notFound();
  const raw = Number(Array.isArray(sp.days) ? sp.days[0] : sp.days);
  const days = (PERIODS as readonly number[]).includes(raw) ? raw : 90;
  // One batch: a bad id makes get_competitor_profile throw not_found (-> 404); Promise.all handles the sibling calls' rejections.
  // Ad-account matches are agency-only: other viewers never trigger the call or see the chips.
  const manageAds = isAgencyRole(ctx.role) && canManageCompetitors(ctx);
  const [profile, pages, matrix, ads, benchmark, geo, signals, adMatches, client, guides, adActivity, ratingTrend] = await Promise.all([
    loadCompetitor(ctx, clientId, competitorId),
    callTool<{ items: TrackedPageView[] }>(ctx, 'list_tracked_pages', { clientId, competitorId }),
    callTool<PriceMatrixView>(ctx, 'get_price_matrix', { clientId, competitorId }),
    callTool<AdList>(ctx, 'list_ads', { clientId, competitorId, limit: 3 }),
    callTool<TopicBenchmarkView>(ctx, 'get_topic_benchmark', { clientId }),
    callTool<GeoGridView>(ctx, 'get_geogrid', { clientId, business: competitorId }),
    callTool<{ competitors: CompetitorSignalView[] }>(ctx, 'get_competitor_signals', { clientId }),
    manageAds
      ? callTool<{ matched: { platform: 'google' | 'meta'; accountId: string; name: string | null }[]; pending: AdMatch[] }>(ctx, 'get_competitor_ad_matches', { clientId, competitorId })
      : Promise.resolve(null),
    callTool<ClientProfile>(ctx, 'get_client_profile', { clientId }),
    helpGuides(ctx, 'client', clientId),
    // Sparkline traces for two KPIs: a refused read leaves the Kpi plain instead of 404-ing the page.
    tryCallTool<AdActivityView>(ctx, 'get_ad_activity', { clientId, competitorId, weeks: 12 }),
    tryCallTool<RatingTrendView>(ctx, 'get_rating_trend', { clientId, months: 12 }),
  ]);
  const adsTrace = adActivity?.series.find((x) => x.competitorId === competitorId)?.points;
  const ratingTrace = ratingTrend?.businesses.find((b) => b.competitorId === competitorId)?.monthly.map((m) => m.avgRating);
  const rated = signals.competitors.find((x) => x.competitorId === competitorId) ?? null;
  const now = new Date();
  const tz = client.timezone;
  const agency = isAgencyRole(ctx.role);

  return (
    <>
      <PageHeader
        title={profile.name}
        breadcrumb={clientCrumbs({ id: clientId, name: client.name }, { label: 'Competitors', href: `/c/${clientId}/competitors` }, profile.name)}
        description={
          <>
            <HelpText text={COPY.description} /> {`Tracked since ${formatDate(profile.addedAt, { tz, withYear: 'always' })}.`}
          </>
        }
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
        variant="detail"
        avatar={<BusinessAvatar name={profile.name} />}
        actions={
          <>
            {profile.domain && (
              <a href={`https://${profile.domain}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary-soft-text">
                {profile.domain}
              </a>
            )}
            <PressureBadge score={profile.pressure.score} level={profile.pressure.level} />
            <HelpTip term="pressure" />
          </>
        }
      />

      <div className="flex flex-col gap-3">
        {rated ? (
          <div className="flex flex-wrap items-center gap-3">
            <TierChip tier={rated.tier} />
            <HelpTip tip="client.competitors.tiers" />
            <SignalPills signals={rated.signals} mode="tracked" />
            <span className="text-xs text-muted-ink">{ratedLabel(rated.computedAt, client.timezone)}</span>
            <HelpTip tip="client.competitors.rated" />
          </div>
        ) : (
          <p className="flex items-center gap-1.5 text-sm text-muted-ink">
            Not rated yet
            <HelpTip tip="client.competitors.rated" />
          </p>
        )}
        {adMatches && <AdMatchChips clientId={clientId} competitorId={competitorId} matched={adMatches.matched} pending={adMatches.pending} />}
      </div>

      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-10">
          <KpiStrip>
            {profile.gbp ? (
              <Kpi
                label={kpiLabel('Google rating')}
                value={profile.gbp.rating === null ? '—' : `${profile.gbp.rating} ★`}
                trace={ratingTrace}
                traceLabel={ratingTrace ? 'Average stars per month, last 12 months' : undefined}
                caption={
                  <>
                    {profile.gbp.rating === null && <span className="block">No rating yet</span>}
                    <span className="block">{profile.gbp.reviews ?? 0} reviews</span>
                    {profile.gbpAsOf && <span className="block">as of {formatDate(profile.gbpAsOf, { tz })}</span>}
                  </>
                }
              />
            ) : (
              <Kpi label={kpiLabel('Google rating')} value="—" caption="No Google profile yet" />
            )}
            <Kpi
              label={kpiLabel('Active ads')}
              value={profile.activeAds.google + profile.activeAds.meta}
              trace={adsTrace}
              traceLabel={adsTrace ? 'Active ads, last 12 weeks' : undefined}
              caption={`Google ${profile.activeAds.google} · Meta ${profile.activeAds.meta}`}
            />
            <Kpi
              label={kpiLabel('Open moves', <HelpTip tip="client.competitors.detail.openMoves" />)}
              value={
                <Link href={`/c/${clientId}/moves`} className="text-primary-soft-text">
                  {profile.openMoves}
                </Link>
              }
            />
            <Kpi
              label={kpiLabel('Pages monitored', <HelpTip tip="client.competitors.detail.pagesMonitored" />)}
              value={profile.pages.active}
              badge={profile.pages.blocked > 0 ? <StatusChip tone="danger">Site blocks monitoring</StatusChip> : undefined}
            />
          </KpiStrip>

          <HairlineGrid cols={2}>
            <HairlineCell>
              <PricesSection clientId={clientId} competitorId={competitorId} matrix={matrix} />
            </HairlineCell>
            <HairlineCell>
              <AdsSection clientId={clientId} competitorId={competitorId} ads={ads} timezone={tz} />
            </HairlineCell>
            <HairlineCell>
              <ReviewsSection clientId={clientId} competitorId={competitorId} benchmark={benchmark} />
            </HairlineCell>
            <HairlineCell>
              <RankingsSection clientId={clientId} competitorId={competitorId} geo={geo} />
            </HairlineCell>
          </HairlineGrid>

          <Section
            title="Timeline"
            actions={
              <nav aria-label="Period" className={segmentedTrackClass}>
                {PERIODS.map((p) => (
                  <Link
                    key={p}
                    href={`/c/${clientId}/competitors/${competitorId}?days=${p}`}
                    aria-current={p === days ? 'page' : undefined}
                    className={segmentedItemClass}
                  >
                    {p} days
                  </Link>
                ))}
              </nav>
            }
          >
            <Suspense fallback={<SectionSkeleton />}>
              <TimelineCard clientId={clientId} competitorId={competitorId} days={days} timezone={tz} />
            </Suspense>
          </Section>

          <PagesCard clientId={clientId} competitorId={competitorId} pages={pages.items} agency={agency} tz={tz} />
        </div>

        <div className="xl:border-l xl:border-line xl:pl-6">
          <Section title="Collection status" titleAside={<HelpTip tip="client.competitors.detail.collection" />}>
            {profile.sources.length === 0 ? (
              <p className="text-sm text-muted-ink">No data sources yet.</p>
            ) : (
              <dl className="flex flex-col divide-y divide-line border-y border-line">
                {profile.sources.map((s) => (
                  <div key={s.source} className="flex flex-col gap-0.5 py-3">
                    <dt className="text-13 text-muted-ink">{s.label}</dt>
                    <dd className="text-sm text-ink">
                      {s.lastRunAt ? `${formatRelative(s.lastRunAt, now, { tz })}${sourceStatusLabel(s.lastStatus) ? ` · ${sourceStatusLabel(s.lastStatus)}` : ''}` : 'Not run yet'}
                      {s.active ? '' : ' · Paused'}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}

function PagesCard({ clientId, competitorId, pages, agency, tz }: { clientId: string; competitorId: string; pages: TrackedPageView[]; agency: boolean; tz: string }) {
  return (
    <Card>
      <CardHeader>
        <h2 data-slot="card-title" className="text-base font-semibold text-ink">Pages</h2>
      </CardHeader>
      {pages.length === 0 ? (
        <CardContent>
          <EmptyState {...COPY.empty.noPages} />
        </CardContent>
      ) : (
        <div className="[&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>URL</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Cadence</TableHead>
                <TableHead>Last captured</TableHead>
                <TableHead>
                  <span className="inline-flex items-center gap-1.5">
                    Pinned
                    <HelpTip tip="client.competitors.detail.pinned" />
                  </span>
                </TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pages.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.url}</TableCell>
                  <TableCell>{labelFor(PAGE_TYPE, p.pageType).label}</TableCell>
                  <TableCell>{labelFor(CADENCE, p.cadence).label}</TableCell>
                  <TableCell>{p.lastCapturedAt ? formatDate(p.lastCapturedAt, { tz }) : '—'}</TableCell>
                  <TableCell>{agency ? <PinPageSwitch clientId={clientId} competitorId={competitorId} page={p} /> : p.pinned ? 'Pinned' : '—'}</TableCell>
                  <TableCell>{!p.active && <StatusChip tone="neutral">Inactive</StatusChip>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {agency && (
        <WriteGuard>
          <CardContent className={pages.length === 0 ? undefined : 'border-t border-line pt-4'}>
            {webEnv().webMonitoring ? (
              <AddPageForm clientId={clientId} competitorId={competitorId} pageTypes={PAGE_TYPES.map((t) => ({ value: t, label: labelFor(PAGE_TYPE, t).label }))} />
            ) : (
              <p className="text-muted-ink">Website monitoring is switched off for now, so pages can’t be added.</p>
            )}
          </CardContent>
        </WriteGuard>
      )}
    </Card>
  );
}
