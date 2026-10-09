import { hasFeature, isAgencyRole } from '@cs/core';
import type {
  AdActivityView,
  AlertSummary,
  BriefDetail,
  BriefSummary,
  ClientProfile,
  MoveRow,
  RecommendationView,
  ReportSummary,
  WorkspaceOverview,
} from '@cs/tools';
import Link from 'next/link';
import { foldSeries, LineChart } from '@/components/charts/line-chart';
import { ClientHomeBasic } from '@/components/client-home-basic';
import { AlertLinkList, BriefLinkList } from '@/components/client-lists';
import { EvidenceChips } from '@/components/evidence-chips';
import { StatCard } from '@/components/stat-card';
import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';
import { MoveCard, movesHref } from './moves/move-card';
import { activeBriefItems, kpiCards } from './overview-kpis';

export const dynamic = 'force-dynamic';

const BAR: Record<'low' | 'elevated' | 'high', string> = { high: 'bg-[#DC2626]', elevated: 'bg-amber', low: 'bg-primary' };
const cardCls = 'min-w-0 rounded-[14px] bg-surface p-6 shadow-card';
const linkCls = 'font-semibold text-primary-soft-text';

export default async function ClientHome({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { ctx } = await requireContext();
  if (!hasFeature(ctx, 'dashboard')) return <ClientHomeBasic clientId={clientId} ctx={ctx} />;
  const [profile, overview, ads, moves, briefs, alerts, recs, reports] = await Promise.all([
    callTool<ClientProfile>(ctx, 'get_client_profile', { clientId }),
    callTool<WorkspaceOverview>(ctx, 'get_workspace_overview', { clientId }),
    callTool<AdActivityView>(ctx, 'get_ad_activity', { clientId, weeks: 12 }),
    callTool<{ items: MoveRow[] }>(ctx, 'list_moves', { clientId }),
    callTool<{ items: BriefSummary[] }>(ctx, 'list_briefs', { clientId, limit: 10 }),
    callTool<{ items: AlertSummary[] }>(ctx, 'list_alerts', { clientId, limit: 10 }),
    callTool<{ items: RecommendationView[] }>(ctx, 'list_recommendations', { clientId }),
    callTool<{ items: ReportSummary[] }>(ctx, 'list_trend_reports', { clientId }),
  ]);
  const first = briefs.items[0];
  const latest = first ? await callTool<BriefDetail>(ctx, 'get_brief', { briefId: first.id }) : null;
  const items = latest ? activeBriefItems(latest.items) : [];
  const delivered = latest && (latest.status === 'approved' || latest.status === 'sent') ? latest : null;
  const openRecs = recs.items.filter((r) => r.status === 'todo' || r.status === 'in_progress');
  const n = overview.trackedCompetitors;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-tight">{profile.name}</h1>
          <p className="mt-1 text-muted-foreground">
            Tracking {n} competitor{n === 1 ? '' : 's'}
            {overview.zips > 0 ? ` across ${overview.zips} ZIP codes` : ''}
            {delivered ? ` · Brief for the week of ${delivered.deliveryDate}` : ''}
          </p>
        </div>
        {isAgencyRole(ctx.role) && overview.pitchSnapshot && (
          <Link href={`/c/${clientId}/pitch-snapshot`} className={linkCls}>
            Pitch snapshot →
          </Link>
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {kpiCards(overview, { agency: isAgencyRole(ctx.role) }).map((k) => (
          <StatCard key={k.title} {...k} />
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <section className={cardCls}>
          <h2 className="font-semibold">This week&apos;s brief</h2>
          <div className="mt-3 flex flex-col gap-3">
            {!latest && <p className="text-muted-foreground">No briefs yet. The first one arrives on a Monday morning.</p>}
            {latest && items.length === 0 && <p className="text-muted-foreground">{latest.summary}</p>}
            {items.map((it, i) => (
              <div key={it.id} className={`rounded-lg border-l-[3px] bg-muted-surface p-3 ${i === 0 && it.confidence >= 0.85 ? 'border-amber' : 'border-primary'}`}>
                <h4 className="font-semibold text-ink">{it.headline}</h4>
                <p className="mt-1 text-sm">{it.whatChanged}</p>
                <p className="mt-1 text-sm">
                  <strong>Suggested:</strong> {it.recommendedAction}
                </p>
                <div className="mt-2">
                  <EvidenceChips clientId={clientId} ids={it.evidenceIds} />
                </div>
              </div>
            ))}
          </div>
          {latest && (
            <div className="mt-3 flex gap-4">
              <Link href={`/c/${clientId}/briefs/${latest.id}`} className={linkCls}>
                Open brief
              </Link>
              {latest.hasPdf && (
                <a href={`/files/brief/${latest.id}`} className={linkCls}>
                  Download PDF
                </a>
              )}
            </div>
          )}
        </section>

        <div className="flex flex-col gap-5">
          <section className={cardCls}>
            <h2 className="font-semibold">Competitive pressure</h2>
            <div className="mt-3 flex flex-col gap-3">
              {overview.pressure.length === 0 && <p className="text-muted-foreground">No competitors tracked yet.</p>}
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
            <h2 className="font-semibold">Recent alerts</h2>
            <div className="mt-3">
              <AlertLinkList clientId={clientId} items={alerts.items} />
            </div>
          </section>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className={cardCls}>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Moves detected</h2>
            <Link href={movesHref(clientId)} className={linkCls}>
              All →
            </Link>
          </div>
          <div className="mt-3 flex flex-col gap-1">
            {moves.items.length === 0 && <p className="text-muted-foreground">No moves detected right now.</p>}
            {moves.items.slice(0, 3).map((m) => (
              <MoveCard key={m.id} move={m} selected={false} href={movesHref(clientId, { move: m.id })} />
            ))}
          </div>
        </section>
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
        <section className={cardCls}>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Recommendations</h2>
            <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-bold text-primary-soft-text">{openRecs.length} open</span>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {openRecs.length === 0 && <p className="text-muted-foreground">Nothing open right now.</p>}
            {openRecs.slice(0, 4).map((r) => (
              <div key={r.id} className="rounded-lg bg-muted-surface px-3 py-2">
                <div className="font-semibold">{r.title}</div>
                <div className="text-xs text-muted-foreground">{r.status === 'in_progress' ? 'In progress' : 'To do'}</div>
              </div>
            ))}
          </div>
          <Link href={`/c/${clientId}/recommendations`} className={`${linkCls} mt-3 inline-block`}>
            All →
          </Link>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={cardCls}>
          <h2 className="font-semibold">Past briefs</h2>
          <div className="mt-3">
            <BriefLinkList clientId={clientId} items={briefs.items.slice(1)} empty="No earlier briefs." />
          </div>
        </section>
        <section className={cardCls}>
          <h2 className="font-semibold">Quarterly reports</h2>
          <div className="mt-3 flex flex-col gap-2">
            {reports.items.length === 0 && <p className="text-muted-foreground">The first report arrives after a full quarter.</p>}
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
