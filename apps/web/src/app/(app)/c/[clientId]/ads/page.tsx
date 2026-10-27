import { hasFeature } from '@cs/core';
import type { AdActivityView, AdList, ClientProfile, TrackedCompetitor } from '@cs/tools';
import { Button, Section, toolbarControlClass } from '@cs/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { foldSeries, LineChart } from '@/components/charts/line-chart';
import { clientCrumbs } from '@/components/client-crumbs';
import { EmptyState } from '@/components/help/empty-state';
import { HelpText } from '@/components/help/help-context';
import { HelpTip } from '@/components/help/help-tip';
import { PageHeader } from '@/components/page-header';
import { PAGE_COPY } from '@/help/copy';
import { requireContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { offsetParam, one, uuidParam } from '@/server/search-params';
import { callTool, tryCallTool } from '@/server/tools';
import { AdCard } from './ad-card';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Ads' };

const HELP_KEY = 'page:client.ads';
const COPY = PAGE_COPY['client.ads'];

const PAGE = 50;
const pick = <T extends string>(v: string | undefined, allowed: readonly T[], fallback: T): T => ((allowed as readonly string[]).includes(v ?? '') ? (v as T) : fallback);

/** Module 5 (decision 5): active-ads trend plus the creative archive. */
export default async function AdsPage({ params, searchParams }: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { clientId } = await params;
  const sp = await searchParams;
  const { ctx } = await requireContext();
  if (!hasFeature(ctx, 'dashboard')) notFound();
  const competitorId = uuidParam(sp, 'competitor');
  const platform = pick(one(sp.platform), ['all', 'meta', 'google'] as const, 'all');
  const status = pick(one(sp.status), ['active', 'ended', 'all'] as const, 'active');
  const offset = offsetParam(sp);

  const [profile, activity, tracked, guides] = await Promise.all([
    callTool<ClientProfile>(ctx, 'get_client_profile', { clientId }),
    callTool<AdActivityView>(ctx, 'get_ad_activity', { clientId, weeks: 12 }),
    callTool<{ items: TrackedCompetitor[] }>(ctx, 'list_client_competitors', { clientId }),
    helpGuides(ctx, 'client', clientId),
  ]);
  const list = await tryCallTool<AdList>(ctx, 'list_ads', {
    clientId, ...(competitorId ? { competitorId } : {}), ...(platform !== 'all' ? { platform } : {}), status, offset, limit: PAGE,
  });
  const more = new URLSearchParams({ ...(competitorId ? { competitor: competitorId } : {}), platform, status, offset: String(offset + PAGE) });

  return (
    <>
      <PageHeader
        title="Ads"
        breadcrumb={clientCrumbs({ id: clientId, name: profile.name }, 'Insights', 'Ads')}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />

      <Section title="Active ads per week" titleAside={<HelpTip tip="client.ads.adsPerWeek" />}>
        <LineChart
          title="Active competitor ads per week"
          labels={activity.weeks}
          series={foldSeries(activity.series.map((s) => ({ key: s.competitorId, name: s.name, points: s.points })))}
          valueLabel="active ads"
        />
      </Section>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-ink">Competitor</span>
          <select name="competitor" defaultValue={competitorId ?? ''} className={toolbarControlClass}>
            <option value="">All competitors</option>
            {tracked.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-ink">Platform</span>
          <select name="platform" defaultValue={platform} className={toolbarControlClass}>
            <option value="all">All</option>
            <option value="meta">Meta</option>
            <option value="google">Google</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-ink">Status</span>
          <select name="status" defaultValue={status} className={toolbarControlClass}>
            <option value="active">Active</option>
            <option value="ended">Ended</option>
            <option value="all">All</option>
          </select>
        </label>
        <Button type="submit" variant="outline" size="sm">Apply</Button>
      </form>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          Active and ended
          <HelpTip tip="client.ads.status" />
        </span>
        <span className="inline-flex items-center gap-1.5">
          Targeting
          <HelpTip tip="client.ads.targeting" />
        </span>
      </div>

      {!list ? (
        <p className="rounded-md bg-muted-surface p-3 text-ink">This competitor is no longer tracked.</p>
      ) : list.items.length === 0 ? (
        <EmptyState {...COPY.empty.noMatch} />
      ) : (
        <>
          <h2 className="sr-only">Ads</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {list.items.map((a) => <AdCard key={a.id} ad={a} timezone={profile.timezone} />)}
          </div>
          {list.hasMore && <Link href={`/c/${clientId}/ads?${more.toString()}`} className="font-semibold text-primary-soft-text">More ads</Link>}
        </>
      )}
    </>
  );
}
