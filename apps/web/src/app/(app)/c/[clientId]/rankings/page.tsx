import { hasFeature, isAgencyRole } from '@cs/core';
import type { ClientProfile, GeoGridView, RankTrendView, ShareOfVoiceView } from '@cs/tools';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChangeGrid } from '@/components/charts/change-grid';
import { GeoGrid } from '@/components/charts/geo-grid';
import { LineChart } from '@/components/charts/line-chart';
import { RankTrend } from '@/components/charts/rank-trend';
import { clientCrumbs } from '@/components/client-crumbs';
import { EmptyState, HelpEmpty } from '@/components/help/empty-state';
import { HelpText } from '@/components/help/help-context';
import { HelpTip } from '@/components/help/help-tip';
import { PageHeader } from '@/components/page-header';
import { PAGE_COPY } from '@/help/copy';
import { requireContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { one, uuidParam } from '@/server/search-params';
import { callTool, tryCallTool } from '@/server/tools';
import { RankSettingsSheet } from './rank-settings-sheet';
import type { RankSettingsView } from './scan-copy';
import { ScanNowButton } from './scan-now-button';
import { ScanSlider } from './scan-slider';
import { sovSeries } from './sov';
import { type RankQuery, type RankTab, RankTabs } from './tabs';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Local rankings' };

const HELP_KEY = 'page:client.rankings';
const COPY = PAGE_COPY['client.rankings'];

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const selectCls = 'rounded-md border border-line bg-surface px-2 py-1.5';
type TrendScan = RankTrendView['scans'][number];
/** Two scans' grid coordinates match: same length, every value within 1e-6. */
const samePoints = (x: number[], y: number[]) => x.length === y.length && x.every((v, i) => Math.abs(v - y[i]!) <= 1e-6);

/**
 * Module 7 (decisions 9–11) + Phase 13b D8: Trend tab (average-rank line, scan slider driving the geo-grid, share of
 * voice) and Compare tab (two scans with the same settings, per-point change grid).
 */
export default async function RankingsPage({ params, searchParams }: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { clientId } = await params;
  const sp = await searchParams;
  const { ctx } = await requireContext();
  if (!hasFeature(ctx, 'dashboard')) notFound();
  const tab: RankTab = one(sp.tab) === 'compare' ? 'compare' : 'trend';
  const keyword = one(sp.keyword)?.slice(0, 100);
  const business = one(sp.business) === 'self' ? 'self' : uuidParam(sp, 'business');
  const scanId = tab === 'trend' ? uuidParam(sp, 'scan') : undefined;
  const sovKeyword = one(sp.sov)?.slice(0, 100);
  const query: RankQuery = {};
  for (const k of ['tab', 'keyword', 'business', 'sov', 'scan', 'a', 'b']) { const v = one(sp[k]); if (v) query[k] = v; }

  // A stale business (removed competitor) or scan id falls back to the defaults and says so.
  const [profile, picked, guides] = await Promise.all([
    callTool<ClientProfile>(ctx, 'get_client_profile', { clientId }),
    tryCallTool<GeoGridView>(ctx, 'get_geogrid', { clientId, ...(keyword ? { keyword } : {}), ...(business ? { business } : {}), ...(scanId ? { scanId } : {}) }),
    helpGuides(ctx, 'client', clientId),
  ]);
  const geo = picked ?? (await callTool<GeoGridView>(ctx, 'get_geogrid', { clientId, ...(keyword ? { keyword } : {}) }));
  const noBusiness = geo.setup === 'ready' && geo.business === null;
  const ready = geo.setup === 'ready' && !noBusiness && geo.keyword !== null;
  // Phase 13b: agency-only controls. `not_ready` covers a paused or inactive client (or agency) and a client without
  // keywords or a service area, so neither control shows for one; client roles never read the settings.
  // 7a1 D7: the three reads depend only on `geo`, so they run together (one stage).
  const [trend, sov, rankSettings] = await Promise.all([
    ready ? callTool<RankTrendView>(ctx, 'get_rank_trend', { clientId, keyword: geo.keyword }) : null,
    ready && tab === 'trend' ? callTool<ShareOfVoiceView>(ctx, 'get_share_of_voice', { clientId, ...(sovKeyword ? { keyword: sovKeyword } : {}) }) : null,
    isAgencyRole(ctx.role) && geo.setup !== 'no_keywords' ? callTool<RankSettingsView>(ctx, 'get_rank_settings', { clientId }) : null,
  ]);
  const history = trend ? [...trend.scans].reverse() : []; // oldest → newest
  const controls = rankSettings && rankSettings.scan.state !== 'not_ready' ? rankSettings : null;

  // Compare: A (from, older) and B (to, newer), defaulting to the newest two; reversed picks are swapped.
  let compare: { a: TrendScan; b: TrendScan; stale: boolean; grids: [GeoGridView, GeoGridView] | null } | null = null;
  if (tab === 'compare' && trend && trend.scans.length >= 2) {
    const byId = (key: 'a' | 'b') => { const id = uuidParam(sp, key); return id ? trend.scans.find((s) => s.scanId === id) : undefined; };
    let a = byId('a');
    let b = byId('b');
    const stale = (one(sp.a) !== undefined && !a) || (one(sp.b) !== undefined && !b);
    a ??= trend.scans[1]!;
    b ??= trend.scans[0]!;
    if (a.finishedAt > b.finishedAt) [a, b] = [b, a];
    const grid = (id: string) => callTool<GeoGridView>(ctx, 'get_geogrid', { clientId, keyword: geo.keyword, ...(geo.business ? { business: geo.business } : {}), scanId: id });
    // Same settings and the same points: the settings key ignores the service-area centre, so a moved centre (or two
    // legacy scans on different grids) would otherwise draw index-aligned deltas between different locations.
    const pair = a.settingsKey === b.settingsKey ? await Promise.all([grid(a.scanId), grid(b.scanId)]) : null;
    const grids = pair && samePoints(pair[0].lats, pair[1].lats) && samePoints(pair[0].lngs, pair[1].lngs) ? pair : null;
    compare = { a, b, stale, grids };
  }

  const chosen = geo.businesses.find((b) => b.key === geo.business);
  const chosenName = chosen ? (chosen.self ? 'You' : chosen.name) : '';
  const summary = `Top 3 at ${geo.top3} of ${geo.points} points · average rank ${geo.avgRank ?? '—'}`;

  return (
    <>
      <PageHeader
        title="Local rankings"
        breadcrumb={clientCrumbs({ id: clientId, name: profile.name }, 'Insights', 'Local rankings')}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
        actions={
          controls ? (
            <div className="flex flex-wrap items-start gap-3">
              <RankSettingsSheet clientId={clientId} settings={controls} />
              <ScanNowButton clientId={clientId} scan={controls.scan} />
              <HelpTip tip="client.rankings.scanNow" />
            </div>
          ) : undefined
        }
      />

      {geo.setup === 'no_keywords' ? (
        <>
          {/* By key: only the viewer's variant is in the help payload, so the other never reaches the browser (I1). */}
          <HelpEmpty
            id="client.rankings.noKeywordsAgency"
            action={<Link href={`/c/${clientId}/settings/profile`} className="text-sm font-semibold text-primary-soft-text">Open Business profile</Link>}
          />
          <HelpEmpty id="client.rankings.noKeywordsClient" />
        </>
      ) : geo.setup === 'no_scan' ? (
        <EmptyState {...COPY.empty.noScan} />
      ) : noBusiness ? (
        <>
          <HelpEmpty
            id="client.rankings.noBusinessAgency"
            action={<Link href={`/c/${clientId}/settings/profile`} className="text-sm font-semibold text-primary-soft-text">Open Business profile</Link>}
          />
          <HelpEmpty id="client.rankings.noBusinessClient" />
        </>
      ) : (
        <>
          {(!picked || compare?.stale) && <p role="alert" className="rounded-lg bg-muted-surface p-3 text-ink">That selection is no longer available, so the defaults are shown.</p>}
          <RankTabs tab={tab} query={query} />
          <div role="tabpanel" id="rank-tabpanel" aria-labelledby={`rank-tab-${tab}`} className="flex flex-col gap-6">
            <form method="get" className="flex flex-wrap items-end gap-3 rounded-[14px] bg-surface p-4 shadow-card">
              {tab === 'compare' && <input type="hidden" name="tab" value="compare" />}
              {tab === 'trend' && scanId && <input type="hidden" name="scan" value={scanId} />}
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-semibold text-ink">Keyword</span>
                <select name="keyword" defaultValue={geo.keyword ?? ''} className={selectCls}>
                  {geo.keywords.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-semibold text-ink">Business</span>
                <select name="business" defaultValue={geo.business ?? ''} className={selectCls}>
                  {geo.businesses.map((b) => <option key={b.key} value={b.key}>{b.self ? 'You' : b.name}</option>)}
                </select>
              </label>
              {tab === 'trend' ? (
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-semibold text-ink">Share of voice for</span>
                  <select name="sov" defaultValue={sovKeyword && geo.keywords.includes(sovKeyword) ? sovKeyword : ''} className={selectCls}>
                    <option value="">All keywords</option>
                    {geo.keywords.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                </label>
              ) : compare && (
                <>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="font-semibold text-ink">From scan</span>
                    <select name="a" defaultValue={compare.a.scanId} className={selectCls}>
                      {trend!.scans.map((s) => <option key={s.scanId} value={s.scanId}>{fmtDate(s.finishedAt)}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="font-semibold text-ink">To scan</span>
                    <select name="b" defaultValue={compare.b.scanId} className={selectCls}>
                      {trend!.scans.map((s) => <option key={s.scanId} value={s.scanId}>{fmtDate(s.finishedAt)}</option>)}
                    </select>
                  </label>
                </>
              )}
              <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white">Show</button>
            </form>

            {tab === 'trend' ? (
              <>
                <section className="rounded-[14px] bg-surface p-6 shadow-card">
                  <div className="mb-1 flex items-center gap-1.5">
                    <h2 className="text-lg font-bold text-ink">Average map rank · “{geo.keyword}”</h2>
                    <HelpTip tip="client.rankings.avgRank" />
                  </div>
                  <p className="mb-3 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                    Average position across the grid, scan by scan (1 is best; 20+ is not in the top 20).
                    <HelpTip tip="client.rankings.schedule" />
                  </p>
                  <RankTrend scans={history} keyword={geo.keyword ?? ''} />
                  <div className="mt-4">
                    <ScanSlider scans={history.map((s) => ({ id: s.scanId, label: fmtDate(s.finishedAt) }))} value={geo.scan?.id ?? null} query={query} />
                  </div>
                </section>

                <section className="rounded-[14px] bg-surface p-6 shadow-card">
                  <div className="flex items-center gap-1.5">
                    <h2 className="text-lg font-bold text-ink">{chosenName} · “{geo.keyword}”</h2>
                    <HelpTip tip="client.rankings.grid" />
                  </div>
                  <p className="mb-3 text-sm text-muted-foreground">
                    {geo.scan && `Scan of ${fmtDate(geo.scan.finishedAt)} · `}Grid {geo.size}×{geo.size}{geo.radiusKm !== null && ` · ${geo.radiusKm} km radius`}
                  </p>
                  <p className="mb-3 font-semibold text-ink">{summary}</p>
                  <GeoGrid title={`Local rankings for ${geo.keyword}`} summary={summary} cells={geo.cells} businessName={chosenName} keyword={geo.keyword ?? ''} map={geo.map} lats={geo.lats} lngs={geo.lngs} />
                </section>

                {sov && (
                  <section className="rounded-[14px] bg-surface p-6 shadow-card">
                    <div className="mb-1 flex items-center gap-1.5">
                      <h2 className="text-lg font-bold text-ink">Share of voice</h2>
                      <HelpTip tip="client.rankings.sov" />
                    </div>
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
            ) : !compare ? (
              <EmptyState {...COPY.empty.compareNeedsTwo} />
            ) : (
              <section className="rounded-[14px] bg-surface p-6 shadow-card">
                <div className="flex items-center gap-1.5">
                  <h2 className="text-lg font-bold text-ink">{chosenName} · “{geo.keyword}”</h2>
                  <HelpTip tip="client.rankings.compare" />
                </div>
                <p className="mb-3 text-sm text-muted-foreground">Change from the scan of {fmtDate(compare.a.finishedAt)} to the scan of {fmtDate(compare.b.finishedAt)}.</p>
                {compare.grids ? (
                  <ChangeGrid
                    title={`Change in local rank for ${geo.keyword}`}
                    before={compare.grids[0].cells}
                    after={compare.grids[1].cells}
                    lats={compare.grids[1].lats}
                    lngs={compare.grids[1].lngs}
                    map={compare.grids[1].map}
                  />
                ) : (
                  <p role="alert" className="rounded-lg bg-muted-surface p-3 text-ink">Settings changed between these scans.</p>
                )}
              </section>
            )}
          </div>
        </>
      )}
    </>
  );
}
