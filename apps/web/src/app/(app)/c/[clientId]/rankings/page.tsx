import { hasFeature, isAgencyRole } from '@cs/core';
import type { GeoGridView, ShareOfVoiceView } from '@cs/tools';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GeoGrid } from '@/components/charts/geo-grid';
import { LineChart } from '@/components/charts/line-chart';
import { requireContext } from '@/server/current-viewer';
import { one, uuidParam } from '@/server/search-params';
import { callTool, tryCallTool } from '@/server/tools';
import { sovSeries } from './sov';

export const dynamic = 'force-dynamic';

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** Module 7 (decisions 9–11): geo-grid per keyword and business, then share of voice over time. */
export default async function RankingsPage({ params, searchParams }: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { clientId } = await params;
  const sp = await searchParams;
  const { ctx } = await requireContext();
  if (!hasFeature(ctx, 'dashboard')) notFound();
  const keyword = one(sp.keyword)?.slice(0, 100);
  const business = one(sp.business) === 'self' ? 'self' : uuidParam(sp, 'business');
  const scanId = uuidParam(sp, 'scan');
  const sovKeyword = one(sp.sov)?.slice(0, 100);

  // A stale business (removed competitor) or scan id falls back to the defaults and says so.
  const picked = await tryCallTool<GeoGridView>(ctx, 'get_geogrid', { clientId, ...(keyword ? { keyword } : {}), ...(business ? { business } : {}), ...(scanId ? { scanId } : {}) });
  const geo = picked ?? (await callTool<GeoGridView>(ctx, 'get_geogrid', { clientId, ...(keyword ? { keyword } : {}) }));
  const sov = geo.setup === 'ready' ? await callTool<ShareOfVoiceView>(ctx, 'get_share_of_voice', { clientId, ...(sovKeyword ? { keyword: sovKeyword } : {}) }) : null;
  const chosen = geo.businesses.find((b) => b.key === geo.business);
  const chosenName = chosen ? (chosen.self ? 'You' : chosen.name) : '';
  const summary = `Top 3 at ${geo.top3} of ${geo.points} points · average rank ${geo.avgRank ?? '—'}`;

  return (
    <>
      <div>
        <h1 className="text-[26px] font-extrabold tracking-tight">Local rankings</h1>
        <p className="mt-1 text-muted-foreground">Where each business shows up in Google’s local results across your service area, from the monthly rank scan.</p>
      </div>

      {geo.setup === 'no_keywords' ? (
        <p className="rounded-lg bg-muted-surface p-3 text-ink">
          Rank tracking starts once keywords and a service area are set on the Profile page.
          {isAgencyRole(ctx.role) && <> <Link href={`/c/${clientId}/settings/profile`} className="font-semibold text-primary-soft-text">Open Profile</Link></>}
        </p>
      ) : geo.setup === 'no_scan' ? (
        <p className="rounded-lg bg-muted-surface p-3 text-ink">The first monthly rank scan hasn’t run yet.</p>
      ) : (
        <>
          {!picked && <p role="alert" className="rounded-lg bg-muted-surface p-3 text-ink">That selection is no longer available, so the defaults are shown.</p>}
          <form method="get" className="flex flex-wrap items-end gap-3 rounded-[14px] bg-surface p-4 shadow-card">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold text-ink">Keyword</span>
              <select name="keyword" defaultValue={geo.keyword ?? ''} className="rounded-md border border-line bg-surface px-2 py-1.5">
                {geo.keywords.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold text-ink">Business</span>
              <select name="business" defaultValue={geo.business ?? ''} className="rounded-md border border-line bg-surface px-2 py-1.5">
                {geo.businesses.map((b) => <option key={b.key} value={b.key}>{b.self ? 'You' : b.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold text-ink">Scan</span>
              <select name="scan" defaultValue={geo.scan?.id ?? ''} className="rounded-md border border-line bg-surface px-2 py-1.5">
                {geo.scans.map((s) => <option key={s.id} value={s.id}>{fmtDate(s.finishedAt)}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold text-ink">Share of voice for</span>
              <select name="sov" defaultValue={sovKeyword && geo.keywords.includes(sovKeyword) ? sovKeyword : ''} className="rounded-md border border-line bg-surface px-2 py-1.5">
                <option value="">All keywords</option>
                {geo.keywords.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </label>
            <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white">Show</button>
          </form>

          <section className="rounded-[14px] bg-surface p-6 shadow-card">
            <h2 className="text-lg font-bold text-ink">{chosenName} · “{geo.keyword}”</h2>
            <p className="mb-3 text-sm text-muted-foreground">
              {geo.scan && `Scan of ${fmtDate(geo.scan.finishedAt)} · `}Grid {geo.size}×{geo.size}{geo.radiusKm !== null && ` · ${geo.radiusKm} km radius`}
            </p>
            <p className="mb-3 font-semibold text-ink">{summary}</p>
            <GeoGrid title={`Local rankings for ${geo.keyword}`} summary={summary} cells={geo.cells} businessName={chosenName} keyword={geo.keyword ?? ''} />
          </section>

          {sov && (
            <section className="rounded-[14px] bg-surface p-6 shadow-card">
              <h2 className="mb-1 text-lg font-bold text-ink">Share of voice</h2>
              <p className="mb-3 text-sm text-muted-foreground">Share of the top-3 local-pack places, scan by scan ({sov.keyword ?? 'all keywords'}).</p>
              <LineChart
                title="Share of top-3 local-pack slots"
                labels={sov.scans.map((s) => s.finishedAt.slice(0, 10))}
                series={sovSeries(sov)}
                valueLabel="share of top-3 places"
                period="scan"
                yMax={100}
                formatValue={(v) => `${Math.round(v)}%`}
              />
              <Table className="mt-4">
                <caption className="sr-only">Share of voice in the latest scan</caption>
                <TableHeader><TableRow><TableHead scope="col">Business</TableHead><TableHead scope="col">Latest scan</TableHead></TableRow></TableHeader>
                <TableBody>
                  {sov.series.map((s) => {
                    const v = s.points.at(-1) ?? null;
                    return <TableRow key={s.key}><TableHead scope="row" className="font-normal">{s.self ? 'You' : s.name}</TableHead><TableCell>{v === null ? '—' : `${Math.round(v * 100)}%`}</TableCell></TableRow>;
                  })}
                </TableBody>
              </Table>
            </section>
          )}
        </>
      )}
    </>
  );
}
