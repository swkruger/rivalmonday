import { hasFeature } from '@cs/core';
import type { AdActivityView, AdList } from '@cs/tools';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { foldSeries, LineChart } from '@/components/charts/line-chart';
import { requireContext } from '@/server/current-viewer';
import { offsetParam, one, uuidParam } from '@/server/search-params';
import { callTool, tryCallTool } from '@/server/tools';
import { AdCard } from './ad-card';

export const dynamic = 'force-dynamic';

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

  const activity = await callTool<AdActivityView>(ctx, 'get_ad_activity', { clientId, weeks: 12 });
  const list = await tryCallTool<AdList>(ctx, 'list_ads', {
    clientId, ...(competitorId ? { competitorId } : {}), ...(platform !== 'all' ? { platform } : {}), status, offset, limit: PAGE,
  });
  const more = new URLSearchParams({ ...(competitorId ? { competitor: competitorId } : {}), platform, status, offset: String(offset + PAGE) });

  return (
    <>
      <div>
        <h1 className="text-[26px] font-extrabold tracking-tight">Ads</h1>
        <p className="mt-1 text-muted-foreground">Ads your competitors run on Google and Meta, with when we first and last saw each one.</p>
      </div>

      <div className="rounded-[14px] bg-surface p-6 shadow-card">
        <h2 className="mb-2 text-lg font-bold text-ink">Active ads per week</h2>
        <LineChart
          title="Active competitor ads per week"
          labels={activity.weeks}
          series={foldSeries(activity.series.map((s) => ({ key: s.competitorId, name: s.name, points: s.points })))}
          valueLabel="active ads"
        />
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-[14px] bg-surface p-4 shadow-card">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-ink">Competitor</span>
          <select name="competitor" defaultValue={competitorId ?? ''} className="rounded-md border border-line bg-surface px-2 py-1.5">
            <option value="">All competitors</option>
            {activity.series.map((s) => <option key={s.competitorId} value={s.competitorId}>{s.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-ink">Platform</span>
          <select name="platform" defaultValue={platform} className="rounded-md border border-line bg-surface px-2 py-1.5">
            <option value="all">All</option>
            <option value="meta">Meta</option>
            <option value="google">Google</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-ink">Status</span>
          <select name="status" defaultValue={status} className="rounded-md border border-line bg-surface px-2 py-1.5">
            <option value="active">Active</option>
            <option value="ended">Ended</option>
            <option value="all">All</option>
          </select>
        </label>
        <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white">Apply</button>
      </form>

      {!list ? (
        <p className="rounded-lg bg-muted-surface p-3 text-ink">This competitor is no longer tracked.</p>
      ) : list.items.length === 0 ? (
        <p className="rounded-lg bg-muted-surface p-3 text-ink">No ads match these filters.</p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {list.items.map((a) => <AdCard key={a.id} ad={a} />)}
          </div>
          {list.hasMore && <Link href={`/c/${clientId}/ads?${more.toString()}`} className="font-semibold text-primary-soft-text">More ads</Link>}
        </>
      )}
    </>
  );
}
