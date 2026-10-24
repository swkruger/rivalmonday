import { hasFeature, hasPermission, isAgencyRole } from '@cs/core';
import type {
  AdActivityView,
  AlertSummary,
  BriefDetail,
  BriefSummary,
  ClientProfile,
  MoveRow,
  RecommendationView,
  ReportSummary,
  SetupState,
  StartingPointStatus,
  WorkspaceOverview,
} from '@cs/tools';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AskCard } from '@/components/ask/ask-card';
import { foldSeries, LineChart } from '@/components/charts/line-chart';
import { ClientHomeBasic } from '@/components/client-home-basic';
import { AlertLinkList, BriefLinkList } from '@/components/client-lists';
import { EmptyState, HelpEmpty } from '@/components/help/empty-state';
import { HelpText } from '@/components/help/help-context';
import { HelpTip } from '@/components/help/help-tip';
import { PageHeader } from '@/components/page-header';
import { pendingStartingPoint, StartingPointCard } from '@/components/starting-point-card';
import { openSetupSteps, SetupBadge } from '@/components/setup-badge';
import { StatCard } from '@/components/stat-card';
import { StatusChip } from '@cs/ui';
import { BriefView } from '@/components/views/brief-view';
import { PAGE_COPY, type TipKey } from '@/help/copy';
import { RECOMMENDATION_STATUS, labelFor } from '@/lib/labels';
import { requireContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { callTool, tryCallTool } from '@/server/tools';
import { MoveCard, movesHref } from './moves/move-card';
import { briefLabel, kpiCards, latestBrief } from './overview-kpis';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Overview' };

const BAR: Record<'low' | 'elevated' | 'high', string> = { high: 'bg-danger', elevated: 'bg-amber', low: 'bg-primary' };
const cardCls = 'min-w-0 rounded-[14px] bg-surface p-6 shadow-card';
const linkCls = 'font-semibold text-primary-soft-text';
const HELP_KEY = 'page:client.overview';
const COPY = PAGE_COPY['client.overview'];
/** One tip per KPI card, keyed by the card's title (`kpiCards`), so reordering the cards can't attach the wrong tip. */
const KPI_TIPS: Readonly<Record<string, TipKey>> = {
  'Changes this week': 'client.overview.changesWeek',
  'Competitor price moves': 'client.overview.priceMoves',
  'Active competitor ads': 'client.overview.activeAds',
  'Your rating vs area': 'client.overview.ratingVsArea',
};

function RecStatus({ status }: { status: string }) {
  const s = labelFor(RECOMMENDATION_STATUS, status);
  return <StatusChip tone={s.tone}>{s.label}</StatusChip>;
}

export default async function ClientHome({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { viewer, ctx } = await requireContext();
  if (!hasFeature(ctx, 'dashboard')) return <ClientHomeBasic clientId={clientId} ctx={ctx} />;
  const [profile, overview, ads, moves, briefs, alerts, recs, reports, starting, setup, guides] = await Promise.all([
    callTool<ClientProfile>(ctx, 'get_client_profile', { clientId }),
    callTool<WorkspaceOverview>(ctx, 'get_workspace_overview', { clientId }),
    callTool<AdActivityView>(ctx, 'get_ad_activity', { clientId, weeks: 12 }),
    callTool<{ items: MoveRow[] }>(ctx, 'list_moves', { clientId }),
    callTool<{ items: BriefSummary[] }>(ctx, 'list_briefs', { clientId, limit: 10 }),
    callTool<{ items: AlertSummary[] }>(ctx, 'list_alerts', { clientId, limit: 10 }),
    callTool<{ items: RecommendationView[] }>(ctx, 'list_recommendations', { clientId }),
    callTool<{ items: ReportSummary[] }>(ctx, 'list_trend_reports', { clientId }),
    tryCallTool<StartingPointStatus>(ctx, 'get_starting_point_status', { clientId }),
    // Agency staff and the client's owner while setup is open; anyone else (and a closed setup for owners) reads null.
    tryCallTool<{ state: SetupState }>(ctx, 'get_client_setup', { clientId }),
    // Same scope `PageGuide` derives from `/c/<id>`: client context for this client.
    helpGuides(ctx, 'client', clientId),
  ]);
  const setupSteps = openSetupSteps(setup, isAgencyRole(ctx.role));
  const preparing = pendingStartingPoint(starting, briefs.items);
  const startingBrief = briefs.items.find((b) => b.kind === 'starting_point');
  const { latest: first, rest: pastBriefs } = latestBrief(briefs.items);
  const latest = first ? await callTool<BriefDetail>(ctx, 'get_brief', { briefId: first.id }) : null;
  const delivered = latest && (latest.status === 'approved' || latest.status === 'sent') ? latest : null;
  const openRecs = recs.items.filter((r) => r.status === 'todo' || r.status === 'in_progress');
  const n = overview.trackedCompetitors;
  const agency = isAgencyRole(ctx.role);
  // Offer "save from an assistant answer" only to a viewer who can (Ask on for a signed-in user, may give feedback).
  const canSaveFromAsk = viewer.kind === 'user' && !ctx.userId.startsWith('contact:') && hasFeature(ctx, 'ask') && hasPermission(ctx, 'feedback');

  return (
    <>
      <PageHeader
        title="Overview"
        description={
          <>
            <HelpText text={COPY.description} />{' '}
            {`Tracking ${n} competitor${n === 1 ? '' : 's'}${overview.zips > 0 ? ` across ${overview.zips} ZIP codes` : ''}${delivered ? ` · ${briefLabel(delivered)}` : ''}`}
          </>
        }
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
        actions={
          agency && overview.pitchSnapshot ? (
            <Link href={`/c/${clientId}/pitch-snapshot`} className={linkCls}>
              Pitch snapshot →
            </Link>
          ) : undefined
        }
      />
      {setupSteps !== null && (
        <div>
          <SetupBadge clientId={clientId} open {...setupSteps} />
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {kpiCards(overview, { agency }).map((k) => {
          const tip = KPI_TIPS[k.title];
          return <StatCard key={k.title} {...k} help={tip && <HelpTip tip={tip} />} />;
        })}
      </div>

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <div className="flex min-w-0 flex-col gap-5">
          {preparing && (
            <section className={cardCls}>
              <StartingPointCard status={preparing} agency={agency} reviewHref={startingBrief ? `/agency/approvals/${startingBrief.id}` : '/agency/approvals'} />
            </section>
          )}
          {!latest && !preparing && (
            <section className={cardCls}>
              <EmptyState {...COPY.empty.noBrief} />
            </section>
          )}
          {latest && <BriefView brief={latest} agency={agency} timezone={profile.timezone} archiveHref={`/c/${clientId}/briefs`} />}
        </div>

        <div className="flex flex-col gap-5">
          <AskCard clientId={clientId} ctx={ctx} />
          <section className={cardCls}>
            <div className="flex items-center gap-1.5">
              <h2 className="font-semibold">Competitive pressure</h2>
              <HelpTip tip="client.overview.pressure" />
            </div>
            <div className="mt-3 flex flex-col gap-3">
              {overview.pressure.length === 0 && <HelpEmpty id={agency ? 'client.overview.noCompetitorsAgency' : 'client.overview.noCompetitorsClient'} />}
              {overview.pressure.map((p) => (
                <div key={p.competitorId}>
                  <div className="flex items-baseline justify-between gap-2">
                    <Link href={`/c/${clientId}/competitors/${p.competitorId}`} className="truncate font-semibold hover:underline">
                      {p.name}
                    </Link>
                    <span className="text-sm font-bold tabular-nums">{p.pressure.score}</span>
                  </div>
                  {p.pressure.reasons[0] && <p className="text-xs text-muted-foreground">{p.pressure.reasons[0]}</p>}
                  <div role="img" aria-label={`Competitive pressure ${p.pressure.score} of 100, ${p.pressure.level}`} className="mt-1 h-2 rounded-full bg-muted-surface-2">
                    <div className={`h-2 rounded-full ${BAR[p.pressure.level]}`} style={{ width: `${Math.min(100, Math.max(0, p.pressure.score))}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className={cardCls}>
            <div className="flex items-center gap-1.5">
              <h2 className="font-semibold">Recent alerts</h2>
              <HelpTip term="alert" />
            </div>
            <div className="mt-3">
              <AlertLinkList clientId={clientId} items={alerts.items} />
            </div>
          </section>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={cardCls}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <h2 className="font-semibold">Moves detected</h2>
              <HelpTip term="move" />
            </div>
            <Link href={movesHref(clientId)} className={linkCls}>
              All →
            </Link>
          </div>
          <div className="mt-3 flex flex-col gap-1">
            {moves.items.length === 0 && <EmptyState {...COPY.empty.noMoves} />}
            {moves.items.slice(0, 3).map((m) => (
              <MoveCard key={m.id} move={m} selected={false} current={false} href={movesHref(clientId, { move: m.id })} />
            ))}
          </div>
        </section>
        <section className={cardCls}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <h2 className="font-semibold">Recommendations</h2>
              <HelpTip term="recommendation" />
            </div>
            <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-bold text-primary-soft-text">{openRecs.length} open</span>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {openRecs.length === 0 && <EmptyState {...(canSaveFromAsk ? COPY.empty.noRecommendationsAsk : COPY.empty.noRecommendations)} />}
            {openRecs.slice(0, 4).map((r) => (
              <div key={r.id} className="rounded-lg bg-muted-surface px-3 py-2">
                <div className="font-semibold">{r.title}</div>
                <div className="mt-1">
                  <RecStatus status={r.status} />
                </div>
              </div>
            ))}
          </div>
          <Link href={`/c/${clientId}/recommendations`} className={`${linkCls} mt-3 inline-block`}>
            All →
          </Link>
        </section>
      </div>

      <section className={cardCls}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Competitor ad activity</h2>
          <span className="text-xs text-muted-foreground">12 weeks</span>
        </div>
        <div className="mt-3">
          <LineChart
            title="Active competitor ads per week"
            valueLabel="active ads"
            labels={ads.weeks}
            series={foldSeries(ads.series.map((s) => ({ key: s.competitorId, name: s.name, points: s.points })))}
          />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={cardCls}>
          <h2 className="font-semibold">Past briefs</h2>
          <div className="mt-3">
            <BriefLinkList clientId={clientId} items={pastBriefs} empty="No earlier briefs." agency={agency} />
          </div>
        </section>
        <section className={cardCls}>
          <div className="flex items-center gap-1.5">
            <h2 className="font-semibold">Quarterly reports</h2>
            <HelpTip term="report" />
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {reports.items.length === 0 && <EmptyState {...COPY.empty.noReports} />}
            {reports.items.map((r) => (
              <Link key={r.id} href={`/c/${clientId}/reports/${r.id}`} className="rounded-lg px-2 py-1 hover:bg-muted-surface">
                {r.quarter}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
