import { hasFeature, hasPermission, isAgencyRole } from '@cs/core';
import type {
  AdActivityView,
  AlertSummary,
  BriefDetail,
  BriefSummary,
  RatingTrendView,
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
import { OwnerFirstVisit, type OwnerSetupRead } from '@/components/client/owner-first-visit';
import { EmptyState, HelpEmpty } from '@/components/help/empty-state';
import { HelpText } from '@/components/help/help-context';
import { HelpTip } from '@/components/help/help-tip';
import { PageHeader } from '@/components/page-header';
import { pendingStartingPoint, StartingPointCard } from '@/components/starting-point-card';
import { openSetupSteps, SetupBadge } from '@/components/setup-badge';
import { StatStrip } from '@/components/stat-strip';
import { Band, HairlineCell, HairlineGrid, Section, StatusChip } from '@cs/ui';
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
  if (!hasFeature(ctx, 'dashboard')) return <ClientHomeBasic clientId={clientId} ctx={ctx} viewer={viewer} />;
  const [profile, overview, ads, rating, moves, briefs, alerts, recs, reports, starting, setup, guides] = await Promise.all([
    callTool<ClientProfile>(ctx, 'get_client_profile', { clientId }),
    callTool<WorkspaceOverview>(ctx, 'get_workspace_overview', { clientId }),
    callTool<AdActivityView>(ctx, 'get_ad_activity', { clientId, weeks: 12 }),
    tryCallTool<RatingTrendView>(ctx, 'get_rating_trend', { clientId, months: 12 }),
    callTool<{ items: MoveRow[] }>(ctx, 'list_moves', { clientId }),
    callTool<{ items: BriefSummary[] }>(ctx, 'list_briefs', { clientId, limit: 10 }),
    callTool<{ items: AlertSummary[] }>(ctx, 'list_alerts', { clientId, limit: 10 }),
    callTool<{ items: RecommendationView[] }>(ctx, 'list_recommendations', { clientId }),
    callTool<{ items: ReportSummary[] }>(ctx, 'list_trend_reports', { clientId }),
    tryCallTool<StartingPointStatus>(ctx, 'get_starting_point_status', { clientId }),
    // Agency staff (and an owner asked to pick, for whom the badge stays hidden); anyone else reads null.
    tryCallTool<{ state: SetupState; invite: { name: string | null } } & NonNullable<OwnerSetupRead>>(ctx, 'get_client_setup', { clientId }),
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
      <OwnerFirstVisit clientId={clientId} ctx={ctx} viewer={viewer} setup={setup} startingPending={preparing !== null} />
      {setupSteps !== null && (
        <div>
          <SetupBadge clientId={clientId} {...setupSteps} />
        </div>
      )}

      <StatStrip
        label="This week"
        items={kpiCards(overview, { agency, ratingMonthly: rating?.businesses.find((b) => b.self)?.monthly.map((m) => m.avgRating) }).map((k) => {
          const tip = KPI_TIPS[k.title];
          return { ...k, help: tip && <HelpTip tip={tip} /> };
        })}
      />

      <div className="grid gap-10 lg:grid-cols-[2fr_1fr]">
        <div className="flex min-w-0 flex-col gap-10">
          {preparing && (
            <Band tone="muted">
              <StartingPointCard status={preparing} agency={agency} reviewHref={startingBrief ? `/agency/approvals/${startingBrief.id}` : '/agency/approvals'} />
            </Band>
          )}
          {!latest && !preparing && (
            <Section>
              <EmptyState {...COPY.empty.noBrief} />
            </Section>
          )}
          {latest && <BriefView brief={latest} agency={agency} timezone={profile.timezone} archiveHref={`/c/${clientId}/briefs`} surface="overview" />}
        </div>

        <div className="flex min-w-0 flex-col gap-10">
          <AskCard clientId={clientId} ctx={ctx} />
          <Section title="Competitive pressure" titleAside={<HelpTip tip="client.overview.pressure" />}>
            <div className="flex flex-col gap-3">
              {overview.pressure.length === 0 && <HelpEmpty id={agency ? 'client.overview.noCompetitorsAgency' : 'client.overview.noCompetitorsClient'} />}
              {overview.pressure.map((p) => (
                <div key={p.competitorId}>
                  <div className="flex items-baseline justify-between gap-2">
                    <Link href={`/c/${clientId}/competitors/${p.competitorId}`} className="truncate font-semibold hover:underline">
                      {p.name}
                    </Link>
                    <span className="text-sm font-bold tabular-nums">{p.pressure.score}</span>
                  </div>
                  {p.pressure.reasons[0] && <p className="text-xs text-muted-ink">{p.pressure.reasons[0]}</p>}
                  <div role="img" aria-label={`Competitive pressure ${p.pressure.score} of 100, ${p.pressure.level}`} className="mt-1 h-2 rounded-full bg-muted-surface-2">
                    <div className={`h-2 rounded-full ${BAR[p.pressure.level]}`} style={{ width: `${Math.min(100, Math.max(0, p.pressure.score))}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Section>
          <Section title="Recent alerts" titleAside={<HelpTip term="alert" />}>
            <AlertLinkList clientId={clientId} items={alerts.items} />
          </Section>
        </div>
      </div>

      <HairlineGrid cols={2}>
        <HairlineCell>
          <Section
            title="Moves detected" titleAside={<HelpTip term="move" />}
            actions={
              <Link href={movesHref(clientId)} className={linkCls}>
                All →
              </Link>
            }
          >
            <div className="flex flex-col gap-1">
              {moves.items.length === 0 && <EmptyState {...COPY.empty.noMoves} />}
              {moves.items.slice(0, 3).map((m) => (
                <MoveCard key={m.id} move={m} selected={false} current={false} href={movesHref(clientId, { move: m.id })} />
              ))}
            </div>
          </Section>
        </HairlineCell>
        <HairlineCell>
          <Section
            title="Recommendations" titleAside={<HelpTip term="recommendation" />}
            actions={<span className="text-xs font-medium text-muted-ink">{openRecs.length} open</span>}
          >
            {openRecs.length === 0 && <EmptyState {...(canSaveFromAsk ? COPY.empty.noRecommendationsAsk : COPY.empty.noRecommendations)} />}
            {openRecs.length > 0 && (
              <ul className="divide-y divide-line">
                {openRecs.slice(0, 4).map((r) => (
                  <li key={r.id} className="py-2">
                    <div className="font-semibold">{r.title}</div>
                    <div className="mt-1">
                      <RecStatus status={r.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Link href={`/c/${clientId}/recommendations`} className={`${linkCls} self-start`}>
              All →
            </Link>
          </Section>
        </HairlineCell>
      </HairlineGrid>

      <Section title="Competitor ad activity" actions={<span className="text-xs text-muted-ink">12 weeks</span>}>
        <LineChart
          title="Active competitor ads per week"
          valueLabel="active ads"
          labels={ads.weeks}
          series={foldSeries(ads.series.map((s) => ({ key: s.competitorId, name: s.name, points: s.points })))}
        />
      </Section>

      <HairlineGrid cols={2}>
        <HairlineCell>
          <Section title="Past briefs">
            <BriefLinkList clientId={clientId} items={pastBriefs} empty="No earlier briefs." agency={agency} />
          </Section>
        </HairlineCell>
        <HairlineCell>
          <Section title="Quarterly reports" titleAside={<HelpTip term="report" />}>
            <div className="flex flex-col gap-2">
              {reports.items.length === 0 && <EmptyState {...COPY.empty.noReports} />}
              {reports.items.map((r) => (
                <Link key={r.id} href={`/c/${clientId}/reports/${r.id}`} className={`${linkCls} rounded-sm px-2 py-1 hover:bg-muted-surface`}>
                  {r.quarter}
                </Link>
              ))}
            </div>
          </Section>
        </HairlineCell>
      </HairlineGrid>
    </>
  );
}
